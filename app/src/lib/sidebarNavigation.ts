import type { Agent, Group, LayoutNode, Project, ProjectFolder } from "../types";
import { collectAgentIdsInOrder } from "./layout";
import { isAgentRuntimeActive } from "./agentActivity";
import { isStandbySession } from "./sessionStandby";
import { matchesSessionSearch, normalizeSessionSearch } from "./sessionSearch";

export type SidebarFilter = "all" | "active" | "sleeping";
export type SidebarDateGroup = "pinned" | "today" | "yesterday" | "week" | "older";
export const LS_SIDEBAR_WIDTH = "multiagent.sidebarWidth.v1";
export const LS_SIDEBAR_FILTER = "multiagent.sessionFilter.v1";
export const SIDEBAR_DEFAULT_WIDTH = 286;

export function sidebarWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(244, Math.min(360, Math.round(value))) : SIDEBAR_DEFAULT_WIDTH;
}

export function loadSidebarWidth(): number {
  try { const raw = localStorage.getItem(LS_SIDEBAR_WIDTH); return raw === null ? SIDEBAR_DEFAULT_WIDTH : sidebarWidth(Number(raw)); }
  catch { return SIDEBAR_DEFAULT_WIDTH; }
}

export function loadSidebarFilter(): SidebarFilter {
  try {
    const value = localStorage.getItem(LS_SIDEBAR_FILTER);
    if (value === "all" || value === "active" || value === "sleeping") return value;
    return localStorage.getItem("multiagent.activeOnly.v1") === "1" ? "active" : "all";
  } catch { return "all"; }
}

export function matchesSidebarFilter(agent: Agent, filter: SidebarFilter): boolean {
  return filter === "all" || (filter === "sleeping" ? isStandbySession(agent) : !isStandbySession(agent) && isAgentRuntimeActive(agent));
}

export function sidebarSessionTime(agent: Agent): number {
  const opened = agent.lastOpenedAt;
  return typeof opened === "number" && Number.isFinite(opened) && opened > 0 ? opened : agent.createdAt;
}

export function sidebarDateGroup(agent: Agent, now: number): SidebarDateGroup {
  if (agent.sidebarPinned) return "pinned";
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today); week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  const timestamp = sidebarSessionTime(agent);
  if (timestamp >= today.getTime()) return "today";
  if (timestamp >= yesterday.getTime()) return "yesterday";
  if (timestamp >= week.getTime()) return "week";
  return "older";
}

export function recentSidebarSessions(agents: Agent[], projects: Project[], folders: ProjectFolder[], options: {
  projectId: string | null; filter: SidebarFilter; query: string; sortByName?: boolean;
}): Agent[] {
  const projectById = new Map(projects.map(project => [project.id, project]));
  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const query = normalizeSessionSearch(options.query);
  return agents.filter(agent => {
    const project = projectById.get(agent.projectId);
    if (agent.sidebarArchived || !project || (options.projectId && agent.projectId !== options.projectId) || !matchesSidebarFilter(agent, options.filter)) return false;
    const folder = project.projectFolderId ? folderById.get(project.projectFolderId) : undefined;
    return !query || matchesSessionSearch(query, agent.name, agent.folder, agent.remoteFolder, project.name, project.folder, project.remoteFolder, folder?.name);
  }).sort((a, b) => Number(!!b.sidebarPinned) - Number(!!a.sidebarPinned)
    || (options.sortByName ? a.name.localeCompare(b.name) : sidebarSessionTime(b) - sidebarSessionTime(a))
    || a.id.localeCompare(b.id));
}

function leafCount(node: LayoutNode): number {
  return node.type === "leaf" ? 1 : node.children.reduce((total, child) => total + leafCount(child), 0);
}

export function sidebarScreens(groups: Group[], agents: Agent[], projects: Project[], activeAgentId: string | null) {
  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  const projectById = new Map(projects.map(project => [project.id, project]));
  return groups.filter(group => group.layout.type === "split" && leafCount(group.layout) > 1).flatMap(group => {
    const members = collectAgentIdsInOrder(group.layout).map(id => agentById.get(id)).filter((agent): agent is Agent => !!agent);
    if (members.length < 2) return [];
    const projectNames = [...new Set(members.map(agent => projectById.get(agent.projectId)?.name).filter(Boolean))];
    return [{ group, members, name: group.name || `${projectNames.join(" + ")} · ${members.map(agent => agent.name).join(" / ")}`,
      targetAgentId: members.find(agent => agent.id === activeAgentId)?.id || members[0].id }];
  });
}
