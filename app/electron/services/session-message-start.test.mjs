import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionMessages } from './session-messages.mjs';
import { SessionStart } from './session-start.mjs';
import { WorkspaceManagement } from './workspace-management.mjs';
import { HookService } from './hook-service.mjs';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture(provider = 'codex') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-start-send-'));
  const stores = [], file = path.join(root, 'messages.json');
  cleanups.push(() => {
    for (const service of stores) service.close();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-start-send-')) throw Error('Unexpected cleanup');
    fs.rmSync(root, { recursive: true });
  });
  const target = { id: 'target', name: 'Worker', aiToolId: provider, folder: root }, caller = { id: 'caller', name: 'Owner', aiToolId: 'codex' };
  const state = { entry: null, conversation: 'saved-conversation', ready: false, clock: 1000 };
  const context = id => id === 'caller' ? { entry: caller } : id === 'target' ? { entry: state.entry, conversationId: state.conversation } : null;
  const activate = vi.fn(async () => { state.entry ||= { id: 'target', aiToolId: provider, startedAt: state.clock }; return { active: true, restarted: true }; });
  const starter = new SessionStart({ agentFor: id => id === 'target' ? target : null, activate });
  const notify = vi.fn(async () => ({ status: 'started', deliveryId: randomUUID() }));
  const options = { file, sessionFor: id => id === 'target' ? target : id === 'caller' ? caller : null, context,
    start: (id, waitMs) => starter.handle({ sessionId: id, waitMs }), now: () => state.clock, notify, receipt: async () => null,
    prepare: async () => ({ ready: state.ready, reason: 'turn-working' }) };
  const open = () => { const service = new SessionMessages(options); stores.push(service); return service; };
  const service = open(), body = { sessionId: 'target', message: '작업 지시입니다.\n\n원문을 보존해 주세요.', requestKey: 'task-1', startIfOffline: true, waitMs: 0 };
  const send = (extra = {}, store = service) => store.handle({ action: 'message-send', agentId: 'caller', body: { ...body, ...extra } });
  return { root, file, state, target, caller, context, activate, notify, options, open, service, body, send };
}

it.each(['codex', 'claude'])('saves before starting an existing %s, waits for readiness and notifies exactly once', async provider => {
  const f = fixture(provider);
  f.activate.mockImplementation(async () => {
    const stored = JSON.parse(fs.readFileSync(f.file, 'utf8'))[0];
    expect(stored.message).toBe(f.body.message); expect(stored.activation.status).toBe('starting');
    f.state.entry = { aiToolId: provider, startedAt: 1000 }; return { active: true, restarted: true };
  });
  const first = await f.send();
  expect(first).toMatchObject({ saved: true, activation: { status: 'started', started: true, background: true }, delivery: { status: 'queued' } });
  expect(f.activate).toHaveBeenCalledExactlyOnceWith('target'); expect(f.notify).not.toHaveBeenCalled();
  f.state.ready = true; f.state.clock = 10000;
  await f.service.poll(); await f.send(); await f.service.poll();
  expect(f.activate).toHaveBeenCalledOnce(); expect(f.notify).toHaveBeenCalledOnce();
  expect(f.notify.mock.calls[0][1]).toMatchObject({ sessionId: 'target', expectedConversationId: 'saved-conversation' });
  expect((await f.service.receive('target', { messageId: first.messageId, markRead: false })).messages[0].message).toBe(f.body.message);
  const restarted = f.open(); await f.send({}, restarted); expect(f.notify).toHaveBeenCalledOnce();
  await expect(f.send({ startIfOffline: false })).rejects.toMatchObject({ statusCode: 409 });
});

it('does not activate without explicit opt-in, for store-only messages, or for unsupported targets', async () => {
  const f = fixture();
  await expect(f.send({ startIfOffline: false })).rejects.toMatchObject({ statusCode: 409 });
  await expect(f.send({ notify: false })).rejects.toMatchObject({ statusCode: 400 });
  await expect(f.send({ startIfOffline: 'yes' })).rejects.toMatchObject({ statusCode: 400 });
  await f.send({ notify: false, startIfOffline: false }); expect(f.activate).not.toHaveBeenCalled();
  for (const provider of ['qwen', 'agy']) {
    const other = fixture(provider); await expect(other.send()).rejects.toMatchObject({ statusCode: 409 }); expect(other.activate).not.toHaveBeenCalled();
  }
});

it('retains an already-active target and never starts it again when the same task is retried', async () => {
  const f = fixture(); f.state.entry = { aiToolId: 'codex', startedAt: 10 }; f.state.ready = true;
  const first = await f.send(); const repeated = await f.send();
  expect(repeated.messageId).toBe(first.messageId); expect(f.activate).not.toHaveBeenCalled(); expect(f.notify).toHaveBeenCalledOnce();
});

it('coalesces concurrent same-key requests into one existing-session start and one notification', async () => {
  const f = fixture(); f.state.ready = true;
  const [first, repeated] = await Promise.all([f.send(), f.send()]);
  expect(first.messageId).toBe(repeated.messageId);
  expect(f.activate).toHaveBeenCalledOnce(); expect(f.notify).toHaveBeenCalledOnce();
  expect(f.service.records).toHaveLength(1);
});

it('does not start or send if original-text persistence or active mailbox capacity fails', async () => {
  const f = fixture(); fs.mkdirSync(f.file + '.tmp');
  await expect(f.send()).rejects.toMatchObject({ statusCode: 503 });
  expect(f.activate).not.toHaveBeenCalled(); expect(f.notify).not.toHaveBeenCalled();
  const full = fixture(); await full.send({ startIfOffline: false, notify: false });
  const seed = full.service.records[0];
  full.service.records = Array.from({ length: 1000 }, (_, i) => ({ ...seed, messageId: randomUUID(), requestKey: 'old-' + i, sequence: i + 1 }));
  full.service.sequence = 1000; full.service.save();
  await expect(full.send()).rejects.toMatchObject({ statusCode: 507 });
  expect(full.activate).not.toHaveBeenCalled(); expect(full.notify).not.toHaveBeenCalled();
});

it('keeps failure evidence and only retries startup explicitly with the same original key', async () => {
  const f = fixture(); f.activate.mockRejectedValueOnce(Error('startup temporarily unavailable'));
  const first = await f.send();
  expect(first).toMatchObject({ saved: true, activation: { status: 'failed' }, delivery: { status: 'notification-error', nothingSent: true } });
  f.state.clock = 10000; await f.service.poll(); expect(f.activate).toHaveBeenCalledOnce();
  f.state.ready = true; const retried = await f.send();
  expect(retried.messageId).toBe(first.messageId); expect(f.activate).toHaveBeenCalledTimes(2); expect(f.notify).toHaveBeenCalledOnce();
});

it('does not automatically replay a startup whose acknowledgement was lost during app shutdown', async () => {
  const f = fixture(); let release;
  f.activate.mockImplementation(async () => { await new Promise(resolve => { release = resolve; }); f.state.entry = { aiToolId: 'codex', startedAt: 1000 }; return { active: true, restarted: true }; });
  const pending = f.send(); await vi.waitFor(() => expect(f.activate).toHaveBeenCalledOnce());
  f.service.close(); const restored = f.open();
  expect(restored.records[0]).toMatchObject({ activation: { status: 'unconfirmed' }, delivery: { reason: 'target-start-unconfirmed' } });
  await restored.poll(); expect(f.activate).toHaveBeenCalledOnce(); expect(f.notify).not.toHaveBeenCalled();
  release(); await pending; f.state.ready = true;
  await f.send({}, restored); expect(f.activate).toHaveBeenCalledOnce(); expect(f.notify).toHaveBeenCalledOnce();
});

it('rejects a pinned conversation change before startup and refuses to send if identity changes during startup', async () => {
  const f = fixture(); await expect(f.send({ expectedConversationId: 'another' })).rejects.toMatchObject({ statusCode: 409 });
  expect(f.activate).not.toHaveBeenCalled();
  f.activate.mockImplementation(async () => { f.state.entry = { aiToolId: 'codex', startedAt: 1000 }; f.state.conversation = 'another'; return { active: true, restarted: true }; });
  expect((await f.send()).delivery).toMatchObject({ status: 'notification-error', reason: 'session-or-conversation-changed', nothingSent: true });
  expect(f.notify).not.toHaveBeenCalled();
});

it('can wake a recipient with an older queued instruction while preserving notification order', async () => {
  const f = fixture(); f.state.entry = { aiToolId: 'codex', startedAt: 100 };
  const older = await f.send({ requestKey: 'older', startIfOffline: false });
  f.state.entry = null; const newer = await f.send();
  expect(f.activate).toHaveBeenCalledOnce(); expect(f.notify).not.toHaveBeenCalled();
  f.state.clock = 10000; f.state.ready = true; await f.service.poll(); await f.service.poll();
  expect(f.notify.mock.calls.map(call => call[1].message.match(/Acedia session message ([0-9a-f-]+)/)[1])).toEqual([older.messageId, newer.messageId]);
});

it('exposes start-and-send through the authenticated HTTP API while preserving the existing session registration', async () => {
  const f = fixture(); f.state.ready = true;
  const workspace = new WorkspaceManagement({ catalog: () => ({ projects: [], agents: [f.caller, f.target] }), isActive: id => id === 'caller' || !!f.state.entry, messages: f.service });
  const hook = new HookService({ baseDir: path.join(f.root, 'hook'), workspaceProvider: input => workspace.handle(input) });
  await hook.start(); cleanups.push(() => new Promise(resolve => { hook.server.closeAllConnections(); hook.server.close(resolve); }));
  const response = await fetch(`http://127.0.0.1:${hook.port}/integration/v1/workspace/messages/send`, { method: 'POST',
    headers: { authorization: 'Bearer ' + hook.token, 'x-acedia-agent-id': 'caller', 'content-type': 'application/json' }, body: JSON.stringify(f.body) });
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ saved: true, targetId: 'target', activation: { status: 'started' }, delivery: { status: 'started' } });
  expect(f.activate).toHaveBeenCalledExactlyOnceWith('target'); expect(f.target.folder).toBe(f.root); expect(f.notify).toHaveBeenCalledOnce();
});
