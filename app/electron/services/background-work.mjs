// Claude's native background agents are not Acedia child sessions. Observe only
// the current TUI status immediately above its composer, never scrollback text.
export function claudeBackgroundFrame(screen) {
  const lines = String(screen || '').slice(-32000).split('\n').map(s => s.trim());
  let composer = -1;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 16); i--) {
    if (/^[❯›>]\s*/u.test(lines[i])) { composer = i; break; }
  }
  if (composer < 0) return null; // Partial/unknown frames cannot clear a wait.
  if (!lines.slice(composer + 1).some(s => /(?:bypass permissions|shift\+tab|to manage|esc to interrupt|context left|\? for shortcuts)/i.test(s))) return null;
  let index = composer - 1;
  while (index >= Math.max(0, composer - 8) && (!lines[index] || /^[─━═_\-\s]+$/u.test(lines[index]) || /^Update available[!:]/i.test(lines[index]))) index--;
  for (let rows = 1; rows <= 3 && index - rows + 1 >= 0; rows++) {
    const match = lines.slice(index - rows + 1, index + 1).join(' ').match(/^[✻✽✶✳✢✦✧∗*·]\s+Waiting for (\d{1,4}) background agents? to finish\s*[.…]*$/iu);
    if (match && +match[1] > 0 && +match[1] <= 1000) return { count: +match[1] };
  }
  // An identifiable composer in a complete native footer, not an arbitrary
  // assistant quote, is necessary to conclude that the waiting row disappeared.
  const foreground = /^[✻✽✶✳✢✦✧∗*·]\s+.*(?:\bing\b|\w+ing\b|…|\.\.\.)/iu.test(lines[index] || '');
  return foreground ? { count: 0, foreground: true } : { count: 0 };
}

export class BackgroundWorkMonitor {
  constructor({ entry, publish, readExternalJobs, readExternalStatus, now = Date.now, delay = 200, externalInterval = 5000 }) {
    Object.assign(this, { entry, publish, readExternalJobs, readExternalStatus, now, delay, externalInterval });
    this.records = new Map();
  }
  record(entry) {
    if (!entry || entry.aiToolId !== 'claude' || this.entry(entry.id) !== entry) return null;
    let record = this.records.get(entry.id);
    if (record?.entry !== entry) { this.forget(entry.id); record = { entry, count: 0, base: null, timer: null }; this.records.set(entry.id, record); }
    return record;
  }
  output(entry) {
    const record = this.record(entry); if (!record || record.timer || record.cancelled) return;
    // Throttle output bursts without rescanning/replaying a transcript or making
    // a second terminal emulator. The existing shadow viewport is already parsed.
    record.timer = setTimeout(() => {
      record.timer = null;
      if (this.records.get(entry.id) !== record || this.entry(entry.id) !== entry) return;
      let frame; try { frame = claudeBackgroundFrame(entry.filter.viewportText?.()); } catch { return; }
      if (['waiting', 'question', 'blocked'].includes(record.base?.event)) return;
      if (!frame || frame.count === record.count) return;
      const previous = record.count; record.count = frame.count;
      if (frame.count || this.hasWaitingExternal(record)) {
        if (!this.emit(this.waitEvent(record))) record.count = previous;
      } else if (previous && !this.emit(this.resumeEvent(record, frame.foreground))) record.count = previous;
    }, this.delay);
    record.timer.unref?.();
  }
  waitEvent(record, base = record.base || {}) {
    return { ...base, id: record.entry.id, event: 'background-wait', hook_event_name: 'BackgroundWorkWait',
      received_at: this.now(), background_count: Math.min(1000, record.count + (record.external?.pending.size || 0)) };
  }
  resumeEvent(record, foreground = false) {
    const base = record.base || {};
    if (!foreground && ['done', 'session-start'].includes(base.event) && record.external?.failed) return this.externalFailure(base);
    const event = foreground || !base.event || base.event === 'working' ? 'tool-end' : base.event;
    return { ...base, id: record.entry.id, event, hook_event_name: 'BackgroundWorkResume',
      received_at: this.now(), background_count: 0 };
  }
  hasWaitingExternal(record) {
    return record.external?.pending.size > 0 && ['done', 'session-start'].includes(record.base?.event);
  }
  async prepare(payload) {
    if (!this.readExternalJobs || !payload.session_id || !['done', 'session-start'].includes(payload.event)) return;
    const record = this.record(this.entry(payload.id));
    if (!record || record.entry.ssh) return;
    if (record.external?.conversationId !== payload.session_id) {
      clearTimeout(record.external?.timer);
      record.external = { conversationId: payload.session_id, pending: new Set(), failed: false, timer: null, check: null };
    }
    const external = record.external;
    await external.check;
    if (record.external !== external || this.entry(payload.id) !== record.entry) return;
    await this.checkExternal(record, true);
  }
  checkExternal(record, loadReceipts) {
    const external = record.external;
    const current = () => this.records.get(record.entry.id) === record && this.entry(record.entry.id) === record.entry && record.external === external;
    if (external.check) return external.check;
    external.check = (async () => {
      const ids = new Set(external.pending);
      if (loadReceipts) {
        for (const id of await this.readExternalJobs(record.entry, external.conversationId)) ids.add(id);
      }
      const answers = await Promise.all([...ids].map(async id => [id, await this.readExternalStatus(id)]));
      if (!current()) return;
      const previous = external.pending.size;
      for (const [id, status] of answers) {
        if (status === 'pending') external.pending.add(id);
        else if (status && external.pending.delete(id) && status === 'blocked') external.failed = true;
      }
      if (!loadReceipts && previous !== external.pending.size && ['done', 'session-start'].includes(record.base?.event)) {
        if (external.pending.size || record.count) this.emit(this.waitEvent(record));
        else this.emit(this.resumeEvent(record));
      }
    })().catch(() => {}).finally(() => {
      external.check = null;
      if (!current() || !external.pending.size || external.timer) return;
      external.timer = setTimeout(() => {
        external.timer = null;
        void this.checkExternal(record, false);
      }, this.externalInterval);
      external.timer.unref?.();
    });
    return external.check;
  }
  externalFailure(base) {
    return { ...base, event: 'blocked', hook_event_name: 'BackgroundWorkResume',
      assistant_message: '연결된 백그라운드 작업 결과를 확인하세요.', received_at: this.now(), background_count: 0 };
  }
  emit(payload) { try { this.publish(payload); return true; } catch { return false; } }
  hook(payload) {
    if (/^BackgroundWork(?:Wait|Resume)$/.test(payload.hook_event_name || '')) return payload;
    const record = this.record(this.entry(payload.id)); if (!record) return payload;
    if (record.timer) { clearTimeout(record.timer); record.timer = null; }
    record.base = payload;
    if (record.external && !record.external.pending.size && payload.hook_event_name === 'UserPromptSubmit') {
      record.external.failed = false;
    }
    if (['cancelled', 'canceled', 'interrupted', 'aborted'].includes(payload.event)) record.cancelled = true;
    else if (['working', 'tool-start', 'session-start'].includes(payload.event)) record.cancelled = false;
    if (payload.event === 'done') {
      let frame; try { frame = claudeBackgroundFrame(record.entry.filter.viewportText?.()); } catch { frame = null; }
      if (frame?.count || !frame && record.count || this.hasWaitingExternal(record)) {
        record.count = frame?.count ?? record.count;
        return this.waitEvent(record, payload);
      }
      if (record.external?.failed) return this.externalFailure(payload);
    } else if (this.hasWaitingExternal(record)) {
      record.count = 0;
      return this.waitEvent(record, payload);
    }
    // An explicit foreground/question/cancellation event wins immediately.
    record.count = 0;
    return payload;
  }
  forget(id) {
    const record = this.records.get(id);
    clearTimeout(record?.timer);
    clearTimeout(record?.external?.timer);
    this.records.delete(id);
  }
  prune(ids) { const live = new Set(ids); for (const [id, record] of this.records) if (!live.has(id) || this.entry(id) !== record.entry) this.forget(id); }
}
