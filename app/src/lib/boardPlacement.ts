import type { BoardPoint, BoardRect } from './boardEdgeRouting';
import type { BoardSession } from './workBoard';

export type BoardProjectPositions = Record<string, BoardPoint>;
export function boardProjectPositions(value: unknown): BoardProjectPositions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 2000).flatMap(([id, p]) => {
    if (!id || id.length > 256 || /[\x00-\x1f]/.test(id) || !p || typeof p !== 'object' || Array.isArray(p)) return [];
    const point = p as BoardPoint;
    return [point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000) ? [[id, { x: point.x, y: point.y }]] : [];
  }));
}

export function boardSessionOrder(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id && id.length <= 256 && !/[\x00-\x1f]/.test(id)))].slice(0, 2000) : [];
}

export function canReorderBoardSession(sessions: BoardSession[], from: string, to: string): boolean {
  const a = sessions.find(s => s.id === from), b = sessions.find(s => s.id === to);
  const parent = (s: BoardSession) => sessions.some(p => p.id === s.parentId && p.projectId === s.projectId) ? s.parentId : null;
  return !!a && !!b && a.id !== b.id && a.projectId === b.projectId && parent(a) === parent(b);
}

/** Changes display order only. A parent carries its subtree; relationships stay intact. */
export function reorderBoardSession(sessions: BoardSession[], order: string[], from: string, to: string, after: boolean): string[] | null {
  if (!canReorderBoardSession(sessions, from, to)) return null;
  const ids = new Set(sessions.map(s => s.id));
  const next = [...new Set([...order.filter(id => ids.has(id)), ...ids])].filter(id => id !== from);
  next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
  return next;
}

/** Keep a released card out of other cards and leave room for connection rails. */
export function placeBoardProject(rect: BoardRect, obstacles: BoardRect[], gap = 24): BoardPoint {
  const origin = { x: Math.round(rect.x), y: Math.round(rect.y) };
  const queue = [origin], seen = new Set<string>();
  const distance = (p: BoardPoint) => (p.x - origin.x) ** 2 + (p.y - origin.y) ** 2;
  for (let attempts = 0; queue.length && attempts < 256; attempts++) {
    queue.sort((a, b) => distance(a) - distance(b));
    const p = queue.shift()!, key = `${p.x}:${p.y}`; if (seen.has(key)) continue; seen.add(key);
    const hit = obstacles.find(r => p.x < r.x + r.width + gap && p.x + rect.width + gap > r.x && p.y < r.y + r.height + gap && p.y + rect.height + gap > r.y);
    if (!hit) return p;
    queue.push({ x: hit.x - rect.width - gap, y: p.y }, { x: hit.x + hit.width + gap, y: p.y },
      { x: p.x, y: hit.y - rect.height - gap }, { x: p.x, y: hit.y + hit.height + gap });
  }
  return { x: Math.max(origin.x, ...obstacles.map(r => r.x + r.width + gap)), y: origin.y };
}
