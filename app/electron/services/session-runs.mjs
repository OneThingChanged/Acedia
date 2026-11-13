import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { sessionMessageText } from './session-messages.mjs';
import { normalizeSessionModel } from '../shared/session-model.mjs';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const key = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const ordered = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
const preparing = new Set(['registered', 'starting', 'folder-trust', 'hook-review', 'question', 'working', 'blocked']);

// One durable request owns one child and one UTF-8 inbox notification. Neither
// a lost creation acknowledgement nor an uncertain PTY submit is replayed.
export class SessionRuns {
  constructor({ file, create, readiness, messages, context, active, now = Date.now }) {
    Object.assign(this, { file, create, readiness, messages, context, active, now });
    this.records = []; this.inflight = new Set(); this.identities = new Map(); this.parents = new Map(); this.closed = false;
    try {
      if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error();
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(data) || data.length > 100 || data.some(r => !key(r.requestKey) || !r.ownerId || !r.sessionId || !r.signature)) throw Error();
      this.records = data;
      for (const r of data) if (!['started', 'failed'].includes(r.phase)) { r.phase = 'reconcile-required'; r.reason = 'app-restarted; no automatic create or resend'; }
    } catch (error) { if (error.code !== 'ENOENT') this.unavailable = true; }
  }
  save() {
    if (this.unavailable || this.closed) throw fail('하위 실행 저장소를 확인하세요.', 503);
    const json = JSON.stringify(this.records);
    if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw fail('하위 실행 저장 한도입니다.', 507);
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', json, { mode: 0o600 }); fs.renameSync(this.file + '.tmp', this.file); }
    catch { this.unavailable = true; throw fail('하위 실행 기록을 저장하지 못했습니다.', 503); }
  }
  update(r, phase, extra = {}) { Object.assign(r, { phase, updatedAt: this.now(), ...extra }); this.save(); }
  view(r) {
    const { signature, creation, message, ...view } = r;
    return structuredClone(view);
  }
  async handle({ action, agentId, body }) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !key(body.requestKey)
      || body.waitMs !== undefined && (!Number.isInteger(body.waitMs) || body.waitMs < 0 || body.waitMs > 10000)) throw fail('requestKey와 0~10000 waitMs를 지정하세요.');
    const allowed = action === 'run' ? ['requestKey', 'projectId', 'name', 'aiToolId', 'folder', 'message', 'messageBase64', 'expectedSha256', 'modelSettings', 'accountId', 'dangerous', 'waitMs'] : ['requestKey', 'waitMs'];
    if (Object.keys(body).some(k => !allowed.includes(k))) throw fail('지원하지 않는 하위 실행 옵션입니다.');
    if (action === 'run' && (typeof body.projectId !== 'string' || !body.projectId.trim() || body.projectId.length > 256
      || ['name', 'folder', 'accountId', 'aiToolId'].some(k => body[k] !== undefined && (typeof body[k] !== 'string' || /[\x00-\x1f]/.test(body[k])))
      || body.name?.length > 120 || body.folder?.length > 4096 || body.accountId?.length > 256
      || body.dangerous !== undefined && typeof body.dangerous !== 'boolean'
      || body.modelSettings !== undefined && (!normalizeSessionModel(body.modelSettings) || Object.keys(body.modelSettings).some(k => !['model', 'effort', 'serviceTier'].includes(k))))) throw fail('프로젝트·경로·계정·모델·권한 옵션을 확인하세요.');
    if (this.unavailable || this.closed) throw fail('하위 실행 저장소를 확인하세요.', 503);
    let r = this.records.find(r => r.ownerId === agentId && r.requestKey === body.requestKey);
    if (action === 'run') {
      const message = sessionMessageText(body), { waitMs, messageBase64, expectedSha256, ...options } = body;
      const signature = hash({ ...options, message });
      if (r && r.signature !== signature) throw fail('같은 requestKey에 다른 하위 실행을 지정할 수 없습니다.', 409);
      if (!r) {
        if (this.records.length >= 100) throw fail('하위 실행 기록 한도입니다.', 507);
        if (this.records.filter(r => r.phase === 'creating' || preparing.has(r.phase) || r.phase === 'sending').length >= 4) throw fail('동시에 준비하는 하위 세션은 최대 4개입니다. 기존 실행을 확인하세요.', 409);
        if (!['codex', 'claude'].includes(body.aiToolId || 'codex')) throw fail('Codex 또는 Claude를 지정하세요.');
        const { message: _, ...creation } = options;
        r = { ownerId: agentId, requestKey: body.requestKey, sessionId: randomUUID(), signature, creation: { ...creation, aiToolId: body.aiToolId || 'codex' },
          message, phase: 'creating', createdAt: this.now(), updatedAt: this.now() };
        this.records.push(r); this.save();
        this.parents.set(r.sessionId, this.context(agentId)?.entry);
        this.launch(r);
      }
    }
    if (!r) throw fail('이 부모 세션의 하위 실행을 찾을 수 없습니다.', 404);
    const deadline = this.now() + (body.waitMs || 0);
    do {
      if (action === 'run' || r.messageId) await this.advance(r);
      if (!body.waitMs || ['started', 'failed', 'reconcile-required', 'question', 'hook-review'].includes(r.phase) || this.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(100, deadline - this.now())));
    } while (!this.closed);
    return this.view(r);
  }
  launch(r) {
    this.inflight.add(r.sessionId);
    void (async () => {
      try {
        if (!this.active(r.ownerId) || this.context(r.ownerId)?.entry !== this.parents.get(r.sessionId)) throw fail('부모 실행 세션이 변경되었습니다.', 409);
        const result = await this.create(r.ownerId, { ...r.creation, parentSessionId: r.ownerId, requestKey: 'run_' + r.sessionId.replaceAll('-', '') }, r.sessionId);
        if (this.closed) return;
        if (result.sessionId !== r.sessionId) throw fail('생성된 하위 세션 ID가 다릅니다.', 409);
        r.registered = true;
        if (result.startError) { this.update(r, 'blocked', { reason: result.startError }); return; }
        const entry = this.context(r.sessionId)?.entry;
        if (!entry) { this.update(r, 'blocked', { reason: 'CLI did not start' }); return; }
        this.identities.set(r.sessionId, entry);
        this.update(r, 'registered', { reason: 'waiting for native composer', deadline: this.now() + 120000 });
      } catch (error) { if (!this.closed) this.update(r, 'reconcile-required', { reason: String(error.message).slice(0, 500) }); }
      finally { this.inflight.delete(r.sessionId); }
    })().catch(() => {});
  }
  async advance(r) {
    if (this.closed || this.unavailable || this.inflight.has(r.sessionId)) return;
    this.inflight.add(r.sessionId);
    try {
      if (r.messageId) {
        const outbox = await this.messages.handle({ action: 'message-receive', agentId: r.ownerId, body: { messageId: r.messageId, direction: 'outbox', markRead: false } });
        const delivery = outbox.messages[0]?.delivery;
        const phase = delivery?.status === 'started' ? 'started' : delivery?.status === 'queued' ? 'queued' : ['unconfirmed', 'failed', 'notification-error'].includes(delivery?.status) ? 'reconcile-required' : 'sent';
        if (delivery && (r.phase !== phase || JSON.stringify(delivery) !== JSON.stringify(r.delivery))) this.update(r, phase,
          { delivery, conversationId: delivery.conversationId || r.conversationId, reason: delivery.reason || delivery.status });
        return;
      }
      if (!preparing.has(r.phase)) return;
      const entry = this.context(r.sessionId)?.entry;
      if (!this.active(r.ownerId) || this.context(r.ownerId)?.entry !== this.parents.get(r.sessionId)
        || !entry || this.identities.get(r.sessionId) !== entry || this.now() > r.deadline) {
        this.update(r, 'reconcile-required', { reason: 'parent/child runtime changed or startup timed out; nothing resent' }); return;
      }
      const status = await this.readiness({ sessionId: r.sessionId, waitMs: 0 });
      if (!status.ready) {
        if (r.phase !== status.phase || r.reason !== status.reason) this.update(r, status.phase, { reason: status.reason, startup: status.startup, question: status.question });
        return;
      }
      if (this.context(r.sessionId)?.entry !== entry) { this.update(r, 'reconcile-required', { reason: 'child runtime changed' }); return; }
      this.update(r, 'sending', { sendReserved: true, conversationId: status.conversationId });
      const message = await this.messages.handle({ action: 'message-send', agentId: r.ownerId, body: { sessionId: r.sessionId, requestKey: 'run_' + r.sessionId.replaceAll('-', ''), message: r.message, notify: true, waitMs: 0 } });
      this.update(r, message.delivery?.status === 'queued' ? 'queued' : 'sent', { messageId: message.messageId, delivery: message.delivery, question: undefined, startup: undefined, reason: message.delivery?.status === 'queued' ? message.delivery.reason || 'waiting for input' : 'waiting for exact receipt' });
    } catch (error) { if (!this.closed) this.update(r, 'reconcile-required', { reason: String(error.message).slice(0, 500) }); }
    finally { this.inflight.delete(r.sessionId); }
  }
  async tick() { if (!this.closed && !this.unavailable) await Promise.all(this.records.filter(r => preparing.has(r.phase) || ['sent', 'queued'].includes(r.phase)).map(r => this.advance(r))); }
  close() { this.closed = true; }
}
