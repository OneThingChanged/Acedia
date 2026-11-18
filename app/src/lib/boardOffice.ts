import { toolForId, type Agent, type AgentWorkStatus, type Project } from '../types';
import type { BoardSnapshot } from './workBoard';

/** Read-only office actors from the same host snapshot as the session tables.
 * These are presentation values, never launch configuration or runtime owners. */
export function boardOfficeData(snapshot: BoardSnapshot, sampledAt: number, connected: boolean) {
  const projects: Project[] = snapshot.projects.map(p => ({ ...p, createdAt: 0 }));
  const byProject = new Map(projects.map(p => [p.id, p]));
  const agents: Agent[] = snapshot.sessions.map(s => {
    const workStatus: AgentWorkStatus = s.state === 'waiting' ? 'waiting'
      : s.state === 'failed' || s.state === 'interrupted' || s.state === 'unknown' ? 'blocked'
      : s.state === 'background' || s.state === 'waiting_external' || s.delegatedWait?.count ? 'background'
      : s.state === 'working' ? 'working'
      : ['review', 'responded', 'completed'].includes(s.state) ? 'done' : 'idle';
    const running = s.runtime === 'running';
    return {
      id: s.id, name: s.name, projectId: s.projectId, folder: s.folder, aiToolId: s.provider,
      aiLabel: toolForId(s.provider).label, dangerous: false, createdAt: 0,
      runtimeStatus: !connected ? 'unreachable' : running ? 'running' : 'idle',
      status: !connected ? 'unreachable' : running ? workStatus === 'done' || workStatus === 'idle' ? 'running' : workStatus : 'idle',
      deferredStart: !running, resumeEligible: s.runtime === 'sleeping',
      ...(byProject.get(s.projectId)?.sshHostId ? { sshHostId: byProject.get(s.projectId)!.sshHostId, remoteFolder: s.folder } : {}),
      modelSettings: s.model || undefined,
      sessionHierarchy: { ...(s.parentId ? { parentId: s.parentId } : {}), inheritFolder: false, inheritModel: false },
      activity: { workStatus, source: 'process', receivedAt: sampledAt, stateStartedAt: s.startedAt || s.updatedAt,
        lastPrompt: s.summary, ...(workStatus === 'waiting' ? { interactiveQuestion: s.reason || s.summary } : {}) },
    };
  });
  return { agents, projects };
}
