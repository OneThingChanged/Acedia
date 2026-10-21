import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionRelocation } from './session-relocation.mjs';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.useRealTimers(); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-relocation-'));
  cleanups.push(() => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-relocation-')) throw Error('Unexpected cleanup path'); fs.rmSync(root, { recursive: true }); });
  const folder = path.join(root, 'RnDHub'); fs.mkdirSync(folder);
  const catalog = { projects: [{ id: 'old', folder: root }, { id: 'new', folder }], agents: [{ id: 'a', projectId: 'old', folder: path.join(root, 'old-folder-already-moved'), aiToolId: 'codex' }] };
  const active = new Set(), locked = new Set();
  const dispatch = vi.fn(() => true), verifySaved = vi.fn(async moves => { for (const m of moves) Object.assign(catalog.agents.find(a => a.id === m.sessionId), { projectId: m.projectId, folder: m.folder }); });
  const service = new SessionRelocation({ catalog: () => catalog, active: id => active.has(id), dispatch, verifySaved, timeoutMs: 100,
    lock: moves => moves.forEach(m => locked.add(m.sessionId)), unlock: moves => moves.forEach(m => locked.delete(m.sessionId)) });
  cleanups.push(() => service.close());
  const move = { sessionId: 'a', projectId: 'new', folder, expectedProjectId: 'old', expectedFolder: catalog.agents[0].folder };
  return { root, folder, catalog, active, locked, service, dispatch, verifySaved, move, save: moves => service.handle({ moves: moves || [move] }) };
}
it('moves an existing OFFLINE registration after persistence, without requiring the old directory to exist', async () => {
  const f = fixture(); const saved = f.save();
  const payload = f.dispatch.mock.calls[0][0];
  expect(f.locked.has('a')).toBe(true); expect(f.verifySaved).not.toHaveBeenCalled();
  expect(f.service.validate(payload)).toMatchObject([f.move]);
  expect(await f.service.complete({ ...payload, id: 'other', ok: true })).toBe(false);
  expect(await f.service.complete({ ...payload, ok: true })).toBe(true);
  expect(await saved).toMatchObject({ saved: true, active: false, moves: [{ sessionId: 'a', projectId: 'new', folder: fs.realpathSync(f.folder) }] });
  expect(f.locked.size).toBe(0); expect(fs.existsSync(f.move.expectedFolder)).toBe(false);
  const retry = f.save(); await f.service.complete({ ...f.dispatch.mock.calls[1][0], ok: true }); await expect(retry).resolves.toMatchObject({ saved: true });
});
it('rejects busy, detached, SSH, missing and stale targets without dispatch or locks', async () => {
  const f = fixture();
  f.active.add('a'); await expect(f.save()).rejects.toMatchObject({ statusCode: 409 }); f.active.clear();
  f.service.writable = () => false; await expect(f.save()).rejects.toMatchObject({ statusCode: 409 }); f.service.writable = () => true;
  f.catalog.projects[1].sshHostId = 'ssh'; await expect(f.save()).rejects.toMatchObject({ statusCode: 409 }); delete f.catalog.projects[1].sshHostId;
  await expect(f.save([{ ...f.move, sessionId: 'missing' }])).rejects.toMatchObject({ statusCode: 404 });
  await expect(f.save([{ ...f.move, folder: path.join(f.root, 'missing') }])).rejects.toMatchObject({ statusCode: 404 });
  await expect(f.save([{ ...f.move, expectedProjectId: 'stale' }])).rejects.toMatchObject({ statusCode: 409 });
  expect(f.dispatch).not.toHaveBeenCalled(); expect(f.locked.size).toBe(0);
});
it('validates the whole batch before any write and preserves project parent-child membership', async () => {
  const f = fixture(); f.catalog.agents.push({ id: 'child', projectId: 'old', folder: f.root, sessionHierarchy: { parentId: 'a' } });
  await expect(f.save()).rejects.toMatchObject({ statusCode: 409 });
  const child = { ...f.move, sessionId: 'child', expectedFolder: f.root };
  await expect(f.save([f.move, { ...child, folder: 'relative' }])).rejects.toMatchObject({ statusCode: 400 });
  expect(f.dispatch).not.toHaveBeenCalled();
  const saved = f.save([f.move, child]); await f.service.complete({ ...f.dispatch.mock.calls[0][0], ok: true });
  expect((await saved).moves).toHaveLength(2);
});
it('rejects invalid payloads, duplicate targets and unsupported options', async () => {
  const f = fixture();
  for (const body of [null, [], {}, { moves: [] }, { moves: [f.move, f.move] }, { moves: [f.move], restart: true },
    { moves: [{ ...f.move, expectedFolder: '..' }] }, { moves: [{ ...f.move, folder: f.folder + '\n' }] }, { moves: Array(21).fill(f.move) }]) {
    await expect(f.service.handle(body)).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(f.dispatch).not.toHaveBeenCalled();
});
it('rechecks live state before commit and serializes registry transactions', async () => {
  const f = fixture(); const saved = f.save(); const checked = expect(saved).rejects.toThrow('cancel');
  await expect(f.save()).rejects.toMatchObject({ statusCode: 409 });
  const payload = f.dispatch.mock.calls[0][0]; f.active.add('a');
  expect(() => f.service.validate(payload)).toThrow('비활성화');
  await f.service.complete({ ...payload, ok: false, error: 'cancel', statusCode: 409 }); await checked;
  expect(f.locked.size).toBe(0); expect(f.verifySaved).not.toHaveBeenCalled();
});
it('releases locks on disk failure, dispatch failure, timeout and shutdown and ignores expired commits', async () => {
  const f = fixture(); f.dispatch.mockReturnValueOnce(false); await expect(f.save()).rejects.toMatchObject({ statusCode: 503 });
  f.verifySaved.mockRejectedValueOnce(new Error('disk failed'));
  const failed = f.save(); const failure = expect(failed).rejects.toThrow('disk failed');
  await f.service.complete({ ...f.dispatch.mock.calls[1][0], ok: true }); await failure; expect(f.locked.size).toBe(0);
  vi.useFakeTimers(); const timed = f.save(); const timeout = expect(timed).rejects.toMatchObject({ statusCode: 504 });
  const payload = f.dispatch.mock.calls[2][0]; await vi.advanceTimersByTimeAsync(101); await timeout;
  expect(() => f.service.validate(payload)).toThrow('만료'); expect(await f.service.complete({ ...payload, ok: true })).toBe(false); expect(f.locked.size).toBe(0);
  const closing = f.save(); const closed = expect(closing).rejects.toMatchObject({ statusCode: 503 }); f.service.close(); await closed;
});
it('does not reject a newer request when an expired asynchronous verifier fails', async () => {
  const f = fixture(); vi.useFakeTimers();
  let rejectVerification;
  f.verifySaved.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectVerification = reject; }));
  const first = f.save(); const timed = expect(first).rejects.toMatchObject({ statusCode: 504 });
  const completing = f.service.complete({ ...f.dispatch.mock.calls[0][0], ok: true });
  await vi.advanceTimersByTimeAsync(101); await timed;
  const second = f.save();
  rejectVerification(new Error('expired verification failed')); expect(await completing).toBe(false);
  expect(f.service.pending).not.toBeNull();
  await f.service.complete({ ...f.dispatch.mock.calls[1][0], ok: true }); await expect(second).resolves.toMatchObject({ saved: true });
});
