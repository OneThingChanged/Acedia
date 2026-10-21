import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const validId = value => typeof value === 'string' && value.trim() && value.length <= 256 && !/[\x00-\x1f]/.test(value);

// One acknowledged registry transaction; physical directories are never moved.
export class SessionRelocation {
  constructor({ catalog, active, writable = () => true, lock = () => {}, unlock = () => {}, dispatch, verifySaved, timeoutMs = 15000 }) {
    Object.assign(this, { catalog, active, writable, lock, unlock, dispatch, verifySaved, timeoutMs });
    this.pending = null;
  }
  check(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'moves')
      || !Array.isArray(body.moves) || !body.moves.length || body.moves.length > 20) throw fail('moves에 1~20개 세션을 지정하세요.');
    const catalog = this.catalog(), seen = new Set();
    const moves = body.moves.map(move => {
      if (!move || typeof move !== 'object' || Array.isArray(move)
        || Object.keys(move).some(k => !['sessionId', 'projectId', 'folder', 'expectedProjectId', 'expectedFolder'].includes(k))
        || ![move.sessionId, move.projectId, move.expectedProjectId].every(validId)
        || ![move.folder, move.expectedFolder].every(p => typeof p === 'string' && p.length <= 4096 && !/[\x00-\x1f]/.test(p) && path.isAbsolute(p))) throw fail('세션·프로젝트 ID와 절대 경로, 기존 등록 값을 정확히 지정하세요.');
      if (seen.has(move.sessionId)) throw fail('한 세션을 중복 지정할 수 없습니다.');
      seen.add(move.sessionId);
      const agent = (catalog.agents || []).find(a => a.id === move.sessionId);
      const project = (catalog.projects || []).find(p => p.id === move.projectId);
      const originalProject = (catalog.projects || []).find(p => p.id === agent?.projectId);
      if (!agent || !project || !originalProject) throw fail('세션 또는 프로젝트를 찾을 수 없습니다.', 404);
      if (agent.sshHostId || project.sshHostId || originalProject.sshHostId) throw fail('로컬 세션과 로컬 프로젝트를 선택하세요.', 409);
      if (this.active(agent.id) || ['starting', 'recovering'].includes(agent.status) || ['starting', 'recovering'].includes(agent.runtimeStatus)) throw fail('대상 세션을 비활성화한 뒤 이동하세요. 앱은 종료하지 않아도 됩니다.', 409);
      if (!this.writable(agent.id)) throw fail('다른 창 또는 진행 중인 작업에서 사용하는 세션입니다. 작업 종료와 창 소유권을 확인하세요.', 409);
      let folder;
      try { folder = fs.realpathSync(move.folder); if (!fs.statSync(folder).isDirectory()) throw Error(); }
      catch { throw fail('옮길 작업 폴더가 존재하지 않거나 열 수 없습니다.', 404); }
      const desired = agent.projectId === move.projectId && key(agent.folder) === key(folder);
      if (!desired && (agent.projectId !== move.expectedProjectId || key(agent.folder) !== key(move.expectedFolder))) throw fail('세션 등록 정보가 변경되었습니다. acedia_projects를 다시 조회하세요.', 409);
      return { ...move, folder };
    });
    const targets = new Map(moves.map(m => [m.sessionId, m.projectId]));
    for (const agent of catalog.agents || []) {
      const parent = (catalog.agents || []).find(a => a.id === agent.sessionHierarchy?.parentId);
      if (parent && (targets.has(agent.id) || targets.has(parent.id))
        && (targets.get(agent.id) || agent.projectId) !== (targets.get(parent.id) || parent.projectId)) throw fail('부모·자식 세션은 같은 프로젝트로 함께 이동하거나 조직도에서 관계를 먼저 해제하세요.', 409);
    }
    return moves;
  }
  handle(body) {
    try {
      if (this.pending) throw fail('세션 등록 변경을 저장 중입니다.', 409);
      const moves = this.check(body), requestId = randomUUID(), id = moves[0].sessionId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.reject(fail('세션 이동 응답 시간이 초과되었습니다. 등록 상태를 다시 조회하세요.', 504)), this.timeoutMs);
        this.pending = { requestId, id, moves, resolve, reject, timer };
        try {
          this.lock(moves);
          if (this.dispatch({ requestId, id, moves }) === false) this.reject(fail('등록 정보를 저장할 작업창이 준비되지 않았습니다.', 503));
        } catch (error) { this.reject(error); }
      });
    } catch (error) { return Promise.reject(error); }
  }
  validate({ requestId, id }) {
    const pending = this.pending;
    if (!pending || pending.requestId !== requestId || pending.id !== id) throw fail('만료된 세션 이동 요청입니다. 다시 조회하세요.', 409);
    return this.check({ moves: pending.moves });
  }
  release() {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer); this.pending = null; this.unlock(pending.moves);
    return pending;
  }
  reject(error) { const pending = this.release(); pending?.reject(error); return !!pending; }
  async complete(result) {
    const pending = this.pending;
    if (!pending || pending.requestId !== result.requestId || pending.id !== result.id || pending.completing) return false;
    pending.completing = true;
    if (!result.ok) return this.reject(fail(result.error || '세션 이동을 저장하지 못했습니다.', result.statusCode || 409));
    try {
      await this.verifySaved(pending.moves);
      if (this.pending !== pending) return false;
      this.release(); pending.resolve({ saved: true, active: false, moves: pending.moves.map(({ sessionId, projectId, folder }) => ({ sessionId, projectId, folder })) });
      return true;
    } catch (error) { return this.pending === pending ? this.reject(error) : false; }
  }
  close() { this.reject(fail('앱이 종료되었습니다. 등록 상태를 다시 조회하세요.', 503)); }
}
