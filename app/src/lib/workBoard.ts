import { folderProjectParents, layoutProjectParents, projectHierarchyEdges } from './projectBoard';
import { placeBoardProject, type BoardProjectPositions } from './boardPlacement';
import type { BoardRect } from './boardEdgeRouting';

export const BOARD_LAYOUT_VERSION = 3;
export const BOARD_CARD = { width: 320, header: 84, row: 92, node: 86, visibleRows: 6, padding: 7 } as const;
const GRID_COLUMN_GAP = 24;
function boardProjectGrid(count: number, columns = Math.max(1, Math.min(3, Math.ceil(count / BOARD_CARD.visibleRows)))) {
  const rows = Math.ceil(count / columns);
  const rowStep = BOARD_CARD.row + (columns > 1 ? 10 : 0);
  const bodyHeight = Math.min(rows, BOARD_CARD.visibleRows) * rowStep + BOARD_CARD.padding * 2;
  return { columns, rows, count, rowStep, bodyHeight,
    width: columns * BOARD_CARD.width + (columns - 1) * GRID_COLUMN_GAP,
    height: BOARD_CARD.header + bodyHeight + (rows > BOARD_CARD.visibleRows ? 28 : 0),
    contentHeight: rows * rowStep + BOARD_CARD.padding * 2 };
}
export type BoardState = 'idle' | 'working' | 'background' | 'waiting' | 'waiting_external' | 'paused' | 'review' | 'responded' | 'completed' | 'interrupted' | 'failed' | 'unknown' | 'planned';
export type BoardSession = {
  id: string; projectId: string; name: string; provider: string; parentId: string | null; folder: string;
  runtime: string; state: BoardState; updatedAt: number; summary: string; reason: string;
  fingerprint: string; needsAttention: boolean; unreviewedResults?: number;
  startedAt?: number; lastActivityAt?: number; step?: string;
  backgroundCount?: number | null;
  delegatedWait?: { childIds: string[]; count: number; observedAt: number };
  model?: { model: string; effort?: string; serviceTier?: string | null } | null;
  accountLabel?: string;
  task: { title: string; state: string; reason: string; runId: string; taskId: string } | null;
};
export type BoardItem = { id: string; sessionId: string; kind: 'question' | 'error' | 'result'; summary: string;
  createdAt: number; fingerprint: string; scope?: 'response' | 'partial' | 'task'; conversationId?: string; runId?: string; taskId?: string; artifacts?: string[] };
export type BoardReference = { id: string; from: string; to: string; kind: string; source: string; startedAt: number; endedAt: number | null; active: boolean };
export type BoardTransfer = { id: string; from: string; to: string; status: string; reason: string; summary?: string; savedAt?: number | null; sentAt?: number | null; receivedAt?: number | null; readAt?: number | null; startedAt?: number | null; isMessage?: boolean };
export type BoardTransferDetail = { id: string; from: string; to: string; message: string | null };
export type BoardViewMode = 'sessions' | 'transfers' | 'board' | 'office';
export type BoardEdgeStyle = 'orthogonal' | 'curved';
export type BoardSessionManagement = { id: string; action: 'properties' | 'rename' | 'delete' | 'hierarchy' };
export type BoardProjectManagement = { action: 'hierarchy'; id?: string } | { action: 'new-session'; id: string };
export type BoardSnapshot = {
  revision: string; sessions: BoardSession[]; projects: { id: string; name: string; folder: string; remoteFolder?: string; sshHostId?: string; hierarchy?: { parentId?: string } }[];
  devices: { sessionId: string; kind: string; tool: string; state: string; source: string; startedAt: number }[];
  items?: BoardItem[]; references?: BoardReference[]; sampledAt?: number;
  transfers?: BoardTransfer[];
  delegations?: { id: string; from: string; to: string }[];
  preferences: { viewMode?: BoardViewMode; edgeStyle?: BoardEdgeStyle; layoutVersion?: number; zoom?: number; x?: number; y?: number; collapsed?: string[]; projectId?: string | null; collapsedProjects?: string[]; motion?: boolean; projectPositions?: BoardProjectPositions; sessionOrder?: string[]; showSleeping?: boolean; showStopped?: boolean; activeOnly?: boolean };
  resultCapacityReached?: boolean;
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
  if (session.delegatedWait?.count) return 'background';
  return session.state === 'review' && unreadResults === 0 ? 'responded' : session.state;
}
export function boardTransferLabel(t: BoardTransfer): [string, string] {
  if (t.status === 'queued' && t.reason === 'target-starting') return ['세션 시작 중', 'Starting session'];
  if (t.status === 'queued' && t.reason === 'startup-pending') return ['입력 준비 확인 중', 'Checking input readiness'];
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
/** Temporary sibling priority; never write this projection to manual preferences. */
export function boardWorkingOrder(sessions: BoardSession[], previous: string[]): string[] {
  const byId = new Map(sessions.map(s => [s.id, s])), working = new Set<string>();
  for (const s of sessions) if (s.runtime === 'running' && s.state === 'working') {
    let current: BoardSession | undefined = s;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id); working.add(current.id);
      const parent = byId.get(current.parentId || '');
      current = parent?.projectId === s.projectId ? parent : undefined;
    }
  }
  const ranks = new Map([...new Set([...previous, ...sessions.map(s => s.id)])].map((id, i) => [id, i]));
  const priority = (s: BoardSession) => s.parentId && byId.get(s.parentId)?.projectId === s.projectId && working.has(s.id) ? 0 : 1;
  return [...sessions].sort((a, b) => priority(a) - priority(b) || ranks.get(a.id)! - ranks.get(b.id)!).map(s => s.id);
}
export function boardSessionVisibilityKind(s: BoardSession): 'sleeping' | 'stopped' | null {
  // Sleeping is independent of the Idle/Stopped switch, even when its last
  // reported work state was Idle or Interrupted.
  return s.runtime === 'sleeping' ? 'sleeping' : s.runtime === 'stopped' || ['idle', 'paused', 'interrupted'].includes(s.state) ? 'stopped' : null;
}
export function boardVisibleSessionIds(sessions: BoardSession[], showSleeping: boolean, showStopped: boolean, revealId?: string | null, activeOnly = false): Set<string> {
  const byId = new Map(sessions.map(s => [s.id, s])), visible = new Set<string>();
  const hasActiveParent = (s: BoardSession) => {
    const seen = new Set([s.id]); let parent = byId.get(s.parentId || '');
    while (parent && !seen.has(parent.id)) {
      if (parent.runtime === 'running') return true;
      seen.add(parent.id); parent = byId.get(parent.parentId || '');
    }
    return false;
  };
  for (const s of sessions) {
    const kind = boardSessionVisibilityKind(s);
    if (s.id !== revealId && (activeOnly
      ? s.runtime !== 'running' && !(s.runtime === 'sleeping' && showSleeping && hasActiveParent(s))
      : kind === 'sleeping' && !showSleeping || kind === 'stopped' && !showStopped)) continue;
    if (s.id !== revealId && activeOnly && s.runtime === 'running' && kind === 'stopped' && !showStopped) continue;
    let current: BoardSession | undefined = s;
    while (current && !visible.has(current.id)) { visible.add(current.id); current = byId.get(current.parentId || ''); }
  }
  return visible;
}
type BoardLayoutResult = {
  groups: ({ id: string; name: string; x: number; y: number; expandedHeight: number } & ReturnType<typeof boardProjectGrid>)[];
  nodes: { session: BoardSession; x: number; y: number; children: number; depth: number; width: number; height: number }[];
  edges: { from: string; to: string }[]; projectEdges: ReturnType<typeof projectHierarchyEdges>; width: number; height: number;
};
export function boardLayout(data: BoardSnapshot, { projectId = '', query = '', filter = 'all', collapsed = new Set<string>(), collapsedProjects = new Set<string>(), overview = false, projectPositions = {}, projectPreview, sessionOrder = [], showSleeping = true, showStopped = true, activeOnly = false, revealId }:
  { projectId?: string; query?: string; filter?: string; collapsed?: Set<string>; collapsedProjects?: Set<string>; overview?: boolean; projectPositions?: BoardProjectPositions; projectPreview?: { id: string; x: number; y: number } | null; sessionOrder?: string[]; showSleeping?: boolean; showStopped?: boolean; activeOnly?: boolean; revealId?: string | null }): BoardLayoutResult {
  if (activeOnly || !showSleeping || !showStopped) {
    const visible = boardVisibleSessionIds(data.sessions, showSleeping, showStopped, revealId, activeOnly);
    if (visible.size < data.sessions.length) {
      // Re-measure only the retained sessions and their project ancestors.
      // The renderer keeps saved full-board placement separate from this view.
      return boardLayout({ ...data, sessions: data.sessions.filter(s => visible.has(s.id)) },
        { projectId, query, filter, collapsed, collapsedProjects, overview, sessionOrder, projectPositions, projectPreview });
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
  const groups: BoardLayoutResult['groups'] = [];
  const nodes: { session: BoardSession; x: number; y: number; children: number; depth: number; width: number; height: number }[] = [];
  const edges: { from: string; to: string }[] = [];
  const folderParents = folderProjectParents(data.projects);
  const parents = layoutProjectParents(data.projects, folderParents);
  const relationships = projectHierarchyEdges(data.projects, folderParents);
  const parentsByChild = new Map<string, string[]>();
  for (const { from, to } of relationships) {
    const incoming = parentsByChild.get(to) || [];
    incoming.push(from);
    parentsByChild.set(to, incoming);
  }
  const slots = new Map<string, { session: BoardSession; depth: number; hidden: boolean }[]>();
  const expandedGrids = new Map<string, ReturnType<typeof boardProjectGrid>>();
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
    // Folding repacks rows within a card. Project anchors use the expanded heights.
    expandedGrids.set(project.id, boardProjectGrid(ordered.length));
    slots.set(project.id, ordered.filter(row => !row.hidden));
  }
  const visibleProjects = new Set(data.projects.filter(p => slots.get(p.id)!.length).map(p => p.id));
  for (const id of visibleProjects) {
    for (const parent of parentsByChild.get(id) || []) visibleProjects.add(parent);
  }
  const children = new Map(data.projects.map(p => [p.id, data.projects.filter(c => visibleProjects.has(c.id) && parents.get(c.id) === p.id)]));
  const measures = new Map<string, { width: number; height: number }>();
  const gapX = 48, gapY = 64;
  const measure = (id: string): { width: number; height: number } => {
    const rows = children.get(id)!, grid = expandedGrids.get(id)!;
    let { width, height } = grid;
    for (let i = 0; i < rows.length; i += 2) {
      const row = rows.slice(i, i + 2).map(p => measure(p.id));
      width = Math.max(width, row.reduce((sum, c) => sum + c.width, 0) + (row.length - 1) * gapX);
      height += gapY + Math.max(...row.map(c => c.height));
    }
    const result = { width, height }; measures.set(id, result); return result;
  };
  const positions = new Map<string, { x: number; y: number }>();
  const placeProject = (id: string, x: number, y: number) => {
    const block = measures.get(id)!, rows = children.get(id)!, grid = expandedGrids.get(id)!;
    positions.set(id, { x: x + (block.width - grid.width) / 2, y });
    let rowY = y + grid.height + gapY;
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
  if (Object.keys(projectPositions).length) {
    const reserved: BoardRect[] = [];
    const placed = (id: string) => Object.prototype.hasOwnProperty.call(projectPositions, id);
    const ordered = [...positions.keys()].sort((a, b) => Number(placed(b)) - Number(placed(a)));
    for (const id of ordered) {
      const { width, height } = expandedGrids.get(id)!;
      const origin = placed(id) ? projectPositions[id] : positions.get(id)!;
      const rect = { ...origin, width, height };
      const overlaps = reserved.some(p => rect.x < p.x + p.width && p.x < rect.x + width && rect.y < p.y + p.height && p.y < rect.y + height);
      const point = overlaps ? placeBoardProject(rect, reserved) : origin;
      positions.set(id, point);
      reserved.push({ ...point, width, height });
    }
  }
  for (const project of data.projects) {
    if (!positions.has(project.id)) continue;
    const position = projectPreview?.id === project.id ? projectPreview : positions.get(project.id)!;
    const { x, y } = position, ordered = slots.get(project.id)!;
    if (!projectId || projectId === project.id) {
      const grid = boardProjectGrid(ordered.length, expandedGrids.get(project.id)!.columns);
      const folded = overview || collapsedProjects.has(project.id);
      groups.push({ id: project.id, name: project.name, x, y, ...grid, expandedHeight: grid.height,
        height: folded ? BOARD_CARD.header : grid.height, bodyHeight: folded ? 0 : grid.bodyHeight });
      ordered.forEach(({ session, depth, hidden }, index) => {
        if (!included.has(session.id) || hidden) return;
        const indent = Math.min(depth, 4) * 14;
        const column = index % grid.columns, row = Math.floor(index / grid.columns);
        nodes.push({ session, x: x + BOARD_CARD.padding + indent + column * (BOARD_CARD.width + GRID_COLUMN_GAP), y: y + BOARD_CARD.header + BOARD_CARD.padding + row * grid.rowStep,
          width: BOARD_CARD.width - BOARD_CARD.padding * 2 - indent - (grid.rows > BOARD_CARD.visibleRows ? 14 : 2), height: BOARD_CARD.node,
          children: data.sessions.filter(s => s.parentId === session.id && s.projectId === session.projectId).length, depth });
      });
    }
  }
  const nodeIds = new Set(nodes.map(n => n.session.id));
  for (const node of nodes) if (node.session.parentId && nodeIds.has(node.session.parentId)) edges.push({ from: node.session.parentId, to: node.session.id });
  const groupIds = new Set(groups.map(g => g.id));
  const projectEdges = relationships.filter(edge => groupIds.has(edge.from) && groupIds.has(edge.to));
  return { groups, nodes, edges, projectEdges, width: Math.max(right, ...groups.map(g => g.x + g.width + 28)), height: Math.max(y + rowHeight + 28, ...groups.map(g => g.y + g.height + 28)) };
}
export function boardViewedAgent<T extends { deferredStart?: boolean }>(agent: T, live: boolean): T {
  return { ...agent, deferredStart: live ? undefined : true };
}
