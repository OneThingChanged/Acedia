import type { BoardSession, BoardSnapshot, BoardTransfer } from './workBoard';

export const transferTime = (t: BoardTransfer) => t.savedAt || t.startedAt || t.readAt || t.receivedAt || t.sentAt || 0;
export function transferTitle(t: BoardTransfer, sender: string): [string, string] {
  if (t.summary?.trim()) return [t.summary, t.summary];
  const at = transferTime(t), stamp = at && Number.isFinite(at) ? ` · ${new Date(at).toLocaleString()}` : '';
  const number = ` · #${t.id.slice(0, 8)}`;
  return t.isMessage ? [`${sender}의 세션 메시지${stamp}${number}`, `Session message from ${sender}${stamp}${number}`]
    : [`${sender}의 직접 전달${stamp}${number}`, `Direct handoff from ${sender}${stamp}${number}`];
}
export function latestIncoming(data: BoardSnapshot, id: string): BoardTransfer | undefined {
  return (data.transfers || []).filter(t => t.to === id).reduce<BoardTransfer | undefined>((last, t) => !last || transferTime(t) >= transferTime(last) ? t : last, undefined);
}
export function sessionTableMatches(data: BoardSnapshot, session: BoardSession, query: string): boolean {
  const q = query.trim().toLowerCase().split('\\').join('/');
  if (!q) return true;
  const incoming = latestIncoming(data, session.id);
  return [session.name, session.folder, session.task?.title, session.reason, data.projects.find(p => p.id === session.projectId)?.name,
    incoming?.summary, data.sessions.find(s => s.id === incoming?.from)?.name].join(' ').toLowerCase().split('\\').join('/').includes(q);
}
/** Include only the ancestors of matching rows, without treating a parent as a request sender. */
export function sessionTableRows(data: BoardSnapshot, visible: Set<string>, matches: (session: BoardSession) => boolean, projectId = '') {
  const byId = new Map(data.sessions.map(s => [s.id, s]));
  const direct = new Set(data.sessions.filter(s => visible.has(s.id) && (!projectId || s.projectId === projectId) && matches(s)).map(s => s.id));
  const ids = new Set(direct);
  for (const id of direct) {
    const seen = new Set([id]); let parent = byId.get(byId.get(id)?.parentId || '');
    while (parent && (!projectId || parent.projectId === projectId) && !seen.has(parent.id)) {
      seen.add(parent.id); ids.add(parent.id); parent = byId.get(parent.parentId || '');
    }
  }
  return { direct, sessions: data.sessions.filter(s => ids.has(s.id)) };
}
export function transferStages(t: BoardTransfer): { label: [string, string]; at: number | null | undefined }[] {
  return [
    { label: ['원문 저장', 'Saved'], at: t.savedAt },
    { label: ['알림 전달', 'Notification sent'], at: t.sentAt },
    { label: ['알림 수신', 'Notification received'], at: t.receivedAt },
    ...(t.isMessage ? [{ label: ['원문 읽음', 'Text read'] as [string, string], at: t.readAt }] : []),
    { label: ['응답 시작', 'Response started'], at: t.startedAt },
  ];
}
