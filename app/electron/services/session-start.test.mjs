import { expect, it, vi } from 'vitest';
import { SessionStart } from './session-start.mjs';
import { RemoteSessionActivationBroker } from './remote-session-activation-broker.mjs';

it('acknowledges an actual background PTY and leaves an active CLI running on retry', async () => {
  let active = false, request;
  const dispatch = vi.fn(payload => { request = payload; return true; });
  const broker = new RemoteSessionActivationBroker({ dispatch, isActive: () => active });
  const agent = { id: 'existing', aiToolId: 'codex', name: 'Keep', dangerous: true, lastSessionId: 'conversation' };
  const original = structuredClone(agent);
  const service = new SessionStart({ agentFor: () => agent, activate: id => broker.activate(id) });
  const pending = service.handle({ sessionId: 'existing' });
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'existing' }));
  expect(request.restart).toBeUndefined();
  active = true;
  broker.complete({ ...request, ok: true });
  await expect(pending).resolves.toEqual({ sessionId: 'existing', active: true, started: true, background: true });
  await expect(service.handle({ sessionId: 'existing' })).resolves.toMatchObject({ active: true, started: false, background: true });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(agent).toEqual(original);
});

it.each(['codex', 'claude', 'qwen', 'agy'])('supports starting a local %s session', async aiToolId => {
  const service = new SessionStart({ agentFor: () => ({ aiToolId }), activate: async () => ({ active: true, restarted: true }) });
  await expect(service.handle({ sessionId: 'offline' })).resolves.toMatchObject({ sessionId: 'offline', active: true });
});

it.each([null, [], {}, { sessionId: 1 }, { sessionId: ' ' }, { sessionId: 'x\n' }, { sessionId: 'x'.repeat(257) }, { sessionId: 'x', focus: true }, { sessionId: 'x', restart: true }])('rejects invalid or unsupported start options before dispatch: %j', async body => {
  const activate = vi.fn();
  const service = new SessionStart({ agentFor: () => ({ aiToolId: 'codex' }), activate });
  await expect(service.handle(body)).rejects.toMatchObject({ statusCode: 400 });
  expect(activate).not.toHaveBeenCalled();
});

it.each([
  [null, true, 404],
  [{ aiToolId: 'none' }, true, 409],
  [{ aiToolId: 'codex', sshHostId: 'ssh' }, true, 409],
  [{ aiToolId: 'claude', detached: true }, true, 409],
  [{ aiToolId: 'qwen' }, false, 409],
])('rejects missing, unsupported, remote, detached or locked targets: %j', async (agent, writable, statusCode) => {
  const activate = vi.fn();
  const service = new SessionStart({ agentFor: () => agent, writable: () => writable, activate });
  await expect(service.handle({ sessionId: 'target' })).rejects.toMatchObject({ statusCode });
  expect(activate).not.toHaveBeenCalled();
});

it('preserves broker failures and rejects an unconfirmed PTY without falling back to visible activation', async () => {
  const activate = vi.fn().mockRejectedValueOnce(Object.assign(new Error('coordinator unavailable'), { statusCode: 503 }))
    .mockRejectedValueOnce(Object.assign(new Error('timeout'), { statusCode: 504 })).mockResolvedValueOnce({ active: false });
  const service = new SessionStart({ agentFor: () => ({ aiToolId: 'codex' }), activate });
  for (const statusCode of [503, 504, 409]) await expect(service.handle({ sessionId: 'target' })).rejects.toMatchObject({ statusCode });
  expect(activate).toHaveBeenCalledTimes(3);
});
