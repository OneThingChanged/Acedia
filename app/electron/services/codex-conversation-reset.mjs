import { deliveryComposerReady } from './session-delivery.mjs';
import { PTY_SUBMIT_DELAY_MS } from './pty-submit.mjs';

const SESSION_ROW = /^\s*Session:\s+([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\s*$/gmi;
export function codexStatusSessionId(screen) {
  return [...String(screen || '').matchAll(SESSION_ROW)].at(-1)?.[1] || null;
}

// Current Codex does not emit SessionStart for /clear or /new. Read the new
// identity from its own /status output, inside the original PTY submission
// lock. No model request or transcript deletion is needed.
export async function confirmCodexConversationReset({ entry, previousSessionId, sessionId,
  isCurrent, wait = ms => new Promise(r => setTimeout(r, ms)), now = Date.now }) {
  const fail = () => new Error('Conversation reset identity was not confirmed; submission outcome unknown. Check the terminal before retrying.');
  await wait(PTY_SUBMIT_DELAY_MS);
  if (!isCurrent()) throw fail();
  const hooked = sessionId();
  if (hooked && hooked !== previousSessionId) return hooked;
  if (!deliveryComposerReady(entry)) throw fail();
  entry.process.write('/status');
  await wait(PTY_SUBMIT_DELAY_MS);
  if (!isCurrent()) throw fail();
  entry.process.write('\r');
  const deadline = now() + 5000;
  while (isCurrent() && now() < deadline) {
    const current = codexStatusSessionId(entry.filter.viewportText());
    if (current && current !== previousSessionId && deliveryComposerReady(entry)) return current;
    await wait(100);
  }
  throw fail();
}
