import { expect, it } from 'vitest';
import { boardProjectPositions, boardSessionOrder, placeBoardProject, reorderBoardSession } from './boardPlacement';
import { boardLayout, type BoardSession, type BoardSnapshot } from './workBoard';

const sessions = [
  { id: 'a', projectId: 'p', parentId: null }, { id: 'a1', projectId: 'p', parentId: 'a' },
  { id: 'b', projectId: 'p', parentId: null }, { id: 'b1', projectId: 'p', parentId: 'b' },
  { id: 'b2', projectId: 'p', parentId: 'b' }, { id: 'c', projectId: 'q', parentId: null },
] as BoardSession[];
const data = { sessions, projects: [{ id: 'p', folder: 'D:/p' }, { id: 'q', folder: 'D:/q' }] } as BoardSnapshot;

it('restores only bounded local geometry without extra fields and retains safe special IDs', () => {
  const stored = JSON.parse('{"p":{"x":-55,"y":103,"command":"ignored"},"__proto__":{"x":5,"y":6},"bad":{"x":null,"y":0},"tooFar":{"x":1000001,"y":0}}');
  const result = boardProjectPositions(stored);
  expect(Object.entries(result)).toEqual([['p', { x: -55, y: 103 }], ['__proto__', { x: 5, y: 6 }]]);
  stored.p.x = 99; expect(result.p.x).toBe(-55);
  expect(boardSessionOrder(['b', 'b', 4, '', 'bad\n', 'a'])).toEqual(['b', 'a']);
});

it('moves a saved project with its session geometry while preserving other projects, filters and edges', () => {
  const before = boardLayout(data, {}), projectPositions = { p: { x: -240, y: 800 } };
  const after = boardLayout(data, { projectPositions });
  expect(after.groups.find(g => g.id === 'p')).toMatchObject(projectPositions.p);
  expect(after.groups.find(g => g.id === 'q')).toEqual(before.groups.find(g => g.id === 'q'));
  const origin = before.groups.find(g => g.id === 'p')!, moved = after.groups.find(g => g.id === 'p')!;
  for (const node of before.nodes.filter(n => n.session.projectId === 'p')) {
    const next = after.nodes.find(n => n.session.id === node.session.id)!;
    expect([next.x - moved.x, next.y - moved.y]).toEqual([node.x - origin.x, node.y - origin.y]);
  }
  expect(after.edges).toEqual(before.edges);
  expect(boardLayout(data, { projectId: 'p', projectPositions }).groups[0]).toEqual(moved);
  expect(after.height).toBeGreaterThan(moved.y + moved.height);
  // Stale saved entries never resurrect a project without an allocated slot.
  expect(boardLayout({ ...data, sessions: sessions.filter(s => s.projectId !== 'p') }, { projectPositions }).groups.map(g => g.id)).toEqual(['q']);
});

it('keeps the released project clear of cards and route gutters, even in a dense arrangement', () => {
  const obstacles = Array.from({ length: 40 }, (_, i) => ({ x: i % 8 * 344, y: Math.floor(i / 8) * 324, width: 320, height: 300 }));
  const rect = { x: 400, y: 440, width: 320, height: 300 }, point = placeBoardProject(rect, obstacles);
  for (const o of obstacles) expect(point.x + rect.width + 24 <= o.x || o.x + o.width + 24 <= point.x || point.y + rect.height + 24 <= o.y || o.y + o.height + 24 <= point.y).toBe(true);
  expect(placeBoardProject({ ...rect, x: -500, y: -500 }, obstacles)).toEqual({ x: -500, y: -500 });
});

it('reorders siblings with their subtrees while refusing reparenting or moving across projects', () => {
  const original = structuredClone(sessions);
  const order = reorderBoardSession(sessions, [], 'b', 'a', false)!;
  const layout = boardLayout(data, { sessionOrder: order });
  expect(layout.nodes.map(n => n.session.id)).toEqual(['b', 'b1', 'b2', 'a', 'a1', 'c']);
  const next = reorderBoardSession(sessions, order, 'b2', 'b1', false)!;
  expect(boardLayout(data, { sessionOrder: next }).nodes.map(n => n.session.id)).toEqual(['b', 'b2', 'b1', 'a', 'a1', 'c']);
  for (const [from, to] of [['b1', 'a1'], ['b', 'c'], ['a', 'a'], ['missing', 'a']]) expect(reorderBoardSession(sessions, next, from, to, false)).toBeNull();
  expect(sessions).toEqual(original);
});
