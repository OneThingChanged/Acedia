import { afterEach, expect, it, vi } from 'vitest';
import { SessionLaunchSettings } from './session-launch-settings.mjs';

const instances = [];
afterEach(() => { for (const instance of instances.splice(0)) instance.close(); vi.useRealTimers(); });
function fixture(extra = {}) {
  const agent = { id: 'target', aiToolId: 'codex', dangerous: false, ...extra };
  const active = new Set();
  const dispatch = vi.fn(() => true), verifySaved = vi.fn(async item => { agent.dangerous = item.dangerous; });
  const service = new SessionLaunchSettings({ agentFor: id => id === agent.id ? agent : null,
    active: id => active.has(id), dispatch, verifySaved, timeoutMs: 100 });
  instances.push(service);
  return { agent, active, dispatch, verifySaved, service,
    save: (dangerous = true, expectedDangerous = false) => service.handle({ sessionId: agent.id, dangerous, expectedDangerous }) };
}
it.each(['codex', 'claude', 'qwen', 'agy'])('saves OFFLINE %s settings only after a verified durable acknowledgement', async aiToolId => {
  const f = fixture({ aiToolId });
  expect(await f.service.handle({ sessionId: 'target' })).toMatchObject({ dangerous: false, active: false, supportsDangerous: true });
  const saved = f.save(); let settled = false; saved.then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  const payload = f.dispatch.mock.calls[0][0];
  expect(await f.service.complete({ ...payload, id: 'wrong-target', ok: true })).toBe(false);
  expect(await f.service.complete({ ...payload, ok: true })).toBe(true);
  expect(await saved).toMatchObject({ sessionId: 'target', aiToolId, dangerous: true, active: false, saved: true, appliesOn: 'next_start' });
  expect(f.verifySaved).toHaveBeenCalledTimes(1);
  expect((await f.service.handle({ sessionId: 'target' })).dangerous).toBe(true);
});
it('saves next-start settings for an active target without claiming a live policy change, including a same-value retry', async () => {
  const f = fixture(); f.active.add('target');
  for (let i = 0; i < 2; i++) {
    const saved = f.save(); await f.service.complete({ ...f.dispatch.mock.calls[i][0], ok: true });
    expect(await saved).toMatchObject({ active: true, dangerous: true, appliesOn: 'next_start' });
  }
  const disabled = f.save(false, true); await f.service.complete({ ...f.dispatch.mock.calls[2][0], ok: true });
  expect(await disabled).toMatchObject({ dangerous: false, saved: true });
});
it('rejects unsupported, SSH and detached targets and stale no-change requests', async () => {
  for (const extra of [{ aiToolId: 'none' }, { aiToolId: 'cline' }, { sshHostId: 'ssh' }, { detached: true }]) {
    const f = fixture(extra); await expect(f.save()).rejects.toMatchObject({ statusCode: 409 }); expect(f.dispatch).not.toHaveBeenCalled();
  }
  const f = fixture({ dangerous: true });
  await expect(f.save(false, false)).rejects.toMatchObject({ statusCode: 409 });
  await expect(f.service.handle({ sessionId: 'missing' })).rejects.toMatchObject({ statusCode: 404 });
});
it('strictly validates booleans, partial payloads and extra options before dispatch', async () => {
  const f = fixture();
  for (const body of [null, [], {}, { sessionId: '\n' }, { sessionId: 'target', dangerous: 'true', expectedDangerous: false },
    { sessionId: 'target', dangerous: true }, { sessionId: 'target', expectedDangerous: false },
    { sessionId: 'target', dangerous: true, expectedDangerous: false, restart: true }, { sessionId: 'target', launchOptions: {} }]) {
    await expect(f.service.handle(body)).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('serializes same-session updates and rejects failed persistence instead of reporting saved', async () => {
  const f = fixture();
  const first = f.save(); const failure = expect(first).rejects.toThrow('disk unavailable');
  await expect(f.save()).rejects.toMatchObject({ statusCode: 409 });
  f.verifySaved.mockRejectedValueOnce(new Error('disk unavailable'));
  await f.service.complete({ ...f.dispatch.mock.calls[0][0], ok: true }); await failure;
  expect(f.agent.dangerous).toBe(false); expect(f.service.pending.size).toBe(0);
});
it('rejects a target removed during acknowledgement without leaving a pending promise', async () => {
  const f = fixture(); const saved = f.save(); const checked = expect(saved).rejects.toMatchObject({ statusCode: 404 });
  f.verifySaved.mockImplementationOnce(async () => { f.agent.id = 'removed'; });
  await f.service.complete({ ...f.dispatch.mock.calls[0][0], ok: true }); await checked;
  expect(f.service.pending.size).toBe(0);
});
it('reports an unavailable coordinator, renderer rejection, timeouts and shutdown; ignores late acknowledgements', async () => {
  const f = fixture(); f.dispatch.mockReturnValueOnce(false);
  await expect(f.save()).rejects.toMatchObject({ statusCode: 503 });
  const rejected = f.save(); const rejectedCheck = expect(rejected).rejects.toMatchObject({ statusCode: 409 });
  await f.service.complete({ ...f.dispatch.mock.calls[1][0], ok: false, statusCode: 409, error: 'changed in another window' }); await rejectedCheck;
  vi.useFakeTimers();
  const timed = f.save(); const timedCheck = expect(timed).rejects.toMatchObject({ statusCode: 504 });
  await vi.advanceTimersByTimeAsync(101); await timedCheck;
  expect(await f.service.complete({ ...f.dispatch.mock.calls[2][0], ok: true })).toBe(false);
  expect(f.verifySaved).not.toHaveBeenCalled();
  const closing = f.save(); const closingCheck = expect(closing).rejects.toMatchObject({ statusCode: 503 });
  f.service.close(); await closingCheck;
});
