import type { Agent, Project } from '../types';
import { AGENT_ACTIVITY_STALE_AFTER_MS, isAgentRuntimeActive, runtimeStatusOf } from './agentActivity';
import { isStandbySession } from './sessionStandby';
import { sidebarSessionFamilies, matchesSidebarFilter } from './sidebarNavigation';
import { matchesSessionSearch, normalizeSessionSearch } from './sessionSearch';
import { repairSessionHierarchy } from './sessionHierarchy';

export type OfficeState = 'working' | 'reading' | 'waiting' | 'blocked' | 'done' | 'sleeping' | 'stopped' | 'starting' | 'idle' | 'disconnected';
export const OFFICE_COLORS: Record<OfficeState, string> = {
  working: '#67cfb2', reading: '#7fb7ff', waiting: '#f5c76b', blocked: '#ee8d90',
  done: '#8cd68b', sleeping: '#9ca5b8', stopped: '#89909e', starting: '#b59cf0', idle: '#a6b6c8', disconnected: '#ee8d90',
};
export const OFFICE_PAGE_SIZE = 24;
export type RightPanelView = 'files' | 'scm' | 'office';
export const LS_RIGHT_PANEL_VIEW = 'multiagent.rightPanelView.v1';
export function loadRightPanelView(): RightPanelView {
  try { const value = localStorage.getItem(LS_RIGHT_PANEL_VIEW); return value === 'scm' || value === 'office' ? value : 'files'; }
  catch { return 'files'; }
}

// A live PTY alone is not evidence of work. Keep process state authoritative,
// and never turn a stale tool name or an interrupted turn into a working pose.
export function officeState(agent: Agent, now = Date.now()): OfficeState {
  const runtime = runtimeStatusOf(agent);
  if (runtime === 'unreachable') return 'disconnected';
  if (isStandbySession(agent)) return 'sleeping';
  if (agent.deferredStart || !isAgentRuntimeActive(agent)) return 'stopped';
  if (runtime === 'starting' || runtime === 'recovering') return 'starting';
  const activity = agent.activity;
  if (!activity || now - activity.receivedAt > AGENT_ACTIVITY_STALE_AFTER_MS) return 'idle';
  if (activity.workStatus === 'waiting' || agent.status === 'question') return 'waiting';
  if (activity.workStatus === 'blocked') return 'blocked';
  if (activity.workStatus === 'done') return 'done'; // Turn ended, not task review.
  if (activity.workStatus !== 'working') return 'idle';
  const preTool = /pre.?tool|before.?tool|tool.?start/i.test(activity.hookEventName || '');
  return preTool && /read|grep|glob|search|browse|fetch/i.test(activity.toolName || '') ? 'reading' : 'working';
}

export function officeAvatar(id: string): number {
  let value = 2166136261;
  for (const c of id) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return (value >>> 0) % 6;
}
const stableOrder = (a: Agent, b: Agent) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);

export type OfficeRole = 'lead' | 'manager' | 'member' | 'independent';
export type OfficeRoleInfo = { role: OfficeRole; parentId?: string; reports: number };
export const OFFICE_ROLE_COLORS: Record<OfficeRole, string> = { lead: '#f4cf82', manager: '#c7b4f4', member: '#b8d9e4', independent: '#c6cec9' };

// Exact registered roots define teams, not directory-prefix containment or a
// child's effective working folder. Windows aliases ignore slash/case; POSIX
// paths and different SSH hosts retain their own identity. No filesystem IO.
export function officeTeamKey(project: Project): string {
  const value = project.sshHostId ? project.remoteFolder || project.folder : project.folder;
  if (!value?.trim()) return `project:${project.id}`;
  const windows = !project.sshHostId && /^(?:[A-Za-z]:|[\\/]{2})/.test(value);
  let folder = value.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  if (windows) folder = folder.toLowerCase();
  return `${project.sshHostId ? `ssh:${project.sshHostId}` : 'local'}:${folder}`;
}

export function officeRoles(agents: Agent[]): Map<string, OfficeRoleInfo> {
  const ids = new Set(agents.map(a => a.id));
  const parents = new Map(agents.map(a => [a.id, a.sessionHierarchy?.parentId && ids.has(a.sessionHierarchy.parentId) && a.sessionHierarchy.parentId !== a.id ? a.sessionHierarchy.parentId : undefined]));
  const reports = new Map<string, number>();
  for (const parent of parents.values()) if (parent) reports.set(parent, (reports.get(parent) || 0) + 1);
  return new Map(agents.map(agent => {
    const parentId = parents.get(agent.id), count = reports.get(agent.id) || 0;
    return [agent.id, { role: count ? parentId ? 'manager' : 'lead' : parentId ? 'member' : 'independent', parentId, reports: count }];
  }));
}

export function officeRooms(agents: Agent[], projects: Project[], options: { projectId?: string | null; activeOnly?: boolean; query?: string } = {}) {
  const groups = new Map<string, { project: Project; projectIds: string[] }>();
  const projectGroup = new Map<string, string>();
  for (const project of projects) {
    const key = officeTeamKey(project), group = groups.get(key) || { project, projectIds: [] };
    group.projectIds.push(project.id); groups.set(key, group); projectGroup.set(project.id, group.project.id);
  }
  const originals = new Map(agents.map(agent => [agent.id, agent]));
  // Only the view projection merges duplicate registrations. The user's
  // project/session records, inheritance, folders and launch IDs stay intact.
  const catalog = repairSessionHierarchy(agents.filter(a => !a.sidebarArchived && projectGroup.has(a.projectId)).map(a => ({ ...a, projectId: projectGroup.get(a.projectId)! })));
  const visible = options.activeOnly ? catalog.filter(a => matchesSidebarFilter(a, 'active')) : catalog;
  const families = sidebarSessionFamilies(visible, catalog, { includeDescendants: !!options.activeOnly });
  const ordered: Agent[] = [];
  const visit = (a: Agent) => { ordered.push(a); [...(families.children.get(a.id) || [])].sort(stableOrder).forEach(visit); };
  [...families.roots].sort(stableOrder).forEach(visit);
  const query = normalizeSessionSearch(options.query || '');
  return [...groups.values()].filter(group => !options.projectId || group.projectIds.includes(options.projectId)).map(({ project, projectIds }) => {
    const all = catalog.filter(a => a.projectId === project.id), roles = officeRoles(all);
    return { project, projectIds, teamKey: officeTeamKey(project), roles, allSessions: all.map(a => ({ ...originals.get(a.id)!, sessionHierarchy: a.sessionHierarchy })), total: all.length, active: all.filter(a => matchesSidebarFilter(a, 'active')).length,
      sessions: ordered.filter(a => a.projectId === project.id && (!query || matchesSessionSearch(query, a.name, a.folder, a.remoteFolder, project.name, project.folder)))
        .map(a => ({ ...originals.get(a.id)!, sessionHierarchy: a.sessionHierarchy })),
    };
  }).filter(room => room.sessions.length > 0);
}

export type OfficeRoomData = ReturnType<typeof officeRooms>[number];
export type OfficeSeat = { agent: Agent; x: number; y: number; parentId?: string; team: string; role: OfficeRole };
// CSS-pixel coordinates, shared by Canvas and keyboard-accessible hit targets.
// Only viewport width and hierarchy affect seats; activity/name changes do not.
export function layoutOfficeSeats(agents: Agent[], width: number, roles = officeRoles(agents)): { seats: OfficeSeat[]; height: number } {
  const columns = Math.max(1, Math.floor((Math.max(220, width) - 16) / 128));
  const cell = (width - 16) / columns;
  const ids = new Set(agents.map(a => a.id)), teams = new Map<string, string>();
  let row = 0, column = 0;
  const seats = agents.map(agent => {
    const parentId = agent.sessionHierarchy?.parentId;
    const team = parentId && ids.has(parentId) ? teams.get(parentId) || parentId : agent.id;
    const role = roles.get(agent.id)?.role || 'independent';
    const leader = role === 'lead' || role === 'manager';
    if (leader && column) { row++; column = 0; }
    const x = leader ? (width - 124) / 2 : 8 + cell * column + (cell - 124) / 2;
    const y = 70 + row * 170;
    if (leader || ++column === columns) { row++; column = 0; }
    teams.set(agent.id, team);
    return { agent, x, y, parentId, team, role };
  });
  // Center a short row of siblings beneath its manager (including 1:1 teams).
  const rows = new Map<number, OfficeSeat[]>();
  for (const seat of seats) { const members = rows.get(seat.y) || []; members.push(seat); rows.set(seat.y, members); }
  for (const members of rows.values()) if (members.length < columns && members.every(seat => seat.role === 'member' && seat.parentId === members[0].parentId)) {
    members.forEach((seat, i) => { seat.x = (width - members.length * cell) / 2 + i * cell + (cell - 124) / 2; });
  }
  return { seats, height: 88 + (row + (column ? 1 : 0)) * 170 };
}
