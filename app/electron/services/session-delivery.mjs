import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value.replace(/\r\n?/g, '\n').trim()).digest('hex');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const keyPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const watching = r => ['sending', 'sent', 'received', 'unconfirmed'].includes(r.status);
const marker = /\[Acedia handoff: ([0-9a-f-]{36})\]/;
const label = value => String(value).replace(/[\x00-\x1f\x7f]/g, ' ');

export function deliveryComposerReady(entry) {
  const screen = entry.filter.viewportText?.() || '';
  if (/esc to interrupt|Queued follow-up inputs|shift\+.*answer/i.test(screen)) return false;
  const buffer = entry.filter.shadow?.buffer.active;
  const line = buffer?.getLine(buffer.baseY + buffer.cursorY);
  const text = line?.translateToString(true) || '';
  const prefix = text.match(/^\s*›\s/);
  if (!prefix || buffer.cursorX !== prefix[0].length) return false;
  // An empty Codex composer displays a dim/gray placeholder. Reject an
  // existing draft even when the user has moved its caret back to the start.
  for (let i = prefix[0].length; i < text.length; i++) {
    const cell = line.getCell(i);
    if (cell?.getChars().trim() && !cell.isDim() && (!cell.isFgPalette() || cell.getFgColor() !== 8)) return false;
  }
  return true;
}

// Only real user messages and identified turn-start events count as receipts.
// Keep a bounded cache across tail reads; quoted assistant/tool output is ignored.
export function deliveryEvidence(text, previous = { turn: null, receipts: [] }) {
  let turn = previous.turn;
  const receipts = new Map(previous.receipts.map(r => [r.deliveryId, r]));
  for (const line of text.split('\n')) {
    let row; try { row = JSON.parse(line); } catch { continue; }
    const at = Date.parse(row.timestamp), p = row.payload;
    if (!Number.isFinite(at)) continue;
    if (row.type === 'event_msg' && p?.type === 'task_started' && typeof p.turn_id === 'string') {
      turn = { id: p.turn_id, at };
    }
    if (row.type !== 'response_item' || p?.type !== 'message' || p.role !== 'user') continue;
    const value = (Array.isArray(p.content) ? p.content : []).filter(c => ['input_text', 'text'].includes(c?.type)).map(c => c.text || '').join('\n');
    const id = value.match(marker)?.[1];
    if (!id) continue;
    const receipt = { deliveryId: id, receivedAt: at, messageHash: hash(value) };
    if (turn && turn.at <= at) Object.assign(receipt, { turnId: turn.id, startedAt: turn.at });
    const old = receipts.get(id);
    if (!old || old.receivedAt === at) receipts.set(id, { ...old, ...receipt });
  }
  return { turn, receipts: [...receipts.values()].slice(-16) };
}

/** Persist intent before touching the PTY. Success requires a matching user
 * record and a NEW task_started, not merely a successful terminal write. */
export class SessionDeliveries {
  constructor({ file, context, read, ready, submit, publish = () => {}, now = Date.now, timeoutMs = 15000 }) {
    Object.assign(this, { file, context, read, ready, submit, publish, now, timeoutMs });
    this.records = new Map(); this.live = new Map(); this.waiters = new Set(); this.locks = new Set(); this.inflight = new Map();
    try {
      const records = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(records) || records.length > 1000 || records.some(r => !r || !/^[0-9a-f-]{36}$/.test(r.deliveryId || '')
        || typeof r.sourceId !== 'string' || typeof r.targetId !== 'string' || !keyPattern.test(r.requestKey || '')
        || !/^[0-9a-f]{64}$/.test(r.signature || '') || !/^[0-9a-f]{64}$/.test(r.messageHash || '')
        || !['sending', 'sent', 'received', 'started', 'failed', 'unconfirmed'].includes(r.status)
        || !Number.isFinite(r.createdAt))) throw Error('Invalid delivery history');
      for (const record of records) {
        if (watching(record)) Object.assign(record, { status: 'unconfirmed', reason: 'app-restarted' });
        this.records.set(this.#key(record.sourceId, record.requestKey), record);
      }
    } catch (error) { if (error.code !== 'ENOENT') this.unavailable = true; }
  }
  #key(sourceId, requestKey) { return sourceId + ':' + requestKey; }
  #save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify([...this.records.values()]), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  #view(record) {
    const { signature, messageHash, previousTurnId, ...view } = record;
    return { ...view };
  }
  #update(record, status, extra = {}) {
    Object.assign(record, { status, updatedAt: this.now(), ...extra });
    try { this.#save(); } catch { this.unavailable = true; }
    this.publish(this.#view(record));
    for (const listener of this.waiters) listener();
  }
  list(id) {
    return [...this.records.values()].filter(r => r.sourceId === id || r.targetId === id)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(r => this.#view(r));
  }
  async handle({ action, agentId, body }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('JSON object required', 400);
    const allowed = action === 'send' ? ['sessionId', 'expectedConversationId', 'message', 'requestKey', 'waitMs'] : ['requestKey', 'waitMs'];
    if (Object.keys(body).some(k => !allowed.includes(k)) || typeof body.requestKey !== 'string' || !keyPattern.test(body.requestKey)) throw fail('Invalid delivery options or requestKey', 400);
    const waitMs = body.waitMs ?? (action === 'send' ? 8000 : 0);
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 10000) throw fail('waitMs must be between 0 and 10000', 400);
    if (action === 'send') await this.#send(agentId, body);
    const record = this.records.get(this.#key(agentId, body.requestKey));
    if (!record) throw fail('Delivery not found for this calling session', 404);
    if (waitMs && ['sending', 'sent', 'received'].includes(record.status)) await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); this.waiters.delete(check); resolve(); };
      const check = () => { if (!['sending', 'sent', 'received'].includes(record.status)) finish(); };
      const timer = setTimeout(finish, waitMs); this.waiters.add(check); check();
    });
    return this.#view(record);
  }
  async #send(sourceId, body) {
    if (typeof body.sessionId !== 'string' || !body.sessionId || body.sessionId.length > 256
      || typeof body.expectedConversationId !== 'string' || !body.expectedConversationId || body.expectedConversationId.length > 256
      || typeof body.message !== 'string' || !body.message.trim() || /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(body.message)
      || Buffer.byteLength(body.message, 'utf8') > 8192) throw fail('Invalid target, conversation or message (maximum 8 KiB; no terminal controls)', 400);
    if (sourceId === body.sessionId) throw fail('Select a different receiving session', 400);
    const key = this.#key(sourceId, body.requestKey);
    const signature = hash(JSON.stringify([body.sessionId, body.expectedConversationId, body.message]));
    const old = this.records.get(key);
    if (old) {
      if (old.signature !== signature) throw fail('requestKey was already used with different content');
      return; // Never replay after a disconnect, timeout or app restart.
    }
    const pending = this.inflight.get(key);
    if (pending) {
      if (pending.signature !== signature) throw fail('requestKey was already used with different content');
      return pending.operation;
    }
    if (this.unavailable || this.records.size >= 1000) throw fail('Delivery history unavailable or full; nothing sent', 503);
    const operation = this.#deliver(sourceId, body, key, signature);
    this.inflight.set(key, { signature, operation });
    try { await operation; } finally { this.inflight.delete(key); }
  }
  async #deliver(sourceId, body, key, signature) {
    if (this.locks.has(body.sessionId)) throw fail('A delivery to this session is already being submitted');
    this.locks.add(body.sessionId);
    try {
      const source = this.context(sourceId), target = this.context(body.sessionId);
      if (!source?.entry) throw fail('Calling session is not active');
      if (!target?.entry || target.entry.ssh || target.entry.aiToolId !== 'codex') throw fail('Receiving session must be an active local Codex session');
      if (target.conversationId !== body.expectedConversationId) throw fail('Receiving conversation changed; refresh acedia_projects');
      const entry = target.entry, inputAt = entry.lastInputAt;
      const current = await this.read(body.sessionId);
      if (!current || current.sessionId !== target.conversationId || current.question || current.lifecycle === 'working'
        || !this.ready(target) || this.context(body.sessionId)?.entry !== entry || entry.lastInputAt !== inputAt) throw fail('Receiving session is busy, has a draft/question, or is not ready; nothing sent');
      const deliveryId = randomUUID();
      const message = `[Acedia handoff: ${deliveryId}]\nFrom: ${label(source.projectName || 'Project')} / ${label(source.name || sourceId)}\n\n${body.message}`;
      if (Buffer.byteLength(message, 'utf8') > 12288) throw fail('Delivery envelope too large', 400);
      const record = { deliveryId, requestKey: body.requestKey, sourceId, sourceName: source.name || sourceId,
        targetId: body.sessionId, targetName: target.name || body.sessionId, conversationId: target.conversationId,
        signature, messageHash: hash(message), previousTurnId: current.turn?.id || null,
        status: 'sending', createdAt: this.now(), updatedAt: this.now() };
      this.records.set(key, record);
      try { this.#save(); } catch { this.records.delete(key); this.unavailable = true; throw fail('Cannot record delivery; nothing sent', 503); }
      this.live.set(deliveryId, { entry, record }); this.publish(this.#view(record));
      const isCurrent = () => this.context(sourceId)?.entry === source.entry
        && this.context(body.sessionId)?.entry === entry && this.context(body.sessionId)?.conversationId === target.conversationId
        && entry.lastInputAt === inputAt;
      try {
        const submitted = await this.submit(body.sessionId, entry, message, isCurrent);
        if (!submitted) this.#update(record, 'failed', { reason: 'not-sent' });
        else if (record.status === 'sending') this.#update(record, 'sent', { sentAt: this.now() });
        else this.#update(record, record.status, { sentAt: this.now() });
      } catch { this.#update(record, 'unconfirmed', { reason: 'submission-uncertain' }); }
      this.observe(body.sessionId, entry, await this.read(body.sessionId).catch(() => null));
    } finally { this.locks.delete(body.sessionId); }
  }
  observe(id, entry, result) {
    if (!result) return;
    for (const { record, entry: expected } of this.live.values()) {
      if (record.targetId !== id || expected !== entry || result.sessionId !== record.conversationId || !watching(record)) continue;
      const receipt = result.deliveries?.find(r => r.deliveryId === record.deliveryId && r.messageHash === record.messageHash && r.receivedAt >= record.createdAt);
      if (!receipt) continue;
      if (!record.receivedAt) this.#update(record, 'received', { receivedAt: receipt.receivedAt, reason: undefined });
      if (receipt.turnId && receipt.turnId !== record.previousTurnId && receipt.startedAt >= record.createdAt) {
        this.#update(record, 'started', { startedAt: receipt.startedAt, turnId: receipt.turnId, reason: undefined });
        this.live.delete(record.deliveryId);
      }
    }
  }
  poll() {
    for (const { entry, record } of this.live.values()) {
      if (!watching(record)) { this.live.delete(record.deliveryId); continue; }
      const target = this.context(record.targetId);
      if (target?.entry !== entry || target?.conversationId !== record.conversationId) {
        this.#update(record, 'unconfirmed', { reason: 'session-changed' }); this.live.delete(record.deliveryId);
      } else if (record.status !== 'unconfirmed' && this.now() - record.createdAt >= this.timeoutMs) {
        this.#update(record, 'unconfirmed', { reason: record.receivedAt ? 'start-not-confirmed' : 'receipt-not-confirmed' });
      }
    }
  }
  dispose() {
    for (const { record } of this.live.values()) if (watching(record)) this.#update(record, 'unconfirmed', { reason: 'app-restarted' });
    this.live.clear();
  }
}
