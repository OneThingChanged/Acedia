const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

// Windows Codex can suppress Enter for 120ms after a paste burst. ConPTY
// delivery and image-path processing can finish later than write() returns.
export const PTY_SUBMIT_DELAY_MS = 500;
export const PTY_SUBMIT_QUIET_MS = 250;
export const PTY_SUBMIT_TIMEOUT_MS = 3000;
const pending = new WeakSet();

export function preparePtySubmission(message) {
  const value = String(message ?? "");
  if (!/[\r\n]/.test(value)) return value;
  const normalized = value.replace(/\r\n|\r|\n/g, "\r");
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}`;
}

export async function submitPtyMessage({
  ptyProcess,
  message,
  isCurrent = () => true,
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  now = () => performance.now(),
}) {
  const value = String(message ?? "");
  if (!ptyProcess || !value.trim() || !isCurrent() || pending.has(ptyProcess)) return false;
  pending.add(ptyProcess);
  let subscription;
  try {
    let lastOutput = now();
    let sawOutput = false;
    const observesOutput = typeof ptyProcess.onData === "function";
    subscription = ptyProcess.onData?.(() => { lastOutput = now(); sawOutput = true; });
    // A terminal paste is one ordered input event. The explicit closing marker
    // lets Codex/Claude finish a multiline paste before the discrete Enter.
    ptyProcess.write(preparePtySubmission(value));
    const started = now();
    await wait(PTY_SUBMIT_DELAY_MS);
    while ((observesOutput && !sawOutput) || now() - lastOutput < PTY_SUBMIT_QUIET_MS) {
      if (!isCurrent() || now() - started >= PTY_SUBMIT_TIMEOUT_MS) {
        throw new Error("Terminal changed or paste did not settle; submission outcome unknown.");
      }
      const quietRemaining = observesOutput && !sawOutput ? PTY_SUBMIT_QUIET_MS : PTY_SUBMIT_QUIET_MS - (now() - lastOutput);
      await wait(Math.min(quietRemaining, PTY_SUBMIT_TIMEOUT_MS - (now() - started)));
    }
    if (!isCurrent()) throw new Error("Terminal changed after paste; submission outcome unknown.");
    ptyProcess.write("\r");
    return true;
  } finally {
    // Once write() was attempted, do not report a safe-to-retry rejection.
    // RemoteSubmissions retains uncertain request IDs instead of replaying text.
    try { subscription?.dispose(); } finally { pending.delete(ptyProcess); }
  }
}
