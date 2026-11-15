import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionMessages } from './session-messages.mjs';

const cleanups = [], hash = value => createHash('sha256').update(value).digest('hex');
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
function fixture({ count = 1000, read = 820, text = '한글 보고서\n\n띄어쓰기와 원문을 보존합니다.', status = 'inbox' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-mail-archive-'));
  const stores = [], file = path.join(root, 'messages.json'), state = { clock: 1000, ready: false };
  cleanups.push(() => {
    for (const store of stores) store.close();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-mail-archive-')) throw Error('Unsafe fixture cleanup');
    fs.rmSync(root, { recursive: true });
  });
  const notify = vi.fn(async () => ({ status: 'started', deliveryId: randomUUID() }));
  const entry = { aiToolId: 'codex', startedAt: 1 };
  const options = { file, sessionFor: id => ['sender', 'receiver', 'other'].includes(id) && { id, name: id, aiToolId: 'codex' },
    context: () => ({ entry, conversationId: 'conversation' }), now: () => state.clock,
    prepare: async () => ({ ready: state.ready, reason: 'turn-working' }), receipt: async () => null, notify };
  const seed = Array.from({ length: count }, (_, i) => {
    const messageId = randomUUID(), notify = status !== 'inbox';
    return { messageId, sequence: i + 1, requestKey: 'seed-' + i, sourceId: 'sender', sourceName: '발신', targetId: 'receiver', targetName: '수신',
      message: text, sha256: hash(text), signature: hash(JSON.stringify(['receiver', text, notify, null, null])), notify,
      createdAt: i + 1, readAt: i < read ? 1000 : null, notificationKey: 'text_' + messageId.replace(/-/g, ''),
      ...(notify ? { pinConversationId: 'conversation', pinProvider: 'codex', pinStartedAt: 1 } : {}), delivery: { status } };
  });
  fs.writeFileSync(file, JSON.stringify(seed));
  const create = () => { const service = new SessionMessages(options); stores.push(service); return service; };
  const service = create();
  return { root, file, state, notify, seed, service, create,
    send: (body, caller = 'sender', target = service) => target.handle({ action: 'message-send', agentId: caller,
      body: { sessionId: 'receiver', message: '새 보고입니다.\n다음 작업도 확인해 주세요.', requestKey: 'new-report', waitMs: 0, ...body } }) };
}

it('accepts a new report at the production 1000-record boundary and queues it until the manager is ready', async () => {
  const f = fixture();
  const result = await f.send();
  expect(result).toMatchObject({ saved: true, delivery: { status: 'queued', reason: 'turn-working' } });
  expect(f.service.records).toHaveLength(800);
  expect(f.service.archive.open().prepare('SELECT count(*) AS n FROM messages').get().n).toBe(201);
  expect(f.notify).not.toHaveBeenCalled();
  expect(f.service.records.filter(r => !r.readAt)).toHaveLength(181);
  expect(f.service.findRecord(f.seed[0].messageId).message).toBe(f.seed[0].message);
  f.service.close(); const restored = f.create();
  f.state.ready = true; f.state.clock = 10000;
  await restored.poll(); await restored.poll();
  expect(f.notify).toHaveBeenCalledOnce();
  expect(f.notify.mock.calls[0][1].message).toContain(result.messageId);
  const received = await restored.receive('receiver', { messageId: result.messageId, markRead: false });
  expect(received.messages[0]).toMatchObject({ message: result.message ?? '새 보고입니다.\n다음 작업도 확인해 주세요.', readAt: null });
  const repeated = await f.send({ requestKey: 'seed-0', message: f.seed[0].message, notify: false }, 'sender', restored);
  expect(repeated.messageId).toBe(f.seed[0].messageId); expect(f.notify).toHaveBeenCalledOnce();
  await expect(f.send({ requestKey: 'seed-0', message: '바뀐 보고', notify: false }, 'sender', restored)).rejects.toMatchObject({ statusCode: 409 });
  await expect(f.send({ sessionId: 'other', requestKey: 'seed-0', message: f.seed[0].message, notify: false }, 'sender', restored)).rejects.toMatchObject({ statusCode: 409 });
});

it('retains exact-ID access, participant isolation, replies and ordered history across hot/archive boundaries', async () => {
  const f = fixture({ read: 1000 }); await f.send({ notify: false });
  const id = f.seed[0].messageId;
  const original = await f.service.receive('receiver', { messageId: id, markRead: false, includeBase64: true });
  expect(original.messages[0]).toMatchObject({ message: f.seed[0].message, sha256: f.seed[0].sha256, readAt: 1000 });
  expect(Buffer.from(original.messages[0].messageBase64, 'base64').toString('utf8')).toBe(f.seed[0].message);
  await expect(f.service.receive('other', { messageId: id })).rejects.toMatchObject({ statusCode: 404 });
  expect((await f.service.receive('sender', { messageId: id, direction: 'outbox' })).messages[0].messageId).toBe(id);
  const page = await f.service.receive('receiver', { unreadOnly: false, after: 190, limit: 20, markRead: false });
  expect(page.messages.map(r => r.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => 191 + i));
  expect(page).toMatchObject({ nextAfter: 210, hasMore: true });
  expect((await f.service.receive('sender', { direction: 'outbox', limit: 20 })).messages.map(r => r.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect((await f.service.receive('receiver', {})).messages.map(r => r.sequence)).toEqual([1001]);
  expect((await f.service.list('sender')).map(r => r.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => 1001 - i));
  await f.send({ sessionId: 'sender', replyTo: id, requestKey: 'reply-archived', message: '확인했습니다.', notify: false }, 'receiver');
  await expect(f.send({ sessionId: 'sender', replyTo: id, requestKey: 'wrong-reply', notify: false }, 'other')).rejects.toMatchObject({ statusCode: 409 });
});

it('archives large read bodies before reaching the byte limit even with fewer than 1000 records', async () => {
  const text = 'x'.repeat(64 * 1024), f = fixture({ count: 252, read: 252, text });
  expect(f.service.unavailable).toBeFalsy();
  for (let i = 0; i < 6 && !fs.existsSync(f.file + '.archive.sqlite'); i++) await f.send({ requestKey: 'large-' + i, message: text, notify: false });
  expect(fs.existsSync(f.file + '.archive.sqlite')).toBe(true);
  expect(fs.statSync(f.file).size).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(f.service.findRecord(f.seed[0].messageId).message).toBe(text);
  expect(f.service.records.some(r => r.requestKey.startsWith('large-') && !r.readAt)).toBe(true);
});

it('preserves the board latest-transfer evidence when only newer read messages can be archived', async () => {
  const f = fixture({ read: 0 });
  for (const record of f.service.records.slice(-50)) record.readAt = 1000;
  f.service.save(); await f.send({ notify: false });
  expect(f.service.records).toHaveLength(951);
  expect(f.service.recentRecords(50).map(r => r.sequence)).toEqual(Array.from({ length: 50 }, (_, i) => 952 + i));
  expect((await f.service.list('sender')).map(r => r.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => 1001 - i));
});

it.each(['unread', 'queued', 'sent', 'received', 'unconfirmed', 'notification-error'])('never archives %s records just to accept another report', async status => {
  const f = fixture({ read: status === 'unread' ? 0 : 1000, status: status === 'unread' ? 'inbox' : status });
  const before = fs.readFileSync(f.file);
  await expect(f.send({ notify: false })).rejects.toMatchObject({ statusCode: 507, code: 'MESSAGE_STORE_FULL' });
  expect(fs.readFileSync(f.file)).toEqual(before);
  expect(fs.existsSync(f.file + '.archive.sqlite')).toBe(false);
  expect(f.notify).not.toHaveBeenCalled(); expect(f.service.records).toHaveLength(1000);
});

it('keeps the original hot file and sends nothing if the archive cannot be persisted', async () => {
  const f = fixture(), before = fs.readFileSync(f.file);
  fs.mkdirSync(f.file + '.archive.sqlite');
  await expect(f.send()).rejects.toMatchObject({ statusCode: 503 });
  expect(fs.readFileSync(f.file)).toEqual(before); expect(f.notify).not.toHaveBeenCalled();
});

it('recovers identical archive/hot copies after interruption between archive commit and JSON replacement', async () => {
  const f = fixture({ read: 1000 }), before = fs.readFileSync(f.file);
  fs.mkdirSync(f.file + '.tmp');
  await expect(f.send()).rejects.toMatchObject({ statusCode: 503 });
  expect(fs.readFileSync(f.file)).toEqual(before); expect(f.notify).not.toHaveBeenCalled();
  expect(f.service.archive.open().prepare('SELECT count(*) AS n FROM messages').get().n).toBe(201);
  f.service.close(); fs.rmdirSync(f.file + '.tmp');
  const restored = f.create();
  const old = await f.send({ requestKey: 'seed-0', message: f.seed[0].message, notify: false }, 'sender', restored);
  expect(old.messageId).toBe(f.seed[0].messageId);
  await f.send({ notify: false }, 'sender', restored);
  const page = await restored.receive('receiver', { unreadOnly: false, markRead: false, limit: 20 });
  expect(page.messages.map(r => r.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(new Set(page.messages.map(r => r.messageId)).size).toBe(20);
  expect(restored.archive.open().prepare('SELECT count(*) AS n FROM messages').get().n).toBe(201);
});

it('fails closed on corrupt archived content and does not replay an old request key', async () => {
  const f = fixture({ read: 1000 }); await f.send({ notify: false });
  const record = { ...f.seed[0], message: '변조된 원문' };
  f.service.archive.open().prepare('UPDATE messages SET record=? WHERE message_id=?').run(JSON.stringify(record), record.messageId);
  f.service.close(); const restored = f.create();
  await expect(restored.receive('receiver', { messageId: record.messageId })).rejects.toMatchObject({ statusCode: 503 });
  await expect(f.send({ requestKey: 'seed-0', message: f.seed[0].message, notify: false }, 'sender', restored)).rejects.toMatchObject({ statusCode: 503 });
  expect(f.notify).not.toHaveBeenCalled();
});

it('does not restart sequence numbering if the hot file is missing beside an existing archive', async () => {
  const f = fixture({ read: 1000 }); await f.send({ notify: false }); f.service.close();
  fs.renameSync(f.file, f.file + '.backup');
  const restored = f.create(); expect(restored.unavailable).toBe(true);
  await expect(f.send({ notify: false }, 'sender', restored)).rejects.toMatchObject({ statusCode: 503 });
});

it.each(['missing', 'truncated'])('does not resend archived requests when their required database is %s', async damage => {
  const f = fixture({ read: 1000 }); await f.send({ notify: false }); f.service.close();
  if (damage === 'missing') fs.renameSync(f.file + '.archive.sqlite', f.file + '.archive.sqlite.backup');
  else fs.writeFileSync(f.file + '.archive.sqlite', '');
  const restored = f.create(); expect(restored.unavailable).toBe(true);
  await expect(f.send({ requestKey: 'seed-0', message: f.seed[0].message, notify: false }, 'sender', restored)).rejects.toMatchObject({ statusCode: 503 });
  expect(f.notify).not.toHaveBeenCalled();
});
