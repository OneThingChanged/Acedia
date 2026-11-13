import { BOARD_CARD, type boardLayout, type BoardReference, type BoardSession } from './workBoard';
import { routeBoardEdges, type BoardEdgePorts, type BoardEdgeRequest, type BoardPort, type BoardRect } from './boardEdgeRouting';

const key = (from: string, to: string) => `${from}:${to}`;

/** Facing sides follow geometry, not the logical parent/child direction. */
function projectPorts(a: BoardRect, b: BoardRect): BoardEdgePorts[] {
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
    return { anchor, escape: { x: anchor.x + (side === 'left' ? -12 : side === 'right' ? 12 : 0),
      y: anchor.y + (side === 'top' ? -12 : side === 'bottom' ? 12 : 0) } };
  };
  return ([['right', 'left'], ['left', 'right'], ['bottom', 'top'], ['top', 'bottom']] as const)
    .map(([from, to]) => ({ from: port(a, from), to: port(b, to) }));
}

export function workBoardConnections(layout: ReturnType<typeof boardLayout> | null, sessions: BoardSession[], references: BoardReference[],
  collapsed: Set<string>, scroll: Record<string, number>, overview: boolean) {
  const projects: BoardEdgeRequest[] = [], external: BoardEdgeRequest[] = [], reads: BoardEdgeRequest[] = [];
  const groups = new Map(layout?.groups.map(g => [g.id, { ...g, height: overview || collapsed.has(g.id) ? BOARD_CARD.header : g.height }]));
  const nodes = new Map(layout?.nodes.map(n => [n.session.id, n]));
  const byId = new Map(sessions.map(s => [s.id, s]));
  const port = (id: string, side: -1 | 1): BoardPort | null => {
    const s = byId.get(id), g = s && groups.get(s.projectId); if (!g) return null;
    const n = nodes.get(id), y = n && n.y - (scroll[g.id] || 0) + n.height / 2;
    const visible = n && !overview && !collapsed.has(g.id) && y !== undefined && y >= g.y + BOARD_CARD.header && y <= g.y + BOARD_CARD.header + g.bodyHeight;
    const anchor = visible ? { x: n.x + (side === 1 ? n.width : 0), y } : { x: g.x + (side === 1 ? g.width : 0), y: g.y + BOARD_CARD.header / 2 };
    return { anchor, escape: { x: side === 1 ? g.x + g.width + 12 : g.x - 12, y: anchor.y } };
  };
  const between = (id: string, from: string, to: string): BoardEdgeRequest | null => {
    if (from === to) return null;
    const a = groups.get(byId.get(from)?.projectId || ''), b = groups.get(byId.get(to)?.projectId || ''); if (!a || !b) return null;
    // Face neighbouring projects; same-column/intra-project reads use one gutter.
    const side = a.x === b.x ? -1 : a.x < b.x ? 1 : -1;
    const start = port(from, side), end = port(to, a.x === b.x ? side : side === 1 ? -1 : 1);
    return start && end ? { id, from: start, to: end } : null;
  };
  for (const edge of layout?.projectEdges || []) {
    const a = groups.get(edge.from), b = groups.get(edge.to); if (!a || !b) continue;
    const [preferred, ...alternatives] = projectPorts(a, b);
    projects.push({ id: `project:${key(edge.from, edge.to)}`, ...preferred, alternatives });
  }
  for (const edge of layout?.edges || []) {
    if (byId.get(edge.from)?.projectId === byId.get(edge.to)?.projectId) continue;
    const request = between(`session:${key(edge.from, edge.to)}`, edge.from, edge.to); if (request) external.push(request);
  }
  for (const read of references) { const request = between(`read:${read.id}`, read.from, read.to); if (request) reads.push(request); }
  const routes = routeBoardEdges([...projects, ...external, ...reads], [...groups.values()]);
  const internal = new Map<string, ReturnType<typeof routeBoardEdges>>();
  for (const group of groups.values()) {
    if (overview || collapsed.has(group.id)) continue;
    const rows = (layout?.nodes || []).filter(n => n.session.projectId === group.id);
    const local = new Map(rows.map(n => [n.session.id, { x: n.x - group.x, y: n.y - group.y - BOARD_CARD.header, width: n.width, height: n.height } as BoardRect]));
    const requests: BoardEdgeRequest[] = [];
    for (const edge of layout?.edges || []) {
      const a = local.get(edge.from), b = local.get(edge.to); if (!a || !b) continue;
      const start = { x: a.x, y: a.y + a.height / 2 }, end = { x: b.x, y: b.y + b.height / 2 };
      requests.push({ id: key(edge.from, edge.to), from: { anchor: start, escape: { x: start.x - 3, y: start.y } }, to: { anchor: end, escape: { x: end.x - 3, y: end.y } } });
    }
    internal.set(group.id, routeBoardEdges(requests, [...local.values()], 3));
  }
  return { routes, internal };
}
