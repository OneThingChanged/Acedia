import { randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const id = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 128 && !/[\x00-\x1f]/.test(value);
const parent = value => value === null || id(value);

/** A coordinator-owned, acknowledged registry transaction; never activates a window. */
export class SessionRegistry {
  constructor({ catalog, active, writable = () => true, lock = () => {}, unlock = () => {}, dispatch, verifySaved, timeoutMs = 15000 }) {
    Object.assign(this, { catalog, active, writable, lock, unlock, dispatch, verifySaved, timeoutMs });
    this.pending = null;
  }
  check(operation, body) {
    const catalog = this.catalog(), agents = new Map((catalog.agents || []).map(a => [a.id, a]));
    const local = sessionId => {
      const agent = agents.get(sessionId), project = (catalog.projects || []).find(p => p.id === agent?.projectId);
      if (!agent || !project) throw fail('세션 또는 프로젝트를 찾을 수 없습니다.', 404);
      if (agent.sshHostId || project.sshHostId || !this.writable(sessionId)) throw fail('기본 작업창에서 관리하는 로컬 세션을 선택하세요. 다른 변경 작업이 진행 중인지 확인하세요.', 409);
      return agent;
    };
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('JSON 객체가 필요합니다.');
    if (operation === 'stop') {
      if (Object.keys(body).some(k => k !== 'sessionId') || !id(body.sessionId)) throw fail('종료할 기존 sessionId를 정확히 지정하세요.');
      local(body.sessionId);
      return { sessionId: body.sessionId };
    }
    if (operation !== 'organize' || Object.keys(body).some(k => k !== 'changes') || !Array.isArray(body.changes) || !body.changes.length || body.changes.length > 20) throw fail('changes에 1~20개 세션의 이름 또는 부모 변경을 지정하세요.');
    const seen = new Set(), parents = new Map([...agents.values()].map(a => [a.id, a.sessionHierarchy?.parentId || null]));
    const changes = body.changes.map(change => {
      if (!change || typeof change !== 'object' || Array.isArray(change) || !id(change.sessionId)
        || Object.keys(change).some(k => !['sessionId', 'name', 'expectedName', 'parentSessionId', 'expectedParentSessionId'].includes(k))
        || (!own(change, 'name') && !own(change, 'parentSessionId')) || seen.has(change.sessionId)) throw fail('중복 없이 세션 ID와 변경할 이름 또는 부모를 지정하세요.');
      seen.add(change.sessionId);
      const agent = local(change.sessionId), next = { ...change };
      if (own(change, 'name')) {
        if (typeof change.name !== 'string' || !change.name.trim() || change.name.trim().length > 120 || /[\x00-\x1f]/.test(change.name)
          || typeof change.expectedName !== 'string' || change.expectedName.length > 120) throw fail('name과 조회한 expectedName을 120자 이내로 지정하세요.');
        next.name = change.name.trim();
        if (agent.name !== change.expectedName && agent.name !== next.name) throw fail('세션 이름이 변경되었습니다. acedia_projects를 다시 조회하세요.', 409);
      } else if (own(change, 'expectedName')) throw fail('expectedName에는 변경할 name도 필요합니다.');
      if (own(change, 'parentSessionId')) {
        if (!parent(change.parentSessionId) || !parent(change.expectedParentSessionId)) throw fail('부모 ID와 조회한 expectedParentSessionId를 지정하세요. 부모가 없으면 null을 사용하세요.');
        const current = agent.sessionHierarchy?.parentId || null;
        if (current !== change.expectedParentSessionId && current !== change.parentSessionId) throw fail('부모 연결이 변경되었습니다. acedia_projects를 다시 조회하세요.', 409);
        if (change.parentSessionId !== null) {
          const target = local(change.parentSessionId);
          if (target.projectId !== agent.projectId) throw fail('부모와 자식은 같은 프로젝트여야 합니다.', 409);
        }
        parents.set(agent.id, change.parentSessionId);
      } else if (own(change, 'expectedParentSessionId')) throw fail('expectedParentSessionId에는 변경할 parentSessionId도 필요합니다.');
      return next;
    });
    // Validate the final graph, allowing an atomic manager/child reorganization.
    for (const change of changes) {
      const visited = new Set(); let current = change.sessionId;
      while (current) {
        if (visited.has(current)) throw fail('자기 자신 또는 자손을 부모로 지정할 수 없습니다.', 409);
        visited.add(current); current = parents.get(current);
      }
    }
    return { changes };
  }
  handle(operation, body) {
    try {
      if (this.pending) throw fail('세션 변경을 저장 중입니다.', 409);
      const checked = this.check(operation, body), requestId = randomUUID();
      const ids = [...new Set(operation === 'stop' ? [checked.sessionId] : checked.changes.flatMap(c => [c.sessionId, c.parentSessionId].filter(Boolean)))];
      const id = operation === 'stop' ? checked.sessionId : checked.changes[0].sessionId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.reject(fail('세션 변경 응답 시간이 초과되었습니다. 목록을 다시 조회하세요.', 504)), this.timeoutMs);
        this.pending = { requestId, id, operation, body: checked, ids, resolve, reject, timer };
        try {
          this.lock(ids);
          if (this.dispatch({ requestId, id, operation }) === false) this.reject(fail('기본 작업창이 준비되지 않았습니다.', 503));
        } catch (error) { this.reject(error); }
      });
    } catch (error) { return Promise.reject(error); }
  }
  validate({ requestId, id }) {
    const pending = this.pending;
    if (!pending || pending.requestId !== requestId || pending.id !== id) throw fail('만료된 세션 변경 요청입니다.', 409);
    return { operation: pending.operation, ...this.check(pending.operation, pending.body) };
  }
  release() {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer); this.pending = null; this.unlock(pending.ids);
    return pending;
  }
  reject(error) { const pending = this.release(); pending?.reject(error); return !!pending; }
  async complete(result) {
    const pending = this.pending;
    if (!pending || pending.requestId !== result.requestId || pending.id !== result.id || pending.completing) return false;
    pending.completing = true;
    if (!result.ok) return this.reject(fail(result.error || '세션 변경에 실패했습니다.', result.statusCode || 409));
    try {
      const saved = await this.verifySaved(pending.operation, pending.body);
      if (this.pending !== pending) return false;
      if (pending.operation === 'stop' && this.active(pending.id)) throw fail('세션 프로세스 종료를 확인하지 못했습니다.', 409);
      this.release(); pending.resolve({ saved: true, background: true, ...saved });
      return true;
    } catch (error) { return this.pending === pending ? this.reject(error) : false; }
  }
  close() { this.reject(fail('앱이 종료되었습니다. 세션 목록을 다시 조회하세요.', 503)); }
}
