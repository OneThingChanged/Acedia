import { startupPrompt } from './startup-automation.mjs';

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Read the same transcript, fresh-launch and native-composer gates as delivery.
// Acedia's stable session ID is sufficient; a CLI conversation need not exist.
export class SessionReadiness {
  constructor({ context, read, freshRead, ready, now = () => performance.now(), wait = delay }) {
    Object.assign(this, { context, read, freshRead, ready, now, wait });
  }
  canWait(id) {
    const entry = this.context(id)?.entry;
    return !!entry && entry.aiToolId === 'codex' && !entry.ssh && !entry.resumeContext
      && Number.isFinite(entry.startedAt) && !entry.firstMessageInput && !entry.firstMessageSubmitted;
  }
  async inspect(sessionId) {
    const target = this.context(sessionId);
    if (!target) throw fail('세션을 찾을 수 없습니다.', 404);
    const base = { sessionId, conversationId: target.conversationId || null, active: !!target.entry,
      ready: false, firstMessageReady: false };
    const result = (phase, reason, extra = {}) => ({ ...base, phase, reason, ...extra });
    const entry = target.entry;
    if (!entry) return result('offline', 'inactive');
    if (entry.aiToolId !== 'codex' || entry.ssh) return result('unsupported', 'local-codex-required');
    const startup = startupPrompt(entry);
    if (startup) return result(startup.startupKind, startup.startupKind, {
      startup: { kind: startup.startupKind, folder: startup.folder || null, trustRoot: startup.trustRoot || null },
    });
    const current = await this.read(sessionId);
    const after = this.context(sessionId);
    if (after?.entry !== entry || after.conversationId !== target.conversationId) return result('changed', 'session-changed');
    if (current && current.sessionId !== target.conversationId) return result('changed', 'conversation-changed');
    if (current?.question) return result('question', 'question-pending');
    const fresh = this.freshRead(sessionId);
    if (fresh && fresh.sessionId === (target.conversationId ?? null) && !current?.turn && !fresh.turn && !fresh.question
      && this.ready(target, { freshSession: true })) {
      return result('ready', 'first-message-ready', { ready: true, firstMessageReady: true });
    }
    if (current?.lifecycle === 'working') return result('working', 'turn-working');
    if (current && target.conversationId && current.sessionId === target.conversationId && this.ready(target)) {
      return result('ready', 'ready', { ready: true });
    }
    if (this.canWait(sessionId)) return result('starting', 'first-message-initializing');
    if (!current) return result('blocked', 'transcript-unavailable');
    return result('blocked', current.sessionId !== target.conversationId ? 'conversation-changed' : 'composer-or-runtime-not-ready');
  }
  async waitForReady(sessionId, waitMs, pinned = this.context(sessionId)) {
    const deadline = this.now() + waitMs;
    const expectedEntry = pinned?.entry, expectedConversationId = pinned?.conversationId;
    for (;;) {
      const status = await this.inspect(sessionId), context = this.context(sessionId);
      if (expectedEntry !== context?.entry || (expectedConversationId && expectedConversationId !== context?.conversationId)) {
        throw fail('준비를 기다리는 동안 실행 세션 또는 대화가 변경되었습니다.', 409);
      }
      if (status.ready || !this.canWait(sessionId) || !['starting', 'folder-trust'].includes(status.phase) || this.now() >= deadline) return status;
      await this.wait(Math.min(100, Math.max(0, deadline - this.now())));
    }
  }
  async handle(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['sessionId', 'waitMs'].includes(key))
      || typeof body.sessionId !== 'string' || !body.sessionId.trim() || body.sessionId.length > 256 || /[\x00-\x1f]/.test(body.sessionId)
      || (body.waitMs !== undefined && (!Number.isInteger(body.waitMs) || body.waitMs < 0 || body.waitMs > 10000))) {
      throw fail('sessionId와 0~10000 범위의 waitMs를 지정하세요.');
    }
    return this.waitForReady(body.sessionId.trim(), body.waitMs || 0);
  }
}
