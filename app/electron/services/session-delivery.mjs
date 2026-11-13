import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseTerminalStartupPrompt } from '../shared/terminal-startup-prompt.mjs';

const hash = value => createHash('sha256').update(value.replace(/\r\n?/g, '\n').trim()).digest('hex');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const keyPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const watching = r => ['sending', 'sent', 'received', 'unconfirmed'].includes(r.status);
const validRecord = r => r && /^[0-9a-f-]{36}$/.test(r.deliveryId || '') && typeof r.sourceId === 'string' && typeof r.targetId === 'string'
  && keyPattern.test(r.requestKey || '') && /^[0-9a-f]{64}$/.test(r.signature || '') && /^[0-9a-f]{64}$/.test(r.messageHash || '')
  && ['sending', 'sent', 'received', 'started', 'failed', 'unconfirmed'].includes(r.status) && Number.isFinite(r.createdAt);
const marker = /\[Acedia handoff: ([0-9a-f-]{36})\]/;
const label = value => String(value).replace(/[\x00-\x1f\x7f]/g, ' ');

export function deliveryComposerReady(entry, { allowWorking = false } = {}) {
  const screen = entry.filter.viewportText?.() || '';
  const claude = entry.aiToolId === 'claude';
  if (parseTerminalStartupPrompt(screen, claude ? 'claude' : 'codex')) return false;
  if (!allowWorking && /esc to interrupt|Queued follow-up inputs|shift\+.*answer/i.test(screen)) return false;
  if (claude && /waiting for .*background|Enter to (?:select|confirm)|Esc to cancel/i.test(screen)) return false;
  const buffer = entry.filter.shadow?.buffer.active;
  let row = buffer?.cursorY;
  if (claude && buffer) {
    // Ink parks the hardware cursor on the status row. Its empty framed input
    // is authoritative; do not confuse that parked cursor with a user draft.
    const rows = entry.filter.shadow.rows;
    row = -1;
    for (let i = 1; i < rows - 1; i++) if (/^\s*❯\s/.test(buffer.getLine(buffer.baseY + i)?.translateToString(true) || '')) row = i;
    if (row < 0 || !/^─+\s*$/.test(buffer.getLine(buffer.baseY + row - 1)?.translateToString(true) || '')
      || !/^─+\s*$/.test(buffer.getLine(buffer.baseY + row + 1)?.translateToString(true) || '')) return false;
    const footer = Array.from({ length: Math.min(4, rows - row - 2) }, (_, i) => buffer.getLine(buffer.baseY + row + 2 + i)?.translateToString(true) || '').join('\n');
    if (!/shift\+tab to cycle|^\s*\? for shortcuts/m.test(footer)) return false;
  }
  const line = buffer?.getLine(buffer.baseY + row);
  const text = line?.translateToString(true) || '';
  const prefix = text.match(claude ? /^\s*❯\s/ : /^\s*›\s/);
  if (!prefix || (!claude || row === buffer.cursorY) && buffer.cursorX !== prefix[0].length) return false;
  // An empty Codex composer displays a dim/gray placeholder. Reject an
  // existing draft even when the user has moved its caret back to the start.
  for (let i = prefix[0].length; i < text.length; i++) {
    const cell = line.getCell(i);
    if (cell?.getChars().trim() && !cell.isDim() && (!cell.isFgPalette() || cell.getFgColor() !== 8)
      && !(claude && cell.isFgRGB?.() && cell.getFgColor() === 0x999999)) return false;
  }
  return true;
}

// Claude has no Codex task_started event. Bind a real top-level user UUID to
// an assistant whose parent chain descends from it. A user append alone is
// received, never started. Keep bounded ancestry across incremental tail reads.
export function claudeDeliveryEvidence(text, previous = { turn: null, receipts: [], parents: [] }) {
  let turn = previous.turn;
  const receipts = new Map(previous.receipts.map(r => [r.deliveryId, { ...r }]));
  const parents = new Map(previous.parents || []), rows = [];
  for (const line of text.split('\n')) {
    let row; try { row = JSON.parse(line); } catch { continue; }
    if (row.isSidechain || !['user', 'assistant', 'attachment', 'system'].includes(row.type) || typeof row.uuid !== 'string' || !Number.isFinite(Date.parse(row.timestamp))) continue;
    rows.push(row);
    if (!parents.get(row.uuid)?.id) parents.set(row.uuid, { parentId: row.parentUuid });
    if (row.type !== 'user' || row.message?.role !== 'user') continue;
    const content = row.message.content;
    const value = typeof content === 'string' ? content : (Array.isArray(content) ? content : []).filter(c => c?.type === 'text').map(c => c.text || '').join('\n');
    if (!value.trim() || /^\s*\[Request interrupted/i.test(value)) continue;
    const at = Date.parse(row.timestamp);
    parents.set(row.uuid, { id: row.uuid, at });
    if (!turn || at > turn.at) turn = { id: row.uuid, at };
    const id = value.match(marker)?.[1];
    if (id && !receipts.has(id)) receipts.set(id, { deliveryId: id, receivedAt: at, messageHash: hash(value), userId: row.uuid });
  }
  for (const row of rows) {
    if (row.type !== 'assistant' || row.message?.role !== 'assistant' || !row.message?.id) continue;
    let ancestor = parents.get(row.parentUuid), depth = 0;
    while (ancestor && !ancestor.id && depth++ < 128) ancestor = parents.get(ancestor.parentId);
    if (depth >= 128) continue;
    if (!ancestor) continue;
    parents.set(row.uuid, ancestor);
    for (const receipt of receipts.values()) if (receipt.userId === ancestor.id && !receipt.startedAt) {
      receipt.turnId = ancestor.id; receipt.startedAt = Date.parse(row.timestamp);
    }
  }
  return { turn, receipts: [...receipts.values()].slice(-16), parents: [...parents].slice(-128) };
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
  constructor({ file, context, read, ready, submit, freshRead = () => null, publish = () => {}, now = Date.now, timeoutMs = 15000 }) {
    Object.assign(this, { file, context, read, ready, submit, freshRead, publish, now, timeoutMs });
    this.records = new Map(); this.live = new Map(); this.waiters = new Set(); this.locks = new Set(); this.inflight = new Map();
    try {
      const records = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(records) || records.length > 1000 || records.some(r => !validRecord(r))) throw Error('Invalid delivery history');
      for (const record of records) {
        if (watching(record)) Object.assign(record, { status: 'unconfirmed', reason: 'app-restarted' });
        this.records.set(this.#key(record.sourceId, record.requestKey), record);
      }
    } catch (error) { if (error.code !== 'ENOENT') this.unavailable = true; }
  }
  #key(sourceId, requestKey) { return sourceId + ':' + requestKey; }
  #archived(key) {
    const file = path.join(this.file + '.archive', createHash('sha256').update(key).digest('hex') + '.json');
    try {
      if (fs.statSync(file).size > 32 * 1024) throw Error('Invalid archived delivery');
      const record = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!validRecord(record) || this.#key(record.sourceId, record.requestKey) !== key) throw Error('Invalid archived delivery');
      return record;
    } catch (error) { if (error.code === 'ENOENT') return null; this.unavailable = true; throw Object.assign(fail('Delivery history unavailable; nothing sent', 503), { nothingSent: true, code: 'DELIVERY_HISTORY_UNAVAILABLE' }); }
  }
  #record(key) { return this.records.get(key) || this.#archived(key); }
  #compact() {
    if (this.records.size < 1000) return;
    // Retain complete per-key receipts on disk. Removing keys outright would
    // permit an old request to execute again after the hot history is rotated.
    const terminal = [...this.records].filter(([, r]) => ['started', 'failed'].includes(r.status)).sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [key, record] of terminal.slice(0, Math.max(1, this.records.size - 800))) {
      const file = path.join(this.file + '.archive', createHash('sha256').update(key).digest('hex') + '.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(record), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
      this.records.delete(key);
    }
  }
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
  async reconcile(sourceId, requestKey) {
    const record = this.#record(this.#key(sourceId, requestKey));
    if (!record || !watching(record) || this.unavailable) return;
    const target = this.context(record.targetId);
    if (!target?.entry || record.conversationId && target.conversationId !== record.conversationId) return;
    const result = await this.read(record.targetId);
    if (this.context(record.targetId)?.entry !== target.entry) return;
    this.live.set(record.deliveryId, { record, entry: target.entry });
    this.observe(record.targetId, target.entry, result);
  }
  async handle({ action, agentId, body, freshSession = false, asciiEnvelope = false, retryNotSent = false }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('JSON object required', 400);
    const allowed = action === 'send' ? ['sessionId', 'expectedConversationId', 'message', 'requestKey', 'waitMs'] : ['requestKey', 'waitMs'];
    if (Object.keys(body).some(k => !allowed.includes(k)) || typeof body.requestKey !== 'string' || !keyPattern.test(body.requestKey)) throw fail('Invalid delivery options or requestKey', 400);
    const waitMs = body.waitMs ?? (action === 'send' ? 8000 : 0);
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 10000) throw fail('waitMs must be between 0 and 10000', 400);
    if (action === 'send') await this.#send(agentId, body, freshSession, asciiEnvelope, retryNotSent);
    const record = this.#record(this.#key(agentId, body.requestKey));
    if (!record) throw fail('Delivery not found for this calling session', 404);
    if (waitMs && ['sending', 'sent', 'received'].includes(record.status)) await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); this.waiters.delete(check); resolve(); };
      const check = () => { if (!['sending', 'sent', 'received'].includes(record.status)) finish(); };
      const timer = setTimeout(finish, waitMs); this.waiters.add(check); check();
    });
    return this.#view(record);
  }
  async #send(sourceId, body, freshSession, asciiEnvelope, retryNotSent) {
    if (typeof body.sessionId !== 'string' || !body.sessionId || body.sessionId.length > 256
      || (!(freshSession && body.expectedConversationId == null) && (typeof body.expectedConversationId !== 'string' || !body.expectedConversationId || body.expectedConversationId.length > 256))
      || typeof body.message !== 'string' || !body.message.trim() || /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(body.message)
      || Buffer.byteLength(body.message, 'utf8') > 8192) throw fail('Invalid target, conversation or message (maximum 8 KiB; no terminal controls)', 400);
    if (sourceId === body.sessionId) throw fail('Select a different receiving session', 400);
    const key = this.#key(sourceId, body.requestKey);
    const signature = hash(JSON.stringify([body.sessionId, body.expectedConversationId, body.message]));
    const old = this.#record(key);
    if (old) {
      if (old.signature !== signature) throw fail('requestKey was already used with different content');
      if (!(retryNotSent && old.status === 'failed' && old.reason === 'not-sent')) return;
      // Only the durable mailbox scheduler enables this internal flag. Unknown
      // outcomes, sent messages and recovered receipts are never replayed.
    }
    const pending = this.inflight.get(key);
    if (pending) {
      if (pending.signature !== signature) throw fail('requestKey was already used with different content');
      return pending.operation;
    }
    if (this.unavailable) throw Object.assign(fail('Delivery history unavailable; nothing sent', 503), { nothingSent: true, code: 'DELIVERY_HISTORY_UNAVAILABLE' });
    try { this.#compact(); } catch { this.unavailable = true; throw Object.assign(fail('Cannot archive delivery history; nothing sent', 503), { nothingSent: true, code: 'DELIVERY_HISTORY_UNAVAILABLE' }); }
    if (this.records.size >= 1000) throw Object.assign(fail('Delivery history has 1000 unresolved entries; nothing sent', 503), { nothingSent: true, code: 'DELIVERY_HISTORY_FULL' });
    const operation = this.#deliver(sourceId, body, key, signature, freshSession, asciiEnvelope);
    this.inflight.set(key, { signature, operation });
    try { await operation; } finally { this.inflight.delete(key); }
  }
  async #deliver(sourceId, body, key, signature, freshSession, asciiEnvelope) {
    if (this.locks.has(body.sessionId)) throw Object.assign(fail('A delivery to this session is already being submitted'), { nothingSent: true });
    this.locks.add(body.sessionId); let inputAttempted = false;
    try {
      const source = this.context(sourceId), target = this.context(body.sessionId);
      if (!source?.entry) throw fail('Calling session is not active');
      if (!target?.entry || target.entry.ssh || !['codex', 'claude'].includes(target.entry.aiToolId)) throw fail('Receiving session must be an active local Codex or Claude session');
      const unbound = freshSession && body.expectedConversationId == null && target.conversationId == null;
      if (!unbound && target.conversationId !== body.expectedConversationId) throw fail('Receiving conversation changed; refresh acedia_projects');
      const entry = target.entry, inputAt = entry.lastInputAt;
      const observed = await this.read(body.sessionId);
      const fresh = freshSession ? this.freshRead(body.sessionId) : null;
      const current = observed || fresh;
      // Only host-verified fresh launches can use the pre-first-turn path.
      // External callers cannot set this flag. Existing transcripts, resumed
      // conversations, drafts, questions and managed worker model checks stay
      // authoritative even when no conversation has been published yet.
      const firstTurn = !!fresh && fresh.sessionId === target.conversationId && !current?.turn;
      const blocked = !current ? 'transcript-unavailable'
        : current.sessionId !== target.conversationId ? 'conversation-changed'
        : unbound && !firstTurn ? 'first-message-not-ready'
        : current.question ? 'question-pending'
        : current.lifecycle === 'working' && !firstTurn ? 'turn-working'
        : !this.ready(target, { freshSession: firstTurn }) ? 'composer-or-runtime-not-ready'
        : this.context(body.sessionId)?.entry !== entry ? 'session-changed'
        : entry.lastInputAt !== inputAt ? 'input-changed' : null;
      if (blocked) throw fail(`Receiving session is not ready (${blocked}); nothing sent`);
      const deliveryId = randomUUID();
      const from = asciiEnvelope ? 'Acedia session' : `${label(source.projectName || 'Project')} / ${label(source.name || sourceId)}`;
      const message = `[Acedia handoff: ${deliveryId}]\nFrom: ${from}\n\n${body.message}`;
      if (Buffer.byteLength(message, 'utf8') > 12288) throw fail('Delivery envelope too large', 400);
      const record = { deliveryId, requestKey: body.requestKey, sourceId, sourceName: source.name || sourceId,
        targetId: body.sessionId, targetName: target.name || body.sessionId, conversationId: target.conversationId ?? null,
        ...(unbound ? { freshUnbound: true } : {}),
        signature, messageHash: hash(message), previousTurnId: current.turn?.id || null,
        status: 'sending', createdAt: this.now(), updatedAt: this.now() };
      this.records.set(key, record);
      try { this.#save(); } catch { this.records.delete(key); this.unavailable = true; throw fail('Cannot record delivery; nothing sent', 503); }
      this.live.set(deliveryId, { entry, record }); this.publish(this.#view(record));
      const isCurrent = () => this.context(sourceId)?.entry === source.entry
        && this.context(body.sessionId)?.entry === entry && (unbound || this.context(body.sessionId)?.conversationId === target.conversationId)
        && entry.lastInputAt === inputAt;
      try {
        inputAttempted = true;
        const submitted = await this.submit(body.sessionId, entry, message, isCurrent);
        if (!submitted) this.#update(record, 'failed', { reason: 'not-sent' });
        else if (record.status === 'sending') this.#update(record, 'sent', { sentAt: this.now() });
        else this.#update(record, record.status, { sentAt: this.now() });
      } catch { this.#update(record, 'unconfirmed', { reason: 'submission-uncertain' }); }
      this.observe(body.sessionId, entry, await this.read(body.sessionId).catch(() => null));
    } catch (error) { if (!inputAttempted) error.nothingSent = true; throw error; }
    finally { this.locks.delete(body.sessionId); }
  }
  observe(id, entry, result) {
    if (!result) return;
    for (const { record, entry: expected } of this.live.values()) {
      if (record.targetId !== id || expected !== entry || (!record.freshUnbound && result.sessionId !== record.conversationId) || !watching(record)) continue;
      const receipt = result.deliveries?.find(r => r.deliveryId === record.deliveryId && r.messageHash === record.messageHash && r.receivedAt >= record.createdAt);
      if (!receipt) continue;
      if (record.freshUnbound) {
        if (!result.sessionId || !receipt.turnId || receipt.startedAt < record.createdAt) continue;
        // Bind a fresh CLI's first conversation only to this exact envelope
        // hash and new turn; merely observing a session ID is insufficient.
        record.conversationId = result.sessionId; record.freshUnbound = false;
      }
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
      if (target?.entry !== entry || (!record.freshUnbound && target?.conversationId !== record.conversationId)) {
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
