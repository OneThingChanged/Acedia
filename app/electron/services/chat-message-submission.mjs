import { submitPtyMessage } from './pty-submit.mjs';

// Coordinate conversation and question ownership before touching a PTY. Keep
// paste timing and serialization in submitPtyMessage, and Electron events and
// transcript caches in the caller.
export function createChatMessageSubmitter({
  terminalSessions, isClosing, questionResponder, currentQuestion, getSessionId,
  composerReady, cancelRetry, confirmReset, onReset,
}) {
  const accepted = new WeakMap();
  const awaitingTurn = (entry, current) => {
    const prior = accepted.get(entry);
    if (!prior) return false;
    const conversationId = getSessionId(entry.id);
    if (prior.sessionId && conversationId && prior.sessionId !== conversationId) { accepted.delete(entry); return false; }
    if (current?.turn?.id && current.turn.id !== prior.turnId) { accepted.delete(entry); return false; }
    if (current?.lifecycle === 'working') prior.sawWorking = true;
    else if (prior.sawWorking && current?.lifecycle === 'idle') { accepted.delete(entry); return false; }
    return true;
  };
  const readiness = async ({ id, sessionId }) => {
    const entry = terminalSessions.get(id), conversationId = getSessionId(id) || null;
    const base = { id, conversationId, supported: entry?.aiToolId === 'codex' && !entry.ssh, active: !!entry?.process, ready: false };
    if (!entry?.process || isClosing()) return { ...base, reason: 'inactive' };
    if (sessionId && conversationId && sessionId !== conversationId) return { ...base, reason: 'conversation-changed' };
    if (!base.supported) return { ...base, reason: 'unsupported' };
    const process = entry.process, current = await currentQuestion(id);
    if (terminalSessions.get(id) !== entry || entry.process !== process || (getSessionId(id) || null) !== conversationId) return { ...base, reason: 'session-changed' };
    if (questionResponder.isBusy(id) || current?.question && !current.question.async) return { ...base, reason: 'question-pending' };
    if (awaitingTurn(entry, current)) return { ...base, reason: 'awaiting-turn' };
    if (current?.lifecycle === 'working') return { ...base, reason: 'working' };
    return composerReady(entry, { allowWorking: false }) ? { ...base, ready: true, reason: 'ready' }
      : { ...base, reason: 'composer-not-ready' };
  };
  const submit = async ({ id, sessionId, message, steering }) => {
    const entry = terminalSessions.get(id);
    if (!entry?.process || isClosing() || questionResponder.isBusy(id)) return false;
    const process = entry.process;
    const conversationId = () => getSessionId(id);
    const previousSessionId = conversationId();
    const sameConversation = () => !sessionId || !conversationId() || conversationId() === sessionId;
    const sameProcess = () => terminalSessions.get(id) === entry && entry.process === process;
    const isCurrent = () => sameProcess() && sameConversation();
    const current = await currentQuestion(id), pending = current?.question;
    if (!isCurrent() || (pending && !pending.async) || questionResponder.isBusy(id)) return false;
    const localCodex = !entry.ssh && entry.aiToolId === 'codex';
    const resetting = localCodex && /^\/(?:clear|new)(?:\s|$)/.test(message.trim());
    if (localCodex && ((!steering && !resetting && awaitingTurn(entry, current)) || !composerReady(entry, { allowWorking: steering === true && !resetting }))) {
      // Check the live composer before *any* paste, including explicit retries.
      // A previous timed-out request or terminal draft must not be concatenated.
      if (resetting) return false;
      throw Object.assign(new Error('Terminal input is not empty or ready; check the terminal before sending again. Nothing sent.'),
        { outcome: 'not-sent', reason: 'composer-not-ready', statusCode: 409 });
    }
    cancelRetry(id);
    const sent = await submitPtyMessage({
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
    if (sent && localCodex && !steering) {
      if (/^\//.test(message.trim())) accepted.delete(entry);
      else accepted.set(entry, { sessionId: getSessionId(id) || previousSessionId, turnId: current?.turn?.id || null, sawWorking: false });
    }
    return sent;
  };
  submit.readiness = readiness;
  submit.reset = id => { const entry = terminalSessions.get(id); if (entry) accepted.delete(entry); };
  return submit;
}
