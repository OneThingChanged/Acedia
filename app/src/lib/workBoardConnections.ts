import { BOARD_CARD, type boardLayout, type BoardEdgeStyle, type BoardReference, type BoardSession } from './workBoard';
import { boardEdgePath, routeBoardEdges, type BoardEdgePath, type BoardEdgePorts, type BoardEdgeRequest, type BoardPort, type BoardRect } from './boardEdgeRouting';

const key = (from: string, to: string) => `${from}:${to}`;
export type BoardProjectReference = { from: string; to: string };

/** Facing sides follow geometry, not the logical parent/child direction. */
function projectPorts(a: BoardRect, b: BoardRect, clearance = 12): BoardEdgePorts[] {
  const shared = (startA: number, sizeA: number, startB: number, sizeB: number) => {
    const low = Math.max(startA + Math.min(12, sizeA / 4), startB + Math.min(12, sizeB / 4));
    const high = Math.min(startA + sizeA - Math.min(12, sizeA / 4), startB + sizeB - Math.min(12, sizeB / 4));
    return low <= high ? (low + high) / 2 : null;
  };
  const y = shared(a.y, a.height, b.y, b.height), x = shared(a.x, a.width, b.x, b.width);
  const port = (r: BoardRect, side: 'left' | 'right' | 'top' | 'bottom'): BoardPort => {
    const horizontal = side === 'left' || side === 'right';
    const anchor = horizontal ? { x: r.x + (side === 'right' ? r.width : 0), y: y ?? r.y + r.height / 2 }
      : { x: x ?? r.x + r.width / 2, y: r.y + (side === 'bottom' ? r.height : 0) };
    return { anchor, escape: { x: anchor.x + (side === 'left' ? -clearance : side === 'right' ? clearance : 0),
      y: anchor.y + (side === 'top' ? -clearance : side === 'bottom' ? clearance : 0) } };
  };
  return ([['right', 'left'], ['left', 'right'], ['bottom', 'top'], ['top', 'bottom']] as const)
    .map(([from, to]) => ({ from: port(a, from), to: port(b, to) }));
}

function projectCurve(parent: BoardRect, child: BoardRect, cards: Iterable<BoardRect>): BoardEdgePath | null {
  const from = { x: parent.x + parent.width / 2, y: parent.y + parent.height };
  const to = { x: child.x + child.width / 2, y: child.y };
  if (to.y - from.y < 24) return null;
  const left = Math.min(from.x, to.x) - 8, right = Math.max(from.x, to.x) + 8;
  for (const card of cards) {
    if (card !== parent && card !== child && card.x < right && card.x + card.width > left
      && card.y < to.y && card.y + card.height > from.y) return null;
  }
  const mid = (from.y + to.y) / 2;
  return { points: [from, to], path: `M ${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}` };
}

export function workBoardConnections(layout: ReturnType<typeof boardLayout> | null, sessions: BoardSession[], references: BoardReference[],
  collapsed: Set<string>, scroll: Record<string, number>, overview: boolean, edgeStyle: BoardEdgeStyle = 'orthogonal', projectReferences?: BoardProjectReference[]) {
  const projects: BoardEdgeRequest[] = [], external: BoardEdgeRequest[] = [], reads: BoardEdgeRequest[] = [];
  const curves = new Map<string, BoardEdgePath>();
  const groups = new Map(layout?.groups.map(g => [g.id, { ...g, height: overview || collapsed.has(g.id) ? BOARD_CARD.header : g.height }]));
  const nodes = new Map(layout?.nodes.map(n => [n.session.id, n]));
  const byId = new Map(sessions.map(s => [s.id, s]));
  const readGroups = new Map<string, string>();
  const localReads = new Map<string, BoardReference[]>();
  const readPortUse = new Map<string, number>();
  const sessionCenter = (id: string, g: NonNullable<ReturnType<typeof groups.get>>) => {
    const node = nodes.get(id);
    const y = node && node.y - (scroll[g.id] || 0) + node.height / 2;
    return !overview && !collapsed.has(g.id) && y !== undefined && y >= g.y + BOARD_CARD.header && y <= g.y + BOARD_CARD.header + g.bodyHeight ? y : undefined;
  };
  const port = (id: string, side: -1 | 1, separate: boolean): BoardPort | null => {
    const s = byId.get(id), g = s && groups.get(s.projectId); if (!g) return null;
    const n = nodes.get(id), y = sessionCenter(id, g);
    const nodePort = n && y !== undefined && g.columns === 1;
    const center = y ?? g.y + BOARD_CARD.header / 2;
    const portKey = `${g.id}:${side}:${center}`;
    const use = separate ? readPortUse.get(portKey) || 0 : 0;
    if (separate) readPortUse.set(portKey, use + 1);
    const offset = Math.min(Math.ceil(use / 2), 4) * 7 * (use % 2 ? -1 : 1);
    const anchor = { x: nodePort ? n.x + (side === 1 ? n.width : 0) : g.x + (side === 1 ? g.width : 0), y: center + offset };
    return { anchor, escape: { x: side === 1 ? g.x + g.width + 12 : g.x - 12, y: anchor.y } };
  };
  const between = (id: string, from: string, to: string, separate = false): BoardEdgeRequest | null => {
    if (from === to) return null;
    const a = groups.get(byId.get(from)?.projectId || ''), b = groups.get(byId.get(to)?.projectId || ''); if (!a || !b) return null;
    // Face neighbouring projects; same-column/intra-project reads use one gutter.
    const side = a.x === b.x ? -1 : a.x < b.x ? 1 : -1;
    const start = port(from, side, separate), end = port(to, a.x === b.x ? side : side === 1 ? -1 : 1, separate);
    return start && end ? { id, from: start, to: end, separate } : null;
  };
  for (const edge of layout?.projectEdges || []) {
    const a = groups.get(edge.from), b = groups.get(edge.to); if (!a || !b) continue;
    const id = `project:${key(edge.from, edge.to)}`;
    const curve = edgeStyle === 'curved' ? projectCurve(a, b, groups.values()) : null;
    if (curve) { curves.set(id, curve); continue; }
    const [preferred, ...alternatives] = projectPorts(a, b);
    projects.push({ id, ...preferred, alternatives, separate: edge.kind === 'parent' });
  }
  for (const edge of projectReferences || []) {
    const a = groups.get(edge.from), b = groups.get(edge.to);
    if (!a || !b || a === b) continue;
    const [preferred, ...alternatives] = projectPorts(a, b);
    projects.push({ id: `project-reference:${key(edge.from, edge.to)}`, ...preferred, alternatives, separate: true });
  }
  for (const edge of layout?.edges || []) {
    if (byId.get(edge.from)?.projectId === byId.get(edge.to)?.projectId) continue;
    const request = between(`session:${key(edge.from, edge.to)}`, edge.from, edge.to); if (request) external.push(request);
  }
  for (const read of [...references].sort((a, b) => Number(b.active) - Number(a.active))) {
    const group = groups.get(byId.get(read.from)?.projectId || '');
    if (group && group.columns > 1 && read.from !== read.to && byId.get(read.to)?.projectId === group.id
      && sessionCenter(read.from, group) !== undefined && sessionCenter(read.to, group) !== undefined) {
      const current = localReads.get(group.id) || []; current.push(read); localReads.set(group.id, current);
    } else {
      const request = between(`read:${read.id}`, read.from, read.to, true);
      if (request) reads.push(request);
    }
  }
  const routes = routeBoardEdges([...projects, ...external, ...reads], [...groups.values()]);
  for (const [id, curve] of curves) routes.set(id, curve);
  if (edgeStyle === 'curved') {
    for (const { id } of [...projects, ...external]) {
      const route = routes.get(id);
      if (route) route.path = boardEdgePath(route.points, 42);
    }
  }
  const internal = new Map<string, ReturnType<typeof routeBoardEdges>>();
  for (const group of groups.values()) {
    if (overview || collapsed.has(group.id)) continue;
    const rows = (layout?.nodes || []).filter(n => n.session.projectId === group.id);
    const local = new Map(rows.map(n => [n.session.id, { x: n.x - group.x, y: n.y - group.y - BOARD_CARD.header, width: n.width, height: n.height } as BoardRect]));
    const requests: BoardEdgeRequest[] = [];
    const addGridConnection = (id: string, a: BoardRect, b: BoardRect, separate = false) => {
      const [preferred, ...alternatives] = projectPorts(a, b, 3);
      requests.push({ id, ...preferred, alternatives, separate });
    };
    for (const edge of layout?.edges || []) {
      const a = local.get(edge.from), b = local.get(edge.to); if (!a || !b) continue;
      if (group.columns > 1) { addGridConnection(key(edge.from, edge.to), a, b); continue; }
      const start = { x: a.x, y: a.y + a.height / 2 }, end = { x: b.x, y: b.y + b.height / 2 };
      requests.push({ id: key(edge.from, edge.to), from: { anchor: start, escape: { x: start.x - 3, y: start.y } }, to: { anchor: end, escape: { x: end.x - 3, y: end.y } } });
    }
    for (const read of localReads.get(group.id) || []) addGridConnection(`read:${read.id}`, local.get(read.from)!, local.get(read.to)!, true);
    const localRoutes = routeBoardEdges(requests, [...local.values()], 3);
    for (const read of localReads.get(group.id) || []) {
      const id = `read:${read.id}`, route = localRoutes.get(id);
      if (!route) continue;
      localRoutes.delete(id);
      const points = route.points.map(({ x, y }) => ({ x: x + group.x, y: y + group.y + BOARD_CARD.header - (scroll[group.id] || 0) }));
      routes.set(id, { points, path: boardEdgePath(points, 1.5) });
      readGroups.set(read.id, group.id);
    }
    if (edgeStyle === 'curved') {
      for (const route of localRoutes.values()) route.path = boardEdgePath(route.points, 10);
    }
    internal.set(group.id, localRoutes);
  }
  return { routes, internal, readGroups };
}
