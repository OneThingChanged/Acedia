const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const supportedTools = new Set(['codex', 'claude', 'qwen', 'agy']);

// Starting a CLI is independent of displaying its pane or activating a window.
// The shared activation broker acknowledges an actual PTY and never restarts
// an already-running session. CLI readiness is checked separately before send.
export class SessionStart {
  constructor({ agentFor, activate, writable = () => true }) {
    Object.assign(this, { agentFor, activate, writable });
  }
  async handle(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => key !== 'sessionId')
      || typeof body.sessionId !== 'string' || !body.sessionId.trim()
      || body.sessionId.length > 256 || /[\x00-\x1f]/.test(body.sessionId)) throw fail('기존 세션의 sessionId를 정확히 지정하세요.');
    const sessionId = body.sessionId.trim();
    const agent = this.agentFor(sessionId);
    if (!agent) throw fail('세션을 찾을 수 없습니다.', 404);
    if (agent.sshHostId || !supportedTools.has(agent.aiToolId)) throw fail('지원하는 로컬 AI 세션을 선택하세요.', 409);
    if (agent.detached || !this.writable(sessionId)) throw fail('다른 창 또는 설정 변경에서 사용하는 세션입니다. 상태를 다시 확인하세요.', 409);
    const result = await this.activate(sessionId);
    if (result?.active !== true) throw fail('실행 중인 터미널을 확인하지 못했습니다. 세션 상태를 다시 조회하세요.', 409);
    return { sessionId, active: true, started: result.restarted === true, background: true };
  }
}
