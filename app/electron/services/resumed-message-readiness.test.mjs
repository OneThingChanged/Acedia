import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { ActiveQuestions } from './active-questions.mjs';
import { SessionReadiness } from './session-readiness.mjs';
import { normalizeTranscriptPath, isTranscriptInsideRoot } from './transcript-path.mjs';
import { hasQueuedCodexQuestion, codexQuestionFrame } from './question-responder.mjs';

const cleanups = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-resumed-readiness-'));
  cleanups.push(async () => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-resumed-readiness-')) throw Error('Unexpected cleanup');
    await fs.rm(root, { recursive: true });
  });
  const sessionId = 'session-resumed', transcriptPath = path.join(root, sessionId + '.jsonl'), old = Date.now() - 3600000;
  const complete = JSON.stringify({ timestamp: new Date(old).toISOString(), type: 'event_msg', payload: { type: 'task_complete', turn_id: 'previous' } }) + '\n';
  await fs.writeFile(transcriptPath, complete); await fs.utimes(transcriptPath, old / 1000, old / 1000);
  const entry = { id: 'target', aiToolId: 'codex', startedAt: Date.now(), resumeContext: { sessionId, folder: root }, filter: { viewportText: () => '' } };
  const source = await fs.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  const setup = source.match(/const activeQuestions = new ActiveQuestions\(\{[\s\S]*?\r?\n\}\);/)?.[0];
  const stopSource = source.match(/function claudeDeliveryStopAt\([^\n]+\n[\s\S]*?\r?\n\}/)?.[0];
  const readSource = source.match(/async function currentQuestion\(id\) \{[\s\S]*?\r?\n\}/)?.[0];
  if (!setup || !stopSource || !readSource) throw Error('Production reader wiring unavailable');
  const resolve = vi.fn(() => ({ path: transcriptPath, tool: 'codex' }));
  const env = { ActiveQuestions, ptys: new Map([['target', entry]]), agentSessionIds: new Map(), accountBindings: new Map(),
    agentTranscripts: new Map(), agentTranscriptTool: new Map(), transcriptMissUntil: new Map(), normalizeTranscriptPath, isTranscriptInsideRoot,
    resolveChatTranscriptBySession: resolve, selectedAccountId: () => 'selected', accountTranscriptRoot: () => root,
    monitorHooks: new Map(), commandApprovals: { read: () => null }, hasQueuedCodexQuestion, codexQuestionFrame };
  const read = vm.runInNewContext(`(function(){${setup}\n${stopSource}\nreturn ${readSource};})()`, env);
  const target = { entry, conversationId: sessionId }, ready = vi.fn(() => true);
  const readiness = new SessionReadiness({ context: () => target, read: () => read('target'), freshRead: () => null, ready });
  return { root, sessionId, transcriptPath, old, complete, entry, env, resolve, read, target, ready, readiness };
}

it('recognizes an existing resumed conversation before any new hook or transcript append', async () => {
  const f = await fixture();
  f.ready.mockImplementation((_target, options) => options?.resumedSession === true);
  expect(await f.read('target')).toMatchObject({ sessionId: f.sessionId, lifecycle: 'idle', question: null, turn: { id: 'previous' } });
  expect(await f.readiness.handle({ sessionId: 'target', waitMs: 0 })).toMatchObject({ active: true, ready: true, firstMessageReady: false });
  expect(f.resolve).toHaveBeenCalledWith('codex', f.sessionId, { toolId: 'codex', accountId: 'selected' });
  expect(f.ready).toHaveBeenCalledWith(f.target, { resumedSession: true });
  expect(await fs.readFile(f.transcriptPath, 'utf8')).toBe(f.complete);
});

it('rejects stale transcript reuse without the exact resume identity and still blocks a draft', async () => {
  const f = await fixture();
  f.env.agentSessionIds.set('target', f.sessionId);
  f.entry.resumeContext = { ...f.entry.resumeContext, sessionId: 'another-session' };
  expect(await f.read('target')).toBeNull();
  f.entry.resumeContext.sessionId = f.sessionId;
  f.ready.mockReturnValue(false);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: false, phase: 'blocked', reason: 'composer-or-runtime-not-ready' });
});

it('does not bypass an unresolved question in a resumed older transcript', async () => {
  const f = await fixture();
  const question = JSON.stringify({ type: 'response_item', payload: { type: 'function_call', call_id: 'question-1', name: 'functions.request_user_input', arguments: '{"questions":[{"id":"approval","question":"Continue?","options":[{"label":"Yes"}]}]}' } }) + '\n';
  await fs.appendFile(f.transcriptPath, question); await fs.utimes(f.transcriptPath, f.old / 1000, f.old / 1000);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: false, phase: 'question', reason: 'question-pending' });
});

it('drops the historical readiness allowance as soon as a new live turn is appended', async () => {
  const f = await fixture();
  expect((await f.read('target')).resumedHistory).toBe(true);
  await fs.appendFile(f.transcriptPath, JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'task_started', turn_id: 'new-live-turn' } }) + '\n');
  await fs.utimes(f.transcriptPath, Date.now() / 1000 + 1, Date.now() / 1000 + 1);
  const live = await f.read('target');
  expect(live.resumedHistory).toBeUndefined(); expect(live.lifecycle).toBe('working');
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ phase: 'working', ready: false });
});

it('allows a pinned resume after an interrupted prior process whose transcript has no final marker', async () => {
  const f = await fixture();
  const row = JSON.stringify({ timestamp: new Date(f.old).toISOString(), type: 'event_msg', payload: { type: 'token_count' } }) + '\n';
  await fs.writeFile(f.transcriptPath, row);
  await fs.utimes(f.transcriptPath, f.old / 1000, f.old / 1000);
  expect(await f.read('target')).toMatchObject({ resumedHistory: true, lifecycle: 'idle' });
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: true, firstMessageReady: false });
  f.ready.mockReturnValue(false);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: false, reason: 'composer-or-runtime-not-ready' });
  await fs.appendFile(f.transcriptPath, row);
  await fs.utimes(f.transcriptPath, Date.now() / 1000 + 1, Date.now() / 1000 + 1);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: false, reason: 'turn-working' });
});

it('does not treat a resumed Codex settings update as a new turn', async () => {
  const f = await fixture();
  const record = (type, payload, at) => JSON.stringify({ type, timestamp: new Date(at).toISOString(), payload }) + '\n';
  const call = { type: 'function_call', name: 'shell_command' };
  await fs.writeFile(f.transcriptPath, record('response_item', call, f.old) +
    record('event_msg', { type: 'thread_settings_applied' }, f.entry.startedAt + 1000));
  await fs.utimes(f.transcriptPath, Date.now() / 1000 + 1, Date.now() / 1000 + 1);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: true });
  await fs.appendFile(f.transcriptPath, record('response_item', call, f.entry.startedAt + 2000));
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: false, reason: 'turn-working' });
});

it('accepts a resumed idle transcript touched at launch and keeps it usable after a draft is cleared', async () => {
  const f = await fixture();
  await fs.utimes(f.transcriptPath, Date.now() / 1000 + 1, Date.now() / 1000 + 1);
  f.ready.mockImplementation((_target, options) => options?.resumedSession === true);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: true, firstMessageReady: false });
  f.entry.firstMessageInput = true;
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: true, firstMessageReady: false });
  f.ready.mockReturnValue(false);
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: false });
});

it('keeps resumed historical lookup inside the selected account root', async () => {
  const f = await fixture();
  expect((await f.read('target')).resumedHistory).toBe(true);
  f.env.accountTranscriptRoot = () => path.join(f.root, 'another-account');
  expect(await f.read('target')).toBeNull();
});

it('recognizes an older Claude completion under the same explicit resume identity', async () => {
  const f = await fixture(); f.entry.aiToolId = 'claude';
  await fs.writeFile(f.transcriptPath, JSON.stringify({ type: 'assistant', timestamp: new Date(f.old).toISOString(), uuid: 'previous', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Previous task complete.' }] } }) + '\n');
  await fs.utimes(f.transcriptPath, f.old / 1000, f.old / 1000);
  expect(await f.read('target')).toMatchObject({ resumedHistory: true, lifecycle: 'idle', sessionId: f.sessionId, question: null });
  expect(await f.readiness.handle({ sessionId: 'target' })).toMatchObject({ ready: true, firstMessageReady: false });
});
