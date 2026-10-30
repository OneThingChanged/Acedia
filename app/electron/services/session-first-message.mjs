import { deliveryComposerReady } from './session-delivery.mjs';
import { startupPrompt } from './startup-automation.mjs';

// Observe input, never send or approve it. Native startup dialog interactions
// are not a first chat prompt; all other input permanently closes this path
// for this PTY generation, even if the draft is subsequently erased.
export function noteFirstMessageInput(entry, data) {
  if (!entry || !data) return;
  // xterm emits cursor/device/keyboard/color reports through the same onData
  // path as keystrokes. Accept only complete reports, never pasted text or
  // arrow/Enter keys, so attaching a visible terminal cannot consume freshness.
  if (/^(?:\x1b\[(?:[IO]|\??\d+;\d+R|[?>]?\d+(?:;\d+)*c|\??\d+(?:;\d+)*u|\d+n|(?:4|8|9);\d+;\d+t|\?\d+;[0-4]\$y)|\x1b\](?:10|11|12);rgb:[\da-f/]+(?:\x07|\x1b\\))+$/.test(data)) return;
  if (startupPrompt(entry) && /^(?:\r|\n|[1-3]|\x1b(?:\[[AB]|O[AB]))+$/.test(data)) return;
  entry.firstMessageInput = true;
}

export function firstMessageSession({ entry, agent, conversationId, hook }) {
  if (!entry || !agent || !Number.isFinite(entry.startedAt) || entry.ssh || entry.aiToolId !== 'codex' || entry.resumeContext
    || entry.firstMessageInput || entry.firstMessageSubmitted || !deliveryComposerReady(entry)) return null;
  // A known conversation must belong to this native launch's SessionStart.
  // A missing transcript alone is never proof that an old session is new.
  if (conversationId) {
    if (hook?.event !== 'session-start' || hook.session_id !== conversationId
      || !Number.isFinite(hook.lastTs) || hook.lastTs < entry.startedAt
      || agent.lastSessionId && agent.lastSessionId !== conversationId) return null;
  } else if (agent.lastSessionId) return null;
  return { sessionId: conversationId || null, turn: null, question: null, lifecycle: 'idle', startupTrust: entry.startupTrustConfirmation };
}
