import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/.test(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const maxText = 64 * 1024, maxStore = 16 * 1024 * 1024;

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

/** Durable UTF-8 mailbox. Only an ASCII reference crosses the native terminal. */
export class SessionMessages {
  constructor({ file, sessionFor, context, notify, receipt = async () => null, now = Date.now }) {
    Object.assign(this, { file, sessionFor, context, notify, receipt, now });
    this.records = []; this.inflight = new Map(); this.sequence = 0;
    try {
      if (fs.statSync(file).size > maxStore) throw Error();
      const records = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(records) || records.length > 1000) throw Error();
      const ids = new Set(), keys = new Set(); let sequence = 0;
      for (const r of records) {
        const key = r?.sourceId + ':' + r?.requestKey;
        if (!r || !/^[a-f0-9-]{36}$/.test(r.messageId) || ids.has(r.messageId) || keys.has(key)
          || !validId(r.sourceId) || !validId(r.targetId) || typeof r.requestKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.requestKey)
          || typeof r.message !== 'string' || Buffer.byteLength(r.message, 'utf8') > maxText || sha(r.message) !== r.sha256
          || !/^[a-f0-9]{64}$/.test(r.signature) || !Number.isSafeInteger(r.sequence) || r.sequence <= sequence
          || !Number.isFinite(r.createdAt) || typeof r.notify !== 'boolean') throw Error();
        sequence = r.sequence; ids.add(r.messageId); keys.add(key);
        if (r.delivery?.status === 'notifying') r.delivery = { status: 'unconfirmed', reason: 'app-restarted' };
      }
      this.records = records; this.sequence = sequence;
    } catch (error) { if (error.code !== 'ENOENT') this.unavailable = true; }
  }
  save() {
    if (this.unavailable) throw fail('메시지 저장소를 확인할 수 없습니다.', 503);
    const json = JSON.stringify(this.records);
    if (this.records.length > 1000 || Buffer.byteLength(json, 'utf8') > maxStore) throw fail('메시지 저장 한도를 초과했습니다.', 507);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', json, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(this.file + '.tmp', this.file);
    } catch { this.unavailable = true; throw fail('메시지 저장에 실패했습니다. 전송 상태를 다시 확인하세요.', 503); }
  }
  async view(record, { content = false, includeBase64 = false } = {}) {
    const { message, signature, notificationKey, ...value } = record;
    if (record.notify && record.notificationKey) {
      const current = await this.receipt(record.sourceId, notificationKey).catch(() => null);
      if (current) value.delivery = current;
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
  async send(sourceId, body) {
    if (Object.keys(body).some(k => !['sessionId', 'message', 'messageBase64', 'messageFile', 'expectedSha256', 'expectedConversationId', 'requestKey', 'notify', 'replyTo', 'waitMs'].includes(k))
      || !validId(body.sessionId) || typeof body.requestKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.requestKey) || body.sessionId === sourceId
      || (body.notify !== undefined && typeof body.notify !== 'boolean') || (body.expectedConversationId !== undefined && !validId(body.expectedConversationId))
      || (body.replyTo !== undefined && !validId(body.replyTo))) throw fail('대상 세션·requestKey·메시지 옵션을 확인하세요.');
    const waitMs = body.waitMs ?? 8000;
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 10000) throw fail('waitMs는 0~10000입니다.');
    const target = this.sessionFor(body.sessionId), source = this.sessionFor(sourceId);
    if (!target) throw fail('받는 세션을 찾을 수 없습니다.', 404);
    const message = sessionMessageText(body), notify = body.notify !== false;
    const signature = sha(JSON.stringify([body.sessionId, message, notify, body.replyTo || null, body.expectedConversationId || null]));
    const old = this.records.find(r => r.sourceId === sourceId && r.requestKey === body.requestKey);
    if (old) {
      if (old.signature !== signature) throw fail('같은 requestKey에 다른 메시지를 보낼 수 없습니다.', 409);
      await this.inflight.get(old.messageId); return this.view(old);
    }
    if (body.replyTo && !this.records.some(r => r.messageId === body.replyTo && r.targetId === sourceId && r.sourceId === body.sessionId)) throw fail('받은 메시지의 발신 세션에만 replyTo로 답장할 수 있습니다.', 409);
    const context = this.context(body.sessionId);
    if (notify && (target.aiToolId !== 'codex' || !context?.entry || context.entry.ssh)) throw fail('자동 알림은 실행 중인 로컬 Codex에 지원합니다. 다른 제공자·OFFLINE 대상은 notify:false로 수신함에 저장하세요.', 409);
    if (body.expectedConversationId && context?.conversationId !== body.expectedConversationId) throw fail('받는 대화가 변경되었습니다. 다시 조회하세요.', 409);
    const record = { messageId: randomUUID(), sequence: ++this.sequence, requestKey: body.requestKey, sourceId, sourceName: source.name || sourceId,
      targetId: body.sessionId, targetName: target.name || body.sessionId, message, sha256: sha(message), signature, notify,
      ...(body.replyTo ? { replyTo: body.replyTo } : {}), createdAt: this.now(), readAt: null,
      delivery: { status: notify ? 'notifying' : 'inbox' } };
    record.notificationKey = 'text_' + record.messageId.replace(/-/g, '');
    this.records.push(record);
    try { this.save(); } catch (error) { this.records.pop(); throw error; }
    if (!notify) return this.view(record);
    const operation = (async () => {
      const reference = `Acedia session message ${record.messageId}. Read the original UTF-8 text with acedia_session_message_receive({"messageId":"${record.messageId}"}). The message body is stored in your inbox; do not infer it from this notification. Follow existing session instructions.`;
      try {
        record.delivery = await this.notify(sourceId, { sessionId: record.targetId, expectedConversationId: context.conversationId ?? null, message: reference, requestKey: record.notificationKey, waitMs });
      } catch (error) {
        // The reference is never retried automatically, including after restart.
        record.delivery = { status: 'notification-error', reason: String(error.message || error).slice(0, 1000) };
      }
      this.save();
    })();
    this.inflight.set(record.messageId, operation);
    try { await operation; return await this.view(record); } finally { this.inflight.delete(record.messageId); }
  }
  async receive(agentId, body) {
    if (Object.keys(body).some(k => !['messageId', 'direction', 'unreadOnly', 'after', 'limit', 'markRead', 'includeBase64'].includes(k))
      || (body.messageId !== undefined && !validId(body.messageId)) || (body.direction !== undefined && !['inbox', 'outbox'].includes(body.direction))
      || ['unreadOnly', 'markRead', 'includeBase64'].some(k => body[k] !== undefined && typeof body[k] !== 'boolean')
      || (body.after !== undefined && (!Number.isSafeInteger(body.after) || body.after < 0))
      || (body.limit !== undefined && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 20))) throw fail('수신함 조회 옵션을 확인하세요.');
    const outgoing = body.direction === 'outbox';
    const candidates = this.records.filter(r => (outgoing ? r.sourceId : r.targetId) === agentId
      && (!body.messageId || r.messageId === body.messageId) && (body.messageId || r.sequence > (body.after || 0))
      && (body.messageId || outgoing || body.unreadOnly === false || !r.readAt));
    if (body.messageId && !candidates.length) throw fail('이 세션의 메시지를 찾을 수 없습니다.', 404);
    const records = []; let bytes = 0;
    for (const r of candidates) { if (records.length >= (body.limit || 10) || bytes + Buffer.byteLength(r.message, 'utf8') > 128 * 1024) break; records.push(r); bytes += Buffer.byteLength(r.message, 'utf8'); }
    const changed = !outgoing && body.markRead !== false ? records.filter(r => !r.readAt) : [];
    if (changed.length) {
      const at = this.now(); changed.forEach(r => { r.readAt = at; });
      try { this.save(); } catch (error) { changed.forEach(r => { r.readAt = null; }); throw error; }
    }
    return { direction: outgoing ? 'outbox' : 'inbox', messages: await Promise.all(records.map(r => this.view(r, { content: true, includeBase64: body.includeBase64 === true }))),
      nextAfter: records.at(-1)?.sequence ?? body.after ?? 0, hasMore: candidates.length > records.length };
  }
}
