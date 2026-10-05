import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPACITY_RETRY_PROMPT, CodexCapacityRetry, codexRetryPromptReady, codexRetryTurn } from './codex-capacity-retry.mjs';

const event = (type, extra = {}, at = 1000) => JSON.stringify({ timestamp: new Date(at).toISOString(), type: 'event_msg', payload: { type, turn_id: 'turn-one', ...extra } });
const error = { message: 'Selected model is at capacity. Please try a different model.', codex_error_info: 'server_overloaded' };
const result = (id, at, status = 'failed', capacity = true) => ({ sessionId: 'session-one', question: null, turn: { id, at, status, capacity } });
function fixture(options = {}) {
  const entry = { id: 'a', aiToolId: 'codex', startedAt: 0, lastInputAt: 0, process: {} };
  const entries = new Map([['a', entry]]), sent = [], updates = [];
  let current = result('t0', 1000);
  const service = new CodexCapacityRetry({ entryFor: id => entries.get(id), read: async () => current,
    ready: () => true, submit: async (id, target, prompt, isCurrent) => {
      expect(target).toBe(entry); expect(isCurrent()).toBe(true); sent.push({ id, target, prompt }); return true;
    }, publish: p => updates.push(p), ...options });
  return { service, entry, entries, sent, updates, observe: next => {
    current = next; service.observe('a', entry, next);
  } };
}

describe('capacity error classification', () => {
  it('uses only terminal lifecycle errors, ignoring quotations, tools, partial JSON and missing turn identities', () => {
    expect(codexRetryTurn(event('task_complete', { error }))).toMatchObject({ capacity: true, status: 'failed', id: 'turn-one' });
    expect(codexRetryTurn(event('task_complete', { error: { message: error.message } }))).toMatchObject({ capacity: true });
    expect(codexRetryTurn(event('task_complete', { error: { message: 'stream disconnected before completion: ' + error.message, codex_error_info: 'other' } }))).toMatchObject({ capacity: true });
    expect(codexRetryTurn(event('task_complete', { last_agent_message: error.message }))).toMatchObject({ capacity: false, status: 'done' });
    expect(codexRetryTurn(JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: error.message } }))).toBeNull();
    expect(codexRetryTurn(event('task_complete', { error: { codex_error_info: 'usage_limit_exceeded', message: 'Quota exceeded' } }))).toMatchObject({ capacity: false });
    expect(codexRetryTurn(event('task_complete', { error, turn_id: null }))).toBeNull();
    expect(codexRetryTurn(event('task_complete', { error }) + '\n' + event('task_started', {}, 2000))).toMatchObject({ capacity: false, status: 'working' });
    expect(codexRetryTurn(event('task_complete', { error }).slice(0, -1))).toBeNull();
  });
  it('requires an idle Codex composer, excluding work, queued questions and a shell', () => {
    expect(codexRetryPromptReady('■ Selected model is at capacity.\n› Ask Codex to do anything\n')).toBe(true);
    expect(codexRetryPromptReady('Working (esc to interrupt)\n› Ask Codex to do anything')).toBe(false);
    expect(codexRetryPromptReady('Queued follow-up inputs\n› Ask Codex to do anything')).toBe(false);
    expect(codexRetryPromptReady('PS G:\\AI> ')).toBe(false);
  });
});

describe('bounded same-model recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
  afterEach(() => { vi.useRealTimers(); });
  it('retries after 30/60/120 seconds on the same PTY, then alerts once without a fourth submission', async () => {
    const f = fixture(); f.observe(result('t0', Date.now()));
    for (const [index, delay] of [30000, 60000, 120000].entries()) {
      expect(f.service.get('a')).toMatchObject({ status: 'scheduled', attempt: index, nextRetryAt: Date.now() + delay });
      f.observe(result(`t${index}`, Date.now())); // Duplicate polling cannot add timers.
      await vi.advanceTimersByTimeAsync(delay - 1); expect(f.sent).toHaveLength(index);
      await vi.advanceTimersByTimeAsync(1); expect(f.sent).toHaveLength(index + 1);
      f.observe(result(`t${index + 1}`, Date.now(), 'working', false));
      f.observe(result(`t${index + 1}`, Date.now()));
    }
    expect(f.service.get('a')).toMatchObject({ status: 'failed', reason: 'exhausted', attempt: 3 });
    f.observe(result('t3', Date.now())); await vi.advanceTimersByTimeAsync(300000);
    expect(f.sent).toHaveLength(3);
    expect(f.sent.every(p => p.target === f.entry && p.prompt === CAPACITY_RETRY_PROMPT)).toBe(true);
    expect(f.updates.filter(p => p.status === 'failed')).toHaveLength(1);
    f.service.dispose();
  });
  it('resolves on a successful continuation and gives the next task its own retry budget', async () => {
    const f = fixture(); f.observe(result('t0', Date.now())); await vi.advanceTimersByTimeAsync(30000);
    f.observe(result('t1', Date.now(), 'done', false));
    expect(f.service.get('a')).toMatchObject({ status: 'resolved', reason: 'completed' });
    f.observe(result('t2', Date.now())); expect(f.service.get('a')).toMatchObject({ status: 'scheduled', attempt: 0 });
    f.service.dispose();
  });
  it('cancels when the user intervenes and does not reschedule the same failure', async () => {
    const f = fixture(); f.observe(result('t0', Date.now()));
    expect(f.service.cancel('a')).toBe(true); f.observe(result('t0', Date.now()));
    await vi.advanceTimersByTimeAsync(30000); expect(f.sent).toHaveLength(0);
    f.observe(result('manual', Date.now(), 'working', false));
    f.observe(result('manual', Date.now())); expect(f.service.get('a')).toMatchObject({ status: 'scheduled', attempt: 0 });
    f.service.dispose();
  });
  it('does not act on historical errors, quota errors, other tools, or SSH', () => {
    const f = fixture(); f.entry.startedAt = 2000; f.observe(result('old', 1000)); expect(f.service.get('a')).toBeNull();
    f.entry.startedAt = 0; f.observe(result('quota', 1000, 'failed', false)); expect(f.service.isActive('a')).toBe(false);
    f.entry.aiToolId = 'claude'; f.observe(result('claude', 2000)); expect(f.service.isActive('a')).toBe(false);
    f.entry.aiToolId = 'codex'; f.entry.ssh = {}; f.observe(result('ssh', 2000)); expect(f.service.isActive('a')).toBe(false);
    f.service.dispose();
  });
  it('rechecks the exact turn and cancels after a conversation change or question', async () => {
    const f = fixture({ read: async () => ({ ...result('new-turn', Date.now()), sessionId: 'session-two' }) });
    f.observe(result('t0', Date.now())); await vi.advanceTimersByTimeAsync(30000); expect(f.sent).toHaveLength(0);
    expect(f.service.get('a').status).toBe('cancelled'); f.service.dispose();
    const q = fixture(); q.observe(result('t0', Date.now())); q.observe({ ...result('t0', Date.now()), question: { async: true } });
    await vi.advanceTimersByTimeAsync(30000); expect(q.sent).toHaveLength(0); q.service.dispose();
  });
  it('cannot submit into a restarted process or after unobserved user input', async () => {
    for (const mutate of [f => { f.entries.set('a', { ...f.entry }); }, f => { f.entry.lastInputAt++; }]) {
      const f = fixture(); f.observe(result('t0', Date.now())); mutate(f);
      await vi.advanceTimersByTimeAsync(30000); expect(f.sent).toHaveLength(0); f.service.prune([]); f.service.dispose();
    }
  });
  it('stops on an unsafe composer or uncertain submission without replaying it', async () => {
    for (const options of [{ ready: () => false }, { submit: async () => { throw new Error('unknown'); } }, { submit: async () => false }]) {
      const f = fixture(options); f.observe(result('t0', Date.now()));
      await vi.advanceTimersByTimeAsync(300000); expect(f.service.get('a').status).toBe('failed');
      expect(f.updates.filter(p => p.status === 'failed')).toHaveLength(1); f.service.dispose();
    }
    const f = fixture(); f.observe(result('t0', Date.now())); await vi.advanceTimersByTimeAsync(45000);
    expect(f.sent).toHaveLength(1); expect(f.service.get('a')).toMatchObject({ status: 'failed', reason: 'unconfirmed' }); f.service.dispose();
  });
});
