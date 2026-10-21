import { expect, it, vi } from 'vitest';
import { relocateSessionRegistry } from './sessionRelocation';
import { buildSpawnArgs } from './spawn';
import { loadStoredAgents } from './persistence';
import { makeLeaf } from './layout';
import type { Agent, Project } from '../types';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../platform/runtime', () => ({ invoke }));
const projects: Project[] = [{ id: 'old', name: 'Old', folder: 'C:/old', createdAt: 1 }, { id: 'new', name: 'RnDHub', folder: 'C:/RnDHub', createdAt: 1 }];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, projectId: 'old', folder: 'C:/old', name: id, aiToolId: 'codex', aiLabel: 'Codex', dangerous: true, status: 'idle', createdAt: 1, ...extra });
const move = (id: string) => ({ sessionId: id, projectId: 'new', folder: `C:/RnDHub/${id}`, expectedProjectId: 'old', expectedFolder: 'C:/old' });
it('preserves session identity, model, accounts, history and group layout while changing membership and cwd', () => {
  const original = agent('a', { lastSessionId: 'chat', modelSettings: { model: 'saved', effort: 'xhigh', serviceTier: 'fast' }, codexAccountId: 'work', codexAccountSessions: { work: 'chat' }, launchOptions: { executable: '', env: [], args: ['--profile', 'work'] } });
  const groups = [{ id: 'screen', projectId: 'old', layout: makeLeaf('a'), sessionPins: { a: 'chat' } }];
  const result = relocateSessionRegistry([original], projects, groups, [move('a')]);
  expect(result.agents[0]).toMatchObject({ ...original, projectId: 'new', folder: 'C:/RnDHub/a', sessionHierarchy: { folderOverride: 'C:/RnDHub/a', inheritFolder: false, resumeContext: { sessionId: 'chat', folder: 'C:/old' } } });
  expect(result.groups[0]).toEqual({ ...groups[0], projectId: 'new' }); expect(result.groups[0].layout).toBe(groups[0].layout);
  expect(original.projectId).toBe('old');
  const restored = loadStoredAgents(result.agents, projects);
  expect(restored[0]).toMatchObject({ folder: 'C:/RnDHub/a', lastSessionId: 'chat', modelSettings: original.modelSettings });
  const retried = relocateSessionRegistry(result.agents, projects, result.groups, [move('a')]);
  expect(retried.agents[0].sessionHierarchy?.resumeContext?.folder).toBe('C:/old');
});
it.each(['codex', 'claude', 'agy'])('looks up the original %s conversation and launches in the new folder', async aiToolId => {
  invoke.mockReset(); invoke.mockImplementation(async (command, args) => command === 'resolve_cli_session' ? args.preferredSessionId : null);
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const input = agent('a', { aiToolId, lastSessionId: sessionId });
  const updated = relocateSessionRegistry([input], projects, [], [move('a')]).agents[0];
  const spawn = await buildSpawnArgs(updated, null, vi.fn());
  expect(invoke).toHaveBeenCalledWith('resolve_cli_session', expect.objectContaining({ preferredSessionId: sessionId, folder: 'C:/old' }));
  expect(spawn.cwd).toBe('C:/RnDHub/a'); expect(spawn.initCommand).toContain(sessionId);
  expect(spawn.resumeContext).toEqual({ sessionId, folder: 'C:/old' });
});
it('keeps linked parents and children together and rejects implicit changes to unlisted descendants', () => {
  const agents = [agent('a'), agent('b', { sessionHierarchy: { parentId: 'a', inheritFolder: true, createdById: 'a' } })];
  expect(() => relocateSessionRegistry(agents, projects, [], [move('a')])).toThrow('함께 이동');
  expect(() => relocateSessionRegistry(agents, projects, [], [{ ...move('a'), projectId: 'old' }])).toThrow('하위 세션');
  const result = relocateSessionRegistry(agents, projects, [], [move('a'), move('b')]);
  expect(result.agents[1].sessionHierarchy).toMatchObject({ parentId: 'a', createdById: 'a', inheritFolder: false, folderOverride: 'C:/RnDHub/b' });
});
it('rejects stale membership and ambiguous pinned conversations', () => {
  expect(() => relocateSessionRegistry([agent('a')], projects, [], [{ ...move('a'), expectedProjectId: 'stale' }])).toThrow('변경');
  expect(() => relocateSessionRegistry([agent('a', { lastSessionId: 'one' })], projects, [{ id: 'g', layout: makeLeaf('a'), sessionPins: { a: 'two' } }], [move('a')])).toThrow('고정');
});
it('keeps naturally exited sessions in standby instead of automatically spawning them after relocation', () => {
  const result = relocateSessionRegistry([agent('a', { status: 'exited', deferredStart: false, runtimeStatus: 'exited' })], projects, [], [move('a')]);
  expect(result.agents[0]).toMatchObject({ deferredStart: true, status: 'idle', runtimeStatus: 'idle' });
});
