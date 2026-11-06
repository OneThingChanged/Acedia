export type BoardState = 'idle' | 'working' | 'waiting' | 'review' | 'completed' | 'interrupted' | 'failed' | 'unknown' | 'planned';
export type BoardSession = {
  id: string; projectId: string; name: string; provider: string; parentId: string | null; folder: string;
  runtime: string; state: BoardState; updatedAt: number; summary: string; reason: string;
  fingerprint: string; needsAttention: boolean;
  task: { title: string; state: string; reason: string; runId: string; taskId: string } | null;
};
export type BoardSnapshot = {
  revision: string; sessions: BoardSession[]; projects: { id: string; name: string; folder: string }[];
  devices: { sessionId: string; kind: string; tool: string; state: string; source: string; startedAt: number }[];
  preferences: { zoom?: number; x?: number; y?: number; collapsed?: string[]; projectId?: string | null };
  storageError: string | null;
};
export function boardLayout(data: BoardSnapshot, { projectId = '', query = '', filter = 'all', collapsed = new Set<string>() }:
  { projectId?: string; query?: string; filter?: string; collapsed?: Set<string> }) {
  const byId = new Map(data.sessions.map(s => [s.id, s]));
  const included = new Set<string>();
  for (const s of data.sessions) {
    if (projectId && s.projectId !== projectId) continue;
    if (filter !== 'all' && (filter === 'attention' ? !s.needsAttention : s.state !== filter)) continue;
    if (query && !`${s.name} ${s.folder} ${s.task?.title || ''} ${data.projects.find(p => p.id === s.projectId)?.name || ''}`.toLowerCase().includes(query.toLowerCase())) continue;
    let current: BoardSession | undefined = s;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) { seen.add(current.id); included.add(current.id); current = byId.get(current.parentId || ''); }
  }
  const groups: { id: string; name: string; x: number; y: number; width: number; height: number }[] = [];
  const nodes: { session: BoardSession; x: number; y: number; children: number }[] = [];
  const edges: { from: string; to: string }[] = [];
  let x = 24, y = 24, rowHeight = 0, right = 800;
  for (const project of data.projects) {
    const members = data.sessions.filter(s => s.projectId === project.id && included.has(s.id));
    if (!members.length) continue;
    const ids = new Set(members.map(s => s.id));
    const children = new Map(members.map(s => [s.id, members.filter(c => c.parentId === s.id)]));
    const local: typeof nodes = [], visited = new Set<string>(); let leaf = 0, depthMax = 0;
    const place = (s: BoardSession, depth: number): number => {
      if (visited.has(s.id)) return leaf;
      visited.add(s.id); depthMax = Math.max(depthMax, depth);
      const descendants = collapsed.has(s.id) && !query && filter === 'all' ? [] : children.get(s.id) || [];
      if (collapsed.has(s.id) && !query && filter === 'all') {
        const hidden = [...(children.get(s.id) || [])];
        while (hidden.length) { const child = hidden.pop()!; if (visited.has(child.id)) continue; visited.add(child.id); hidden.push(...(children.get(child.id) || [])); }
      }
      const positions = descendants.filter(c => !visited.has(c.id)).map(c => { edges.push({ from: s.id, to: c.id }); return place(c, depth + 1); });
      const position = positions.length ? positions.reduce((sum, n) => sum + n, 0) / positions.length : leaf++;
      local.push({ session: s, x: 24 + depth * 280, y: 76 + position * 128, children: children.get(s.id)?.length || 0 });
      return position;
    };
    for (const root of members.filter(s => !ids.has(s.parentId || ''))) place(root, 0);
    for (const orphan of members) if (!visited.has(orphan.id)) place(orphan, 0);
    const width = 48 + (depthMax + 1) * 280, height = Math.max(230, 100 + leaf * 128);
    if (x > 24 && x + width > 1900) { x = 24; y += rowHeight + 32; rowHeight = 0; }
    groups.push({ id: project.id, name: project.name, x, y, width, height });
    nodes.push(...local.map(n => ({ ...n, x: n.x + x, y: n.y + y })));
    right = Math.max(right, x + width + 24); rowHeight = Math.max(rowHeight, height); x += width + 32;
  }
  return { groups, nodes, edges, width: right, height: y + rowHeight + 24 };
}

// Viewing an offline session must never activate its deferred CLI.
export function boardViewedAgent<T extends { deferredStart?: boolean }>(agent: T, live: boolean): T {
  return { ...agent, deferredStart: live ? undefined : true };
}
