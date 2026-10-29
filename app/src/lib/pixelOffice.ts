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

export function officeRooms(agents: Agent[], projects: Project[], options: { projectId?: string | null; activeOnly?: boolean; activeSessionsOnly?: boolean; query?: string } = {}) {
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
  const query = normalizeSessionSearch(options.query || '');
  const projectById = new Map([...groups.values()].map(group => [group.project.id, group.project]));
  const matchesQuery = (agent: Agent) => {
    const project = projectById.get(agent.projectId)!;
    return !query || matchesSessionSearch(query, agent.name, agent.folder, agent.remoteFolder, project.name, project.folder);
  };
  // The dock follows the left Active predicate, adding only required ancestors.
  // Board "Active teams" retains its existing whole-family projection.
  const visible = catalog.filter(a => (!(options.activeOnly || options.activeSessionsOnly) || matchesSidebarFilter(a, 'active'))
    && (!options.activeSessionsOnly || matchesQuery(a)));
  const families = sidebarSessionFamilies(visible, catalog, { includeDescendants: !!options.activeOnly && !options.activeSessionsOnly });
  const ordered: Agent[] = [];
  const visit = (a: Agent) => { ordered.push(a); [...(families.children.get(a.id) || [])].sort(stableOrder).forEach(visit); };
  [...families.roots].sort(stableOrder).forEach(visit);
  return [...groups.values()].filter(group => !options.projectId || group.projectIds.includes(options.projectId)).map(({ project, projectIds }) => {
    const all = catalog.filter(a => a.projectId === project.id), roles = officeRoles(all);
    return { project, projectIds, teamKey: officeTeamKey(project), roles, allSessions: all.map(a => ({ ...originals.get(a.id)!, sessionHierarchy: a.sessionHierarchy })), total: all.length, active: all.filter(a => matchesSidebarFilter(a, 'active')).length,
      sessions: ordered.filter(a => a.projectId === project.id && (options.activeSessionsOnly || matchesQuery(a)))
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

export type OfficeDepartment = { room: OfficeRoomData; x: number; y: number; width: number; height: number; color: string };
export type OfficeScene = { width: number; height: number; seats: OfficeSeat[]; departments: OfficeDepartment[] };
export type OfficeViewport = { width: number; height: number; x: number; y: number; zoom: number };
const DEPARTMENT_COLORS = ['#8abca6', '#8caecc', '#c9b184', '#b39ecb', '#c68f94', '#85b9bb'];

// One world for both placements. Department rugs share the same floor and
// corridors; viewport resizing never reshuffles an employee's desk.
export function layoutOfficeScene(rooms: OfficeRoomData[]): OfficeScene {
  const width = 560, gap = 48, margin = 40;
  const layouts = rooms.map(room => layoutOfficeSeats(room.sessions, width - 32, room.roles));
  const averageHeight = layouts.reduce((sum, layout) => sum + layout.height + 20, 0) / Math.max(1, layouts.length);
  const columns = Math.max(1, Math.min(rooms.length, Math.round(Math.sqrt(rooms.length * averageHeight / width * 1.65))));
  const departments: OfficeDepartment[] = [], seats: OfficeSeat[] = [];
  let x = margin, y = 76, rowHeight = 0, sceneWidth = 0;
  rooms.forEach((room, index) => {
    const local = layouts[index];
    const height = local.height + 20;
    if (index && index % columns === 0) { x = margin; y += rowHeight + gap; rowHeight = 0; }
    departments.push({ room, x, y, width, height, color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length] });
    seats.push(...local.seats.map(seat => ({ ...seat, x: seat.x + x + 16, y: seat.y + y })));
    rowHeight = Math.max(rowHeight, height); sceneWidth = Math.max(sceneWidth, x + width + margin); x += width + gap;
  });
  return { width: Math.max(640, sceneWidth), height: Math.max(360, y + rowHeight + margin), departments, seats };
}

export function fitOfficeViewport(scene: Pick<OfficeScene, 'width' | 'height'>, width: number, height: number): OfficeViewport {
  const zoom = Math.min(1, Math.max(Number.EPSILON, Math.min(Math.max(1, width - 32) / scene.width, Math.max(1, height - 32) / scene.height)));
  return { width, height, zoom, x: (width - scene.width * zoom) / 2, y: (height - scene.height * zoom) / 2 };
}
export function constrainOfficeViewport(scene: Pick<OfficeScene, 'width' | 'height'>, view: OfficeViewport): OfficeViewport {
  const axis = (offset: number, extent: number, viewport: number) => extent <= viewport - 32 ? (viewport - extent) / 2 : Math.max(24 - extent, Math.min(viewport - 24, offset));
  return { ...view, x: axis(view.x, scene.width * view.zoom, view.width), y: axis(view.y, scene.height * view.zoom, view.height) };
}
export function zoomOfficeViewport(scene: Pick<OfficeScene, 'width' | 'height'>, view: OfficeViewport, zoom: number, anchorX = view.width / 2, anchorY = view.height / 2): OfficeViewport {
  const next = Math.max(fitOfficeViewport(scene, view.width, view.height).zoom, Math.min(2, zoom));
  const ratio = next / view.zoom;
  return constrainOfficeViewport(scene, { ...view, zoom: next, x: anchorX - (anchorX - view.x) * ratio, y: anchorY - (anchorY - view.y) * ratio });
}
export function officeWorldPoint(view: OfficeViewport, x: number, y: number) { return { x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom }; }
