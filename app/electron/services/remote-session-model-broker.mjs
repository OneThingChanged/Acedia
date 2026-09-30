import { randomUUID } from "node:crypto";

// A settings update succeeds only after the coordinator confirms persistence
// (and, when requested, the replacement PTY). Serialize updates per session.
export class RemoteSessionModelBroker {
  constructor({ dispatch, timeoutMs = 60000, idFactory = randomUUID }) {
    this.dispatch = dispatch; this.timeoutMs = timeoutMs; this.idFactory = idFactory; this.pending = new Map();
  }
  update(payload) {
    if ([...this.pending.values()].some(item => item.id === payload.id)) {
      return Promise.reject(Object.assign(new Error("세션 설정을 변경 중입니다."), { statusCode: 409 }));
    }
    const requestId = this.idFactory();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.complete({ requestId, id: payload.id, ok: false, statusCode: 504,
        error: "설정 변경 응답 시간이 초과되었습니다. 세션 상태를 새로 확인하세요." }), this.timeoutMs);
      this.pending.set(requestId, { id: payload.id, settings: payload.settings, restart: payload.restart, resolve, reject, timer });
      try {
        if (this.dispatch({ ...payload, requestId }) === false) this.complete({ requestId, id: payload.id, ok: false, statusCode: 503, error: "데스크톱 창이 준비되지 않았습니다." });
      } catch (error) { this.complete({ requestId, id: payload.id, ok: false, statusCode: 500, error: String(error.message || error) }); }
    });
  }
  complete(result) {
    const item = this.pending.get(result.requestId);
    if (!item || item.id !== result.id) return false;
    clearTimeout(item.timer); this.pending.delete(result.requestId);
    if (result.ok) item.resolve({ id: result.id, restarted: result.restarted === true });
    else item.reject(Object.assign(new Error(result.error || "설정을 변경하지 못했습니다."), { statusCode: result.statusCode || 409 }));
    return true;
  }
  close() {
    for (const [requestId, item] of this.pending) this.complete({ requestId, id: item.id, ok: false, statusCode: 503, error: "앱이 종료되었습니다." });
  }
}
