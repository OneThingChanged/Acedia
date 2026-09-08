import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const MAX_AGE = 7 * 24 * 60 * 60_000;
const failure = (status, error) => ({ status, body: { error } });

// Persist intent before touching a PTY. An interrupted submission must never
// execute again just because the browser did not receive the HTTP response.
export class RemoteSubmissions {
  constructor(file) {
    this.file = file;
    this.pending = new Map();
    this.entries = new Map();
    try {
      this.entries = new Map(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") this.unavailable = true;
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify([...this.entries]), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  async submit(requestId, id, message, execute) {
    // Older clients have no retry identity; retain their original behavior.
    if (requestId == null) return await execute() === false
      ? failure(409, "session is not active") : { status: 200, body: { ok: true } };
    if (typeof requestId !== "string" || !/^\d{13}-[a-zA-Z0-9-]{16,80}$/.test(requestId)) {
      return failure(400, "invalid request ID");
    }
    const createdAt = Number(requestId.slice(0, 13));
    if (createdAt < Date.now() - MAX_AGE || createdAt > Date.now() + 5 * 60_000) {
      return failure(409, "request expired; check conversation before sending again");
    }
    if (this.unavailable) return failure(503, "submission history unavailable");
    const fingerprint = createHash("sha256").update(JSON.stringify([id, message])).digest("hex");
    const old = this.entries.get(requestId);
    if (old) {
      if (old.fingerprint !== fingerprint) return failure(409, "request ID reused with different content");
      return this.pending.get(requestId) || old.result || failure(409, "submission outcome unknown; check conversation before sending again");
    }
    for (const [key, entry] of this.entries) {
      if (entry.createdAt < Date.now() - MAX_AGE && !this.pending.has(key)) this.entries.delete(key);
    }
    if (this.entries.size >= 10_000) return failure(503, "submission history full; retry later");
    const entry = { createdAt, fingerprint };
    this.entries.set(requestId, entry);
    try { this.save(); } catch {
      this.entries.delete(requestId);
      return failure(503, "cannot record submission; nothing sent");
    }
    const operation = Promise.resolve().then(async () => {
      let result;
      let notSent = false;
      try {
        notSent = await execute() === false;
        result = notSent ? failure(409, "session is not active") : { status: 200, body: { ok: true } };
      } catch {
        result = failure(409, "submission outcome unknown; check conversation before sending again");
      }
      entry.result = result;
      // A definitive rejection before submission is safe to retry after activation.
      if (notSent) this.entries.delete(requestId);
      try { this.save(); } catch { /* persisted intent still prevents replay after restart */ }
      return result;
    });
    this.pending.set(requestId, operation);
    try { return await operation; } finally { this.pending.delete(requestId); }
  }
}
