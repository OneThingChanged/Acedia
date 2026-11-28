const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

// Windows Codex can suppress Enter for 120ms after a paste burst. ConPTY
// delivery and image-path processing can finish later than write() returns.
export const PTY_SUBMIT_DELAY_MS = 500;
export const PTY_SUBMIT_QUIET_MS = 250;
export const PTY_SUBMIT_TIMEOUT_MS = 3000;
export const PTY_DRAFT_TIMEOUT_MS = 8000;
const pending = new WeakSet();

// ConPTY's character-to-key translation can assign modifiers to Unicode
// punctuation. Codex then treats it as a shortcut. Explicit UTF-16 key records
// preserve those characters without changing the user's clipboard or text.
export function encodeConptyUnicode(input) {
  return input.replace(/[^\x00-\x7f]/g, char => `\x1b[0;0;${char.charCodeAt(0)};1;0;1_`);
}

export function preparePtySubmission(message, forceBracketedPaste = false) {
  const value = String(message ?? "");
  if (!forceBracketedPaste && !/[\r\n]/.test(value)) return value;
  const normalized = value.replace(/\r\n|\r|\n/g, "\r");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}`;
}

export async function submitPtyMessage({
  ptyProcess,
  message,
  encodeInput = value => value,
  writeInput = value => ptyProcess.write(value),
  waitForOutputQuiet = true,
  forceBracketedPaste = false,
  draftReady = null,
  confirm = null,
  confirmTimeoutMs = 8000,
  isCurrent = () => true,
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  now = () => performance.now(),
}) {
  const value = String(message ?? "");
  if (!ptyProcess || !value.trim() || !isCurrent() || pending.has(ptyProcess)) return false;
  const bracketedPaste = forceBracketedPaste || /[\r\n]/.test(value);
  pending.add(ptyProcess);
  let subscription;
  try {
    let lastOutput = now();
    let sawOutput = false;
    const observesOutput = typeof ptyProcess.onData === "function";
    subscription = ptyProcess.onData?.(() => { lastOutput = now(); sawOutput = true; });
    // A terminal paste is one ordered input event. The explicit closing marker
    // lets Codex/Claude finish a multiline paste before the discrete Enter.
    writeInput(encodeInput(preparePtySubmission(value, forceBracketedPaste)));
    const started = now();
    await wait(PTY_SUBMIT_DELAY_MS);
    // For verified handoffs, the draft itself is the readiness signal.
    // Footer repaints can continue even after the full paste is visible.
    while (bracketedPaste && !draftReady && ((observesOutput && !sawOutput) || (waitForOutputQuiet && now() - lastOutput < PTY_SUBMIT_QUIET_MS))) {
      if (!isCurrent() || now() - started >= PTY_SUBMIT_TIMEOUT_MS) {
        throw new Error("Terminal changed or paste did not settle; submission outcome unknown.");
      }
      const quietRemaining = bracketedPaste && observesOutput && !sawOutput
        ? PTY_SUBMIT_QUIET_MS : PTY_SUBMIT_QUIET_MS - (now() - lastOutput);
      await wait(Math.min(quietRemaining, PTY_SUBMIT_TIMEOUT_MS - (now() - started)));
    }
    if (draftReady) {
      // ConPTY can spend the initial delay still feeding input to Codex. Wait
      // through the paste-burst interval after the complete draft is visible.
      const deadline = started + PTY_DRAFT_TIMEOUT_MS;
      let visibleAt = null;
      while (isCurrent() && now() < deadline) {
        const time = now();
        if (!draftReady()) visibleAt = null;
        else {
          visibleAt ??= time;
          if (time - visibleAt >= PTY_SUBMIT_QUIET_MS) break;
        }
        await wait(Math.min(50, deadline - time));
      }
      if (now() >= deadline || !isCurrent()) {
        throw new Error("The handoff draft could not be verified; submission outcome unknown.");
      }
    }
    if (!isCurrent()) throw new Error("Terminal changed after paste; submission outcome unknown.");
    writeInput("\r");
    if (confirm) {
      const deadline = now() + confirmTimeoutMs;
      while (!(await confirm())) {
        if (!isCurrent() || now() >= deadline) {
          throw new Error("Conversation reset was not confirmed; submission outcome unknown. Check the terminal before retrying.");
        }
        await wait(100);
      }
    }
    return true;
  } finally {
    // Once write() was attempted, do not report a safe-to-retry rejection.
    // RemoteSubmissions retains uncertain request IDs instead of replaying text.
    try { subscription?.dispose(); } finally { pending.delete(ptyProcess); }
  }
}
