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
  constructor({ catalog, create, isActive, deliveries = null, messages = null, sessionSettings = null, sessionStart = null, relocation = null, registry = null, sessionState = () => ({}) }) {
    Object.assign(this, { catalog, create, isActive, deliveries, messages, sessionSettings, sessionStart, relocation, registry, sessionState });
    this.queue = Promise.resolve(); this.results = new Map();
  }
  snapshot() {
    const catalog = this.catalog();
    return {
      projects: (catalog.projects || []).map(p => ({ id: p.id, name: p.name, folder: p.folder, local: !p.sshHostId })),
      sessions: (catalog.agents || []).map(a => ({ id: a.id, projectId: a.projectId, folder: a.folder, name: a.name, aiToolId: a.aiToolId, dangerous: a.dangerous === true, active: this.isActive(a.id), ...this.sessionState(a.id), ...(a.sessionHierarchy?.parentId ? { parentSessionId: a.sessionHierarchy.parentId } : {}), ...(a.sessionHierarchy?.createdById ? { createdBySessionId: a.sessionHierarchy.createdById } : {}) })),
      availableTools: (catalog.availableTools || []).map(t => ({ id: t.id, label: t.label })),
    };
  }
  async createTaskSession({ id, ownerId, projectId, folder, name, modelSettings }) {
    const snapshot = this.snapshot();
    const caller = (this.catalog().agents || []).find(a => a.id === ownerId);
    if (!this.isActive(ownerId) || caller?.projectId !== projectId || caller.aiToolId !== 'codex'
      || !snapshot.projects.some(p => p.id === projectId && p.local)
      || !snapshot.availableTools.some(t => t.id === 'codex') || snapshot.sessions.some(s => s.id === id)) throw fail('전용 작업 세션을 생성할 수 없습니다.', 409);
    return this.create({ id, projectId, name, aiToolId: 'codex', dangerous: false, workspaceManaged: true, modelSettings,
      sessionHierarchy: { createdById: ownerId, parentId: ownerId, inheritFolder: false, folderOverride: folder, inheritInstructions: true, inheritModel: false } });
  }
  handle({ action, body = {}, agentId }) {
    if (!this.isActive(agentId)) return Promise.reject(fail('호출한 Acedia 세션이 실행 중이 아닙니다.', 409));
    if (action === 'list') return Promise.resolve(this.snapshot());
    if (action === 'message-send' || action === 'message-receive') return this.messages ? this.messages.handle({ action, agentId, body }) : Promise.reject(fail('Session messages unavailable', 503));
    if (action === 'start') return this.sessionStart ? this.sessionStart.handle(body) : Promise.reject(fail('Session start unavailable', 503));
    if (action === 'session-settings') return this.sessionSettings ? this.sessionSettings.handle(body) : Promise.reject(fail('Session settings unavailable', 503));
    if (action === 'relocate-sessions') return this.relocation ? this.relocation.handle(body) : Promise.reject(fail('Session relocation unavailable', 503));
    if (action === 'organize-sessions' || action === 'stop') {
      if (action === 'stop' && body?.sessionId === agentId) return Promise.reject(fail('호출 중인 자기 세션은 종료할 수 없습니다.', 409));
      return this.registry ? this.registry.handle(action === 'stop' ? 'stop' : 'organize', body) : Promise.reject(fail('Session registry unavailable', 503));
    }
    if (action === 'task') return this.tasks ? this.tasks.handle({ action: body.action, body: body.body, agentId }) : Promise.reject(fail('Task orchestration unavailable', 503));
    if (['send', 'delivery'].includes(action)) return this.deliveries ? this.deliveries.handle({ action, agentId, body }) : Promise.reject(fail('Session delivery unavailable', 503));
    if (!['create-project', 'create-session'].includes(action)) return Promise.reject(fail('지원하지 않는 작업입니다.', 404));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Promise.reject(fail('JSON 객체가 필요합니다.'));
    const next = this.queue.catch(() => {}).then(() => this.createItem(action, body, agentId));
    this.queue = next; return next;
  }
  async createItem(action, body, agentId) {
    if (!this.isActive(agentId)) throw fail('호출한 Acedia 세션이 종료되었습니다.', 409);
    const allowed = action === 'create-project' ? ['folder', 'name', 'aiToolId', 'start'] : ['projectId', 'name', 'aiToolId', 'requestKey', 'parentSessionId', 'folder', 'start'];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw fail('지원하지 않는 생성 옵션입니다.');
    if (Object.entries(body).some(([key, value]) => key === 'start' ? typeof value !== 'boolean' : key === 'parentSessionId' ? value !== null && typeof value !== 'string' : typeof value !== 'string')) throw fail('생성 옵션의 자료형을 확인하세요.');
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
    let folder;
    if (action === 'create-session' && Object.hasOwn(body, 'folder')) {
      const raw = string(body.folder);
      if (!raw || !path.isAbsolute(raw) || raw.length > 4096 || /[\x00-\x1f]/.test(raw)) throw fail('기존 작업 폴더의 절대 경로가 필요합니다.');
      try { folder = fs.realpathSync(raw); if (!fs.statSync(folder).isDirectory()) throw Error(); }
      catch { throw fail('작업 폴더를 찾거나 열 수 없습니다.', 404); }
    }
    const caller = (this.catalog().agents || []).find(a => a.id === agentId);
    const explicitParent = Object.hasOwn(body, 'parentSessionId');
    if (explicitParent && body.parentSessionId !== null && (!string(body.parentSessionId) || body.parentSessionId.length > 128 || /[\x00-\x1f]/.test(body.parentSessionId))) throw fail('부모 sessionId 또는 null을 지정하세요.');
    const parentId = action === 'create-session' ? explicitParent ? body.parentSessionId : caller?.projectId === projectId ? agentId : undefined : undefined;
    const parent = parentId ? (this.catalog().agents || []).find(a => a.id === parentId) : null;
    if (parentId && (!parent || parent.projectId !== projectId || parent.sshHostId)) throw fail('부모는 같은 로컬 프로젝트에 등록된 세션이어야 합니다.', 409);
    const signature = JSON.stringify({ action, projectId: action === 'create-session' ? projectId : null, name, aiToolId, parentId: parentId || null, folder: folder || null, start: body.start !== false });
    const previous = this.results.get(key);
    if (previous) {
      if (action === 'create-session' && signature !== previous.signature) throw fail('같은 requestKey에 다른 생성 옵션을 사용할 수 없습니다.', 409);
      const result = await previous.promise;
      return { ...result, created: false, active: this.isActive(result.sessionId) };
    }
    if (!this.snapshot().availableTools.some(t => t.id === aiToolId) || aiToolId === 'none') throw fail('사용 가능한 AI 도구를 선택하세요.', 409);
    // Retain an uncertain/failed acknowledgement too: retrying a timeout must
    // not silently create a second session. The list operation can reconcile it.
    const promise = Promise.resolve().then(() => this.create({ projectId, ...(project ? { project } : {}), name: project ? 'Session 1' : name || 'New session', aiToolId, dangerous: false, workspaceManaged: true, start: body.start !== false,
      sessionHierarchy: { createdById: agentId, ...(parentId ? { parentId, inheritFolder: true, inheritInstructions: true, inheritModel: parent.aiToolId === aiToolId } : {}), ...(folder ? { inheritFolder: false, folderOverride: folder } : {}) },
    }))
      .then(result => ({ created: true, projectId, sessionId: result.id, active: this.isActive(result.id), ...(result.startError ? { startError: result.startError } : {}) }));
    this.results.set(key, { signature, promise });
    if (this.results.size > 200) this.results.delete(this.results.keys().next().value);
    return promise;
  }
}
