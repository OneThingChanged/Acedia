import type { Agent, Project } from '../types';
import { canParentSession, resolveSessionSettings } from './sessionHierarchy';

export type SessionOrganizationChange = {
  sessionId: string;
  name?: string;
  expectedName?: string;
  parentSessionId?: string | null;
  expectedParentSessionId?: string | null;
};
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const conflict = (message: string): never => { throw Object.assign(new Error(message), { statusCode: 409 }); };

/** Change reporting lines, preserving the effective launch context of every session. */
export function organizeSessionRegistry(agents: Agent[], projects: Project[], changes: SessionOrganizationChange[]): Agent[] {
  const byId = new Map(changes.map(c => [c.sessionId, c]));
  if (byId.size !== changes.length) conflict('세션을 중복 지정할 수 없습니다.');
  for (const change of changes) {
    const agent = agents.find(a => a.id === change.sessionId);
    if (!agent) return conflict('세션을 찾을 수 없습니다.');
    if (own(change, 'name') && agent.name !== change.expectedName && agent.name !== change.name) conflict('세션 이름이 변경되었습니다. 다시 조회하세요.');
    const current = agent.sessionHierarchy?.parentId || null;
    if (own(change, 'parentSessionId') && current !== change.expectedParentSessionId && current !== change.parentSessionId) conflict('부모 연결이 변경되었습니다. 다시 조회하세요.');
  }
  const next = agents.map(agent => {
    const change = byId.get(agent.id);
    if (!change) return agent;
    let updated = { ...agent, ...(own(change, 'name') ? { name: change.name! } : {}) };
    if (own(change, 'parentSessionId') && (agent.sessionHierarchy?.parentId || null) !== change.parentSessionId) {
      const settings = resolveSessionSettings(agent, agents, projects);
      const instructions = resolveSessionSettings(agent, agents).instructions;
      if (instructions.length > 20000) conflict('상속된 지침이 너무 깁니다. 지침을 정리한 뒤 부모를 변경하세요.');
      updated = { ...updated, folder: settings.folder, remoteFolder: settings.remoteFolder, modelSettings: settings.modelSettings,
        sessionHierarchy: { ...agent.sessionHierarchy, parentId: change.parentSessionId || undefined,
          inheritFolder: false, folderOverride: agent.sshHostId ? settings.remoteFolder : settings.folder,
          inheritInstructions: false, instructions: instructions || undefined, inheritModel: false } };
    }
    return updated;
  });
  for (const change of changes) {
    const agent = next.find(a => a.id === change.sessionId)!;
    if (!canParentSession(next, agent.id, agent.sessionHierarchy?.parentId)) conflict('부모는 같은 프로젝트의 세션이어야 하며 순환 관계를 만들 수 없습니다.');
  }
  return next;
}
