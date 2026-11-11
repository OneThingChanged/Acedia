import { expect, it, vi } from 'vitest';
import { SessionReadiness } from './session-readiness.mjs';

function fixture() {
  let time = 0, available = false;
  const entry = { aiToolId: 'codex', startedAt: 1, filter: { viewportText: () => '' } };
  const target = { entry, conversationId: null };
  const read = vi.fn(async () => null), ready = vi.fn(() => true);
  const options = { context: () => target, read, ready, freshRead: () => available ? { sessionId: target.conversationId, turn: null } : null,
    now: () => time, wait: vi.fn(async ms => { time += ms; if (time >= 100) available = true; }) };
  const service = new SessionReadiness(options);
  return { service, target, entry, options, read, ready, time: () => time };
}
it('waits for a pristine first composer instead of requiring a transcript or conversation ID', async () => {
  const f = fixture();
  expect(await f.service.handle({ sessionId: 'new', waitMs: 0 })).toMatchObject({ phase: 'starting', ready: false, conversationId: null });
  expect(await f.service.handle({ sessionId: 'new', waitMs: 1000 })).toMatchObject({ phase: 'ready', ready: true, firstMessageReady: true, conversationId: null });
  expect(f.options.wait).toHaveBeenCalledOnce();
});
it('reports folder trust and hook review separately without approving or typing', async () => {
  const f = fixture();
  f.entry.filter.viewportText = () => 'Folder access\nC:/fixture\nTrust this folder?\n› 1. Trust and continue\n  2. Quit\nenter continue · esc quit';
  expect(await f.service.handle({ sessionId: 'new' })).toMatchObject({ phase: 'folder-trust', startup: { folder: 'C:/fixture' }, ready: false });
  f.entry.filter.viewportText = () => "Hooks need review\nHooks can run outside the sandbox after you trust them.\n› 1. Review hooks\n2. Trust all and continue\n3. Continue without trusting (hooks won't run)\nenter confirm · esc skip";
  expect(await f.service.handle({ sessionId: 'new', waitMs: 1000 })).toMatchObject({ phase: 'hook-review', ready: false });
  expect(f.time()).toBe(0); expect(f.options.wait).not.toHaveBeenCalled();
});
it('does not turn a resumed transcript failure, draft or active task into a fresh session', async () => {
  for (const patch of [{ resumeContext: { sessionId: 'old' } }, { firstMessageInput: true }, { firstMessageSubmitted: true }]) {
    const f = fixture(); Object.assign(f.entry, patch); f.target.conversationId = 'old';
    expect(await f.service.handle({ sessionId: 'existing', waitMs: 1000 })).toMatchObject({ phase: 'blocked', reason: 'transcript-unavailable' });
    expect(f.options.wait).not.toHaveBeenCalled();
  }
  const f = fixture(); f.read.mockResolvedValue({ sessionId: null, lifecycle: 'working' });
  expect(await f.service.handle({ sessionId: 'working' })).toMatchObject({ phase: 'working', ready: false });
});
it('keeps a real transcript question or existing turn authoritative over a fresh composer', async () => {
  const f = fixture();
  f.service.freshRead = () => ({ sessionId: null, turn: null });
  f.read.mockResolvedValueOnce({ sessionId: null, question: { id: 'approval' } });
  expect(await f.service.handle({ sessionId: 'question' })).toMatchObject({ phase: 'question', ready: false });
  f.read.mockResolvedValueOnce({ sessionId: null, turn: { id: 'started' }, lifecycle: 'working' });
  expect(await f.service.handle({ sessionId: 'working' })).toMatchObject({ phase: 'working', firstMessageReady: false });
  f.read.mockResolvedValueOnce({ sessionId: 'different-conversation', turn: null });
  expect(await f.service.handle({ sessionId: 'stale' })).toMatchObject({ phase: 'changed', reason: 'conversation-changed', ready: false });
});
it('does not wait past the budget or cross a changed runtime/conversation', async () => {
  const f = fixture(); f.service.freshRead = () => null;
  expect(await f.service.handle({ sessionId: 'slow', waitMs: 250 })).toMatchObject({ ready: false });
  expect(f.time()).toBe(250);
  const g = fixture(); g.service.wait = async () => { g.target.entry = { ...g.entry }; };
  await expect(g.service.handle({ sessionId: 'changed', waitMs: 1000 })).rejects.toMatchObject({ statusCode: 409 });
});
it('reports offline, other providers and invalid status options without activating a session', async () => {
  const f = fixture(); f.target.entry = null;
  expect(await f.service.handle({ sessionId: 'offline' })).toMatchObject({ phase: 'offline', active: false });
  f.target.entry = { aiToolId: 'qwen' };
  expect(await f.service.handle({ sessionId: 'qwen' })).toMatchObject({ phase: 'unsupported', active: true });
  for (const body of [null, {}, { sessionId: 'x', waitMs: -1 }, { sessionId: 'x', waitMs: 10001 }, { sessionId: 'x', approve: true }]) {
    await expect(f.service.handle(body)).rejects.toMatchObject({ statusCode: 400 });
  }
});
it('waits for a fresh Claude composer and reports authentication without exposing environment keys or approving it', async () => {
  const f = fixture(); f.entry.aiToolId = 'claude';
  expect(await f.service.handle({ sessionId: 'claude', waitMs: 1000 })).toMatchObject({ ready: true, firstMessageReady: true });
  f.entry.filter.viewportText = () => 'Detected a custom API key in your environment\nANTHROPIC_API_KEY: fixture-secret\nDo you want to use this API key?\nEnter to confirm · Esc to cancel';
  const state = await f.service.handle({ sessionId: 'claude', waitMs: 1000 });
  expect(state).toMatchObject({ phase: 'question', ready: false, reason: 'authentication-required', question: { kind: 'authentication' } });
  expect(JSON.stringify(state)).not.toContain('fixture-secret');
});
