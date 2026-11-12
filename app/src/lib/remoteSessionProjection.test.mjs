import { expect, it } from 'vitest';
import { remoteAgentStatus, remoteAgentView } from './remoteSessionProjection.ts';
import { buildSessionFamilies } from '../../electron/remote-pwa/session-tree.js';
import { matchesSessionFilter } from '../../electron/shared/session-state.mjs';

const roundTrip = value => JSON.parse(JSON.stringify(value));
const a = (id, parentId, extra = {}) => ({ id, name: id, projectId: 'p', folder: 'G:/work', aiToolId: 'codex', aiLabel: 'Codex', dangerous: true,
  status: 'running', runtimeStatus: 'running', createdAt: 1, sessionHierarchy: parentId ? { parentId } : undefined, ...extra });
const names = new Map([['p', 'RnDHub']]);

it('carries the same editable hierarchy and visibility in both actual Remote payloads', () => {
  const all = [a('RnDHub', undefined, { status: 'exited', runtimeStatus: 'exited' }),
    a('Codex', 'RnDHub', { status: 'idle', runtimeStatus: 'idle', deferredStart: true, resumeEligible: true }),
    a('Sol', 'Codex'), a('Hidden', 'Codex', { sidebarArchived: true }),
    a('Sleeping sibling', 'Codex', { runtimeStatus: 'idle', deferredStart: true, resumeEligible: true })];
  const status = roundTrip(all.map(agent => remoteAgentStatus(agent, names))), view = roundTrip(all.map(remoteAgentView));
  for (const catalog of [status, view, view.map(agent => ({ ...agent, ...status.find(value => value.id === agent.id) }))]) {
    const tree = buildSessionFamilies(catalog.filter(agent => matchesSessionFilter(agent, 'active')), catalog, { includeDescendants: true });
    expect(tree.roots.map(agent => agent.id)).toEqual(['RnDHub']);
    expect(tree.children.get('RnDHub')?.map(agent => agent.id)).toEqual(['Codex']);
    expect(tree.children.get('Codex')?.map(agent => agent.id)).toEqual(['Sol']);
    expect(tree.agents.map(agent => agent.id)).not.toContain('Hidden');
    expect(tree.agents.map(agent => agent.id)).not.toContain('Sleeping sibling');
  }
});

it('propagates inactive-child choices, reparenting, detachment and names without transmitting instructions', () => {
  const original = a('worker', 'old', { sidebarShowInactiveChildren: true, sessionHierarchy: { parentId: 'old', createdById: 'creator', instructions: 'private instructions' } });
  for (const project of [remoteAgentView, agent => remoteAgentStatus(agent, names)]) {
    expect(roundTrip(project(original))).toMatchObject({ sidebarShowInactiveChildren: true, sessionHierarchy: { parentId: 'old' } });
    expect(JSON.stringify(project(original))).not.toContain('private instructions');
    expect(JSON.stringify(project(original))).not.toContain('creator');
    const moved = project({ ...original, name: 'renamed', sessionHierarchy: { ...original.sessionHierarchy, parentId: 'new' } });
    expect(roundTrip(moved)).toMatchObject({ name: 'renamed', sessionHierarchy: { parentId: 'new' } });
    const detached = roundTrip(project({ ...original, sessionHierarchy: undefined }));
    expect(detached.sessionHierarchy).toBeNull();
    expect({ ...roundTrip(project(original)), ...detached }.sessionHierarchy).toBeNull();
  }
});
