import fs from "node:fs";
import path from "node:path";

function readObject(file) {
  try {
    if (fs.statSync(file).size > 256 * 1024) return null;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

// Main-process-only matching key. Require both the workspace account and the
// user subject; an email or a shared workspace alone cannot identify a login.
export function storedCodexAccountKey(home) {
  const tokens = readObject(path.join(home, "auth.json"))?.tokens;
  if (typeof tokens?.account_id !== "string" || !tokens.account_id || tokens.account_id.length > 512
    || typeof tokens.id_token !== "string" || tokens.id_token.length > 32768) return null;
  const parts = tokens.id_token.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const subject = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.sub;
    return typeof subject === "string" && subject && subject.length <= 512
      ? `${tokens.account_id}:${subject}` : null;
  } catch { return null; }
}

// Only an email from the selected CLI home may cross IPC. This is stored
// metadata, not a server check or verification of a token's signature.
export function storedAccountIdentity(provider, home) {
  let email;
  if (provider === "codex") {
    const token = readObject(path.join(home, "auth.json"))?.tokens?.id_token;
    if (typeof token !== "string" || token.length > 32768) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    try { email = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.email; }
    catch { return null; }
  } else if (provider === "claude") {
    email = readObject(path.join(home, ".claude.json"))?.oauthAccount?.emailAddress;
  }
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email)) return null;
  return { email, source: "local" };
}
