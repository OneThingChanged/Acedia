import fs from "node:fs/promises";

const MAX_TAIL_BYTES = 1024 * 1024;
const MAX_CACHED_FILES = 64;
const USAGE_RECORD = /"type"\s*:\s*"(token_count|context_compacted|compacted)"/;

function latestInputTokens(buffer, startsAtLine) {
  const lines = buffer.toString("utf8").split("\n");
  // The last line may still be in the process of being written.
  for (let index = lines.length - 2; index >= (startsAtLine ? 0 : 1); index--) {
    const line = lines[index];
    if (!USAGE_RECORD.test(line)) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const event = row.type === "event_msg" ? row.payload : null;
    if (row.type === "compacted" || event?.type === "context_compacted") return null;
    if (event?.type !== "token_count") continue;
    const input = event.info?.last_token_usage?.input_tokens;
    if (Number.isSafeInteger(input) && input >= 0) return input;
  }
  return undefined;
}

// Keep recent counts only. A growing transcript can contain much larger tool
// and image records, so sidebar refreshes never scan the full conversation.
export class CodexContextUsage {
  #files = new Map();

  async read(file) {
    let entry = this.#files.get(file);
    if (!entry) {
      entry = {};
      this.#files.set(file, entry);
      if (this.#files.size > MAX_CACHED_FILES) this.#files.delete(this.#files.keys().next().value);
    }
    entry.pending ??= this.#readTail(file, entry.snapshot)
      .then(snapshot => { entry.snapshot = snapshot; return snapshot.inputTokens; })
      .catch(() => { entry.snapshot = undefined; return null; })
      .finally(() => { entry.pending = undefined; });
    return entry.pending;
  }

  async #readTail(file, previous) {
    const handle = await fs.open(file, "r");
    try {
      const { size, mtimeMs, ino } = await handle.stat();
      if (previous?.size === size && previous.mtimeMs === mtimeMs && previous.ino === ino) return previous;
      const start = Math.max(0, size - MAX_TAIL_BYTES);
      const buffer = Buffer.alloc(size - start);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      const input = latestInputTokens(buffer.subarray(0, bytesRead), start === 0);
      // Reuse the previous count only if the new tail still covers the
      // previously observed end. Otherwise a compaction may have been missed.
      const appended = previous?.ino === ino && size > previous.size && start < previous.size;
      return { size, mtimeMs, ino, inputTokens: input === undefined && appended ? previous.inputTokens : input ?? null };
    } finally {
      await handle.close();
    }
  }
}
