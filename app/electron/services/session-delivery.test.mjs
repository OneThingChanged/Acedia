import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { deliveryComposerReady, deliveryEvidence, SessionDeliveries } from './session-delivery.mjs';
import { CodexScrollbackFilter } from './terminal-stream.mjs';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-delivery-test-'));
  cleanups.push(() => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-delivery-test-')) throw Error('Unexpected cleanup'); fs.rmSync(root, { recursive: true }); });
  let now = 10000, evidence = [];
  const contexts = { caller: { entry: {}, name: 'Main', projectName: 'Fixture' }, target: { entry: { id: 'target', aiToolId: 'codex', lastInputAt: 9000 }, name: 'UI', conversationId: 'conversation', state: 'DONE', reason: 'completed' } };
  const updates = [], file = path.join(root, 'deliveries.json');
  const options = { file, context: id => contexts[id], now: () => now, ready: () => true,
    read: vi.fn(async () => ({ sessionId: 'conversation', lifecycle: 'done', turn: { id: 'previous' }, deliveries: evidence })),
    submit: vi.fn(async () => true), publish: update => updates.push(update) };
  const service = new SessionDeliveries(options);
  const body = { sessionId: 'target', expectedConversationId: 'conversation', message: 'UI 초안 → 확인\n다음 작업을 진행해 주세요.', requestKey: 'draft-1', waitMs: 0 };
  const send = extra => service.handle({ action: 'send', agentId: 'caller', body: { ...body, ...extra } });
  const acknowledge = (started = true) => {
    const message = options.submit.mock.calls.at(-1)[2];
    const id = message.match(/handoff: ([0-9a-f-]+)/)[1];
    evidence = [{ deliveryId: id, messageHash: createHash('sha256').update(message.trim()).digest('hex'), receivedAt: now + 100,
      ...(started ? { turnId: 'new-turn', startedAt: now + 50 } : {}) }];
    service.observe('target', contexts.target.entry, { sessionId: 'conversation', deliveries: evidence });
  };
  return { root, options, service, contexts, body, send, acknowledge, updates, advance: ms => { now += ms; service.poll(); } };
}
it('reports actual sent, received and identified new-turn stages; keeps the original Unicode/multiline message', async () => {
  const f = fixture();
  expect(await f.send()).toMatchObject({ status: 'sent', sourceName: 'Main', targetName: 'UI', sentAt: 10000 });
  expect(f.options.submit.mock.calls[0][2]).toContain(f.body.message);
  f.acknowledge(false);
  expect(f.service.list('caller')[0]).toMatchObject({ status: 'received', receivedAt: 10100 });
  f.acknowledge(true);
  expect(await f.service.handle({ action: 'delivery', agentId: 'caller', body: { requestKey: f.body.requestKey } })).toMatchObject({ status: 'started', startedAt: 10050, turnId: 'new-turn' });
  expect(f.updates.map(u => u.status)).toEqual(['sending', 'sent', 'received', 'started']);
  expect(f.service.list('target')[0].deliveryId).toBe(f.service.list('caller')[0].deliveryId);
  expect(fs.readFileSync(f.options.file, 'utf8')).not.toContain('UI 초안');
});
it('deduplicates concurrent retries and app restarts without sending again, rejecting changed request content', async () => {
  const f = fixture();
  const [first, retry] = await Promise.all([f.send(), f.send()]);
  expect(first.deliveryId).toBe(retry.deliveryId); expect(f.options.submit).toHaveBeenCalledTimes(1);
  await expect(f.send({ message: 'Different' })).rejects.toMatchObject({ statusCode: 409 });
  const restarted = new SessionDeliveries(f.options);
  expect(await restarted.handle({ action: 'send', agentId: 'caller', body: f.body })).toMatchObject({ status: 'unconfirmed', reason: 'app-restarted' });
  expect(f.options.submit).toHaveBeenCalledTimes(1);
  await expect(restarted.handle({ action: 'delivery', agentId: 'other', body: { requestKey: f.body.requestKey } })).rejects.toMatchObject({ statusCode: 404 });
});
it('leaves timeout as unconfirmed, never replays text, and accepts a later exact receipt', async () => {
  const f = fixture(); await f.send();
  f.advance(16000);
  expect(f.service.list('caller')[0]).toMatchObject({ status: 'unconfirmed', reason: 'receipt-not-confirmed' });
  await f.send(); expect(f.options.submit).toHaveBeenCalledTimes(1);
  f.acknowledge(); expect(f.service.list('caller')[0].status).toBe('started');
});
it('does not count stale, quoted, mismatched or old-turn evidence as a started task', async () => {
  const f = fixture(); const r = await f.send();
  const matching = { deliveryId: r.deliveryId, messageHash: JSON.parse(fs.readFileSync(f.options.file))[0].messageHash, receivedAt: 10100, turnId: 'previous', startedAt: 9000 };
  f.service.observe('target', f.contexts.target.entry, { sessionId: 'other', deliveries: [matching] });
  f.service.observe('target', f.contexts.target.entry, { sessionId: 'conversation', deliveries: [{ ...matching, messageHash: 'wrong' }] });
  expect(f.service.list('caller')[0].status).toBe('sent');
  f.service.observe('target', f.contexts.target.entry, { sessionId: 'conversation', deliveries: [matching] });
  expect(f.service.list('caller')[0].status).toBe('received');
  f.advance(16000); expect(f.service.list('caller')[0].reason).toBe('start-not-confirmed');
});
it('refuses inactive, SSH, non-Codex, busy, changed, question and non-ready receivers before any input', async () => {
  const changes = [f => { f.contexts.target.entry = null; }, f => { f.contexts.target.entry.ssh = {}; }, f => { f.contexts.target.entry.aiToolId = 'claude'; },
    f => { f.contexts.target.conversationId = 'other'; }, f => { f.options.read.mockResolvedValue({ sessionId: 'conversation', lifecycle: 'working' }); },
    f => { f.options.read.mockResolvedValue({ sessionId: 'conversation', question: {} }); }, f => { f.service.ready = () => false; }];
  for (const change of changes) { const f = fixture(); change(f); await expect(f.send()).rejects.toThrow(); expect(f.options.submit).not.toHaveBeenCalled(); }
});
it('rejects terminal controls, self-targets, oversized input and invalid delivery options', async () => {
  const f = fixture();
  for (const body of [{ message: '\x1b[13u' }, { message: 'tab\tinput' }, { message: '가'.repeat(3000) }, { sessionId: 'caller' }, { requestKey: 123 }, { waitMs: 11000 }, { unexpected: true }, { expectedConversationId: '' }]) {
    await expect(f.send(body)).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(f.options.submit).not.toHaveBeenCalled();
});
it('keeps uncertain writes and session changes from ever being retried, and isolates target submission locks', async () => {
  const f = fixture(); let finish;
  f.options.submit.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.send(); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await expect(f.send({ requestKey: 'other-key' })).rejects.toThrow('already being submitted');
  finish(true); await pending;
  f.contexts.target.entry = { ...f.contexts.target.entry };
  f.service.poll(); expect(f.service.list('caller')[0]).toMatchObject({ status: 'unconfirmed', reason: 'session-changed' });
  await f.send(); expect(f.options.submit).toHaveBeenCalledTimes(1);
  const g = fixture(); g.options.submit.mockRejectedValueOnce(Error('paste happened, connection failed'));
  expect(await g.send()).toMatchObject({ status: 'unconfirmed', reason: 'submission-uncertain' });
  await g.send(); expect(g.options.submit).toHaveBeenCalledTimes(1);
});
it('waits for confirmation and fails closed when delivery history is corrupt or cannot be saved', async () => {
  const f = fixture(); const promise = f.send({ waitMs: 1000 });
  await vi.waitFor(() => expect(f.options.submit).toHaveBeenCalledTimes(1)); f.acknowledge();
  expect((await promise).status).toBe('started');
  fs.writeFileSync(f.options.file, 'not json'); const bad = new SessionDeliveries(f.options);
  await expect(bad.handle({ action: 'send', agentId: 'caller', body: { ...f.body, requestKey: 'new' } })).rejects.toMatchObject({ statusCode: 503 });
  const g = fixture(); fs.mkdirSync(g.options.file + '.tmp');
  await expect(g.send()).rejects.toMatchObject({ statusCode: 503 }); expect(g.options.submit).not.toHaveBeenCalled();
});
it('correlates only native user messages with task_started across bounded tail reads', () => {
  const id = '11111111-1111-4111-8111-111111111111', value = `[Acedia handoff: ${id}]\n실제 작업`, at = new Date(10000).toISOString();
  const row = payload => JSON.stringify({ type: 'response_item', timestamp: at, payload }) + '\n';
  const start = JSON.stringify({ type: 'event_msg', timestamp: at, payload: { type: 'task_started', turn_id: 'turn' } }) + '\n';
  expect(deliveryEvidence(row({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: value }] })).receipts).toEqual([]);
  expect(deliveryEvidence(row({ type: 'function_call', arguments: value })).receipts).toEqual([]);
  const before = deliveryEvidence(start);
  const result = deliveryEvidence(row({ type: 'message', role: 'user', content: [{ type: 'input_text', text: value }] }), before);
  expect(result.receipts[0]).toMatchObject({ deliveryId: id, turnId: 'turn', receivedAt: 10000, startedAt: 10000 });
  expect(deliveryEvidence('malformed\n' + row({ type: 'message', role: 'user', content: {} }), result).receipts).toEqual(result.receipts);
});
it('accepts an empty composer/gray placeholder and rejects existing drafts, queued input and running tools', async () => {
  const filter = new CodexScrollbackFilter(8, 80); cleanups.push(() => filter.dispose());
  const entry = { filter };
  const screen = async data => { filter.push('\x1b[2J\x1b[1;1H' + data); await new Promise(resolve => setTimeout(resolve, 20)); };
  await screen('› \x1b[90mAsk Codex to do anything\x1b[0m\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(true);
  await screen('› \x1b[2mAsk Codex to do anything\x1b[0m\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(true);
  await screen('› existing draft\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(false);
  await screen('› \x1b[2;1HQueued follow-up inputs\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(false);
  await screen('› \x1b[2;1Hesc to interrupt\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(false);
});
