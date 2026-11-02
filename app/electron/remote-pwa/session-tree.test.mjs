import { expect, it } from 'vitest';
import { buildSessionFamilies } from './session-tree.js';

const agent = (id, parent, extra = {}) => ({ id, name: id, projectId: 'p',
  ...(parent ? { sessionHierarchy: { parentId: parent } } : {}), ...extra });
const ids = values => values.map(value => value.id);

it('uses the editable parent and builds multiple levels without duplicating sessions', () => {
  const all = [agent('child', 'manager', { sessionHierarchy: { parentId: 'manager', createdById: 'old' } }),
    agent('grandchild', 'child'), agent('manager'), agent('old')];
  const tree = buildSessionFamilies(all, all);
  expect(ids(tree.roots)).toEqual(['manager', 'old']);
  expect(ids(tree.children.get('manager'))).toEqual(['child']);
  expect(ids(tree.children.get('child'))).toEqual(['grandchild']);
  expect(tree.agents).toHaveLength(4);
});

it('keeps inactive ancestors of active or matching descendants without revealing siblings', () => {
  const all = [agent('manager'), agent('middle', 'manager'), agent('match', 'middle'), agent('sibling', 'manager')];
  const tree = buildSessionFamilies([all[2]], all, { includeDescendants: true });
  expect(ids(tree.agents)).toEqual(['manager', 'middle', 'match']);
  expect(ids(tree.roots)).toEqual(['manager']);
});

it('inherits Show inactive through parents and honors an explicit branch Hide', () => {
  const all = [agent('manager', null, { sidebarShowInactiveChildren: true }),
    agent('branch', 'manager', { sidebarShowInactiveChildren: false }), agent('hidden', 'branch'), agent('sleep', 'manager')];
  const tree = buildSessionFamilies([all[0]], all, { includeDescendants: true });
  expect(ids(tree.agents)).toEqual(['manager', 'branch', 'sleep']);
});

it('keeps All, Sleeping and search matches discoverable when inactive children are hidden', () => {
  const all = [agent('manager', null, { sidebarShowInactiveChildren: false }), agent('sleep', 'manager')];
  expect(ids(buildSessionFamilies(all, all).agents)).toEqual(['manager', 'sleep']);
  expect(ids(buildSessionFamilies([all[1]], all).agents)).toEqual(['manager', 'sleep']);
  expect(buildSessionFamilies([], all, { includeDescendants: true }).agents).toEqual([]);
});

it('can reveal sibling branches when a contextual parent has Show inactive enabled', () => {
  const all = [agent('manager', null, { sidebarShowInactiveChildren: true }), agent('active', 'manager'), agent('sleep', 'manager')];
  expect(ids(buildSessionFamilies([all[1]], all, { includeDescendants: true }).agents)).toEqual(['manager', 'active', 'sleep']);
});

it('does not invent relationships across projects or through archived/missing parents', () => {
  const all = [agent('foreign', 'manager', { projectId: 'q' }), agent('manager'),
    agent('orphan', 'missing'), agent('archived', null, { sidebarArchived: true }), agent('child', 'archived')];
  const tree = buildSessionFamilies(all, all);
  expect(ids(tree.roots)).toEqual(['foreign', 'manager', 'orphan', 'child']);
  expect(tree.children.size).toBe(0);
});

it('breaks cycles and self-parenting without hiding sessions or mutating the catalog', () => {
  const all = [agent('a', 'b'), agent('b', 'a'), agent('self', 'self'), agent('valid', 'a')];
  const original = JSON.stringify(all);
  const tree = buildSessionFamilies(all, all);
  const visit = value => [value.id, ...(tree.children.get(value.id) || []).flatMap(visit)];
  expect(tree.roots.flatMap(visit).sort()).toEqual(['a', 'b', 'self', 'valid']);
  expect(JSON.stringify(all)).toBe(original);
});
