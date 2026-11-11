export type BoardState = 'idle' | 'working' | 'background' | 'waiting' | 'waiting_external' | 'paused' | 'review' | 'completed' | 'interrupted' | 'failed' | 'unknown' | 'planned';
export type BoardSession = {
  id: string; projectId: string; name: string; provider: string; parentId: string | null; folder: string;
  runtime: string; state: BoardState; updatedAt: number; summary: string; reason: string;
  fingerprint: string; needsAttention: boolean; unreviewedResults?: number;
  startedAt?: number; lastActivityAt?: number; step?: string;
  backgroundCount?: number | null;
  task: { title: string; state: string; reason: string; runId: string; taskId: string } | null;
};
export type BoardItem = { id: string; sessionId: string; kind: 'question' | 'error' | 'result'; summary: string;
  createdAt: number; fingerprint: string; scope?: 'response' | 'partial' | 'task'; conversationId?: string; runId?: string; taskId?: string; artifacts?: string[] };
export type BoardReference = { id: string; from: string; to: string; kind: string; source: string; startedAt: number; endedAt: number | null; active: boolean };
export type BoardSnapshot = {
  revision: string; sessions: BoardSession[]; projects: { id: string; name: string; folder: string }[];
  devices: { sessionId: string; kind: string; tool: string; state: string; source: string; startedAt: number }[];
  items?: BoardItem[]; references?: BoardReference[]; sampledAt?: number;
  preferences: { zoom?: number; x?: number; y?: number; collapsed?: string[]; projectId?: string | null; collapsedProjects?: string[]; motion?: boolean };
  storageError: string | null;
};
export function boardItems(data: BoardSnapshot): BoardItem[] {
  return data.items || data.sessions.filter(s => s.needsAttention).map(s => ({ id: s.fingerprint, sessionId: s.id,
    kind: s.state === 'waiting' ? 'question' : ['review', 'completed'].includes(s.state) ? 'result' : 'error',
    summary: s.reason || s.summary, createdAt: s.updatedAt, fingerprint: s.fingerprint, scope: s.state === 'completed' ? 'task' : 'response' }));
}
export function boardCounts(sessions: BoardSession[], items: BoardItem[]) {
  const ids = new Set(sessions.map(s => s.id)), unique = [...new Map(items.filter(i => ids.has(i.sessionId)).map(i => [i.id, i])).values()];
  const current = [...new Map(sessions.map(s => [s.id, s])).values()];
  return { working: current.filter(s => s.state === 'working').length, background: current.filter(s => s.state === 'background').length, questions: unique.filter(i => i.kind === 'question').length,
    errors: unique.filter(i => i.kind === 'error').length, results: unique.filter(i => i.kind === 'result').length, attention: unique.length };
}
export function boardLayout(data: BoardSnapshot, { projectId = '', query = '', filter = 'all', collapsed = new Set<string>() }:
  { projectId?: string; query?: string; filter?: string; collapsed?: Set<string> }) {
  const byId = new Map(data.sessions.map(s => [s.id, s])), included = new Set<string>();
  for (const s of data.sessions) {
    if (projectId && s.projectId !== projectId) continue;
    if (filter !== 'all' && (filter === 'attention' ? !s.needsAttention : s.state !== filter)) continue;
    if (query && !`${s.name} ${s.folder} ${s.task?.title || ''} ${data.projects.find(p => p.id === s.projectId)?.name || ''}`.toLowerCase().includes(query.toLowerCase())) continue;
    let current: BoardSession | undefined = s;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) { seen.add(current.id); included.add(current.id); current = byId.get(current.parentId || ''); }
  }
  const groups: { id: string; name: string; x: number; y: number; width: number; height: number }[] = [];
  const nodes: { session: BoardSession; x: number; y: number; children: number; depth: number; width: number }[] = [];
  const edges: { from: string; to: string }[] = [];
  let x = 24, y = 24, rowHeight = 0, right = 800;
  for (const project of data.projects) {
    // Allocate all slots first: status/search filters never rearrange the board.
    const members = data.sessions.filter(s => s.projectId === project.id);
    if (!members.length) continue;
    const ids = new Set(members.map(s => s.id));
    const children = new Map(members.map(s => [s.id, [] as BoardSession[]]));
    for (const member of members) if (member.parentId) children.get(member.parentId)?.push(member);
    const ordered: { session: BoardSession; depth: number; hidden: boolean }[] = [], visited = new Set<string>();
    const place = (s: BoardSession, depth: number, hidden = false) => {
      if (visited.has(s.id)) return;
      visited.add(s.id); ordered.push({ session: s, depth, hidden });
      for (const child of children.get(s.id) || []) place(child, depth + 1, hidden || collapsed.has(s.id) && !query && filter === 'all');
    };
    for (const root of members.filter(s => !ids.has(s.parentId || ''))) place(root, 0);
    for (const orphan of members) if (!visited.has(orphan.id)) place(orphan, 0);
    const width = 356, height = 70 + ordered.length * 84;
    if (x > 24 && x + width > 1180) { x = 24; y += rowHeight + 36; rowHeight = 0; }
    if (!projectId || projectId === project.id) {
      groups.push({ id: project.id, name: project.name, x, y, width, height });
      ordered.forEach(({ session, depth, hidden }, index) => {
        if (!included.has(session.id) || hidden) return;
        const indent = Math.min(depth, 5) * 14;
        nodes.push({ session, x: x + 12 + indent, y: y + 58 + index * 84, width: width - 24 - indent, children: children.get(session.id)?.length || 0, depth });
        if (session.parentId && included.has(session.parentId) && !ordered.find(i => i.session.id === session.parentId)?.hidden) edges.push({ from: session.parentId, to: session.id });
      });
    }
    right = Math.max(right, x + width + 24); rowHeight = Math.max(rowHeight, height); x += width + 28;
  }
  return { groups, nodes, edges, width: right, height: y + rowHeight + 24 };
}
export function boardViewedAgent<T extends { deferredStart?: boolean }>(agent: T, live: boolean): T {
  return { ...agent, deferredStart: live ? undefined : true };
}
