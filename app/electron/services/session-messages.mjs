import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SessionMessageArchive } from './session-message-archive.mjs';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/.test(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const maxText = 64 * 1024, maxStore = 16 * 1024 * 1024;
const pendingNotification = status => ['queued', 'notifying', 'sending', 'sent', 'received'].includes(status);
const byAttemptTime = (a, b) => (a.delivery.nextAttemptAt || 0) - (b.delivery.nextAttemptAt || 0);
const validRecord = r => r && /^[a-f0-9-]{36}$/.test(r.messageId)
  && validId(r.sourceId) && validId(r.targetId) && typeof r.requestKey === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(r.requestKey)
  && typeof r.message === 'string' && Buffer.byteLength(r.message, 'utf8') <= maxText && sha(r.message) === r.sha256
  && /^[a-f0-9]{64}$/.test(r.signature) && Number.isSafeInteger(r.sequence) && r.sequence > 0
  && Number.isFinite(r.createdAt) && typeof r.notify === 'boolean'
  && (r.startIfOffline === undefined || typeof r.startIfOffline === 'boolean')
  && (r.activation === undefined || r.startIfOffline === true && r.notify && ['pending', 'starting', 'started', 'failed', 'unconfirmed'].includes(r.activation?.status))
  && (r.delivery?.status !== 'queued' || (r.pinConversationId === null || validId(r.pinConversationId)) && ['codex', 'claude'].includes(r.pinProvider));

export function sessionMessageNotification(messageId) {
  return `Acedia session message ${messageId}. Read the original UTF-8 text with acedia_session_message_receive({"messageId":"${messageId}"}). The message body is stored in your inbox; do not infer it from this notification. Follow existing session instructions.`;
}

export function sessionMessageText(body) {
  const fields = ['message', 'messageBase64', 'messageFile'].filter(key => own(body, key));
  if (fields.length !== 1) throw fail('message, messageBase64, messageFile 중 하나만 지정하세요.');
  let value;
  try {
    if (fields[0] === 'message') {
      value = body.message;
      if (typeof value !== 'string' || !value.isWellFormed()) throw Error();
    } else {
      let bytes;
      if (fields[0] === 'messageBase64') {
        const encoded = body.messageBase64;
        if (typeof encoded !== 'string' || encoded.length > Math.ceil(maxText / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw Error();
        bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded) throw Error();
      } else {
        if (typeof body.messageFile !== 'string' || body.messageFile.length > 4096 || /[\x00-\x1f]/.test(body.messageFile) || !path.isAbsolute(body.messageFile)) throw Error();
        const descriptor = fs.openSync(body.messageFile, 'r');
        try {
          const stat = fs.fstatSync(descriptor);
          if (!stat.isFile() || stat.size > maxText) throw Error();
          // Bound the actual read too: another process could grow the file.
          const buffer = Buffer.alloc(maxText + 1); let count = 0;
          while (count < buffer.length) { const n = fs.readSync(descriptor, buffer, count, buffer.length - count, null); if (!n) break; count += n; }
          if (count > maxText) throw Error(); bytes = buffer.subarray(0, count);
        } finally { fs.closeSync(descriptor); }
      }
      value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
  } catch { throw fail('본문은 올바른 UTF-8 텍스트여야 합니다. Base64 또는 기존 UTF-8 파일을 확인하세요.'); }
  if (!value.trim() || value.includes('\0') || Buffer.byteLength(value, 'utf8') > maxText) throw fail('본문은 비어 있지 않은 UTF-8 텍스트로 최대 64 KiB입니다.');
  if (body.expectedSha256 !== undefined && (!/^[a-f0-9]{64}$/.test(body.expectedSha256) || sha(value) !== body.expectedSha256)) throw fail('본문 SHA-256이 다릅니다. 호출 과정에서 인코딩이 바뀌었는지 확인하세요.', 409);
  return value;
}

/** Durable UTF-8 mailbox. The terminal receives the sender and a reference to the stored body. */
export class SessionMessages {
  constructor({ file, sessionFor, context, notify, start = null, startBlocker = () => null, prepare = null, receipt = async () => null, publish = () => {}, observe = () => {}, readActivity = (_id, _targets, task) => task(), now = Date.now }) {
    Object.assign(this, { file, sessionFor, context, notify, start, startBlocker, prepare, receipt, publish, observe, readActivity, now });
    this.records = []; this.inflight = new Map(); this.targets = new Set(); this.sequence = 0; this.closed = false;
    this.persisted = new Map();
    this.archive = new SessionMessageArchive(file + '.archive.sqlite', validRecord);
    try {
      if (fs.statSync(file).size > maxStore) throw Error();
      const records = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(records) || records.length > 1000) throw Error();
      const ids = new Set(), keys = new Set(); let sequence = 0;
      for (const r of records) {
        const key = r?.sourceId + ':' + r?.requestKey;
        if (!validRecord(r) || ids.has(r.messageId) || keys.has(key) || r.sequence <= sequence) throw Error();
        sequence = r.sequence; ids.add(r.messageId); keys.add(key);
        if (r.delivery?.status === 'notifying') r.delivery = { status: 'unconfirmed', reason: 'app-restarted' };
        if (r.activation?.status === 'starting') {
          r.activation = { ...r.activation, status: 'unconfirmed' };
          r.delivery = { status: 'notification-error', reason: 'target-start-unconfirmed', nothingSent: true };
        }
      }
      this.records = records; this.sequence = sequence;
      this.persisted = new Map(records.map(r => [r.messageId, JSON.stringify(r)]));
    } catch (error) { if (error.code !== 'ENOENT' || fs.existsSync(this.archive.file)) this.unavailable = true; }
    if (!this.unavailable) {
      try { this.sequence = Math.max(this.sequence, this.archive.maxSequence()); }
      catch { this.unavailable = true; this.archive.close(); }
    }
  }
  archiveRead(read) {
    if (this.unavailable) throw fail('메시지 저장소를 확인할 수 없습니다.', 503);
    try { return read(); } catch { this.unavailable = true; throw fail('메시지 보관소를 확인할 수 없습니다. 원문과 요청 키를 보존한 채 복구가 필요합니다.', 503); }
  }
  findRecord(messageId) {
    if (typeof messageId !== 'string' || !/^[a-f0-9-]{36}$/.test(messageId)) return null;
    return this.records.find(r => r.messageId === messageId) || this.archiveRead(() => this.archive.byId(messageId));
  }
  save() {
    if (this.unavailable) throw fail('메시지 저장소를 확인할 수 없습니다.', 503);
    let records = this.records, json = JSON.stringify(records);
    const encoded = new Map(records.map(r => [r.messageId, JSON.stringify(r)]));
    const archived = [];
    if (records.length > 1000 || Buffer.byteLength(json, 'utf8') > maxStore) {
      // Do not archive newly changed state before it is durable. This makes
      // archive/hot duplicates after a crash identical and safe to reconcile.
      let bytes = Buffer.byteLength(json, 'utf8'), count = records.length;
      for (const r of records) {
        if (count <= 800 && bytes <= 12 * 1024 * 1024) break;
        if (!r.readAt || !['inbox', 'started', 'failed'].includes(r.delivery?.status) || this.inflight.has(r.messageId)
          || this.persisted.get(r.messageId) !== encoded.get(r.messageId)) continue;
        archived.push(r); count--; bytes -= Buffer.byteLength(encoded.get(r.messageId), 'utf8') + 1;
      }
      const ids = new Set(archived.map(r => r.messageId));
      records = records.filter(r => !ids.has(r.messageId)); json = JSON.stringify(records);
      if (records.length > 1000 || Buffer.byteLength(json, 'utf8') > maxStore) {
        const error = fail('미확인·전달 대기 메시지로 활성 저장 한도(1,000건·16 MiB)에 도달했습니다. 원문 읽음과 전달 상태를 확인해 주세요.', 507);
        error.code = 'MESSAGE_STORE_FULL'; throw error;
      }
    }
    try {
      this.archive.put(archived);
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', json, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(this.file + '.tmp', this.file);
    } catch { this.unavailable = true; throw fail('메시지 저장에 실패했습니다. 전송 상태를 다시 확인하세요.', 503); }
    this.records = records;
    this.persisted = new Map(records.map(r => [r.messageId, encoded.get(r.messageId)]));
  }
  async view(record, { content = false, includeBase64 = false, refreshReceipt = true } = {}) {
    const { message, signature, notificationKey, pinConversationId, pinStartedAt, pinProvider, ...value } = record;
    if (refreshReceipt && record.notify && record.notificationKey) {
      const current = await this.receipt(record.sourceId, notificationKey).catch(() => null);
      if (current && !(['queued', 'notifying'].includes(record.delivery?.status) && current.status === 'failed' && current.reason === 'not-sent')) value.delivery = current;
    }
    return { ...value, encoding: 'utf-8', bytes: Buffer.byteLength(message, 'utf8'), saved: true,
      ...(content ? { message, ...(includeBase64 ? { messageBase64: Buffer.from(message, 'utf8').toString('base64') } : {}) } : {}) };
  }
  async handle({ action, agentId, body = {} }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('JSON 객체가 필요합니다.');
    if (this.unavailable) throw fail('메시지 저장소를 확인할 수 없습니다.', 503);
    if (!this.sessionFor(agentId)) throw fail('호출 세션을 찾을 수 없습니다.', 404);
    return action === 'message-send' ? this.send(agentId, body) : action === 'message-receive' ? this.receive(agentId, body) : Promise.reject(fail('지원하지 않는 메시지 작업입니다.', 404));
  }
  async list(id) {
    const archived = this.archiveRead(() => this.archive.select({ agentId: id, recent: true, limit: 20, exclude: this.records.map(r => r.messageId) }));
    return Promise.all([...this.records.filter(r => r.sourceId === id || r.targetId === id), ...archived]
      .sort((a, b) => b.sequence - a.sequence).slice(0, 20).map(r => this.view(r)));
  }
  recentRecords(limit = 50) {
    const hot = this.records.slice(-limit);
    if (hot.length >= limit && hot[0].sequence > this.archiveRead(() => this.archive.maxSequence())) return hot;
    const archived = this.archiveRead(() => this.archive.select({ recent: true, limit, exclude: this.records.map(r => r.messageId) }));
    return [...hot, ...archived].sort((a, b) => a.sequence - b.sequence).slice(-limit);
  }
  notice(value) {
    return { ...value.delivery, deliveryId: value.delivery?.deliveryId || value.messageId, requestKey: 'text_' + value.messageId.replace(/-/g, ''),
      sourceId: value.sourceId, targetId: value.targetId, sourceName: value.sourceName, targetName: value.targetName,
      createdAt: value.createdAt, savedAt: value.createdAt, readAt: value.readAt, isMessage: true,
      status: value.delivery?.status === 'notification-error' ? 'failed' : value.delivery?.status === 'inbox' ? 'saved' : value.delivery?.status };
  }
  #state(record, delivery) {
    record.delivery = delivery; this.save();
    this.observe(record);
    void this.view(record).then(value => this.publish(value)).catch(() => {});
  }
  #queue(record, reason, retryAt) {
    const nextAttemptAt = this.now() + Math.min(30000, 1000 * 2 ** Math.min(record.notificationAttempts || 0, 5));
    this.#state(record, { status: 'queued', reason, nextAttemptAt: Math.max(retryAt || 0, nextAttemptAt), retryAt });
  }
  async dispatch(record, waitMs = 0, activationOnly = false) {
    if (this.closed || record.delivery?.status !== 'queued') return;
    if (activationOnly && record.activation?.status !== 'pending') return;
    if (!activationOnly && record.activation?.status === 'pending') return;
    if (this.inflight.has(record.messageId)) return this.inflight.get(record.messageId);
    if (this.targets.has(record.targetId)) return;
    if (!activationOnly && this.records.some(r => r.sequence < record.sequence && r.targetId === record.targetId && r.notify && pendingNotification(r.delivery?.status))) return;
    this.targets.add(record.targetId);
    const operation = Promise.resolve().then(() => activationOnly ? this.#activate(record, waitMs) : this.#notify(record, waitMs));
    this.inflight.set(record.messageId, operation);
    try { await operation; } finally { this.inflight.delete(record.messageId); this.targets.delete(record.targetId); }
  }
  async #activate(record, waitMs) {
    if (this.closed || this.unavailable || record.readAt) return;
    if (!this.context(record.sourceId)?.entry) { this.#queue(record, 'sender-offline'); return; }
    let context = this.context(record.targetId);
    const matches = current => {
      const target = this.sessionFor(record.targetId);
      return target && target.aiToolId === record.pinProvider && !target.sshHostId && !current?.entry?.ssh
        && (!record.pinConversationId || current?.conversationId === record.pinConversationId);
    };
    if (!matches(context)) {
      record.activation = { status: 'failed', at: this.now() };
      this.#state(record, { status: 'notification-error', reason: 'session-or-conversation-changed', nothingSent: true }); return;
    }
    const blocker = !context?.entry && this.startBlocker(this.sessionFor(record.targetId));
    if (blocker?.retryAt) { this.#queue(record, blocker.reason, blocker.retryAt); return; }
    if (blocker) {
      record.activation = { status: 'failed', at: this.now() };
      this.#state(record, { status: 'notification-error', reason: blocker.reason, nothingSent: true }); return;
    }
    record.activation = { status: 'starting', at: this.now() };
    this.#state(record, { status: 'queued', reason: 'target-starting' });
    try {
      // SessionStart is idempotent for an already-running target and never
      // selects a pane, creates a replacement session or changes permissions.
      const result = context?.entry ? { active: true, started: false } : await this.start(record.targetId, waitMs);
      if (this.closed) return;
      context = this.context(record.targetId);
      if (!result?.active || !context?.entry) throw Error('target-start-not-confirmed');
      if (!matches(context)) throw Error('session-or-conversation-changed');
      record.pinStartedAt = Number.isFinite(context.entry.startedAt) ? context.entry.startedAt : null;
      record.activation = { status: 'started', at: this.now(), started: result.started === true, background: true };
      this.#state(record, { status: 'queued', reason: 'startup-pending' });
    } catch (error) {
      if (this.closed || this.unavailable) return;
      record.activation = { ...record.activation, status: 'failed' };
      this.#state(record, { status: 'notification-error', reason: String(error.message || error).slice(0, 1000), nothingSent: true });
    }
  }
  async #notify(record, waitMs) {
    if (this.closed || this.unavailable) return;
    if (record.readAt) { this.#state(record, { status: 'inbox', reason: 'already-read' }); return; }
    const prior = await this.receipt(record.sourceId, record.notificationKey).catch(() => null);
    if (prior && !(prior.status === 'failed' && prior.reason === 'not-sent')) { this.#state(record, prior); return; }
    const context = this.context(record.targetId);
    if (!context?.entry || !this.context(record.sourceId)?.entry) { this.#queue(record, !context?.entry ? 'target-offline' : 'sender-offline'); return; }
    if (context.entry.ssh || context.entry.aiToolId !== record.pinProvider || record.pinConversationId && context.conversationId !== record.pinConversationId
      || !record.pinConversationId && record.pinStartedAt !== null && context.entry.startedAt !== record.pinStartedAt) {
      this.#state(record, { status: 'notification-error', reason: 'session-or-conversation-changed', nothingSent: true }); return;
    }
    let current = context, remaining = waitMs;
    try {
      if (this.prepare) {
        const deadline = performance.now() + waitMs;
        const status = await this.prepare(record.targetId, { waitMs, context });
        current = this.context(record.targetId);
        if (current?.entry !== context.entry || context.conversationId && current.conversationId !== context.conversationId
          || !context.conversationId && current?.conversationId && !status?.firstMessageReady) {
          this.#state(record, { status: 'notification-error', reason: 'session-or-conversation-changed', nothingSent: true }); return;
        }
        if (!status?.ready) { this.#queue(record, status?.reason || 'startup-pending', status?.retryAt); return; }
        remaining = Math.max(0, Math.floor(deadline - performance.now()));
      }
    } catch (error) { this.#state(record, { status: 'notification-error', reason: String(error.message || error).slice(0, 1000), nothingSent: true }); return; }
    if (this.closed || record.readAt) return;
    record.pinConversationId = current.conversationId ?? null;
    record.notificationAttempts = (record.notificationAttempts || 0) + 1;
    // Persist uncertain intent before any terminal call. A crash here is never
    // replayed on restart, even if the original receipt is not available yet.
    this.#state(record, { status: 'notifying' });
    const reference = sessionMessageNotification(record.messageId);
    try {
      const delivery = await this.notify(record.sourceId, { sessionId: record.targetId, expectedConversationId: record.pinConversationId, message: reference, requestKey: record.notificationKey, waitMs: remaining });
      if (delivery?.status === 'failed' && delivery.reason === 'not-sent') this.#retry(record, 'not-sent');
      else this.#state(record, delivery && ['sending', 'sent', 'received', 'started', 'failed', 'unconfirmed'].includes(delivery.status) ? delivery : { status: 'unconfirmed', reason: 'notification-outcome-unknown' });
    } catch (error) {
      if (error.nothingSent === true && [409, 503, 507].includes(error.statusCode)) this.#retry(record, error.code || String(error.message).slice(0, 1000));
      else this.#state(record, { status: 'unconfirmed', reason: String(error.message || error).slice(0, 1000) });
    }
  }
  #retry(record, reason) {
    if (record.notificationAttempts >= 5) this.#state(record, { status: 'notification-error', reason: `retry-limit: ${reason}`, nothingSent: true });
    else this.#queue(record, reason);
  }
  #settleReadQueue() {
    const settled = this.records.filter(r => r.readAt && r.delivery?.status === 'queued' && !this.inflight.has(r.messageId));
    if (!settled.length) return;
    const previous = settled.map(r => r.delivery);
    for (const r of settled) r.delivery = { status: 'inbox', reason: 'already-read' };
    try { this.save(); }
    catch (error) {
      settled.forEach((r, index) => { r.delivery = previous[index]; });
      throw error;
    }
    for (const r of settled) {
      this.observe(r);
      void this.view(r, { refreshReceipt: false }).then(value => this.publish(value)).catch(() => {});
    }
  }
  async poll() {
    if (this.closed || this.unavailable || this.polling) return;
    this.polling = true;
    try {
      this.#settleReadQueue();
      const pending = this.records.filter(r => r.notify && ['sending', 'sent', 'received'].includes(r.delivery?.status) && !this.inflight.has(r.messageId));
      const uncertain = this.records.filter(r => r.notify && r.delivery?.status === 'unconfirmed' && !this.inflight.has(r.messageId));
      const cursor = (this.receiptCursor || 0) % Math.max(1, uncertain.length), count = Math.max(0, 8 - Math.min(8, pending.length));
      const batch = [...pending.slice(0, 8), ...Array.from({ length: Math.min(count, uncertain.length) }, (_, i) => uncertain[(cursor + i) % uncertain.length])];
      this.receiptCursor = (cursor + count) % Math.max(1, uncertain.length);
      for (const r of batch) {
        const receipt = await this.receipt(r.sourceId, r.notificationKey).catch(() => null);
        if (receipt && JSON.stringify(receipt) !== JSON.stringify(r.delivery)) this.#state(r, receipt);
      }
      const starting = this.records.filter(r => r.delivery?.status === 'queued' && r.activation?.status === 'pending'
        && (r.delivery.nextAttemptAt || 0) <= this.now()).sort(byAttemptTime).slice(0, 4);
      await Promise.all(starting.map(r => this.dispatch(r, 0, true)));
      const first = new Map();
      for (const r of this.records) if (r.notify && pendingNotification(r.delivery?.status) && !first.has(r.targetId)) first.set(r.targetId, r);
      // A retried head moves behind older due targets, while the earliest
      // pending message for each target retains its place in that inbox.
      const due = [...first.values()].filter(r => r.delivery.status === 'queued' && (r.delivery.nextAttemptAt || 0) <= this.now()).sort(byAttemptTime).slice(0, 4);
      await Promise.all(due.map(r => this.dispatch(r, 0)));
    } finally { this.polling = false; }
  }
  close() { this.closed = true; this.archive.close(); }
  async send(sourceId, body) {
    if (Object.keys(body).some(k => !['sessionId', 'message', 'messageBase64', 'messageFile', 'expectedSha256', 'expectedConversationId', 'requestKey', 'notify', 'startIfOffline', 'replyTo', 'waitMs'].includes(k))
      || !validId(body.sessionId) || typeof body.requestKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.requestKey) || body.sessionId === sourceId
      || (body.notify !== undefined && typeof body.notify !== 'boolean') || (body.expectedConversationId !== undefined && !validId(body.expectedConversationId))
      || (body.startIfOffline !== undefined && typeof body.startIfOffline !== 'boolean') || body.startIfOffline === true && body.notify === false
      || (body.replyTo !== undefined && !validId(body.replyTo))) throw fail('대상 세션·requestKey·메시지 옵션을 확인하세요.');
    const waitMs = body.waitMs ?? 8000;
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 10000) throw fail('waitMs는 0~10000입니다.');
    const target = this.sessionFor(body.sessionId), source = this.sessionFor(sourceId);
    if (!target) throw fail('받는 세션을 찾을 수 없습니다.', 404);
    const message = sessionMessageText(body), notify = body.notify !== false;
    const signature = sha(JSON.stringify([body.sessionId, message, notify, body.replyTo || null, body.expectedConversationId || null,
      ...(body.startIfOffline === true ? [{ startIfOffline: true }] : [])]));
    const old = this.records.find(r => r.sourceId === sourceId && r.requestKey === body.requestKey)
      || this.archiveRead(() => this.archive.byKey(sourceId, body.requestKey));
    if (old) {
      if (old.signature !== signature) throw fail('같은 requestKey에 다른 메시지를 보낼 수 없습니다.', 409);
      if (old.startIfOffline && ['failed', 'unconfirmed'].includes(old.activation?.status) && old.delivery?.nothingSent) {
        old.activation = { status: 'pending' }; this.#state(old, { status: 'queued', reason: 'explicit-start-retry' });
      }
      // An explicit repeat of the original API call may restart a bounded retry
      // cycle only when every prior attempt is proven to have written no input.
      // Ordinary polling and application restart never reset this limit.
      if (old.delivery?.status === 'notification-error' && old.delivery.nothingSent === true && old.delivery.reason?.startsWith('retry-limit:') && old.pinProvider) {
        old.notificationAttempts = 0; this.#state(old, { status: 'queued', reason: 'explicit-safe-retry' });
      }
      if (old.delivery?.status === 'queued' && (old.delivery.nextAttemptAt || 0) <= this.now()) {
        const deadline = performance.now() + waitMs;
        await this.dispatch(old, waitMs, true);
        await this.dispatch(old, Math.max(0, Math.floor(deadline - performance.now())));
      }
      await this.inflight.get(old.messageId); return this.view(old);
    }
    if (body.replyTo) {
      const replied = this.findRecord(body.replyTo);
      if (!replied || replied.targetId !== sourceId || replied.sourceId !== body.sessionId) throw fail('받은 메시지의 발신 세션에만 replyTo로 답장할 수 있습니다.', 409);
    }
    const liveContext = this.context(body.sessionId);
    const context = liveContext ? { ...liveContext } : liveContext;
    const needsStart = notify && !context?.entry && body.startIfOffline === true;
    if (notify && (!['codex', 'claude'].includes(target.aiToolId) || !context?.entry && !needsStart || context?.entry?.ssh || target.sshHostId)) throw fail('자동 알림은 로컬 Codex·Claude에 지원합니다. 비활성 대상은 startIfOffline:true로 시작하거나 notify:false로 저장하세요.', 409);
    if (needsStart && !this.start) throw fail('비활성 세션 시작 기능을 사용할 수 없습니다.', 503);
    if (body.expectedConversationId && context?.conversationId !== body.expectedConversationId) throw fail('받는 대화가 변경되었습니다. 다시 조회하세요.', 409);
    const record = { messageId: randomUUID(), sequence: ++this.sequence, requestKey: body.requestKey, sourceId, sourceName: source.name || sourceId,
      targetId: body.sessionId, targetName: target.name || body.sessionId, message, sha256: sha(message), signature, notify,
      ...(body.startIfOffline === true ? { startIfOffline: true } : {}),
      ...(needsStart ? { activation: { status: 'pending' } } : {}),
      ...(body.replyTo ? { replyTo: body.replyTo } : {}), createdAt: this.now(), readAt: null,
      ...(notify ? { pinConversationId: context?.conversationId ?? null, pinStartedAt: Number.isFinite(context?.entry?.startedAt) ? context.entry.startedAt : null, pinProvider: target.aiToolId } : {}),
      delivery: { status: notify ? 'queued' : 'inbox' } };
    record.notificationKey = 'text_' + record.messageId.replace(/-/g, '');
    this.records.push(record);
    try { this.save(); } catch (error) { this.records.pop(); throw error; }
    this.observe(record);
    if (!notify) return this.view(record);
    const deadline = performance.now() + waitMs;
    if (needsStart) await this.dispatch(record, waitMs, true);
    const earlier = this.records.some(r => r !== record && r.targetId === record.targetId && r.notify && pendingNotification(r.delivery?.status));
    if (!earlier) await this.dispatch(record, Math.max(0, Math.floor(deadline - performance.now())));
    return this.view(record);
  }
  async receive(agentId, body) {
    if (Object.keys(body).some(k => !['messageId', 'direction', 'unreadOnly', 'after', 'limit', 'markRead', 'includeBase64'].includes(k))
      || (body.messageId !== undefined && !validId(body.messageId)) || (body.direction !== undefined && !['inbox', 'outbox'].includes(body.direction))
      || ['unreadOnly', 'markRead', 'includeBase64'].some(k => body[k] !== undefined && typeof body[k] !== 'boolean')
      || (body.after !== undefined && (!Number.isSafeInteger(body.after) || body.after < 0))
      || (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 20))) throw fail('수신함 조회 옵션을 확인하세요.');
    const outgoing = body.direction === 'outbox';
    const archived = body.messageId ? [this.findRecord(body.messageId)].filter(r => r && !this.records.includes(r))
      : outgoing || body.unreadOnly === false ? this.archiveRead(() => this.archive.select({ agentId, outgoing, after: body.after || 0,
        limit: (body.limit || 10) + 1, exclude: this.records.map(r => r.messageId) })) : [];
    const candidates = [...this.records, ...archived].filter(r => (outgoing ? r.sourceId : r.targetId) === agentId
      && (!body.messageId || r.messageId === body.messageId) && (body.messageId || r.sequence > (body.after || 0))
      && (body.messageId || outgoing || body.unreadOnly === false || !r.readAt)).sort((a, b) => a.sequence - b.sequence);
    if (body.messageId && !candidates.length) throw fail('이 세션의 메시지를 찾을 수 없습니다.', 404);
    const records = []; let bytes = 0;
    for (const r of candidates) { if (records.length >= (body.limit || 10) || bytes + Buffer.byteLength(r.message, 'utf8') > 128 * 1024) break; records.push(r); bytes += Buffer.byteLength(r.message, 'utf8'); }
    const changed = !outgoing && body.markRead !== false ? records.filter(r => !r.readAt) : [];
    if (changed.length) {
      const at = this.now(); changed.forEach(r => { r.readAt = at; });
      try { this.save(); } catch (error) { changed.forEach(r => { r.readAt = null; }); throw error; }
      for (const r of changed) { this.observe(r); void this.view(r, { refreshReceipt: false }).then(value => this.publish(value)).catch(() => {}); }
    }
    return this.readActivity(agentId, outgoing ? [] : records.map(r => r.sourceId), async () => ({
      direction: outgoing ? 'outbox' : 'inbox',
      // Reading the durable inbox must finish even while a terminal receipt is pending.
      messages: await Promise.all(records.map(r => this.view(r, { content: true, includeBase64: body.includeBase64 === true, refreshReceipt: outgoing }))),
      nextAfter: records.at(-1)?.sequence ?? body.after ?? 0, hasMore: candidates.length > records.length }));
  }
}
