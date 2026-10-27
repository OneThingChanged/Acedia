import { expect, it } from 'vitest';
import type { Agent, Project } from '../types';
import { organizeSessionRegistry } from './sessionOrganization';
import { resolveSessionSettings } from './sessionHierarchy';
import { loadStoredAgents } from './persistence';

const projects: Project[] = [{ id: 'p', name: 'Project', folder: 'C:/project', createdAt: 1, hierarchy: { instructions: 'Project instructions' } }];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, name: id, projectId: 'p', aiToolId: 'codex', aiLabel: 'Codex', folder: 'C:/project', dangerous: true, status: 'idle', createdAt: 1, ...extra });
function family() {
  return [agent('a', { sessionHierarchy: { folderOverride: 'C:/work', instructions: 'Parent instructions' }, modelSettings: { model: 'sol', effort: 'xhigh', serviceTier: 'fast' } }),
    agent('b', { lastSessionId: 'conversation', codexAccountId: 'work', sessionHierarchy: { parentId: 'a', createdById: 'creator', inheritFolder: true, inheritInstructions: true, inheritModel: true, instructions: 'Own instructions', resumeContext: { sessionId: 'conversation', folder: 'C:/original' } } }),
    agent('c', { sessionHierarchy: { parentId: 'b', inheritFolder: true, inheritModel: true } }),
    agent('d', { folder: 'C:/different', sessionHierarchy: { instructions: 'Different instructions' }, modelSettings: { model: 'luna', effort: 'max' } })];
}
it('preserves effective cwd, inherited instructions/model, descendants and conversation identity when reparenting, including persistence roundtrip', () => {
  const original = family(), before = original.map(a => resolveSessionSettings(a, original, projects));
  const next = organizeSessionRegistry(original, projects, [{ sessionId: 'b', parentSessionId: 'd', expectedParentSessionId: 'a', name: 'Worker', expectedName: 'b' }]);
  expect(next.map(a => resolveSessionSettings(a, next, projects))).toEqual(before);
  expect(next[1]).toMatchObject({ lastSessionId: 'conversation', codexAccountId: 'work', dangerous: true,
    sessionHierarchy: { parentId: 'd', createdById: 'creator', inheritFolder: false, inheritInstructions: false, inheritModel: false, resumeContext: { sessionId: 'conversation', folder: 'C:/original' } } });
  expect(original[1].name).toBe('b'); expect(original[1].sessionHierarchy?.parentId).toBe('a');
  const restored = loadStoredAgents(next, projects);
  expect(restored.map(a => resolveSessionSettings(a, restored, projects))).toEqual(before);
});
it('unlinks without changing context, and retry or rename alone does not alter inheritance', () => {
  const original = family(), rename = organizeSessionRegistry(original, projects, [{ sessionId: 'b', name: 'New', expectedName: 'b' }]);
  expect(rename[1].sessionHierarchy).toBe(original[1].sessionHierarchy);
  const changes = [{ sessionId: 'b', parentSessionId: null, expectedParentSessionId: 'a' }];
  const next = organizeSessionRegistry(original, projects, changes);
  expect(next[1].sessionHierarchy?.parentId).toBeUndefined();
  expect(resolveSessionSettings(next[1], next, projects)).toEqual(resolveSessionSettings(original[1], original, projects));
  expect(organizeSessionRegistry(next, projects, changes)).toEqual(next);
});
it('rejects cycles, foreign projects, stale values and ambiguous batch entries without mutating input', () => {
  const original = [...family(), agent('outside', { projectId: 'other' })], serialized = JSON.stringify(original);
  for (const changes of [
    [{ sessionId: 'a', parentSessionId: 'c', expectedParentSessionId: null }],
    [{ sessionId: 'b', parentSessionId: 'outside', expectedParentSessionId: 'a' }],
    [{ sessionId: 'b', parentSessionId: null, expectedParentSessionId: 'stale' }],
    [{ sessionId: 'b', name: 'New', expectedName: 'stale' }],
    [{ sessionId: 'missing', name: 'New', expectedName: 'missing' }],
    [{ sessionId: 'b', name: 'New', expectedName: 'b' }, { sessionId: 'b', name: 'Other', expectedName: 'b' }],
  ]) expect(() => organizeSessionRegistry(original, projects, changes)).toThrow();
  expect(JSON.stringify(original)).toBe(serialized);
});
it('evaluates final batch graph instead of rejecting a valid atomic manager swap', () => {
  const original = family();
  const next = organizeSessionRegistry(original, projects, [{ sessionId: 'a', parentSessionId: 'b', expectedParentSessionId: null }, { sessionId: 'b', parentSessionId: null, expectedParentSessionId: 'a' }]);
  expect(next[0].sessionHierarchy?.parentId).toBe('b'); expect(next[1].sessionHierarchy?.parentId).toBeUndefined();
});
