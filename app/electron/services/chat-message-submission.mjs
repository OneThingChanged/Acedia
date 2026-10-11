import { submitPtyMessage } from './pty-submit.mjs';

// Coordinate conversation and question ownership before touching a PTY. Keep
// paste timing and serialization in submitPtyMessage, and Electron events and
// transcript caches in the caller.
export function createChatMessageSubmitter({
  terminalSessions, isClosing, questionResponder, currentQuestion, getSessionId,
  composerReady, cancelRetry, confirmReset, onReset,
}) {
  return async ({ id, sessionId, message, steering }) => {
    const entry = terminalSessions.get(id);
    if (!entry?.process || isClosing() || questionResponder.isBusy(id)) return false;
    const process = entry.process;
    const conversationId = () => getSessionId(id);
    const previousSessionId = conversationId();
    const sameConversation = () => !sessionId || !conversationId() || conversationId() === sessionId;
    const sameProcess = () => terminalSessions.get(id) === entry && entry.process === process;
    const isCurrent = () => sameProcess() && sameConversation();
    const pending = (await currentQuestion(id))?.question;
    if (!isCurrent() || (pending && !pending.async) || questionResponder.isBusy(id)) return false;
    const resetting = !entry.ssh && entry.aiToolId === 'codex' && /^\/(?:clear|new)(?:\s|$)/.test(message.trim());
    if (resetting && !composerReady(entry)) return false;
    cancelRetry(id);
    return submitPtyMessage({
      ptyProcess: process, message, isCurrent,
      waitForOutputQuiet: !steering,
      writeInput: value => terminalSessions.write(id, value),
      ...(resetting ? { confirm: async () => {
        // A reset intentionally changes the conversation, but must still be
        // confirmed against the exact process that received the command.
        const nextId = await confirmReset({ id, entry, previousSessionId, isCurrent: sameProcess });
        if (!sameProcess()) throw new Error('Terminal changed; submission outcome unknown.');
        onReset(id, entry, nextId);
        return true;
      } } : {}),
    });
  };
}
