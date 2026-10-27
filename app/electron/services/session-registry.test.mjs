import { afterEach, expect, it, vi } from 'vitest';
import { SessionRegistry } from './session-registry.mjs';

const services = [];
afterEach(() => { services.splice(0).forEach(s => s.close()); vi.useRealTimers(); });
function fixture(extra = {}) {
  const catalog = { projects: [{ id: 'p' }, { id: 'other' }, { id: 'ssh', sshHostId: 'host' }], agents: [
    { id: 'a', name: 'Manager', projectId: 'p' }, { id: 'b', name: 'Worker', projectId: 'p', sessionHierarchy: { parentId: 'a', createdById: 'original' } },
    { id: 'c', name: 'Independent', projectId: 'p' }, { id: 'outside', name: 'Other', projectId: 'other' }, { id: 'remote', projectId: 'ssh' },
  ] };
  const active = new Set(['a', 'b']);
  const dispatch = vi.fn(() => true), lock = vi.fn(), unlock = vi.fn();
  const verifySaved = vi.fn(async (operation, body) => operation === 'stop' ? { sessionId: body.sessionId, active: false } : { sessions: body.changes });
  const service = new SessionRegistry({ catalog: () => catalog, active: id => active.has(id), dispatch, verifySaved, lock, unlock, ...extra });
  services.push(service);
  return { catalog, active, dispatch, verifySaved, lock, unlock, service,
    ack: (result = {}) => service.complete({ ...dispatch.mock.lastCall[0], ok: true, ...result }) };
}
it('acknowledges active or offline rename/reparent only after durable verification and ignores foreign receipts', async () => {
  const f = fixture(), changes = [{ sessionId: 'a', name: 'Chief', expectedName: 'Manager' }, { sessionId: 'c', parentSessionId: 'a', expectedParentSessionId: null }];
  const request = f.service.handle('organize', { changes });
  expect(f.lock).toHaveBeenCalledWith(['a', 'c']);
  expect(await f.service.complete({ requestId: 'wrong', id: 'a', ok: true })).toBe(false);
  expect(f.service.validate(f.dispatch.mock.lastCall[0])).toEqual({ operation: 'organize', changes });
  await f.ack(); expect(await request).toEqual({ saved: true, background: true, sessions: changes });
  expect(f.verifySaved).toHaveBeenCalledWith('organize', { changes });
  expect(f.unlock).toHaveBeenCalledOnce();
});
it('validates the entire final graph, including atomic swaps and removal', async () => {
  const f = fixture();
  await expect(f.service.handle('organize', { changes: [{ sessionId: 'a', parentSessionId: 'b', expectedParentSessionId: null }] })).rejects.toMatchObject({ statusCode: 409 });
  const request = f.service.handle('organize', { changes: [{ sessionId: 'a', parentSessionId: 'b', expectedParentSessionId: null }, { sessionId: 'b', parentSessionId: null, expectedParentSessionId: 'a' }] });
  await f.ack(); expect((await request).saved).toBe(true);
});
it.each([
  {}, { changes: [] }, { changes: Array.from({ length: 21 }, () => ({ sessionId: 'a' })) },
  { changes: [{ sessionId: 'a', name: 'New' }] }, { changes: [{ sessionId: 'a', name: '\n', expectedName: 'Manager' }] },
  { changes: [{ sessionId: 'a', parentSessionId: null }] }, { changes: [{ sessionId: 'a', parentSessionId: 'a', expectedParentSessionId: null }] },
  { changes: [{ sessionId: 'a', parentSessionId: 'outside', expectedParentSessionId: null }] },
  { changes: [{ sessionId: 'a', parentSessionId: 'missing', expectedParentSessionId: null }] },
  { changes: [{ sessionId: 'remote', name: 'Remote', expectedName: '' }] },
  { changes: [{ sessionId: 'a', name: 'New', expectedName: 'stale' }] },
  { changes: [{ sessionId: 'b', parentSessionId: null, expectedParentSessionId: 'stale' }] },
  { changes: [{ sessionId: 'a', expectedName: 'Manager' }] },
  { changes: [{ sessionId: 'a', name: 'New', expectedName: 'Manager', folder: 'C:/new' }] },
  { changes: [{ sessionId: 'a', name: 'New', expectedName: 'Manager' }, { sessionId: 'a', name: 'Other', expectedName: 'Manager' }] },
])('rejects invalid or stale organization requests before dispatch: %j', async body => {
  const f = fixture(); await expect(f.service.handle('organize', body)).rejects.toThrow(); expect(f.dispatch).not.toHaveBeenCalled();
});
it('allows idempotent retry but rechecks a concurrent edit immediately before coordinator persistence', async () => {
  const f = fixture(), changes = [{ sessionId: 'a', name: 'Chief', expectedName: 'Manager' }];
  f.catalog.agents[0].name = 'Chief';
  const request = f.service.handle('organize', { changes });
  expect(f.service.validate(f.dispatch.mock.lastCall[0]).changes).toEqual(changes);
  f.catalog.agents[0].name = 'Edited';
  expect(() => f.service.validate(f.dispatch.mock.lastCall[0])).toThrow('변경');
  await f.ack({ ok: false, statusCode: 409 }); await expect(request).rejects.toMatchObject({ statusCode: 409 });
});
it('requires confirmed process exit as well as saved standby and supports offline stop', async () => {
  const f = fixture(); let request = f.service.handle('stop', { sessionId: 'b' });
  await f.ack(); await expect(request).rejects.toMatchObject({ statusCode: 409 });
  request = f.service.handle('stop', { sessionId: 'b' }); f.active.delete('b');
  await f.ack(); expect(await request).toMatchObject({ active: false, saved: true, sessionId: 'b' });
  request = f.service.handle('stop', { sessionId: 'b' }); await f.ack(); expect((await request).active).toBe(false);
});
it('does not mutate reserved sessions or parents, rejects concurrent transactions and releases timeout locks', async () => {
  const f = fixture({ writable: id => id !== 'a', timeoutMs: 10 });
  await expect(f.service.handle('organize', { changes: [{ sessionId: 'c', parentSessionId: 'a', expectedParentSessionId: null }] })).rejects.toMatchObject({ statusCode: 409 });
  const request = f.service.handle('stop', { sessionId: 'b' });
  await expect(f.service.handle('stop', { sessionId: 'c' })).rejects.toMatchObject({ statusCode: 409 });
  await expect(request).rejects.toMatchObject({ statusCode: 504 }); expect(f.unlock).toHaveBeenCalledWith(['b']);
  expect(() => f.service.validate(f.dispatch.mock.lastCall[0])).toThrow('만료');
});
it('reports unavailable coordinators and disk failures without success', async () => {
  const f = fixture({ dispatch: () => false }); await expect(f.service.handle('stop', { sessionId: 'c' })).rejects.toMatchObject({ statusCode: 503 });
  const g = fixture({ verifySaved: () => { throw new Error('disk'); } }), request = g.service.handle('stop', { sessionId: 'c' });
  await g.ack(); await expect(request).rejects.toThrow('disk'); expect(g.unlock).toHaveBeenCalledOnce();
});
