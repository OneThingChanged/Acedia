import { folderProjectParents } from './projectBoard';
import type { BoardProjectPositions } from './boardPlacement';

export const BOARD_LAYOUT_VERSION = 2;
export const BOARD_CARD = { width: 320, header: 84, row: 92, node: 86, visibleRows: 6, padding: 7 } as const;
export type BoardState = 'idle' | 'working' | 'background' | 'waiting' | 'waiting_external' | 'paused' | 'review' | 'responded' | 'completed' | 'interrupted' | 'failed' | 'unknown' | 'planned';
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
export type BoardTransfer = { id: string; from: string; to: string; status: string; reason: string; savedAt?: number | null; readAt?: number | null; startedAt?: number | null; isMessage?: boolean };
export type BoardSnapshot = {
  revision: string; sessions: BoardSession[]; projects: { id: string; name: string; folder: string; remoteFolder?: string; sshHostId?: string; hierarchy?: { parentId?: string } }[];
  devices: { sessionId: string; kind: string; tool: string; state: string; source: string; startedAt: number }[];
  items?: BoardItem[]; references?: BoardReference[]; sampledAt?: number;
  transfers?: BoardTransfer[];
  preferences: { layoutVersion?: number; zoom?: number; x?: number; y?: number; collapsed?: string[]; projectId?: string | null; collapsedProjects?: string[]; motion?: boolean; projectPositions?: BoardProjectPositions; sessionOrder?: string[]; showSleeping?: boolean; showStopped?: boolean };
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
export function boardDisplayState(session: BoardSession, unreadResults: number): BoardState {
  return session.state === 'review' && unreadResults === 0 ? 'responded' : session.state;
}
export function boardTransferLabel(t: BoardTransfer): [string, string] {
  if (t.status === 'queued') return ['입력 준비 후 전달 대기', 'Queued until input is ready'];
  if (t.status === 'notification-error' || t.status === 'failed') return ['전달 실패', 'Delivery failed'];
  if (t.status === 'unconfirmed') return ['전달 확인 필요', 'Delivery outcome uncertain'];
  if (t.isMessage && t.readAt) return t.startedAt ? ['원문 읽음 · 응답 시작', 'Text read · response started'] : ['원문 읽음', 'Text read'];
  if (t.status === 'started') return t.isMessage ? ['알림 처리 시작 · 원문 미확인', 'Notification started · text unread'] : ['작업 시작 확인', 'Task start confirmed'];
  if (t.status === 'received') return t.isMessage ? ['알림 수신 · 원문 미확인', 'Notification received · text unread'] : ['수신 확인', 'Receipt confirmed'];
  if (t.status === 'sent') return ['알림 전달됨 · 수신 확인 중', 'Notification sent · awaiting receipt'];
  return t.status === 'inbox' ? ['메시지함에 저장됨', 'Saved in inbox'] : ['알림 전달 중', 'Sending notification'];
}
/** An explicit one-shot sort; polling never moves a user's manually placed nodes. */
export function boardPriorityOrder(sessions: BoardSession[], items: BoardItem[], previous: string[]): string[] {
  const byId = new Map(sessions.map(s => [s.id, s])), unread = new Set(items.filter(i => i.kind === 'result').map(i => i.sessionId));
  const score = new Map(sessions.map(s => [s.id, s.state === 'waiting' || s.state === 'failed' ? 0 : s.state === 'working' ? 1 : s.state === 'background' ? 2 : unread.has(s.id) ? 3 : s.state === 'planned' ? 4 : 5]));
  for (const s of sessions) { const priority = score.get(s.id)!; const seen = new Set<string>(); let current: BoardSession | undefined = s;
    while (current && !seen.has(current.id)) { seen.add(current.id); score.set(current.id, Math.min(priority, score.get(current.id)!)); current = byId.get(current.parentId || ''); } }
  const ranks = new Map([...new Set([...previous, ...sessions.map(s => s.id)])].map((id, i) => [id, i]));
  return [...sessions].sort((a, b) => score.get(a.id)! - score.get(b.id)! || ranks.get(a.id)! - ranks.get(b.id)!).map(s => s.id);
}
export function boardSessionVisibilityKind(s: BoardSession): 'sleeping' | 'stopped' | null {
  // Sleeping is independent of the Idle/Stopped switch, even when its last
  // reported work state was Idle or Interrupted.
  return s.runtime === 'sleeping' ? 'sleeping' : s.runtime === 'stopped' || ['idle', 'paused', 'interrupted'].includes(s.state) ? 'stopped' : null;
}
export function boardVisibleSessionIds(sessions: BoardSession[], showSleeping: boolean, showStopped: boolean, revealId?: string | null): Set<string> {
  const byId = new Map(sessions.map(s => [s.id, s])), visible = new Set<string>();
  for (const s of sessions) {
    const kind = boardSessionVisibilityKind(s);
    if (s.id !== revealId && (kind === 'sleeping' && !showSleeping || kind === 'stopped' && !showStopped)) continue;
    let current: BoardSession | undefined = s;
    while (current && !visible.has(current.id)) { visible.add(current.id); current = byId.get(current.parentId || ''); }
  }
  return visible;
}
type BoardLayoutResult = {
  groups: { id: string; name: string; x: number; y: number; width: number; height: number; rows: number; bodyHeight: number }[];
  nodes: { session: BoardSession; x: number; y: number; children: number; depth: number; width: number; height: number }[];
  edges: { from: string; to: string }[]; projectEdges: { from: string; to: string }[]; width: number; height: number;
};
export function boardLayout(data: BoardSnapshot, { projectId = '', query = '', filter = 'all', collapsed = new Set<string>(), projectPositions = {}, sessionOrder = [], showSleeping = true, showStopped = true, revealId }:
  { projectId?: string; query?: string; filter?: string; collapsed?: Set<string>; projectPositions?: BoardProjectPositions; sessionOrder?: string[]; showSleeping?: boolean; showStopped?: boolean; revealId?: string | null }): BoardLayoutResult {
  if (!showSleeping || !showStopped) {
    const visible = boardVisibleSessionIds(data.sessions, showSleeping, showStopped, revealId);
    if (visible.size < data.sessions.length) {
      const options = { projectId, query, filter, collapsed, sessionOrder };
      // Compact hidden rows, while retaining the full board's project origins.
      // Toggling visibility must not overwrite the user's saved placement.
      const full = boardLayout(data, { ...options, projectPositions });
      const origins = Object.fromEntries(full.groups.map(g => [g.id, { x: g.x, y: g.y }]));
      return boardLayout({ ...data, sessions: data.sessions.filter(s => visible.has(s.id)) }, { ...options, projectPositions: { ...origins, ...projectPositions } });
    }
  }
  const byId = new Map(data.sessions.map(s => [s.id, s])), included = new Set<string>();
  for (const s of data.sessions) {
    if (projectId && s.projectId !== projectId) continue;
    if (filter !== 'all' && (filter === 'attention' ? !s.needsAttention : s.state !== filter)) continue;
    if (query && !`${s.name} ${s.folder} ${s.task?.title || ''} ${data.projects.find(p => p.id === s.projectId)?.name || ''}`.toLowerCase().includes(query.toLowerCase())) continue;
    let current: BoardSession | undefined = s;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) { seen.add(current.id); included.add(current.id); current = byId.get(current.parentId || ''); }
  }
  const groups: { id: string; name: string; x: number; y: number; width: number; height: number; rows: number; bodyHeight: number }[] = [];
  const nodes: { session: BoardSession; x: number; y: number; children: number; depth: number; width: number; height: number }[] = [];
  const edges: { from: string; to: string }[] = [];
  const parents = folderProjectParents(data.projects);
  // Registered relationships and folder containment are evidence of hierarchy.
  // Unrelated projects must never be attached to an invented master project.
  const projects = new Map(data.projects.map(p => [p.id, p]));
  for (const project of data.projects) {
    const parent = projects.get(project.hierarchy?.parentId || '');
    if (parents.has(project.id) || !parent || (parent.sshHostId || '') !== (project.sshHostId || '')) continue;
    const seen = new Set([project.id]); let id: string | undefined = parent.id;
    while (id && !seen.has(id)) { seen.add(id); id = parents.get(id); }
    if (!id) parents.set(project.id, parent.id);
  }
  const slots = new Map<string, { session: BoardSession; depth: number; hidden: boolean }[]>();
  const rank = new Map(sessionOrder.map((id, index) => [id, index]));
  for (const project of data.projects) {
    // Allocate all slots first: status/search filters never rearrange the board.
    const members = data.sessions.filter(s => s.projectId === project.id).sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
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
    // Explicit folding may compact a subtree. Search/status filtering below
    // still uses these allocated slots and never repacks matching rows.
    slots.set(project.id, ordered.filter(row => !row.hidden));
  }
  const visibleProjects = new Set(data.projects.filter(p => slots.get(p.id)!.length).map(p => p.id));
  for (const id of [...visibleProjects]) { let parent = parents.get(id); while (parent) { visibleProjects.add(parent); parent = parents.get(parent); } }
  const children = new Map(data.projects.map(p => [p.id, data.projects.filter(c => visibleProjects.has(c.id) && parents.get(c.id) === p.id)]));
  const cardHeight = (id: string) => BOARD_CARD.header + Math.min(BOARD_CARD.visibleRows, slots.get(id)!.length) * BOARD_CARD.row
    + BOARD_CARD.padding * 2 + (slots.get(id)!.length > BOARD_CARD.visibleRows ? 28 : 0);
  const measures = new Map<string, { width: number; height: number }>();
  const gapX = 48, gapY = 64;
  const measure = (id: string): { width: number; height: number } => {
    const rows = children.get(id)!; let width = BOARD_CARD.width as number, height = cardHeight(id);
    for (let i = 0; i < rows.length; i += 2) {
      const row = rows.slice(i, i + 2).map(p => measure(p.id));
      width = Math.max(width, row.reduce((sum, c) => sum + c.width, 0) + (row.length - 1) * gapX);
      height += gapY + Math.max(...row.map(c => c.height));
    }
    const result = { width, height }; measures.set(id, result); return result;
  };
  const positions = new Map<string, { x: number; y: number }>();
  const placeProject = (id: string, x: number, y: number) => {
    const block = measures.get(id)!, rows = children.get(id)!;
    positions.set(id, { x: x + (block.width - BOARD_CARD.width) / 2, y });
    let rowY = y + cardHeight(id) + gapY;
    for (let i = 0; i < rows.length; i += 2) {
      const row = rows.slice(i, i + 2), rowWidth = row.reduce((sum, c) => sum + measures.get(c.id)!.width, 0) + (row.length - 1) * gapX;
      let rowX = x + (block.width - rowWidth) / 2;
      for (const child of row) { placeProject(child.id, rowX, rowY); rowX += measures.get(child.id)!.width + gapX; }
      rowY += Math.max(...row.map(c => measures.get(c.id)!.height)) + gapY;
    }
  };
  let x = 28, y = 38, rowHeight = 0, right = 800;
  for (const project of data.projects.filter(p => visibleProjects.has(p.id) && !parents.has(p.id))) {
    const block = measure(project.id);
    if (x > 28 && x + block.width > 1160) { x = 28; y += rowHeight + gapY; rowHeight = 0; }
    placeProject(project.id, x, y); right = Math.max(right, x + block.width + 28);
    rowHeight = Math.max(rowHeight, block.height); x += block.width + gapX;
  }
  for (const project of data.projects) {
    if (!positions.has(project.id)) continue;
    const position = Object.prototype.hasOwnProperty.call(projectPositions, project.id) ? projectPositions[project.id] : positions.get(project.id); if (!position) continue;
    const { x, y } = position, ordered = slots.get(project.id)!;
    if (!projectId || projectId === project.id) {
      groups.push({ id: project.id, name: project.name, x, y, width: BOARD_CARD.width, height: cardHeight(project.id), rows: ordered.length,
        bodyHeight: Math.min(ordered.length, BOARD_CARD.visibleRows) * BOARD_CARD.row + BOARD_CARD.padding * 2 });
      ordered.forEach(({ session, depth, hidden }, index) => {
        if (!included.has(session.id) || hidden) return;
        const indent = Math.min(depth, 4) * 14;
        nodes.push({ session, x: x + BOARD_CARD.padding + indent, y: y + BOARD_CARD.header + BOARD_CARD.padding + index * BOARD_CARD.row,
          width: BOARD_CARD.width - BOARD_CARD.padding * 2 - indent - (ordered.length > BOARD_CARD.visibleRows ? 14 : 2), height: BOARD_CARD.node,
          children: data.sessions.filter(s => s.parentId === session.id && s.projectId === session.projectId).length, depth });
      });
    }
  }
  const nodeIds = new Set(nodes.map(n => n.session.id));
  for (const node of nodes) if (node.session.parentId && nodeIds.has(node.session.parentId)) edges.push({ from: node.session.parentId, to: node.session.id });
  const groupIds = new Set(groups.map(g => g.id));
  const projectEdges = [...parents].filter(([child, parent]) => groupIds.has(child) && groupIds.has(parent)).map(([to, from]) => ({ from, to }));
  return { groups, nodes, edges, projectEdges, width: Math.max(right, ...groups.map(g => g.x + g.width + 28)), height: Math.max(y + rowHeight + 28, ...groups.map(g => g.y + g.height + 28)) };
}
export function boardViewedAgent<T extends { deferredStart?: boolean }>(agent: T, live: boolean): T {
  return { ...agent, deferredStart: live ? undefined : true };
}
