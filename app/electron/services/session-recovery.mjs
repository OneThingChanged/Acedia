import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const supported = new Set(['codex', 'claude']);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/.test(value);
const pending = new Set(['launching', 'waiting-ready']);
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
const folderKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
export const RECOVERY_CONTINUATION = 'Acedia를 완전히 종료했다가 이전 세션 복구를 승인했습니다. 이 대화의 마지막 사용자 요청과 기존 권한 범위 안에서 중단된 작업을 계속 진행하세요. 먼저 현재 파일·산출물·진행 중인 자식 세션과 기존 전달 결과를 확인하고, 이미 완료한 작업이나 전달한 명령을 중복 실행하지 마세요. 새 승인이나 사용자 답변이 필요한 경우에는 기다리세요.';

export function recoveryConfiguration(agent, project) {
  return JSON.stringify([agent.aiToolId, agent.folder || null, project?.folder || null, agent.sshHostId || project?.sshHostId || null,
    agent.codexAccountId || 'default', agent.claudeAccountId || 'default', agent.codexPoolAccountId || null, agent.modelSettings || null,
    agent.sessionHierarchy?.parentId || null]);
}
export function recoveryWorkMode(agent, hook, delegated = false) {
  const state = hook?.event || agent.activity?.workStatus || agent.workStatus || agent.status;
  if (['waiting', 'blocked', 'question', 'waiting_user', 'waiting_approval'].includes(state)) return 'waiting';
  if (['working', 'tool-start', 'tool-end', 'background-wait', 'background'].includes(state) || delegated) return 'working';
  return 'idle';
}

/** Host-owned full-exit checkpoint. Layout/catalog remain in the existing
 * workspace snapshot. No credentials or conversation bodies are copied here.
 * A launch and a continuation are separate, durable, one-shot operations. */
export class SessionRecovery {
  constructor({ file, catalog, context, readiness, submit, closing = () => false, now = Date.now }) {
    Object.assign(this, { file, catalog, context, readiness, submit, closing, now });
    this.data = null; this.generations = new Map(); this.inflight = false;
    try {
      if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error('Checkpoint too large');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.version !== 1 || !validId(data.id) || !Number.isFinite(data.savedAt) || !['pending', 'accepted', 'declined'].includes(data.decision)
        || !Array.isArray(data.sessions) || data.sessions.length > 10000 || new Set(data.sessions.map(r => r.id)).size !== data.sessions.length
        || data.sessions.some(r => !validId(r.id) || typeof r.name !== 'string' || !supported.has(r.provider)
          || r.sessionId !== null && !validId(r.sessionId) || r.fresh !== undefined && typeof r.fresh !== 'boolean'
          || r.fresh && (r.sessionId || r.mode === 'working') || !path.isAbsolute(r.cwd || '') || typeof r.configuration !== 'string'
          || !['working', 'waiting', 'idle'].includes(r.mode) || !['pending', 'launching', 'waiting-ready', 'restored', 'continued', 'already-working', 'needs-attention', 'skipped', 'uncertain'].includes(r.state))) throw Error('Invalid checkpoint');
      this.data = data;
      // An interrupted paste/start is never replayed after a crash.
      for (const r of data.sessions) if (pending.has(r.state)) { r.state = 'uncertain'; r.reason = 'previous-recovery-interrupted'; }
    } catch (error) { if (error.code !== 'ENOENT') this.error = '이전 실행 상태를 읽지 못했습니다. 세션을 수동으로 확인해 주세요.'; }
  }
  save() {
    const json = JSON.stringify(this.data);
    if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw fail('이전 실행 상태 저장 한도를 초과했습니다.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', json, { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  capture(records) {
    // Only live, supported local AI sessions are launched by recovery. Dormant,
    // SSH and shell entries stay in the regular catalog without execution.
    const sessions = records.filter(r => supported.has(r.provider) && !r.ssh).map(r => ({
      id: r.id, name: r.name, provider: r.provider, sessionId: r.sessionId || null, cwd: r.cwd,
      fresh: r.fresh === true && !r.sessionId && r.mode !== 'working',
      configuration: r.configuration, mode: r.mode, parentId: r.parentId || null,
      poolResumeOwnerId: r.poolResumeOwnerId || null, state: 'pending', reason: null,
    }));
    const next = { version: 1, id: randomUUID(), savedAt: this.now(), decision: 'pending', sessions };
    const previous = this.data; this.data = next;
    try { this.save(); this.error = null; this.generations.clear(); }
    catch (error) { this.data = previous; throw error; }
    return this.offer();
  }
  waitingDecision() { return this.data?.decision === 'pending' && this.data.sessions.length > 0; }
  status() {
    return { checkpointId: this.data?.id || null, decision: this.data?.decision || null, error: this.error || null,
      sessions: this.data?.sessions.map(({ id, name, mode, state, reason }) => ({ id, name, mode, state, reason })) || [] };
  }
  offer() {
    return this.waitingDecision() ? { ...this.status(), savedAt: this.data.savedAt,
      activeCount: this.data.sessions.length, workingCount: this.data.sessions.filter(r => r.mode === 'working').length } : { ...this.status(), activeCount: 0 };
  }
  decide({ checkpointId, restore }) {
    if (!this.data || this.data.id !== checkpointId) throw fail('복구 대상 실행 상태가 변경되었습니다.');
    const choice = restore ? 'accepted' : 'declined';
    if (this.data.decision !== 'pending' && this.data.decision !== choice) throw fail('이미 복구 여부를 선택했습니다.');
    const previous = this.data.decision; this.data.decision = choice;
    try { this.save(); } catch (error) { this.data.decision = previous; throw error; }
    // Deeper workers first, so a restored leader can consult existing workers.
    const rows = new Map(this.data.sessions.map(r => [r.id, r]));
    const depth = r => { let d = 0; const seen = new Set([r.id]); while (r.parentId && rows.has(r.parentId) && !seen.has(r.parentId)) { seen.add(r.parentId); r = rows.get(r.parentId); d++; } return d; };
    return { ...this.status(), sessionIds: restore ? [...rows.values()].sort((a, b) => depth(b) - depth(a)).map(r => r.id) : [] };
  }
  row(checkpointId, id) {
    if (!this.data || this.data.id !== checkpointId || this.data.decision !== 'accepted') throw fail('먼저 이전 세션 복구를 승인하세요.');
    const row = this.data.sessions.find(r => r.id === id);
    if (!row) throw fail('복구 대상 세션을 찾을 수 없습니다.');
    return row;
  }
  configurationMatches(row) {
    const catalog = this.catalog(), agent = catalog.agents?.find(a => a.id === row.id), project = catalog.projects?.find(p => p.id === agent?.projectId);
    return agent && recoveryConfiguration(agent, project) === row.configuration;
  }
  update(row, state, reason = null) {
    row.state = state; row.reason = reason; this.save();
    if (!pending.has(state)) this.generations.delete(row.id);
    return { id: row.id, state, reason };
  }
  claim({ checkpointId, id }) {
    const row = this.row(checkpointId, id);
    if (row.state !== 'pending') return { id, state: row.state };
    if (this.closing() || !this.configurationMatches(row)) return this.update(row, 'skipped', 'session-configuration-changed');
    if (this.context(id)?.entry) return this.update(row, 'skipped', 'already-active');
    const agent = this.catalog().agents?.find(a => a.id === id);
    if (row.fresh && (agent?.lastSessionId || agent?.sessionHierarchy?.resumeContext?.sessionId)) return this.update(row, 'needs-attention', 'session-history-changed');
    if (!row.sessionId && !row.fresh) return this.update(row, 'needs-attention', 'exact-conversation-unavailable');
    this.update(row, 'launching');
    return { id, state: 'launching', ...(row.fresh ? { fresh: true } : { resumeSessionId: row.sessionId }),
      ...(row.poolResumeOwnerId ? { poolResumeOwnerId: row.poolResumeOwnerId } : {}) };
  }
  launched({ checkpointId, id, failed = false }) {
    const row = this.row(checkpointId, id);
    if (row.state !== 'launching') return { id, state: row.state };
    const current = this.context(id), entry = current?.entry;
    if (failed || !entry || (row.fresh ? !!entry.resumeContext : entry.resumeContext?.sessionId !== row.sessionId || current.conversationId !== row.sessionId)
      || folderKey(entry.cwd) !== folderKey(row.cwd) || !this.configurationMatches(row)) return this.update(row, 'needs-attention', 'exact-resume-not-confirmed');
    this.generations.set(id, entry); row.deadline = this.now() + 120000;
    return this.update(row, 'waiting-ready');
  }
  async tick() {
    if (this.inflight || this.closing() || this.data?.decision !== 'accepted') return;
    this.inflight = true;
    try {
      const waiting = this.data.sessions.filter(r => r.state === 'waiting-ready'), offset = (this.cursor || 0) % Math.max(1, waiting.length);
      const batch = Array.from({ length: Math.min(4, waiting.length) }, (_, i) => waiting[(offset + i) % waiting.length]);
      this.cursor = offset + batch.length;
      for (const row of batch) {
        const current = this.context(row.id), entry = this.generations.get(row.id);
        const valid = () => !this.closing() && this.context(row.id)?.entry === entry
          && (row.fresh ? !entry.resumeContext : this.context(row.id)?.conversationId === row.sessionId) && this.configurationMatches(row);
        if (!entry || !valid()) { this.update(row, 'needs-attention', 'runtime-or-conversation-changed'); continue; }
        if (entry.firstMessageInput || entry.firstMessageSubmitted) { this.update(row, 'skipped', 'input-already-provided'); continue; }
        let ready;
        try { ready = await this.readiness(row.id); }
        catch { if (this.now() >= row.deadline) this.update(row, 'needs-attention', 'startup-check-unavailable'); continue; }
        if (!valid()) { this.update(row, 'needs-attention', 'runtime-or-conversation-changed'); continue; }
        if (ready.phase === 'question') { this.update(row, 'needs-attention', 'question-or-login-pending'); continue; }
        if (ready.phase === 'working') { this.update(row, 'already-working'); continue; }
        if (!ready.ready) {
          if (this.now() >= row.deadline) this.update(row, 'needs-attention', 'startup-timeout');
          continue;
        }
        if (row.mode !== 'working') { this.update(row, 'restored'); continue; }
        const inputAt = entry.lastInputAt;
        const canSubmit = () => valid() && !entry.firstMessageInput && !entry.firstMessageSubmitted && entry.lastInputAt === inputAt;
        // Durable intent precedes the irreversible paste. No retry after an
        // uncertain write, process replacement, user draft or restart.
        this.update(row, 'uncertain', 'continuation-submission-started');
        try {
          const sent = await this.submit(row.id, entry, RECOVERY_CONTINUATION, canSubmit);
          this.update(row, sent ? 'continued' : 'needs-attention', sent ? null : 'continuation-not-sent');
        } catch { this.update(row, 'uncertain', 'continuation-outcome-unknown'); }
      }
    } finally { this.inflight = false; }
  }
}
