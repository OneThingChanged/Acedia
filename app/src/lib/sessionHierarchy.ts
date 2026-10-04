import type { Agent, Project, SessionHierarchy } from "../types";

export function normalizeSessionHierarchy(value: unknown): SessionHierarchy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const result: SessionHierarchy = {};
  const resume = raw.resumeContext;
  if (resume && typeof resume === "object" && !Array.isArray(resume)) {
    const context = resume as Record<string, unknown>;
    if (typeof context.sessionId === "string" && context.sessionId.trim() && context.sessionId.length <= 128 &&
        typeof context.folder === "string" && context.folder.trim() && context.folder.length <= 4096 &&
        !/[\x00-\x1f]/.test(context.sessionId + context.folder)) {
      result.resumeContext = { sessionId: context.sessionId.trim(), folder: context.folder.trim() };
    }
  }
  for (const key of ["parentId", "createdById", "folderOverride", "instructions"] as const) {
    if (typeof raw[key] === "string" && raw[key].trim()) {
      result[key] = raw[key].trim().slice(0, key === "instructions" ? 20000 : key === "folderOverride" ? 4096 : 128);
    }
  }
  for (const key of ["inheritFolder", "inheritInstructions", "inheritModel"] as const) {
    if (typeof raw[key] === "boolean") result[key] = raw[key];
  }
  if (result.folderOverride && result.inheritFolder === undefined) result.inheritFolder = false;
  return Object.keys(result).length ? result : undefined;
}

export function canParentSession(agents: readonly Agent[], childId: string, parentId: string | undefined): boolean {
  const child = agents.find((agent) => agent.id === childId);
  if (!child) return false;
  if (!parentId) return true;
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const parent = byId.get(parentId);
  if (!parent || parent.projectId !== child.projectId) return false;
  const visited = new Set([childId]);
  let current: Agent | undefined = parent;
  while (current) {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    current = current.sessionHierarchy?.parentId ? byId.get(current.sessionHierarchy.parentId) : undefined;
  }
  return true;
}

export function repairSessionHierarchy(agents: Agent[]): Agent[] {
  return agents.map((agent) => {
    const hierarchy = normalizeSessionHierarchy(agent.sessionHierarchy);
    if (hierarchy?.parentId && !canParentSession(agents, agent.id, hierarchy.parentId)) {
      delete hierarchy.parentId;
      // Keep the last working folder instead of reverting a repaired orphan.
      hierarchy.inheritFolder = false;
      hierarchy.folderOverride ??= agent.remoteFolder || agent.folder;
      hierarchy.inheritModel = false;
    }
    return JSON.stringify(hierarchy) === JSON.stringify(agent.sessionHierarchy) ? agent : { ...agent, sessionHierarchy: hierarchy };
  });
}

export type ResolvedSessionSettings = {
  folder: string;
  remoteFolder?: string;
  modelSettings: Agent["modelSettings"];
  instructions: string;
};

export function resolveSessionSettings(agent: Agent, agents: readonly Agent[], projects: readonly Project[] = []): ResolvedSessionSettings {
  const byId = new Map(agents.map((item) => [item.id, item]));
  const visited = new Set<string>();
  function resolve(current: Agent): ResolvedSessionSettings {
    const hierarchy = normalizeSessionHierarchy(current.sessionHierarchy);
    const project = projects.find((item) => item.id === current.projectId);
    const localFolder = (!current.sshHostId && hierarchy?.folderOverride) || current.folder || project?.folder || "";
    const remoteFolder = hierarchy?.folderOverride || current.remoteFolder || project?.remoteFolder;
    const base: ResolvedSessionSettings = { folder: localFolder, remoteFolder, modelSettings: current.modelSettings, instructions: hierarchy?.instructions || "" };
    if (visited.has(current.id)) return base;
    visited.add(current.id);
    const parent = hierarchy?.parentId ? byId.get(hierarchy.parentId) : undefined;
    if (!parent || parent.projectId !== current.projectId || visited.has(parent.id)) return base;
    const inherited = resolve(parent);
    if (hierarchy?.inheritFolder !== false) {
      base.folder = inherited.folder;
      base.remoteFolder = inherited.remoteFolder;
    }
    if (hierarchy?.inheritInstructions !== false) base.instructions = [inherited.instructions, base.instructions].filter(Boolean).join("\n\n");
    if (hierarchy?.inheritModel === true && parent.aiToolId === current.aiToolId && !current.sshHostId) base.modelSettings = inherited.modelSettings;
    return base;
  }
  return resolve(agent);
}

export function removeSessionFromHierarchy(agents: Agent[], removedId: string, projects: readonly Project[] = []): Agent[] {
  const removed = agents.find((agent) => agent.id === removedId);
  return agents.filter((agent) => agent.id !== removedId).map((agent) => {
    if (agent.sessionHierarchy?.parentId !== removedId) return agent;
    const settings = resolveSessionSettings(agent, agents, projects);
    return {
      ...agent,
      modelSettings: settings.modelSettings,
      sessionHierarchy: {
        ...agent.sessionHierarchy,
        parentId: removed?.sessionHierarchy?.parentId,
        inheritFolder: false,
        folderOverride: agent.sshHostId ? settings.remoteFolder : settings.folder,
        inheritInstructions: false,
        instructions: settings.instructions || undefined,
        inheritModel: false,
      },
    };
  });
}

export type OrganizationNode = { agent: Agent; x: number; y: number; children: string[] };
export function withSessionModelOverride(agent: Agent, modelSettings: Agent["modelSettings"]): Agent {
  return { ...agent, modelSettings, ...(agent.sessionHierarchy ? { sessionHierarchy: { ...agent.sessionHierarchy, inheritModel: false } } : {}) };
}

export function layoutSessionHierarchy(inputAgents: readonly Agent[], collapsed: ReadonlySet<string>) {
  const agents = repairSessionHierarchy([...inputAgents]);
  const validIds = new Set(agents.map((agent) => agent.id));
  const children = (id: string) => collapsed.has(id) ? [] : agents.filter((agent) => agent.sessionHierarchy?.parentId === id);
  const roots = agents.filter((agent) => !agent.sessionHierarchy?.parentId || !validIds.has(agent.sessionHierarchy.parentId));
  const count = (agent: Agent): number => Math.max(1, children(agent.id).reduce((sum, child) => sum + count(child), 0));
  const leafCount = roots.reduce((sum, agent) => sum + count(agent), 0);
  const width = Math.max(620, leafCount * 286 + 40);
  const nodes: OrganizationNode[] = [];
  let deepest = 0;
  function place(agent: Agent, left: number, depth: number) {
    deepest = Math.max(deepest, depth);
    const descendants = children(agent.id);
    nodes.push({ agent, x: left + count(agent) * 143 - 130, y: 148 + depth * 210, children: descendants.map((child) => child.id) });
    let cursor = left;
    descendants.forEach((child) => { place(child, cursor, depth + 1); cursor += count(child) * 286; });
  }
  let cursor = (width - leafCount * 286) / 2;
  roots.forEach((agent) => { place(agent, cursor, 0); cursor += count(agent) * 286; });
  return { nodes, width, height: 148 + deepest * 210 + 200 };
}
