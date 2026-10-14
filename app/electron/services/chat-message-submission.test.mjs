import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatMessageSubmitter } from './chat-message-submission.mjs';
import { TerminalSessionService } from './terminal-session-service.mjs';
import { PTY_SUBMIT_DELAY_MS } from './pty-submit.mjs';

const id = 'agent-a';
const request = { id, sessionId: 'before', message: '계속 진행해줘', steering: false };

function fixture() {
  const state = { sessionId: 'before', closing: false, busy: false, ready: true, question: null };
  const listeners = new Set();
  const process = {
    write: vi.fn(() => { for (const listener of listeners) listener('render'); }),
    onData: listener => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
  const entry = { id, process, aiToolId: 'codex', cwd: 'project' };
  const sessions = new Map([[id, entry]]);
  const onInput = vi.fn();
  const terminalSessions = new TerminalSessionService({ sessions, onInput });
  const dependencies = {
    terminalSessions, isClosing: () => state.closing,
    questionResponder: { isBusy: () => state.busy },
    currentQuestion: vi.fn(async () => ({ question: state.question })),
    getSessionId: () => state.sessionId,
    composerReady: () => state.ready,
    cancelRetry: vi.fn(),
    confirmReset: vi.fn(async () => { state.sessionId = 'after'; return 'after'; }),
    onReset: vi.fn(),
  };
  return { state, entry, sessions, process, listeners, onInput, dependencies,
    submit: createChatMessageSubmitter(dependencies) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('host chat submission coordination', () => {
  it('rejects a parked terminal draft before retrying paste or Enter', async () => {
    const f = fixture(); f.state.ready = false;
    await expect(f.submit(request)).rejects.toMatchObject({ outcome: 'not-sent', reason: 'composer-not-ready' });
    expect(f.process.write).not.toHaveBeenCalled();
    expect(f.onInput).not.toHaveBeenCalled();
    f.state.ready = true;
    const retry = f.submit(request);
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    expect(await retry).toBe(true);
    expect(f.process.write.mock.calls).toEqual([[request.message], ['\r']]);
  });

  it('checks the live composer for both ordinary sends and steering', async () => {
    const f = fixture(); f.dependencies.composerReady = vi.fn(() => true);
    const submit = createChatMessageSubmitter(f.dependencies);
    for (const steering of [false, true]) {
      const sent = submit({ ...request, steering });
      await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
      expect(await sent).toBe(true);
      expect(f.dependencies.composerReady).toHaveBeenLastCalledWith(f.entry, { allowWorking: steering });
    }
  });
  it.each([
    ['missing terminal', f => f.sessions.delete(id)],
    ['missing process', f => { f.entry.process = null; }],
    ['shutdown', f => { f.state.closing = true; }],
    ['answer in progress', f => { f.state.busy = true; }],
    ['blocking question', f => { f.state.question = { async: false }; }],
    ['different conversation', f => { f.state.sessionId = 'other'; }],
  ])('rejects %s before any terminal input', async (_label, arrange) => {
    const f = fixture(); arrange(f);
    expect(await f.submit(request)).toBe(false);
    expect(f.process.write).not.toHaveBeenCalled();
    expect(f.dependencies.cancelRetry).not.toHaveBeenCalled();
  });

  it.each(['process', 'conversation', 'answer'])('rechecks %s after async question lookup', async change => {
    const f = fixture();
    f.dependencies.currentQuestion.mockImplementationOnce(async () => {
      if (change === 'process') f.entry.process = { write: vi.fn() };
      if (change === 'conversation') f.state.sessionId = 'other';
      if (change === 'answer') f.state.busy = true;
      return { question: null };
    });
    expect(await f.submit(request)).toBe(false);
    expect(f.process.write).not.toHaveBeenCalled();
  });

  it('uses host input bookkeeping and serializes overlapping submissions on the actual PTY', async () => {
    const f = fixture();
    const first = f.submit({ ...request, message: '첫 줄\n둘째 줄' });
    await vi.advanceTimersByTimeAsync(0);
    expect(await f.submit(request)).toBe(false);
    expect(f.process.write.mock.calls).toEqual([['\x1b[200~첫 줄\r둘째 줄\x1b[201~']]);
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    expect(await first).toBe(true);
    expect(f.process.write.mock.calls.at(-1)).toEqual(['\r']);
    expect(f.onInput).toHaveBeenCalledTimes(2);
    expect(f.listeners.size).toBe(0);
  });

  it('allows steering past an async question while working output keeps repainting', async () => {
    const f = fixture();
    f.state.question = { async: true };
    const spinner = setInterval(() => { for (const listener of f.listeners) listener('working'); }, 100);
    const submitted = f.submit({ ...request, message: '중간 지시\n작업 계속', steering: true });
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    expect(await submitted).toBe(true);
    expect(f.process.write.mock.calls).toEqual([['\x1b[200~중간 지시\r작업 계속\x1b[201~'], ['\r']]);
    clearInterval(spinner);
  });

  it.each(['process', 'entry', 'conversation'])('never sends Enter when %s changes after paste', async change => {
    const f = fixture();
    const submitted = f.submit(request);
    const rejected = expect(submitted).rejects.toThrow('submission outcome unknown');
    await vi.advanceTimersByTimeAsync(0);
    if (change === 'process') f.entry.process = { write: vi.fn() };
    if (change === 'entry') f.sessions.set(id, { ...f.entry });
    if (change === 'conversation') f.state.sessionId = 'other';
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    await rejected;
    expect(f.process.write.mock.calls).toEqual([[request.message]]);
    expect(f.listeners.size).toBe(0);
  });

  it.each(['/clear', '/new next'])('requires a ready composer before local Codex %s', async message => {
    const f = fixture(); f.state.ready = false;
    expect(await f.submit({ ...request, message })).toBe(false);
    expect(f.process.write).not.toHaveBeenCalled();
  });

  it.each(['ssh', 'claude'])('keeps %s slash commands on the ordinary submission path', async kind => {
    const f = fixture(); f.state.ready = false;
    if (kind === 'ssh') f.entry.ssh = {};
    else f.entry.aiToolId = kind;
    const submitted = f.submit({ ...request, message: '/clear' });
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    expect(await submitted).toBe(true);
    expect(f.dependencies.confirmReset).not.toHaveBeenCalled();
    expect(f.dependencies.onReset).not.toHaveBeenCalled();
  });

  it('publishes a reset only after the new conversation is confirmed on the same process', async () => {
    const f = fixture();
    const submitted = f.submit({ ...request, message: '/clear' });
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    expect(await submitted).toBe(true);
    expect(f.dependencies.confirmReset).toHaveBeenCalledWith({
      id, entry: f.entry, previousSessionId: 'before', isCurrent: expect.any(Function),
    });
    expect(f.dependencies.confirmReset.mock.calls[0][0].isCurrent()).toBe(true);
    expect(f.dependencies.onReset).toHaveBeenCalledExactlyOnceWith(id, f.entry, 'after');
  });

  it.each(['process replaced', 'confirmation failure'])('leaves reset caches untouched on %s', async change => {
    const f = fixture();
    f.dependencies.confirmReset.mockImplementationOnce(async () => {
      if (change === 'confirmation failure') throw Error('reset not confirmed');
      f.entry.process = { write: vi.fn() };
      return 'after';
    });
    const submitted = f.submit({ ...request, message: '/clear' });
    const rejected = expect(submitted).rejects.toThrow(change === 'confirmation failure' ? 'not confirmed' : 'outcome unknown');
    await vi.advanceTimersByTimeAsync(PTY_SUBMIT_DELAY_MS);
    await rejected;
    expect(f.dependencies.onReset).not.toHaveBeenCalled();
    expect(f.process.write.mock.calls).toEqual([['/clear'], ['\r']]);
  });
});
