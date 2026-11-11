import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { ChildLaunchPolicy, childLaunchPreferences } from './child-launch-policy.mjs';
import { WorkspaceManagement } from './workspace-management.mjs';
import { SessionRuns } from './session-runs.mjs';
import { SessionMessages } from './session-messages.mjs';
import { SessionDeliveries, deliveryComposerReady, deliveryEvidence, claudeDeliveryEvidence } from './session-delivery.mjs';
import { SessionReadiness } from './session-readiness.mjs';
import { firstMessageSession } from './session-first-message.mjs';
import { StartupAutomation } from './startup-automation.mjs';
import { TrackedTerminalFilter } from './terminal-stream.mjs';

const cleanup = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); vi.useRealTimers(); });
const settings = { codex: { model: 'sol', effort: 'high', serviceTier: 'fast' }, claude: { model: 'sonnet', effort: 'medium' } };
const modelList = provider => [settings[provider]].map(s => ({ model: s.model, efforts: [{ effort: s.effort }] }));
const temp = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-child-run-')); cleanup.push(() => fs.rmSync(root, { recursive: true })); return root; };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

function policyFixture(parentTool = 'codex') {
  let parent = { id: 'owner', aiToolId: parentTool, modelSettings: settings[parentTool], codexAccountId: 'codex-parent', claudeAccountId: 'claude-parent' };
  const options = { parent: () => parent, preferences: async tool => ({ codexAccountId: 'codex-default', claudeAccountId: 'claude-default', dangerousDefaultMode: 'off' }),
    defaults: tool => settings[tool], accounts: tool => [{ id: tool + '-parent', state: 'saved' }, { id: tool + '-default', state: 'saved' }, { id: 'empty', state: 'empty' }],
    models: vi.fn(async ({ provider }) => ({ models: modelList(provider) })) };
  return { policy: new ChildLaunchPolicy(options), options, change: value => { parent = { ...parent, ...value }; } };
}

for (const ownerTool of ['codex', 'claude']) for (const childTool of ['codex', 'claude']) it(`${ownerTool} → ${childTool}: background creation, frozen settings, fresh no-transcript inbox delivery and actual start`, async () => {
  const root = temp(), p = policyFixture(ownerTool), records = new Map(), contexts = new Map([['owner', { entry: { aiToolId: ownerTool }, name: 'Parent' }]]);
  const catalog = { projects: [{ id: 'project', folder: root }], agents: [{ id: 'owner', projectId: 'project', aiToolId: ownerTool }], availableTools: [{ id: 'codex' }, { id: 'claude' }] };
  const context = id => contexts.get(id), read = async id => records.get(id) || null;
  const freshRead = id => firstMessageSession({ entry: context(id)?.entry, agent: catalog.agents.find(a => a.id === id), conversationId: context(id)?.conversationId });
  const submit = vi.fn(async (id, entry, text) => {
    expect(text).not.toContain('한글 작업'); // Only the mailbox reference crosses the terminal.
    entry.firstMessageSubmitted = true;
    const timestamp = new Date().toISOString(), uuid = randomUUID(), conversation = randomUUID();
    const rows = childTool === 'codex' ? [
      { timestamp, type: 'event_msg', payload: { type: 'task_started', turn_id: uuid } },
      { timestamp, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
    ] : [
      { timestamp, type: 'assistant', uuid: randomUUID(), parentUuid: 'attachment', message: { role: 'assistant', id: 'native-model-response' } },
      { timestamp, type: 'user', uuid, message: { role: 'user', content: text } },
      { timestamp, type: 'attachment', uuid: 'attachment', parentUuid: uuid },
    ];
    const evidence = (childTool === 'codex' ? deliveryEvidence : claudeDeliveryEvidence)(rows.map(r => JSON.stringify(r)).join('\n'));
    context(id).conversationId = conversation;
    records.set(id, { sessionId: conversation, turn: { id: uuid }, lifecycle: 'working', deliveries: evidence.receipts });
    return true;
  });
  const deliveries = new SessionDeliveries({ file: path.join(root, 'delivery.json'), context, read, freshRead, ready: target => deliveryComposerReady(target.entry), submit });
  const readiness = new SessionReadiness({ context, read, freshRead, ready: deliveries.ready });
  const messages = new SessionMessages({ file: path.join(root, 'messages.json'), sessionFor: id => catalog.agents.find(a => a.id === id), context,
    prepare: (id, { waitMs, context: pinned }) => readiness.waitForReady(id, waitMs, pinned),
    notify: (agentId, body) => deliveries.handle({ action: 'send', agentId, body, freshSession: true, asciiEnvelope: true }),
    receipt: (agentId, requestKey) => deliveries.handle({ action: 'delivery', agentId, body: { requestKey, waitMs: 0 } }) });
  const create = vi.fn(async payload => {
    const filter = new TrackedTerminalFilter(15, 100); cleanup.push(() => filter.dispose());
    filter.push(childTool === 'codex' ? '\r\n› \r\nsol high fast · fixture\x1b[2;3H' : '\r\n────────────────────\r\n❯ \r\n────────────────────\r\n auto mode on (shift+tab to cycle)\x1b[3;3H');
    await tick();
    const entry = { id: payload.id, aiToolId: payload.aiToolId, startedAt: Date.now(), cwd: root, filter };
    catalog.agents.push({ ...payload }); contexts.set(payload.id, { entry, conversationId: null, state: 'WAIT', reason: 'ready' });
    return { id: payload.id };
  });
  const workspace = new WorkspaceManagement({ catalog: () => catalog, isActive: id => contexts.has(id), create, resolveLaunch: options => p.policy.resolve(options) });
  const options = { file: path.join(root, 'runs.json'), create: (ownerId, body, id) => workspace.createItem('create-session', body, ownerId, id),
    readiness: body => readiness.handle(body), messages, context, active: id => contexts.has(id) };
  const runs = new SessionRuns(options); cleanup.push(() => runs.close());
  const body = { projectId: 'project', aiToolId: childTool, name: 'Child', requestKey: 'one', message: '한글 작업\n원문 보존', waitMs: 1000 };
  const result = await runs.handle({ action: 'run', agentId: 'owner', body });
  expect(result.phase, JSON.stringify(result)).toBe('started'); expect(result.delivery).toMatchObject({ status: 'started', targetId: result.sessionId });
  expect(create).toHaveBeenCalledOnce(); expect(submit).toHaveBeenCalledOnce();
  const launch = create.mock.calls[0][0];
  expect(launch).toMatchObject({ aiToolId: childTool, modelSettings: settings[childTool], dangerous: false, workspaceManaged: true,
    sessionHierarchy: { createdById: 'owner', parentId: 'owner', inheritModel: false } });
  expect(launch[childTool === 'codex' ? 'codexAccountId' : 'claudeAccountId']).toBe(childTool + (childTool === ownerTool ? '-parent' : '-default'));
  const inbox = await messages.handle({ action: 'message-receive', agentId: result.sessionId, body: { messageId: result.messageId } });
  expect(inbox.messages[0].message).toBe(body.message);
  const again = await runs.handle({ action: 'run', agentId: 'owner', body: { ...body, waitMs: 0 } });
  expect(again.sessionId).toBe(result.sessionId); expect(create).toHaveBeenCalledOnce(); expect(submit).toHaveBeenCalledOnce();
  await expect(runs.handle({ action: 'run', agentId: 'owner', body: { ...body, message: 'changed' } })).rejects.toMatchObject({ statusCode: 409 });
  const restored = new SessionRuns(options); cleanup.push(() => restored.close());
  expect((await restored.handle({ action: 'run-status', agentId: 'owner', body: { requestKey: 'one' } })).phase).toBe('started');
  await expect(restored.handle({ action: 'run-status', agentId: 'other-parent', body: { requestKey: 'one' } })).rejects.toMatchObject({ statusCode: 404 });
  expect(create).toHaveBeenCalledOnce(); expect(submit).toHaveBeenCalledOnce();
});

it('rejects missing login, unsupported models/effort/Fast and a parent switch before creation', async () => {
  const f = policyFixture();
  for (const options of [{ accountId: 'deleted' }, { accountId: 'empty' }, { modelSettings: { model: 'unknown' } }, { modelSettings: { model: 'sol', effort: 'ultra' } }, { modelSettings: { model: 'sol', serviceTier: 'ultrafast' } }]) {
    await expect(f.policy.resolve({ ownerId: 'owner', aiToolId: 'codex', ...options })).rejects.toMatchObject({ statusCode: 409 });
  }
  await expect(f.policy.resolve({ ownerId: 'owner', aiToolId: 'claude', modelSettings: { model: 'sonnet', serviceTier: 'fast' } })).rejects.toThrow();
  f.options.models.mockImplementationOnce(async () => { f.change({ generation: 2 }); return { models: modelList('codex') }; });
  await expect(f.policy.resolve({ ownerId: 'owner', aiToolId: 'codex' })).rejects.toThrow('부모 세션이 변경');
});

it('Claude trust navigates once, verifies the native selection, then confirms only the exact scope', async () => {
  vi.useFakeTimers(); const root = temp();
  let selection = 0;
  const screen = () => `────────────────\n Accessing workspace:\n\n ${root}\n\n Quick safety check: Is this a project you created or one you trust?\n Claude Code'll be able to read, edit, and execute files here.\n\n ${selection === 0 ? '❯ ' : ''}No, exit\n ${selection === 1 ? '❯ ' : ''}Yes, I trust this folder\n\n Enter to confirm · Esc to cancel`;
  const entry = { aiToolId: 'claude', cwd: root, filter: { viewportText: screen } }, write = vi.fn();
  const engine = new StartupAutomation({ entry: () => entry, allowedRoot: () => root, write });
  expect(engine.check('child')).toBe(false); expect(write).toHaveBeenCalledExactlyOnceWith('child', '\x1b[B');
  vi.advanceTimersByTime(500); expect(engine.check('child')).toBe(false); expect(write).toHaveBeenCalledOnce();
  selection = 1; expect(engine.check('child')).toBe(true); expect(write).toHaveBeenLastCalledWith('child', '\r');
  expect(engine.check('child')).toBe(false); expect(write).toHaveBeenCalledTimes(2);
  const other = path.join(root, 'other'); fs.mkdirSync(other);
  for (const changed of [other, null]) {
    const out = new StartupAutomation({ entry: () => entry, allowedRoot: () => changed, write });
    expect(out.check('child')).toBe(false);
  }
  expect(write).toHaveBeenCalledTimes(2);
});

it('Claude receipt requires an actual assistant descendant, excludes tool prose and survives partial tails', () => {
  const timestamp = new Date().toISOString(), id = randomUUID(), userId = randomUUID(), value = `[Acedia handoff: ${id}]\nFrom: Acedia\n\nTask`;
  const user = { type: 'user', uuid: userId, timestamp, message: { role: 'user', content: value } };
  const encode = (...rows) => rows.map(r => JSON.stringify(r)).join('\n');
  const received = claudeDeliveryEvidence(encode(user));
  expect(received.receipts[0]).toMatchObject({ deliveryId: id }); expect(received.receipts[0]).not.toHaveProperty('startedAt');
  const result = claudeDeliveryEvidence(encode(
    { type: 'assistant', uuid: 'a', timestamp, parentUuid: 'attachment', message: { role: 'assistant', id: 'response' } },
    { type: 'attachment', uuid: 'attachment', parentUuid: userId, timestamp },
  ), received);
  expect(result.receipts[0]).toMatchObject({ turnId: userId, startedAt: Date.parse(timestamp) });
  const quoted = claudeDeliveryEvidence(encode({ ...user, isSidechain: true }, { ...user, type: 'assistant', message: { role: 'assistant', id: 'quoted', content: value } }));
  expect(quoted.receipts).toEqual([]);
});

it('Claude parked cursor accepts only an empty native frame, never a draft, question or background wait', async () => {
  const filter = new TrackedTerminalFilter(12, 80); cleanup.push(() => filter.dispose());
  const entry = { aiToolId: 'claude', filter };
  const paint = async (input = '', footer = '⏵⏵ auto mode on (shift+tab to cycle)', before = '') => {
    filter.push(`\x1b[2J\x1b[1;1H${before}\r\n────────────────────\r\n❯ ${input}\r\n────────────────────\r\n${footer}\x1b[12;80H`); await tick();
  };
  await paint(); expect(deliveryComposerReady(entry)).toBe(true);
  await paint('draft'); expect(deliveryComposerReady(entry)).toBe(false);
  await paint('draft\r\nsecond line'); expect(deliveryComposerReady(entry)).toBe(false);
  await paint('', 'Enter to confirm · Esc to cancel'); expect(deliveryComposerReady(entry)).toBe(false);
  await paint('', 'auto mode on (shift+tab to cycle) · esc to interrupt'); expect(deliveryComposerReady(entry)).toBe(false);
  await paint('', 'auto mode on (shift+tab to cycle)', 'Waiting for 1 background agent to finish'); expect(deliveryComposerReady(entry)).toBe(false);
});

it('lost creation acknowledgement and app restart never recreate or resend a child', async () => {
  const root = temp(), create = vi.fn(async () => { throw Error('creation acknowledgement lost'); });
  const options = { file: path.join(root, 'runs.json'), create, context: () => null, active: () => true,
    readiness: vi.fn(), messages: { handle: vi.fn() } };
  const body = { projectId: 'project', requestKey: 'one', message: 'Task' };
  const f = new SessionRuns(options); cleanup.push(() => f.close());
  const original = await f.handle({ action: 'run', agentId: 'parent', body }); await tick();
  const restored = new SessionRuns(options); cleanup.push(() => restored.close());
  const again = await restored.handle({ action: 'run', agentId: 'parent', body });
  expect(again).toMatchObject({ phase: 'reconcile-required', sessionId: original.sessionId });
  expect(create).toHaveBeenCalledOnce(); expect(options.readiness).not.toHaveBeenCalled(); expect(options.messages.handle).not.toHaveBeenCalled();
});

it('keeps a real question visible to the parent, then sends once after it clears; runtime replacement stops preparation', async () => {
  const root = temp(); let entry = {}, ready = false;
  const messages = { handle: vi.fn(async () => ({ messageId: 'message', delivery: { status: 'sent' } })) };
  const service = new SessionRuns({ file: path.join(root, 'runs.json'), active: () => true, context: () => ({ entry }),
    create: async (_owner, _body, id) => ({ sessionId: id }), messages,
    readiness: async () => ready ? { ready: true, conversationId: null } : { ready: false, phase: 'question', reason: 'authentication-required', question: { kind: 'authentication' } } });
  cleanup.push(() => service.close());
  await service.handle({ action: 'run', agentId: 'parent', body: { projectId: 'p', requestKey: 'one', message: 'Task' } }); await tick();
  await service.tick();
  const status = await service.handle({ action: 'run-status', agentId: 'parent', body: { requestKey: 'one' } });
  expect(status).toMatchObject({ phase: 'question', question: { kind: 'authentication' } }); expect(messages.handle).not.toHaveBeenCalled();
  ready = true; await service.tick(); expect(messages.handle).toHaveBeenCalledOnce();
  await service.handle({ action: 'run', agentId: 'parent', body: { projectId: 'p', requestKey: 'two', message: 'Task' } }); await tick();
  entry = {}; await service.tick();
  expect(service.records.find(r => r.requestKey === 'two').phase).toBe('reconcile-required'); expect(messages.handle.mock.calls.filter(([c]) => c.action === 'message-send')).toHaveLength(1);
});

it('validates inherited Claude full model IDs against their documented family and keeps automatic routing unpinned', async () => {
  const f = policyFixture('claude'); f.change({ modelSettings: { model: 'claude-sonnet-5-5', effort: 'medium' } });
  expect(await f.policy.resolve({ ownerId: 'owner', aiToolId: 'claude' })).toMatchObject({ modelSettings: { model: 'claude-sonnet-5-5', effort: 'medium' } });
  const c = policyFixture('codex'); expect((await c.policy.resolve({ ownerId: 'owner', aiToolId: 'codex' })).codexPoolAccountId).toBeUndefined();
});
it('uses the same remembered Dangerous selection as the creation UI and rejects conflicting advanced model flags', async () => {
  const values = { 'multiagent.agentDefaults.v1': JSON.stringify({ claude: { dangerousDefaultMode: 'remember', dangerous: false } }),
    'multiagent.newSessionPreferences.v1': JSON.stringify({ dangerousByTool: { claude: true } }) };
  expect(childLaunchPreferences(values, 'claude').dangerous).toBe(true);
  values['multiagent.agentDefaults.v1'] = JSON.stringify({ claude: { dangerousDefaultMode: 'off', dangerous: false } });
  expect(childLaunchPreferences(values, 'claude').dangerous).toBe(false);
  const f = policyFixture();
  f.policy.preferences = async () => ({ launchOptions: { args: ['--model', 'other'] } });
  await expect(f.policy.resolve({ ownerId: 'owner', aiToolId: 'codex' })).rejects.toThrow('model/effort');
});
