export const CAPACITY_RETRY_DELAYS = [30_000, 60_000, 120_000];
export const CAPACITY_RETRY_PROMPT = '모델 용량 부족으로 중단된 기존 작업을 현재 상태에서 이어서 진행해. 이미 완료한 작업과 명령 실행 결과를 확인하고 완료된 작업을 반복하지 마.';

export function isCodexCapacityError(error) {
  return Boolean(error && (error.codex_error_info === 'server_overloaded' ||
    /^(?:stream disconnected before completion:\s*)?Selected model is at capacity\. Please try a different model\.?$/i.test(error.message?.trim() || '')));
}

// Inspect lifecycle records only: quoted errors in chat or tool output must
// never cause an automatic submission. No conversation text leaves this reader.
export function codexRetryTurn(text, previous = null) {
  let turn = previous;
  for (const line of String(text).split('\n')) {
    let row; try { row = JSON.parse(line); } catch { continue; }
    if (row.type !== 'event_msg') continue;
    const p = row.payload;
    if (!['task_started', 'task_complete', 'turn_aborted'].includes(p?.type)) continue;
    const at = Date.parse(row.timestamp);
    if (!Number.isFinite(at) || typeof p.turn_id !== 'string') continue;
    const error = p.error;
    const capacity = p.type === 'task_complete' && isCodexCapacityError(error);
    turn = { id: p.turn_id, at, status: p.type === 'task_started' ? 'working'
      : p.type === 'turn_aborted' ? 'cancelled' : error ? 'failed' : 'done', capacity: Boolean(capacity) };
  }
  return turn;
}

export function codexRetryPromptReady(screen) {
  return /(?:^|\n)\s*›(?:\s|$)/u.test(screen || '')
    && !/esc to interrupt|Queued follow-up inputs|shift\+.*answer/i.test(screen || '');
}

const active = status => ['scheduled', 'retrying', 'working'].includes(status);

/** One bounded recovery per interrupted task. Timers belong to a PTY instance,
 * not its reusable agent ID. All user input and process changes cancel them. */
export class CodexCapacityRetry {
  constructor({ entryFor, read, submit, publish, ready, now = Date.now, delays = CAPACITY_RETRY_DELAYS }) {
    Object.assign(this, { entryFor, read, submit, publish, ready, now, delays });
    this.records = new Map();
  }
  get(id) { return this.records.get(id)?.view || null; }
  isActive(id) { return active(this.get(id)?.status); }
  cancel(id) {
    const record = this.records.get(id);
    if (!record || !active(record.view?.status)) return false;
    clearTimeout(record.timer); record.timer = null;
    this.#publish(id, record, 'cancelled');
    return true;
  }
  prune(ids) {
    const live = new Set(ids);
    for (const [id, record] of this.records) if (!live.has(id) || this.entryFor(id) !== record.entry) {
      clearTimeout(record.timer); this.records.delete(id);
      this.publish({ id, status: 'resolved' });
    }
  }
  dispose() { for (const record of this.records.values()) clearTimeout(record.timer); this.records.clear(); }
  observe(id, entry, result) {
    if (entry.aiToolId !== 'codex' || entry.ssh || this.entryFor(id) !== entry || !result?.sessionId || !result.turn) return;
    const turn = result.turn;
    if (turn.at < entry.startedAt) return; // Never recover an error replayed by resume.
    let record = this.records.get(id);
    if (record?.entry !== entry || record?.sessionId !== result.sessionId) {
      if (record) clearTimeout(record.timer);
      record = { entry, sessionId: result.sessionId, attempt: 0, seen: null, timer: null, view: null };
      this.records.set(id, record);
    }
    if (result.question) { this.cancel(id); return; }
    if (record.seen === `${turn.id}:${turn.status}`) return;
    record.seen = `${turn.id}:${turn.status}`;
    if (record.view && ['cancelled', 'failed'].includes(record.view.status)
      && record.turn?.id !== turn.id && entry.lastInputAt > (record.turn?.at || 0) && turn.at >= entry.lastInputAt) {
      record.attempt = 0; this.#publish(id, record, 'resolved');
    }
    if (turn.status === 'working') {
      if (record.view?.status === 'retrying') { clearTimeout(record.timer); record.timer = null; this.#publish(id, record, 'working'); }
      else if (record.view && record.view.status !== 'working') {
        clearTimeout(record.timer); record.timer = null; record.attempt = 0;
        this.#publish(id, record, 'resolved');
      }
      return;
    }
    if (!turn.capacity) {
      if (active(record.view?.status)) {
        clearTimeout(record.timer); record.timer = null;
        this.#publish(id, record, turn.status === 'failed' ? 'failed' : 'resolved',
          { reason: turn.status === 'done' ? 'completed' : turn.status === 'cancelled' ? 'cancelled' : 'other-error' });
      }
      record.attempt = 0;
      return;
    }
    if (record.view?.status === 'cancelled' || record.view?.status === 'failed') return;
    // A prompt typed after this failure takes precedence, even if no new turn
    // has reached the rollout yet. The write boundary also cancels live timers.
    if (entry.lastInputAt > turn.at) return;
    record.turn = turn;
    record.inputAt = entry.lastInputAt;
    clearTimeout(record.timer);
    if (record.attempt >= this.delays.length) { this.#publish(id, record, 'failed', { reason: 'exhausted' }); return; }
    const delay = this.delays[record.attempt];
    this.#publish(id, record, 'scheduled', { nextRetryAt: this.now() + delay });
    record.timer = setTimeout(() => { void this.#retry(id, record); }, delay);
    record.timer.unref?.();
  }
  #publish(id, record, status, extra = {}) {
    record.view = { id, sessionId: record.sessionId, status, attempt: record.attempt,
      maxAttempts: this.delays.length, at: this.now(), ...extra };
    this.publish(record.view);
  }
  #current(id, record) {
    return this.records.get(id) === record && this.entryFor(id) === record.entry
      && record.entry.lastInputAt === record.inputAt && record.view.status === 'scheduled';
  }
  async #retry(id, record) {
    record.timer = null;
    try {
      if (!this.#current(id, record)) {
        if (this.records.get(id) === record && this.entryFor(id) === record.entry) this.cancel(id);
        return;
      }
      const result = await this.read(id);
      if (!this.#current(id, record)) return;
      if (result?.sessionId !== record.sessionId || result.turn?.id !== record.turn.id
        || !result.turn.capacity || result.question) { this.cancel(id); return; }
      if (!this.ready(record.entry)) { this.#publish(id, record, 'failed', { reason: 'not-ready' }); return; }
      record.attempt++;
      this.#publish(id, record, 'retrying');
      const isCurrent = () => this.records.get(id) === record && this.entryFor(id) === record.entry
        && record.entry.lastInputAt === record.inputAt && record.view.status === 'retrying';
      const submitted = await this.submit(id, record.entry, CAPACITY_RETRY_PROMPT, isCurrent);
      if (!isCurrent()) return;
      if (!submitted) { this.#publish(id, record, 'failed', { reason: 'not-ready' }); return; }
      // Never paste a second prompt when the first submission's result is
      // uncertain. A fresh task_started/complete record acknowledges it.
      record.timer = setTimeout(() => {
        record.timer = null;
        if (record.view.status === 'retrying' && this.entryFor(id) === record.entry)
          this.#publish(id, record, 'failed', { reason: 'unconfirmed' });
      }, 15_000);
      record.timer.unref?.();
    } catch {
      if (this.records.get(id) === record && this.entryFor(id) === record.entry && active(record.view.status))
        this.#publish(id, record, 'failed', { reason: 'unconfirmed' });
    }
  }
}
