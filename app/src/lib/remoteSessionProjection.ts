import type { Agent } from '../types';

function navigation(agent: Agent) {
  return {
    projectId: agent.projectId,
    sidebarArchived: agent.sidebarArchived,
    sidebarShowInactiveChildren: agent.sidebarShowInactiveChildren,
    // Explicit null clears an old parent when the two snapshots arrive apart.
    // Instructions and creation provenance are not navigation metadata.
    sessionHierarchy: agent.sessionHierarchy?.parentId ? { parentId: agent.sessionHierarchy.parentId } : null,
  };
}

export function remoteAgentStatus(agent: Agent, projectNames: ReadonlyMap<string, string>) {
  return {
    id: agent.id, name: agent.name, project: projectNames.get(agent.projectId) ?? '',
    status: agent.status, runtimeStatus: agent.runtimeStatus,
    deferredStart: agent.deferredStart, resumeEligible: agent.resumeEligible,
    tool: agent.aiToolId, ...navigation(agent),
  };
}

export function remoteAgentView(agent: Agent) {
  return {
    id: agent.id, name: agent.name, folder: agent.folder,
    status: agent.status, runtimeStatus: agent.runtimeStatus,
    deferredStart: agent.deferredStart, resumeEligible: agent.resumeEligible,
    aiToolId: agent.aiToolId, dangerous: agent.dangerous,
    modelSettings: agent.modelSettings, sshHostId: agent.sshHostId,
    ...navigation(agent),
  };
}
