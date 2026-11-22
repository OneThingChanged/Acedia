import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { deliveryComposerReady, deliveryEvidence, deliverySummary, SessionDeliveries } from './session-delivery.mjs';
import { sessionMessageNotification } from './session-messages.mjs';
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
it('rotates completed history without forgetting archived request keys across restart', async () => {
  const f = fixture(), initial = await f.send(), saved = structuredClone([...f.service.records.values()][0]);
  f.service.records.clear();
  for (let i = 0; i < 1000; i++) f.service.records.set('caller:old-' + i, { ...saved, requestKey: 'old-' + i, status: 'started' });
  expect((await f.send({ requestKey: 'new' })).status).toBe('sent');
  expect(f.service.records.size).toBeLessThan(1000);
  const reopened = new SessionDeliveries(f.options);
  expect(await reopened.handle({ action: 'send', agentId: 'caller', body: { ...f.body, requestKey: 'old-0' } })).toMatchObject({ status: 'started', deliveryId: initial.deliveryId });
  expect(f.options.submit).toHaveBeenCalledTimes(2);
});
it('distinguishes unresolved history capacity from corruption without discarding uncertain receipts', async () => {
  const f = fixture(); await f.send(); const saved = structuredClone([...f.service.records.values()][0]);
  f.service.records.clear(); for (let i = 0; i < 1000; i++) f.service.records.set('caller:u-' + i, { ...saved, requestKey: 'u-' + i, status: 'unconfirmed' });
  await expect(f.send({ requestKey: 'new' })).rejects.toMatchObject({ code: 'DELIVERY_HISTORY_FULL', nothingSent: true });
  expect(f.service.records.size).toBe(1000); expect(f.options.submit).toHaveBeenCalledOnce();
  fs.writeFileSync(f.options.file, 'corrupted'); const broken = new SessionDeliveries(f.options);
  await expect(broken.handle({ action: 'send', agentId: 'caller', body: f.body })).rejects.toMatchObject({ code: 'DELIVERY_HISTORY_UNAVAILABLE', nothingSent: true });
  expect(fs.readFileSync(f.options.file, 'utf8')).toBe('corrupted');
});
it('allows internal mailbox retry only after a definite not-sent result', async () => {
  const f = fixture(); f.options.submit.mockResolvedValueOnce(false);
  expect((await f.send()).reason).toBe('not-sent'); await f.send(); expect(f.options.submit).toHaveBeenCalledOnce();
  await f.service.handle({ action: 'send', agentId: 'caller', body: f.body, retryNotSent: true }); expect(f.options.submit).toHaveBeenCalledTimes(2);
  const g = fixture(); g.options.submit.mockRejectedValue(Error('outcome unknown'));
  await g.send(); await g.service.handle({ action: 'send', agentId: 'caller', body: g.body, retryNotSent: true }); expect(g.options.submit).toHaveBeenCalledOnce();
});
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
  const stored = JSON.parse(fs.readFileSync(f.options.file, 'utf8'))[0];
  expect(stored.summary).toBe('UI 초안 → 확인'); expect(stored.message).toBeUndefined();
});
it('passes a verified cancelled turn to the native readiness check before sending a new instruction', async () => {
  const f = fixture();
  f.options.read.mockResolvedValue({ sessionId: 'conversation', lifecycle: 'idle', turn: { id: 'cancelled', status: 'cancelled', at: 9900 } });
  f.service.ready = vi.fn(() => false);
  await expect(f.send()).rejects.toThrow('composer-or-runtime-not-ready');
  expect(f.service.ready).toHaveBeenCalledWith(f.contexts.target, { freshSession: false, resumedSession: false, cancelledAt: 9900 });
  expect(f.options.submit).not.toHaveBeenCalled();
  f.service.ready.mockReturnValue(true);
  expect((await f.send()).status).toBe('sent');
});
it('uses the real project and sender in a one-line mailbox notification with a verifiable receipt', async () => {
  const f = fixture(); f.contexts.caller.name = '관리자\n\t검증'; f.contexts.caller.projectName = '한글 프로젝트';
  const body = { ...f.body, message: sessionMessageNotification('22222222-2222-4222-8222-222222222222') };
  const result = await f.service.handle({ action: 'send', agentId: 'caller', body, mailboxNotification: true });
  const wire = f.options.submit.mock.calls[0][2];
  expect(wire).toBe(`[Acedia handoff: ${result.deliveryId}] From: 한글 프로젝트 / 관리자 검증 | ${body.message}`);
  const evidence = deliveryEvidence(JSON.stringify({ type: 'response_item', timestamp: new Date(10100).toISOString(),
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: wire }] } }));
  f.service.observe('target', f.contexts.target.entry, { sessionId: 'conversation', deliveries: evidence.receipts });
  expect(f.service.list('target')[0]).toMatchObject({ status: 'received', notificationFrom: '한글 프로젝트 / 관리자 검증' });
});

it('retains a bounded Unicode summary through restart without storing the full direct-handoff body', async () => {
  const f = fixture(), message = '\n  수정 검증   결과입니다. 🚀\n상세 근거는 별도 문서를 확인하세요.';
  const first = await f.send({ message });
  expect(first.summary).toBe('수정 검증 결과입니다. 🚀');
  const stored = JSON.parse(fs.readFileSync(f.options.file, 'utf8'))[0];
  expect(stored.summary).toBe(first.summary); expect(stored.message).toBeUndefined();
  expect(JSON.stringify(stored)).not.toContain('상세 근거');
  const restored = new SessionDeliveries(f.options);
  expect((await restored.handle({ action: 'send', agentId: 'caller', body: { ...f.body, message } })).summary).toBe(first.summary);
  expect(f.options.submit).toHaveBeenCalledOnce();
  delete stored.summary; fs.writeFileSync(f.options.file, JSON.stringify([stored]));
  const legacy = new SessionDeliveries(f.options);
  expect(legacy.unavailable).toBeFalsy(); expect(legacy.list('caller')[0].summary).toBeUndefined();
});

it('keeps summary truncation on a valid Unicode boundary', () => {
  const summary = deliverySummary('a'.repeat(199) + '🚀' + '\nprivate detail');
  expect(summary.length).toBe(199); expect(summary.isWellFormed()).toBe(true); expect(summary).not.toContain('private detail');
});
it('allows only the internal first-turn path with an empty composer and no previous turn', async () => {
  const f = fixture();
  f.options.read.mockResolvedValue({ sessionId: 'conversation', lifecycle: 'working', turn: null, question: null });
  await expect(f.send()).rejects.toThrow('turn-working');
  await expect(f.service.handle({ action: 'send', agentId: 'caller', body: f.body, freshSession: true })).rejects.toThrow('turn-working');
  f.service.freshRead = () => ({ sessionId: 'conversation', lifecycle: 'idle', turn: null, question: null });
  expect(await f.service.handle({ action: 'send', agentId: 'caller', body: f.body, freshSession: true })).toMatchObject({ status: 'sent' });
  const g = fixture();
  g.options.read.mockResolvedValue({ sessionId: 'conversation', lifecycle: 'working', turn: { id: 'existing-turn' } });
  await expect(g.service.handle({ action: 'send', agentId: 'caller', body: g.body, freshSession: true })).rejects.toThrow('turn-working');
  await expect(g.send({ freshSession: true })).rejects.toMatchObject({ statusCode: 400 });
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
it('recovers a receipt lost at shutdown by reading exact transcript evidence without resubmission', async () => {
  const f = fixture(); await f.send(); f.acknowledge();
  const records = JSON.parse(fs.readFileSync(f.options.file)); records[0].status = 'sent'; delete records[0].turnId;
  fs.writeFileSync(f.options.file, JSON.stringify(records));
  const restored = new SessionDeliveries(f.options);
  const receipt = f.service.list('caller')[0], message = f.options.submit.mock.calls[0][2];
  f.options.read.mockResolvedValue({ sessionId: 'conversation', deliveries: [{ deliveryId: receipt.deliveryId, messageHash: createHash('sha256').update(message.trim()).digest('hex'), receivedAt: 10100, turnId: 'new-turn', startedAt: 10050 }] });
  await restored.reconcile('caller', f.body.requestKey);
  expect(restored.list('caller')[0].status).toBe('started'); expect(f.options.submit).toHaveBeenCalledTimes(1);
});
it('binds the first conversation of a reserved new CLI only from its exact received envelope and started turn', async () => {
  const f = fixture(); f.contexts.target.conversationId = null;
  f.options.read.mockResolvedValue(null); f.service.freshRead = () => ({ sessionId: null, turn: null, question: null, lifecycle: 'idle' });
  await expect(f.send({ expectedConversationId: null })).rejects.toThrow();
  const receipt = await f.service.handle({ action: 'send', agentId: 'caller', freshSession: true, body: { ...f.body, expectedConversationId: null } });
  expect(receipt.status).toBe('sent'); expect(receipt.conversationId).toBe(null);
  const message = f.options.submit.mock.calls[0][2], hash = createHash('sha256').update(message.trim()).digest('hex');
  const evidence = { deliveryId: receipt.deliveryId, messageHash: hash, receivedAt: 10100, turnId: 'first-turn', startedAt: 10050 };
  f.service.observe('target', f.contexts.target.entry, { sessionId: 'new-conversation', deliveries: [{ ...evidence, messageHash: 'wrong' }] });
  expect(f.service.list('caller')[0].conversationId).toBe(null);
  f.service.observe('target', f.contexts.target.entry, { sessionId: 'new-conversation', deliveries: [evidence] });
  expect(f.service.list('caller')[0]).toMatchObject({ status: 'started', conversationId: 'new-conversation', turnId: 'first-turn' });
  expect(f.options.submit).toHaveBeenCalledTimes(1);
});
it('leaves timeout as unconfirmed, never replays text, and accepts a later exact receipt', async () => {
  const f = fixture(); await f.send();
  f.advance(16000);
  expect(f.service.list('caller')[0]).toMatchObject({ status: 'unconfirmed', reason: 'receipt-not-confirmed' });
  await f.send(); expect(f.options.submit).toHaveBeenCalledTimes(1);
  f.acknowledge(); expect(f.service.list('caller')[0].status).toBe('started');
});
it('does not re-arm a restored timeout or publish another warning when the target restarts', async () => {
  const f = fixture(), delivery = await f.send();
  f.advance(16000);
  const restored = new SessionDeliveries(f.options);
  const updates = f.updates.length;
  await restored.reconcile('caller', f.body.requestKey);
  f.contexts.target.entry = { ...f.contexts.target.entry };
  restored.poll();
  expect(f.updates).toHaveLength(updates);
  expect(restored.list('caller')[0]).toMatchObject({ status: 'unconfirmed', reason: 'receipt-not-confirmed' });

  const original = f.options.submit.mock.calls[0][2];
  f.options.read.mockResolvedValue({ sessionId: 'conversation', deliveries: [{
    deliveryId: delivery.deliveryId, messageHash: createHash('sha256').update(original.trim()).digest('hex'),
    receivedAt: 10100, turnId: 'new-turn', startedAt: 10050,
  }] });
  await restored.reconcile('caller', f.body.requestKey);
  expect(restored.list('caller')[0].status).toBe('started');
  expect(f.options.submit).toHaveBeenCalledOnce();
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
it('refuses inactive, SSH, unsupported, busy, changed, question and non-ready receivers before any input', async () => {
  const changes = [f => { f.contexts.target.entry = null; }, f => { f.contexts.target.entry.ssh = {}; }, f => { f.contexts.target.entry.aiToolId = 'qwen'; },
    f => { f.contexts.target.conversationId = 'other'; }, f => { f.options.read.mockResolvedValue({ sessionId: 'conversation', lifecycle: 'working' }); },
    f => { f.options.read.mockResolvedValue({ sessionId: 'conversation', question: {} }); }, f => { f.service.ready = () => false; }];
  for (const change of changes) { const f = fixture(); change(f); await expect(f.send()).rejects.toThrow(); expect(f.options.submit).not.toHaveBeenCalled(); }
});
it('identifies a missing transcript without reserving the request key or writing input', async () => {
  const f=fixture(); f.options.read.mockResolvedValueOnce(null);
  await expect(f.send()).rejects.toThrow('transcript-unavailable');
  expect(f.options.submit).not.toHaveBeenCalled(); expect(f.service.list('caller')).toEqual([]);
  // Once exact transcript lookup is available, the same intended request is safe.
  expect(await f.send()).toMatchObject({status:'sent'}); expect(f.options.submit).toHaveBeenCalledTimes(1);
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
it('restores only the exact mailbox notification when Codex removes its newlines', () => {
  const id = '11111111-1111-4111-8111-111111111111', messageId = '22222222-2222-4222-8222-222222222222';
  const value = `[Acedia handoff: ${id}]\nFrom: Acedia session\n\n${sessionMessageNotification(messageId)}`;
  const flat = value.replaceAll('\n', '');
  const at = new Date(10000).toISOString();
  const observedHash = text => deliveryEvidence(JSON.stringify({ type: 'response_item', timestamp: at,
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })).receipts[0].messageHash;
  expect(observedHash(flat)).toBe(observedHash(value));
  expect(observedHash(flat + ' extra text')).not.toBe(observedHash(value));
  expect(observedHash(flat.replace(messageId, id))).not.toBe(observedHash(value));
});
it('accepts an empty composer/gray placeholder and rejects existing drafts, queued input and running tools', async () => {
  const filter = new CodexScrollbackFilter(8, 80); cleanups.push(() => filter.dispose());
  const entry = { filter };
  const screen = async data => { filter.push('\x1b[2J\x1b[1;1H' + data); await new Promise(resolve => setTimeout(resolve, 20)); };
  await screen('› \x1b[90mAsk Codex to do anything\x1b[0m\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(true);
  await screen('› \x1b[2mAsk Codex to do anything\x1b[0m\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(true);
  await screen('› existing draft\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(false);
  expect(deliveryComposerReady(entry, { allowWorking: true })).toBe(false);
  await screen('› \x1b[2;1HQueued follow-up inputs\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(false);
  await screen('› \x1b[2;1Hesc to interrupt\x1b[1;3H'); expect(deliveryComposerReady(entry)).toBe(false);
  expect(deliveryComposerReady(entry, { allowWorking: true })).toBe(true);
});
