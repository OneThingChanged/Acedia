import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const string = value => typeof value === 'string' ? value.trim() : '';
const folderKey = value => {
  if (typeof value !== 'string' || !value) return '';
  try { value = fs.realpathSync(value); } catch { value = path.resolve(value); }
  return process.platform === 'win32' ? value.toLowerCase() : value;
};

/** Authenticated local MCP operations. Creation is acknowledged by the same
 * coordinator that owns the UI, after persistence and the first launch attempt.
 */
export class WorkspaceManagement {
  constructor({ catalog, create, isActive }) {
    Object.assign(this, { catalog, create, isActive });
    this.queue = Promise.resolve(); this.results = new Map();
  }
  snapshot() {
    const catalog = this.catalog();
    return {
      projects: (catalog.projects || []).map(p => ({ id: p.id, name: p.name, folder: p.folder, local: !p.sshHostId })),
      sessions: (catalog.agents || []).map(a => ({ id: a.id, projectId: a.projectId, name: a.name, aiToolId: a.aiToolId, active: this.isActive(a.id), ...(a.sessionHierarchy?.parentId ? { parentSessionId: a.sessionHierarchy.parentId } : {}), ...(a.sessionHierarchy?.createdById ? { createdBySessionId: a.sessionHierarchy.createdById } : {}) })),
      availableTools: (catalog.availableTools || []).map(t => ({ id: t.id, label: t.label })),
    };
  }
  handle({ action, body = {}, agentId }) {
    if (!this.isActive(agentId)) return Promise.reject(fail('호출한 Acedia 세션이 실행 중이 아닙니다.', 409));
    if (action === 'list') return Promise.resolve(this.snapshot());
    if (!['create-project', 'create-session'].includes(action)) return Promise.reject(fail('지원하지 않는 작업입니다.', 404));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Promise.reject(fail('JSON 객체가 필요합니다.'));
    const next = this.queue.catch(() => {}).then(() => this.createItem(action, body, agentId));
    this.queue = next; return next;
  }
  async createItem(action, body, agentId) {
    if (!this.isActive(agentId)) throw fail('호출한 Acedia 세션이 종료되었습니다.', 409);
    const allowed = action === 'create-project' ? ['folder', 'name', 'aiToolId'] : ['projectId', 'name', 'aiToolId', 'requestKey'];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw fail('지원하지 않는 생성 옵션입니다.');
    if (Object.values(body).some(value => typeof value !== 'string')) throw fail('생성 옵션은 문자열로 입력하세요.');
    const aiToolId = string(body.aiToolId) || 'codex';
    const name = string(body.name);
    if (name.length > 120 || /[\x00-\x1f]/.test(name)) throw fail('이름은 제어 문자 없이 120자 이내로 입력하세요.');
    let projectId, project, key;
    if (action === 'create-project') {
      const raw = string(body.folder);
      if (!raw || !path.isAbsolute(raw) || raw.length > 4096 || /[\x00-\x1f]/.test(raw)) throw fail('기존 로컬 폴더의 절대 경로가 필요합니다.');
      let folder;
      try { folder = fs.realpathSync(raw); if (!fs.statSync(folder).isDirectory()) throw new Error(); }
      catch { throw fail('프로젝트 폴더를 찾거나 열 수 없습니다.', 404); }
      const existing = this.snapshot().projects.find(p => p.local && folderKey(p.folder) === folderKey(folder));
      if (existing) {
        const sessionId = this.snapshot().sessions.find(s => s.projectId === existing.id)?.id || null;
        return { created: false, projectId: existing.id, sessionId, active: Boolean(sessionId && this.isActive(sessionId)) };
      }
      key = 'folder:' + folderKey(folder);
      projectId = randomUUID(); project = { name: name || path.basename(folder), folder };
    } else {
      projectId = string(body.projectId);
      const existing = this.snapshot().projects.find(p => p.id === projectId);
      if (!existing) throw fail('프로젝트를 찾을 수 없습니다. acedia_projects에서 프로젝트 ID를 확인하세요.', 404);
      if (!existing.local) throw fail('로컬 프로젝트에서 세션을 생성하세요.');
      const requestKey = string(body.requestKey);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(requestKey)) throw fail('중복 생성을 방지할 requestKey가 필요합니다.');
      key = 'session:' + agentId + ':' + requestKey;
    }
    const signature = JSON.stringify({ action, projectId: action === 'create-session' ? projectId : null, name, aiToolId });
    const previous = this.results.get(key);
    if (previous) {
      if (action === 'create-session' && signature !== previous.signature) throw fail('같은 requestKey에 다른 생성 옵션을 사용할 수 없습니다.', 409);
      const result = await previous.promise;
      return { ...result, created: false, active: this.isActive(result.sessionId) };
    }
    if (!this.snapshot().availableTools.some(t => t.id === aiToolId) || aiToolId === 'none') throw fail('사용 가능한 AI 도구를 선택하세요.', 409);
    // Retain an uncertain/failed acknowledgement too: retrying a timeout must
    // not silently create a second session. The list operation can reconcile it.
    const caller = (this.catalog().agents || []).find(a => a.id === agentId);
    const parentId = action === 'create-session' && caller?.projectId === projectId ? agentId : undefined;
    const promise = Promise.resolve().then(() => this.create({ projectId, ...(project ? { project } : {}), name: project ? 'Session 1' : name || 'New session', aiToolId, dangerous: false, workspaceManaged: true,
      sessionHierarchy: { createdById: agentId, ...(parentId ? { parentId, inheritFolder: true, inheritInstructions: true, inheritModel: caller.aiToolId === aiToolId } : {}) },
    }))
      .then(result => ({ created: true, projectId, sessionId: result.id, active: this.isActive(result.id), ...(result.startError ? { startError: result.startError } : {}) }));
    this.results.set(key, { signature, promise });
    if (this.results.size > 200) this.results.delete(this.results.keys().next().value);
    return promise;
  }
}
