import type { Agent, Group, Project } from '../types';
import { collectAgentIds } from './layout';
import { resolveSessionSettings } from './sessionHierarchy';

export type SessionMove = { sessionId: string; projectId: string; folder: string; expectedProjectId: string; expectedFolder: string };
const pathKey = (value: string) => {
  const normalized = value.replace(/\\/g, '/').replace(/\/$/, '');
  return /^(?:[A-Za-z]:|\/\/)/.test(normalized) ? normalized.toLowerCase() : normalized;
};
const conflict = (message: string) => { throw Object.assign(new Error(message), { statusCode: 409 }); };

export function relocateSessionRegistry(agents: Agent[], projects: Project[], groups: Group[], moves: SessionMove[]) {
  const byId = new Map(moves.map(move => [move.sessionId, move]));
  const before = new Map(agents.map(agent => [agent.id, resolveSessionSettings(agent, agents, projects)]));
  for (const move of moves) {
    const agent = agents.find(a => a.id === move.sessionId), project = projects.find(p => p.id === move.projectId);
    if (!agent || !project) conflict('세션 또는 프로젝트를 찾을 수 없습니다.');
    if (agent!.sshHostId || project!.sshHostId) conflict('로컬 세션과 프로젝트를 선택하세요.');
    const desired = agent!.projectId === move.projectId && pathKey(agent!.folder) === pathKey(move.folder);
    if (!desired && (agent!.projectId !== move.expectedProjectId || pathKey(agent!.folder) !== pathKey(move.expectedFolder))) conflict('세션 등록 정보가 변경되었습니다. 다시 조회하세요.');
  }
  const next = agents.map(agent => {
    const move = byId.get(agent.id);
    if (!move) return agent;
    const conversations = new Set([agent.idleResumeSessionId, agent.lastSessionId, ...groups.map(g => g.sessionPins?.[agent.id])].filter((id): id is string => !!id));
    if (conversations.size > 1) conflict('서로 다른 대화가 고정된 세션입니다. 세션 고정을 확인한 뒤 이동하세요.');
    const sessionId = [...conversations][0];
    const resumeContext = agent.sessionHierarchy?.resumeContext;
    return { ...agent, projectId: move.projectId, folder: move.folder, deferredStart: true, status: 'idle' as const, runtimeStatus: 'idle' as const,
      sessionHierarchy: { ...agent.sessionHierarchy, inheritFolder: false, folderOverride: move.folder,
        ...(sessionId && (!resumeContext || resumeContext.sessionId !== sessionId)
          ? { resumeContext: { sessionId, folder: agent.folder } } : {}),
      } };
  });
  for (const agent of next) {
    const parent = next.find(a => a.id === agent.sessionHierarchy?.parentId);
    if (parent && parent.projectId !== agent.projectId && (byId.has(agent.id) || byId.has(parent.id))) conflict('부모·자식 세션은 같은 프로젝트로 함께 이동하세요.');
    if (!byId.has(agent.id) && before.get(agent.id)?.folder !== resolveSessionSettings(agent, next, projects).folder) conflict('폴더를 상속하는 하위 세션도 이동 목록에 포함하세요.');
  }
  const nextById = new Map(next.map(a => [a.id, a]));
  const nextGroups = groups.map(group => {
    const ids = [...collectAgentIds(group.layout)];
    if (!ids.some(id => byId.has(id)) || !ids.every(id => nextById.has(id))) return group;
    const projects = new Set(ids.map(id => nextById.get(id)!.projectId));
    return projects.size === 1 ? { ...group, projectId: [...projects][0] } : group;
  });
  return { agents: next, groups: nextGroups };
}
