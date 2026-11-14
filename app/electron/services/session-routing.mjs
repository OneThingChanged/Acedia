import { randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validId = value => typeof value === 'string' && value.trim() === value && value.length > 0
  && value.length <= 256 && !/[\x00-\x1f]/.test(value);
const accountId = value => value === null || validId(value);

// Only the next-launch pin is edited. A live CLI's assignment and in-flight
// requests remain owned by AccountPool until an explicit stop/start.
export class SessionRouting {
  constructor({ agentFor, active, pool, writable = () => true, lock = () => {}, unlock = () => {},
    dispatch, verifySaved, timeoutMs = 15000 }) {
    Object.assign(this, { agentFor, active, pool, writable, lock, unlock, dispatch, verifySaved, timeoutMs });
    this.pending = new Map();
  }
  read(id) {
    const agent = this.agentFor(id);
    if (!agent) throw fail('세션을 찾을 수 없습니다.', 404);
    const supportsRouting = agent.aiToolId === 'codex' && !agent.sshHostId;
    const info = supportsRouting ? this.pool(id) : { enabled: false, writable: false, accounts: [] };
    const active = this.active(id);
    return { sessionId: id, aiToolId: agent.aiToolId, supportsRouting,
      canEdit: supportsRouting && !agent.detached && info.writable && this.writable(id),
      active, enabled: info.enabled === true, preferredAccountId: agent.codexPoolAccountId || null,
      runningMode: !active ? 'inactive' : info.routed ? 'routed' : 'direct',
      runningAccountId: active && info.routed ? info.assignedAccountId || null : null,
      accounts: info.accounts.map(a => ({ id: a.id, label: a.label, available: a.available === true })),
      appliesOn: 'next_start', restartRequired: active, background: true };
  }
  check(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['sessionId', 'accountId', 'expectedAccountId'].includes(key))
      || !validId(body.sessionId)) throw fail('정확한 sessionId와 지원하는 라우팅 옵션을 지정하세요.');
    const current = this.read(body.sessionId);
    if (!Object.hasOwn(body, 'accountId')) {
      if (Object.hasOwn(body, 'expectedAccountId')) throw fail('변경할 accountId가 필요합니다.');
      return { current };
    }
    if (!accountId(body.accountId) || !accountId(body.expectedAccountId)) throw fail('accountId와 조회한 expectedAccountId가 필요합니다. 자동 배정은 null을 사용하세요.');
    if (!current.canEdit) throw fail('기본 작업창의 로컬 Codex 세션과 계정 저장 상태를 확인하세요.', 409);
    if (current.preferredAccountId !== body.expectedAccountId && current.preferredAccountId !== body.accountId) throw fail('세션 라우팅 설정이 변경되었습니다. 다시 조회하세요.', 409);
    if (body.accountId !== null && !current.accounts.some(a => a.id === body.accountId && a.available)) throw fail('지정한 분산 계정을 사용할 수 없습니다. 로그인·참여·한도를 확인하세요.', 409);
    return { current, change: { sessionId: body.sessionId, accountId: body.accountId, expectedAccountId: body.expectedAccountId } };
  }
  handle(body) {
    try {
      const { current, change } = this.check(body);
      if (!change) return Promise.resolve(current);
      if (this.pending.has(body.sessionId)) throw fail('이 세션의 라우팅 설정을 저장 중입니다.', 409);
      const requestId = randomUUID(), id = body.sessionId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.reject(id, fail('라우팅 저장 응답 시간이 초과되었습니다. 다시 조회해 저장 상태를 확인하세요.', 504)), this.timeoutMs);
        this.pending.set(id, { requestId, id, change, resolve, reject, timer });
        try {
          this.lock(id);
          if (this.dispatch({ requestId, id }) === false) this.reject(id, fail('설정을 저장할 기본 작업창이 준비되지 않았습니다.', 503));
        } catch (error) { this.reject(id, error); }
      });
    } catch (error) { return Promise.reject(error); }
  }
  validate({ requestId, id }) {
    const item = this.pending.get(id);
    if (!item || item.requestId !== requestId || item.completing) throw fail('만료된 라우팅 변경 요청입니다.', 409);
    return this.check(item.change).change;
  }
  release(id) {
    const item = this.pending.get(id);
    if (!item) return null;
    clearTimeout(item.timer); this.pending.delete(id); this.unlock(id);
    return item;
  }
  reject(id, error) { const item = this.release(id); item?.reject(error); return !!item; }
  async complete(result) {
    const item = this.pending.get(result.id);
    if (!item || item.requestId !== result.requestId || item.completing) return false;
    item.completing = true;
    if (!result.ok) return this.reject(item.id, fail(result.error || '라우팅 설정을 저장하지 못했습니다.', result.statusCode || 409));
    try {
      await this.verifySaved(item.change);
      if (this.pending.get(item.id) !== item) return false;
      const saved = this.read(item.id);
      if (saved.preferredAccountId !== item.change.accountId) throw fail('저장된 라우팅 설정을 확인하지 못했습니다. 다시 조회하세요.', 409);
      this.release(item.id); item.resolve({ ...saved, saved: true });
      return true;
    } catch (error) { return this.pending.get(item.id) === item ? this.reject(item.id, error) : false; }
  }
  close() { for (const id of this.pending.keys()) this.reject(id, fail('앱이 종료되었습니다. 라우팅 설정을 다시 조회하세요.', 503)); }
}
