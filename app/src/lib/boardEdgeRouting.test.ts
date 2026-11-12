import { describe, expect, it } from 'vitest';
import { routeBoardEdges, type BoardPoint, type BoardRect } from './boardEdgeRouting';
import { BOARD_CARD, boardLayout, type BoardReference, type BoardSession, type BoardSnapshot } from './workBoard';
import { workBoardConnections } from './workBoardConnections';

// Inspect the rendered SVG geometry, including rounded corners, independently
// of the router's collision predicate. Endpoints may touch a card's border.
function assertAvoids(path: string, rectangles: BoardRect[]) {
  const tokens = path.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!;
  let at = { x: 0, y: 0 }, i = 0;
  const point = () => ({ x: Number(tokens[i++]), y: Number(tokens[i++]) });
  const inspect = (p: BoardPoint) => { for (const r of rectangles) {
    expect(p.x > r.x + 1e-7 && p.x < r.x + r.width - 1e-7 && p.y > r.y + 1e-7 && p.y < r.y + r.height - 1e-7,
      `Connection enters card ${JSON.stringify(r)} at ${JSON.stringify(p)}: ${path}`).toBe(false);
  } };
  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'M') { at = point(); inspect(at); continue; }
    const control = command === 'Q' ? point() : null, end = point();
    const steps = Math.max(20, Math.ceil((Math.abs(end.x - at.x) + Math.abs(end.y - at.y)) / 2));
    for (let n = 1; n <= steps; n++) {
      const t = n / steps;
      inspect(control ? { x: (1 - t) ** 2 * at.x + 2 * (1 - t) * t * control.x + t * t * end.x, y: (1 - t) ** 2 * at.y + 2 * (1 - t) * t * control.y + t * t * end.y }
        : { x: at.x + (end.x - at.x) * t, y: at.y + (end.y - at.y) * t });
    }
    at = end;
  }
}

const box = (x: number, y: number, width = 100, height = 100) => ({ x, y, width, height });
describe('Obstacle-avoiding board connections', () => {
  it.each([false, true])('detours around a card with rounded corners in either direction (reverse=%s)', reverse => {
    const a = { x: 0, y: 60 }, b = { x: 400, y: 60 }, obstacle = box(130, 10, 140, 100);
    const [from, to] = reverse ? [b, a] : [a, b];
    const routes = routeBoardEdges([{ id: 'edge', from: { anchor: from, escape: from }, to: { anchor: to, escape: to } }], [obstacle]);
    const route = routes.get('edge')!; expect(route).toBeDefined();
    expect(route.points[0]).toEqual(from); expect(route.points[route.points.length - 1]).toEqual(to);
    expect(route.points.some(p => p.y < obstacle.y || p.y > obstacle.y + obstacle.height)).toBe(true);
    assertAvoids(route.path, [obstacle]);
  });
  it('finds a multi-turn corridor between staggered cards and reuses geometry across edges', () => {
    const obstacles = [box(80, -100, 100, 230), box(220, 30, 100, 230), box(360, -100, 100, 230)];
    const requests = Array.from({ length: 12 }, (_, i) => ({ id: String(i), from: { anchor: { x: 0, y: i * 3 }, escape: { x: 0, y: i * 3 } }, to: { anchor: { x: 540, y: 100 + i * 3 }, escape: { x: 540, y: 100 + i * 3 } } }));
    const routes = routeBoardEdges(requests, obstacles); expect(routes.size).toBe(requests.length);
    for (const route of routes.values()) assertAvoids(route.path, obstacles);
    expect([...routeBoardEdges(requests, obstacles)]).toEqual([...routes]);
  });
  it('does not emit a misleading through-card fallback for an enclosed or missing request', () => {
    const p = { x: 50, y: 50 }, q = { x: 250, y: 50 };
    expect(routeBoardEdges([{ id: 'invalid', from: { anchor: p, escape: p }, to: { anchor: q, escape: q } }], [box(0, 0)]).size).toBe(0);
    expect(routeBoardEdges([], []).size).toBe(0);
  });
});

function fixture(): BoardSnapshot {
  const projects = ['Master', 'Automation', 'Movie', 'Max', 'Unity'].map((id, index) => ({ id, name: id, folder: index ? `G:/Master/${id}` : 'G:/Master' }));
  const s = (id: string, projectId: string, parentId: string | null = null) => ({ id, name: id, projectId, parentId, state: 'working', runtime: 'running', provider: 'codex', task: null } as BoardSession);
  const read = (id: string, from: string, to: string) => ({ id, from, to, active: true, kind: 'message', source: 'inbox', startedAt: 0, endedAt: null } as BoardReference);
  return { revision: 'r', preferences: {}, storageError: null, devices: [], projects, sessions: [s('master', 'Master'), s('desk', 'Automation'), s('auto', 'Automation', 'desk'), s('camera', 'Movie'), s('max', 'Max'), s('export', 'Max', 'max'), s('unity', 'Unity'), s('prefab', 'Unity', 'unity')], references: [read('reverse', 'unity', 'max'), read('forward', 'max', 'unity'), read('vertical', 'camera', 'prefab'), read('internal', 'prefab', 'unity')] };
}
describe('Actual project board connection projection', () => {
  it('reproduces the supplied screenshot without crossing source, target or intermediate cards', () => {
    const data = fixture(), layout = boardLayout(data, {});
    const connections = workBoardConnections(layout, data.sessions, data.references!, new Set(), {}, false);
    const source = layout.nodes.find(n => n.session.id === 'unity')!, target = layout.nodes.find(n => n.session.id === 'max')!;
    const route = connections.routes.get('read:reverse')!;
    expect(route.points[0]).toEqual({ x: source.x, y: source.y + source.height / 2 });
    expect(route.points[route.points.length - 1]).toEqual({ x: target.x + target.width, y: target.y + target.height / 2 });
    expect(connections.routes.size).toBe(layout.projectEdges.length + data.references!.length);
    for (const [id, edge] of connections.routes) assertAvoids(edge.path, id.startsWith('project:') ? layout.groups : layout.nodes);
    // Master -> Max previously travelled through the Automation card.
    assertAvoids(connections.routes.get('project:Master:Max')!.path, layout.groups);
    for (const [id, paths] of connections.internal) {
      const g = layout.groups.find(g => g.id === id)!;
      const local = layout.nodes.filter(n => n.session.projectId === id).map(n => ({ ...n, x: n.x - g.x, y: n.y - g.y - BOARD_CARD.header }));
      for (const edge of paths.values()) assertAvoids(edge.path, local);
    }
  });
  it('adapts endpoints to folded, scrolled and overview cards while preserving every project connection', () => {
    const data = fixture(), layout = boardLayout(data, {});
    const state = new Set(['Max']);
    for (const overview of [false, true]) {
      const connections = workBoardConnections(layout, data.sessions, data.references!, state, { Unity: 50 }, overview);
      const max = layout.groups.find(g => g.id === 'Max')!;
      const route = connections.routes.get('read:reverse')!;
      expect(route.points[route.points.length - 1]).toEqual({ x: max.x + max.width, y: max.y + BOARD_CARD.header / 2 });
      const obstacles = layout.groups.map(g => ({ ...g, height: overview || state.has(g.id) ? BOARD_CARD.header : g.height }));
      for (const [id, edge] of connections.routes) if (id.startsWith('project:')) assertAvoids(edge.path, obstacles);
      expect([...connections.routes.keys()].filter(id => id.startsWith('project:'))).toHaveLength(layout.projectEdges.length);
    }
  });
  it('routes deep session trees outside every intermediate row, including capped indentation', () => {
    const data = fixture(); data.projects = [data.projects[0]];
    data.sessions = Array.from({ length: 36 }, (_, i) => ({ ...data.sessions[0], id: String(i), parentId: i ? String(i - 1) : null }));
    const layout = boardLayout(data, {}), g = layout.groups[0];
    const connections = workBoardConnections(layout, data.sessions, [], new Set(), {}, false);
    const local = layout.nodes.map(n => ({ ...n, x: n.x - g.x, y: n.y - g.y - BOARD_CARD.header }));
    expect(connections.internal.get(g.id)!.size).toBe(35);
    for (const edge of connections.internal.get(g.id)!.values()) assertAvoids(edge.path, local);
  });
});
