import { randomUUID } from 'node:crypto';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const dangerousTools = new Set(['codex', 'claude', 'qwen', 'agy']);

// Launch settings are saved by the coordinator, never by typing into a CLI.
// Success requires a durable snapshot acknowledgement; it does not restart a
// running process or imply that its current permission policy has changed.
export class SessionLaunchSettings {
  constructor({ agentFor, active, dispatch, verifySaved, timeoutMs = 15000, idFactory = randomUUID }) {
    Object.assign(this, { agentFor, active, dispatch, verifySaved, timeoutMs, idFactory });
    this.pending = new Map();
  }
  read(id) {
    const agent = this.agentFor(id);
    if (!agent) throw fail('세션을 찾을 수 없습니다.', 404);
    const supportsDangerous = dangerousTools.has(agent.aiToolId) && !agent.sshHostId;
    return { sessionId: id, aiToolId: agent.aiToolId, dangerous: agent.dangerous === true,
      supportsDangerous, canEdit: supportsDangerous && !agent.detached,
      active: this.active(id), appliesOn: 'next_start' };
  }
  handle(body) {
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['sessionId', 'dangerous', 'expectedDangerous'].includes(key))) throw fail('지원하지 않는 세션 설정입니다.');
      const id = body.sessionId;
      if (typeof id !== 'string' || !id.trim() || id.length > 256 || /[\x00-\x1f]/.test(id)) throw fail('정확한 세션 ID가 필요합니다.');
      const current = this.read(id);
      if (!Object.hasOwn(body, 'dangerous')) {
        if (Object.hasOwn(body, 'expectedDangerous')) throw fail('dangerous 변경 값이 필요합니다.');
        return Promise.resolve(current);
      }
      if (typeof body.dangerous !== 'boolean' || typeof body.expectedDangerous !== 'boolean') throw fail('dangerous와 조회한 expectedDangerous 불리언이 필요합니다.');
      if (!current.supportsDangerous) throw fail('로컬 Codex, Claude, Qwen 또는 Antigravity 세션을 선택하세요.', 409);
      if (this.agentFor(id).detached) throw fail('분리된 작업창의 세션은 기본 작업창으로 가져온 뒤 변경하세요.', 409);
      if (current.dangerous !== body.expectedDangerous && current.dangerous !== body.dangerous) throw fail('실행 옵션이 변경되었습니다. 현재 설정을 다시 조회하세요.', 409);
      if ([...this.pending.values()].some(item => item.id === id)) throw fail('이 세션의 실행 옵션을 저장 중입니다.', 409);
      const requestId = this.idFactory();
      const payload = { requestId, id, aiToolId: current.aiToolId, dangerous: body.dangerous, expectedDangerous: body.expectedDangerous };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.reject(requestId, fail('설정 저장 응답 시간이 초과되었습니다. 다시 조회해 저장 상태를 확인하세요.', 504)), this.timeoutMs);
        this.pending.set(requestId, { ...payload, resolve, reject, timer });
        try {
          if (this.dispatch(payload) === false) this.reject(requestId, fail('설정을 저장할 데스크톱 창이 준비되지 않았습니다.', 503));
        } catch (error) { this.reject(requestId, error); }
      });
    } catch (error) { return Promise.reject(error); }
  }
  reject(requestId, error) {
    const item = this.pending.get(requestId);
    if (!item) return false;
    clearTimeout(item.timer); this.pending.delete(requestId); item.reject(error);
    return true;
  }
  async complete(result) {
    const item = this.pending.get(result.requestId);
    if (!item || item.id !== result.id || item.completing) return false;
    item.completing = true;
    if (!result.ok) return this.reject(result.requestId, fail(String(result.error || '설정을 저장하지 못했습니다.'), result.statusCode || 409));
    try {
      await this.verifySaved(item);
      if (this.pending.get(result.requestId) !== item) return false;
      const saved = { ...this.read(item.id), dangerous: item.dangerous, saved: true };
      clearTimeout(item.timer); this.pending.delete(result.requestId);
      item.resolve(saved);
      return true;
    } catch (error) { return this.reject(result.requestId, error); }
  }
  close() {
    for (const requestId of this.pending.keys()) this.reject(requestId, fail('앱이 종료되었습니다. 저장 상태를 다시 확인하세요.', 503));
  }
}
