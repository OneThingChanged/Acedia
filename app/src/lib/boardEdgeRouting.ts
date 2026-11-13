export type BoardPoint = { x: number; y: number };
export type BoardRect = BoardPoint & { width: number; height: number };
export type BoardPort = { anchor: BoardPoint; escape: BoardPoint };
export type BoardEdgePorts = { from: BoardPort; to: BoardPort };
export type BoardEdgeRequest = BoardEdgePorts & { id: string; alternatives?: BoardEdgePorts[] };
export type BoardEdgePath = { points: BoardPoint[]; path: string };

const same = (a: BoardPoint, b: BoardPoint) => a.x === b.x && a.y === b.y;
const distance = (a: BoardPoint, b: BoardPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function simplify(points: BoardPoint[]) {
  const result: BoardPoint[] = [];
  for (const point of points) {
    if (result.length && same(result[result.length - 1], point)) continue;
    const a = result[result.length - 2], b = result[result.length - 1];
    if (a && b && (a.x === b.x && b.x === point.x || a.y === b.y && b.y === point.y)) result.pop();
    result.push(point);
  }
  return result;
}

/** Round only the corners of an already obstacle-free orthogonal route. */
export function boardEdgePath(points: BoardPoint[], radius = 6): string {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const r = Math.min(radius, distance(a, b) / 2, distance(b, c) / 2);
    const before = { x: b.x + Math.sign(a.x - b.x) * r, y: b.y + Math.sign(a.y - b.y) * r };
    const after = { x: b.x + Math.sign(c.x - b.x) * r, y: b.y + Math.sign(c.y - b.y) * r };
    path += ` L ${before.x} ${before.y} Q ${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

type SearchEntry = { key: number; cost: number; score: number };
class SearchQueue {
  private heap: SearchEntry[] = [];
  push(entry: SearchEntry) {
    let i = this.heap.length; this.heap.push(entry);
    while (i) { const parent = (i - 1) >> 1; if (this.heap[parent].score <= entry.score) break; this.heap[i] = this.heap[parent]; i = parent; }
    this.heap[i] = entry;
  }
  pop(): SearchEntry | undefined {
    const first = this.heap[0], last = this.heap.pop();
    if (this.heap.length && last) {
      let i = 0;
      while (i * 2 + 1 < this.heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.heap.length && this.heap[child + 1].score < this.heap[child].score) child++;
        if (this.heap[child].score >= last.score) break;
        this.heap[i] = this.heap[child]; i = child;
      }
      this.heap[i] = last;
    }
    return first;
  }
}

/** Shared sparse coordinate grid; pan/zoom does not participate in routing. */
export function routeBoardEdges(requests: BoardEdgeRequest[], obstacles: BoardRect[], clearance = 12): Map<string, BoardEdgePath> {
  const result = new Map<string, BoardEdgePath>(); if (!requests.length) return result;
  const boxes = obstacles.map(r => ({ left: r.x - clearance, right: r.x + r.width + clearance, top: r.y - clearance, bottom: r.y + r.height + clearance }));
  const ends = requests.flatMap(r => [r, ...(r.alternatives || [])].flatMap(pair => [pair.from.escape, pair.to.escape]));
  const xs = [...new Set([...ends.map(p => p.x), ...boxes.flatMap(r => [r.left, r.right])])].sort((a, b) => a - b);
  const ys = [...new Set([...ends.map(p => p.y), ...boxes.flatMap(r => [r.top, r.bottom])])].sort((a, b) => a - b);
  const xIndex = new Map(xs.map((x, i) => [x, i])), yIndex = new Map(ys.map((y, i) => [y, i]));
  const point = (index: number) => ({ x: xs[Math.floor(index / ys.length)], y: ys[index % ys.length] });
  const inside = (p: BoardPoint) => boxes.some(r => p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom);
  const clear = (a: BoardPoint, b: BoardPoint) => !boxes.some(r => a.x === b.x
    ? a.x > r.left && a.x < r.right && Math.max(a.y, b.y) > r.top && Math.min(a.y, b.y) < r.bottom
    : a.y > r.top && a.y < r.bottom && Math.max(a.x, b.x) > r.left && Math.min(a.x, b.x) < r.right);
  const segmentCache = new Map<number, boolean>();
  const search = (from: BoardPoint, to: BoardPoint): BoardPoint[] | null => {
    if (inside(from) || inside(to)) return null;
    if (same(from, to)) return [from];
    for (const bend of [{ x: to.x, y: from.y }, { x: from.x, y: to.y }]) {
      if (clear(from, bend) && clear(bend, to)) return simplify([from, bend, to]);
    }
    const start = xIndex.get(from.x)! * ys.length + yIndex.get(from.y)!, goal = xIndex.get(to.x)! * ys.length + yIndex.get(to.y)!;
    const costs = new Map<number, number>([[start * 3, 0]]), previous = new Map<number, number>(), queue = new SearchQueue();
    queue.push({ key: start * 3, cost: 0, score: distance(from, to) });
    let current: SearchEntry | undefined;
    while ((current = queue.pop())) {
      if (current.cost !== costs.get(current.key)) continue;
      const index = Math.floor(current.key / 3), direction = current.key % 3, a = point(index);
      if (index === goal) {
        const path = [a]; let key = current.key;
        while (previous.has(key)) { key = previous.get(key)!; path.push(point(Math.floor(key / 3))); }
        return simplify(path.reverse());
      }
      const ix = Math.floor(index / ys.length), iy = index % ys.length;
      for (const [nx, ny, nextDirection] of [[ix - 1, iy, 1], [ix + 1, iy, 1], [ix, iy - 1, 2], [ix, iy + 1, 2]]) {
        if (nx < 0 || nx >= xs.length || ny < 0 || ny >= ys.length) continue;
        const next = nx * ys.length + ny, b = point(next), edge = Math.min(index, next) * 2 + nextDirection - 1;
        let passable = segmentCache.get(edge);
        if (passable === undefined) { passable = clear(a, b); segmentCache.set(edge, passable); }
        if (!passable) continue;
        const cost = current.cost + distance(a, b) + (direction && direction !== nextDirection ? 12 : 0), key = next * 3 + nextDirection;
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, cost); previous.set(key, current.key); queue.push({ key, cost, score: cost + distance(b, to) });
      }
    }
    // Never fall back to a line through a card if input rectangles overlap.
    return null;
  };
  for (const request of requests) {
    const lowerBound = (pair: BoardEdgePorts) => distance(pair.from.anchor, pair.from.escape)
      + distance(pair.from.escape, pair.to.escape) + distance(pair.to.escape, pair.to.anchor);
    const candidates = [request, ...(request.alternatives || [])].sort((a, b) => lowerBound(a) - lowerBound(b));
    let best: BoardPoint[] | undefined, bestCost = Infinity;
    for (const pair of candidates) {
      // Clear, facing ports usually produce a direct line. Other directions
      // cannot improve it, so do not run more searches during project dragging.
      if (best && lowerBound(pair) >= bestCost) break;
      const middle = search(pair.from.escape, pair.to.escape); if (!middle) continue;
      const points = simplify([pair.from.anchor, ...middle, pair.to.anchor]);
      const cost = points.reduce((sum, point, index) => sum + (index ? distance(points[index - 1], point) : 0), 0)
        + Math.max(0, points.length - 2) * 12;
      if (cost < bestCost) { best = points; bestCost = cost; }
    }
    if (best) result.set(request.id, { points: best, path: boardEdgePath(best, Math.min(6, clearance / 2)) });
  }
  return result;
}
