import { afterEach, expect, it, vi } from 'vitest';
import { SessionRouting } from './session-routing.mjs';

const instances = [];
afterEach(() => { for (const service of instances.splice(0)) service.close(); vi.useRealTimers(); });
function fixture(extra = {}) {
  const agent = { id: 'target', aiToolId: 'codex', dangerous: true, lastSessionId: 'original-conversation',
    modelSettings: { model: 'sol', effort: 'xhigh', serviceTier: 'fast' }, ...extra };
  const info = { enabled: true, writable: true, routed: false, assignedAccountId: 'old',
    accounts: [{ id: 'old', label: 'Old', available: true }, { id: 'new', label: '새 계정', available: true },
      { id: 'unavailable', label: '한도 소진', available: false, auth: 'never expose' }] };
  const active = new Set(), locked = new Set();
  const dispatch = vi.fn(() => true), verifySaved = vi.fn(async change => { agent.codexPoolAccountId = change.accountId || undefined; });
  const service = new SessionRouting({ agentFor: id => agent?.id === id ? agent : null, active: id => active.has(id),
    pool: () => info, dispatch, verifySaved, lock: id => locked.add(id), unlock: id => locked.delete(id), timeoutMs: 100 });
  instances.push(service);
  return { agent, info, active, locked, dispatch, verifySaved, service,
    save: (accountId = 'new', expectedAccountId = null) => service.handle({ sessionId: agent.id, accountId, expectedAccountId }),
    ack: () => ({ ...dispatch.mock.calls.at(-1)[0], ok: true }) };
}
it('reads OFFLINE preferences and minimal account choices without changing or exposing credentials', async () => {
  const f = fixture({ codexPoolAccountId: 'old' });
  expect(await f.service.handle({ sessionId: 'target' })).toEqual({ sessionId: 'target', aiToolId: 'codex',
    supportsRouting: true, canEdit: true, active: false, enabled: true, preferredAccountId: 'old',
    runningMode: 'inactive', runningAccountId: null, accounts: f.info.accounts.map(({ id, label, available }) => ({ id, label, available })),
    appliesOn: 'next_start', restartRequired: false, background: true });
  expect(f.dispatch).not.toHaveBeenCalled(); expect(f.verifySaved).not.toHaveBeenCalled();
});
it('persists the next-start pin only after acknowledgement, retaining the live assignment and other launch settings', async () => {
  const f = fixture({ codexPoolAccountId: 'old' }); f.active.add('target'); f.info.routed = true;
  const original = structuredClone(f.agent), pending = f.save('new', 'old'); let settled = false;
  pending.then(() => { settled = true; }); await Promise.resolve();
  expect(settled).toBe(false); expect(f.locked.has('target')).toBe(true);
  expect(await f.service.complete({ ...f.ack(), id: 'other' })).toBe(false);
  expect(await f.service.complete({ ...f.ack(), requestId: 'other' })).toBe(false);
  expect(f.service.validate(f.ack())).toEqual({ sessionId: 'target', accountId: 'new', expectedAccountId: 'old' });
  expect(await f.service.complete(f.ack())).toBe(true);
  expect(await pending).toMatchObject({ saved: true, preferredAccountId: 'new', runningAccountId: 'old', runningMode: 'routed', active: true, restartRequired: true });
  expect(f.info.assignedAccountId).toBe('old');
  expect(f.agent).toEqual({ ...original, codexPoolAccountId: 'new' }); expect(f.locked.size).toBe(0);
});
it('supports Automatic, same-value retry and explicit disabled-routing state without toggling the pool', async () => {
  const f = fixture({ codexPoolAccountId: 'new' }); f.info.enabled = false; f.active.add('target');
  for (let i = 0; i < 2; i++) {
    const saved = f.save(null, 'new'); await f.service.complete(f.ack());
    expect(await saved).toMatchObject({ saved: true, preferredAccountId: null, runningMode: 'direct', runningAccountId: null, enabled: false });
  }
  expect(f.info.enabled).toBe(false);
});
it('rejects stale expected values, unavailable accounts, non-Codex, SSH, detached and unwritable targets', async () => {
  const f = fixture({ codexPoolAccountId: 'old' });
  await expect(f.save('new', null)).rejects.toMatchObject({ statusCode: 409 });
  for (const id of ['missing', 'unavailable']) await expect(f.save(id, 'old')).rejects.toMatchObject({ statusCode: 409 });
  for (const extra of [{ aiToolId: 'claude' }, { sshHostId: 'remote' }, { detached: true }]) {
    const g = fixture(extra); await expect(g.save()).rejects.toMatchObject({ statusCode: 409 }); expect(g.dispatch).not.toHaveBeenCalled();
  }
  f.info.writable = false; await expect(f.save('new', 'old')).rejects.toMatchObject({ statusCode: 409 });
  expect((await f.service.handle({ sessionId: 'target' })).accounts).toHaveLength(3);
  f.info.writable = true; f.service.writable = () => false;
  await expect(f.save('new', 'old')).rejects.toMatchObject({ statusCode: 409 });
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('rejects malformed, extra and incomplete options before dispatch', async () => {
  const f = fixture();
  for (const body of [null, [], {}, { sessionId: ' target' }, { sessionId: '\n' }, { sessionId: 'target', accountId: '' },
    { sessionId: 'target', expectedAccountId: null }, { sessionId: 'target', accountId: 'new' },
    { sessionId: 'target', accountId: true, expectedAccountId: null }, { sessionId: 'target', accountId: 'new', expectedAccountId: null, restart: true }]) {
    await expect(f.service.handle(body)).rejects.toMatchObject({ statusCode: 400 });
  }
  await expect(f.service.handle({ sessionId: 'missing' })).rejects.toMatchObject({ statusCode: 404 });
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('revalidates queued writes and serializes updates while storage is verified', async () => {
  const f = fixture(); const saved = f.save();
  await expect(f.save()).rejects.toMatchObject({ statusCode: 409 });
  f.agent.codexPoolAccountId = 'old'; expect(() => f.service.validate(f.ack())).toThrow('변경');
  f.agent.codexPoolAccountId = undefined;
  let finish; f.verifySaved.mockImplementationOnce(() => new Promise(resolve => { finish = () => { f.agent.codexPoolAccountId = 'new'; resolve(); }; }));
  const completing = f.service.complete(f.ack());
  expect(await f.service.complete(f.ack())).toBe(false); await expect(f.save()).rejects.toMatchObject({ statusCode: 409 });
  finish(); await completing; expect((await saved).saved).toBe(true); expect(f.locked.size).toBe(0);
});
it('reports failed persistence or divergent durable data and releases the session lock', async () => {
  const f = fixture(); f.verifySaved.mockRejectedValueOnce(new Error('disk unavailable'));
  const saved = f.save(), checked = expect(saved).rejects.toThrow('disk unavailable');
  await f.service.complete(f.ack()); await checked; expect(f.locked.size).toBe(0);
  f.verifySaved.mockResolvedValueOnce(undefined);
  const divergent = f.save(), divergentCheck = expect(divergent).rejects.toMatchObject({ statusCode: 409 });
  await f.service.complete(f.ack()); await divergentCheck; expect(f.locked.size).toBe(0);
});
it('handles unavailable coordinator, renderer rejection, expired acknowledgements and shutdown without leaking locks', async () => {
  const f = fixture(); f.dispatch.mockReturnValueOnce(false);
  await expect(f.save()).rejects.toMatchObject({ statusCode: 503 }); expect(f.locked.size).toBe(0);
  const denied = f.save(), deniedCheck = expect(denied).rejects.toMatchObject({ statusCode: 409 });
  await f.service.complete({ ...f.ack(), ok: false }); await deniedCheck;
  vi.useFakeTimers(); const timed = f.save(), timedCheck = expect(timed).rejects.toMatchObject({ statusCode: 504 });
  const stale = f.ack(); await vi.advanceTimersByTimeAsync(101); await timedCheck;
  expect(() => f.service.validate(stale)).toThrow('만료'); expect(await f.service.complete(stale)).toBe(false);
  const closing = f.save(), closingCheck = expect(closing).rejects.toMatchObject({ statusCode: 503 });
  f.service.close(); await closingCheck; expect(f.locked.size).toBe(0); expect(f.verifySaved).not.toHaveBeenCalled();
});
