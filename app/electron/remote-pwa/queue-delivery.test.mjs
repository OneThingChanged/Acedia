import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createQueueInputGate } from './queue-delivery.js';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  let now = 10000, ready = true;
  const agent = { id: 'a', aiToolId: 'codex', runtimeStatus: 'running', status: 'done', sessionId: 'original' };
  const queue = ['첫 번째', '두 번째 C:\\첨부\\검증.png', '세 번째'].map((text, i) => ({ text, requestId: `request-${i}`, sessionId: 'original' }));
  const inspect = vi.fn(async id => ({ id, supported: true, ready, conversationId: 'original' }));
  const gate = createQueueInputGate({ inspect, now: () => now });
  const sent = [];
  const context = { drainingQueues: false, nativePageActive: true, sessionQueues: new Map([['a', queue]]), agentMap: () => new Map([['a', agent]]),
    sendingAgents: new Set(), sessionRestartRequests: new Set(), sessionActivationDeadlines: new Map(), sessionQueueErrors: new Map(),
    blockedSubmissions: new Set(), uncertainSubmissions: new Set(), sessionLastSendAt: new Map(), QUEUE_COOLDOWN_MS: 1200,
    Date: { now: () => now }, agentActivated: () => true, agentInitializing: () => false, agentBusy: a => a.status === 'working', blockingPrompt: () => false,
    agentReady: a => a.status !== 'working', statusOf: a => a.status, conversationId: a => a.sessionId, selectedAgent: () => null,
    renderComposerQueue: vi.fn(), lastChatFetch: {}, queueInputGate: gate,
    sendInput: vi.fn(async (id, text, options) => { sent.push({ id, text, ...options }); gate.sent(id, options.sessionId); ready = false; return true; }) };
  const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function drainQueues()'), end = source.indexOf('\nasync function requestSessionActivation(', start);
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  return { context, agent, queue, sent, gate, inspect, tick: (value = 2000) => { now += value; }, ready: value => { ready = value; }, drain: () => context.drainQueues() };
}
describe('Remote queue source without browser automation', () => {
  it('sends three entries in order, waits through delayed startup and resumes even when a working badge is stale', async () => {
    const f = fixture(); await f.drain(); expect(f.sent.map(s => s.text)).toEqual(['첫 번째']);
    f.tick(); await f.drain(); f.tick(); await f.drain();
    expect(f.sent).toHaveLength(1); expect(f.queue).toHaveLength(2); expect(f.context.sessionQueueErrors.size).toBe(0);
    f.agent.status = 'working'; f.ready(true); f.tick(); await f.drain();
    expect(f.sent.map(s => s.text)).toEqual(['첫 번째', '두 번째 C:\\첨부\\검증.png']);
    f.tick(); await f.drain(); expect(f.sent).toHaveLength(2);
    f.ready(true); f.tick(); await f.drain(); expect(f.sent.map(s => s.requestId)).toEqual(['request-0', 'request-1', 'request-2']);
    expect(f.context.sessionQueues.size).toBe(0);
  });
  it('recovers a definitive not-sent composer rejection automatically without discarding or changing its request ID', async () => {
    const f = fixture(); f.context.sessionQueueErrors.set('a', 'composer-not-ready'); f.context.blockedSubmissions.add('request-0');
    f.ready(false); await f.drain(); expect(f.sent).toHaveLength(0); expect(f.queue).toHaveLength(3);
    f.tick(); f.ready(true); await f.drain(); expect(f.sent[0].requestId).toBe('request-0');
    expect(f.context.blockedSubmissions.size).toBe(0); expect(f.context.sessionQueueErrors.size).toBe(0);
  });
  it.each(['outcome-unknown', 'closed', 'conversation-changed', 'send-failed'])('never auto-replays %s', async error => {
    const f = fixture(); f.context.sessionQueueErrors.set('a', error);
    await f.drain(); f.tick(); await f.drain();
    expect(f.inspect).not.toHaveBeenCalled(); expect(f.sent).toHaveLength(0); expect(f.queue).toHaveLength(3);
  });
  it.each(['cancel', 'close', 'conversation'])('rechecks %s after a slow readiness response', async change => {
    const f = fixture(), held = deferred(); f.inspect.mockImplementationOnce(() => held.promise);
    const pending = f.drain(); await Promise.resolve();
    if (change === 'cancel') f.queue.splice(0, 1);
    if (change === 'close') f.context.sessionQueueErrors.set('a', 'closed');
    if (change === 'conversation') f.agent.sessionId = 'other';
    held.resolve({ supported: true, ready: true, conversationId: 'original' }); await pending;
    expect(f.sent).toHaveLength(0);
    if (change === 'conversation') expect(f.context.sessionQueueErrors.get('a')).toBe('conversation-changed');
  });
  it('retains the head on status transport failure without making a submission attempt', async () => {
    const f = fixture(); f.inspect.mockRejectedValueOnce(Error('offline'));
    await f.drain(); expect(f.sent).toHaveLength(0); expect(f.queue[0].requestId).toBe('request-0');
    f.tick(); await f.drain(); expect(f.sent).toHaveLength(1);
  });
});

describe('Remote Claude delivery mode', () => {
  function composer() {
    const agent = { id: 'claude', aiToolId: 'claude', status: 'working' };
    const queue = [{ text: '예약된 메시지' }], buttons = new Map();
    const button = { setAttribute: vi.fn() }, clickHandlers = new Map(), inputHandlers = new Map();
    buttons.set('composerDeliveryButton', { ...button, addEventListener: (name, handler) => clickHandlers.set(name, handler) });
    const context = {
      document: { getElementById: id => buttons.get(id) ?? { dataset: {}, querySelector: () => ({}), addEventListener: vi.fn() } },
      ui: { messageInput: { value: '진행 중 추가 요청', addEventListener: (name, handler) => inputHandlers.set(name, handler) }, sendButton: {} },
      selectedAgent: () => agent, statusOf: a => a?.status, sessionViewMode: 'chat', isChatOnly: () => false, t: value => value,
      lastChatData: {}, deliveryModes: new Map(), agentBusy: a => a.status === 'working', agentInitializing: vi.fn(() => false),
      blockingPrompt: vi.fn(() => false), agentReady: () => false, acknowledgeCompletion: vi.fn(),
      currentAttachments: () => [], sendingAgents: new Set(), taskModes: new Set(), remoteAttachmentMessage: message => message,
      composerRevisions: new Map(), pendingSubmissions: new Map(), uncertainSubmissions: new Set(), submissionId: () => 'submission',
      conversationId: () => 'conversation', updateComposerSendState: vi.fn(), followAgentTerminal: vi.fn(), queueForAgent: () => queue,
      QUEUE_COOLDOWN_MS: 1500, sessionLastSendAt: new Map(), sendInput: vi.fn(async () => true), clearAcceptedComposer: vi.fn(),
      renderComposerQueue: vi.fn(), showToast: vi.fn(), acItems: [], acceptComposerAc: vi.fn(),
    };
    const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
    const sourceBetween = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    vm.runInNewContext(sourceBetween('function supportsRemoteSteering(', 'function appendConversationTurn(')
      + sourceBetween('ui.messageInput.addEventListener("keydown"', 'ui.copyOutputButton.addEventListener('), context);
    return { agent, context, queue, delivery: buttons.get('composerDeliveryButton'), click: clickHandlers.get('click'), keydown: inputHandlers.get('keydown') };
  }

  it('exposes the mode button and Tab, sends an explicit follow-up ahead of completion reservations', async () => {
    const f = composer();
    f.context.updateWorking();
    expect(f.delivery.hidden).toBe(false);
    expect(f.delivery.textContent).toContain('완료 후 예약');
    f.click(); expect(f.delivery.textContent).toContain('작업 중 추가');
    const tab = { key: 'Tab', preventDefault: vi.fn() };
    f.keydown(tab); expect(f.delivery.textContent).toContain('완료 후 예약');
    await f.context.sendSelectedMessage();
    expect(f.context.sendInput).not.toHaveBeenCalled();
    expect(f.queue.map(item => item.text)).toEqual(['예약된 메시지', '진행 중 추가 요청']);
    f.keydown(tab);
    f.context.ui.messageInput.value = '끼어넣을 새 지시';
    await f.context.sendSelectedMessage();
    expect(tab.preventDefault).toHaveBeenCalledTimes(2);
    expect(f.context.sendInput).toHaveBeenCalledExactlyOnceWith('claude', '끼어넣을 새 지시', { requestId: 'submission', sessionId: 'conversation', steering: true });
    expect(f.queue).toHaveLength(2);
  });

  it.each(['blocking question', 'initialization', 'Claude command', 'SSH', 'other provider'])('retains completion delivery for %s', async state => {
    const f = composer();
    f.click();
    if (state === 'blocking question') f.context.blockingPrompt.mockReturnValue(true);
    if (state === 'initialization') f.context.agentInitializing.mockReturnValue(true);
    if (state === 'Claude command') f.context.ui.messageInput.value = '/clear';
    if (state === 'SSH') f.agent.sshHostId = 'remote';
    if (state === 'other provider') f.agent.aiToolId = 'qwen';
    f.context.updateWorking();
    expect(f.delivery.hidden).toBe(['SSH', 'other provider'].includes(state));
    await f.context.sendSelectedMessage();
    expect(f.context.sendInput).not.toHaveBeenCalled();
    expect(f.queue).toHaveLength(2);
  });
});

describe('Read-only input readiness gate', () => {
  it('checks a fresh session before its first conversation ID exists', async () => {
    const inspect = vi.fn(async () => ({ supported: true, ready: true, conversationId: null }));
    const gate = createQueueInputGate({ inspect });
    expect(await gate.check('fresh')).toMatchObject({ ready: true });
    expect(inspect).toHaveBeenCalledWith('fresh', undefined);
  });
  it('shares in-flight checks and bounds polling while waiting', async () => {
    let now = 1000; const held = deferred(), inspect = vi.fn(() => held.promise);
    const gate = createQueueInputGate({ inspect, now: () => now });
    const a = gate.check('a', 'conversation'), b = gate.check('a', 'conversation');
    held.resolve({ supported: true, ready: false }); await Promise.all([a, b]);
    await gate.check('a', 'conversation'); expect(inspect).toHaveBeenCalledTimes(1);
    now += 1000; await gate.check('a', 'conversation'); expect(inspect).toHaveBeenCalledTimes(2);
  });
  it('invalidates a pending ready response when a submission has intervened', async () => {
    const held = deferred(), gate = createQueueInputGate({ inspect: () => held.promise });
    const pending = gate.check('a', 'conversation'); gate.sent('a', 'conversation');
    held.resolve({ supported: true, ready: true }); expect(await pending).toMatchObject({ ready: false });
  });
});
