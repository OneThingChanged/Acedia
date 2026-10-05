import fs from "node:fs";
import { isTranscriptInsideRoot } from "./transcript-path.mjs";
import { isCodexCapacityError } from './codex-capacity-retry.mjs';

const TAIL_BYTES = 256 * 1024;
const MAX_CACHED_FILES = 128;

/**
 * A missed completion hook must not leave Remote's composer queue blocked.
 * Read only the end of a Codex rollout and only trust a completion written
 * after the last working hook. A missing marker is inconclusive, not idle.
 */
export class CodexTurnCompletion {
  constructor() {
    this.cache = new Map();
  }

  isComplete({ root, transcriptPath, sessionId, lastHookAt }) {
    if (!root || !transcriptPath || !sessionId || !Number.isFinite(lastHookAt)) return false;
    if (!transcriptPath.toLowerCase().includes(sessionId.toLowerCase())) return false;
    if (!isTranscriptInsideRoot(root, transcriptPath)) return false;
    try {
      const stat = fs.statSync(transcriptPath);
      if (!stat.isFile() || stat.mtimeMs <= lastHookAt) return false;
      const cached = this.cache.get(transcriptPath);
      if (cached?.size === stat.size && cached?.mtimeMs === stat.mtimeMs) return cached.complete;

      const length = Math.min(stat.size, TAIL_BYTES);
      const bytes = Buffer.alloc(length);
      const fd = fs.openSync(transcriptPath, "r");
      try {
        fs.readSync(fd, bytes, 0, length, stat.size - length);
      } finally {
        fs.closeSync(fd);
      }
      const text = bytes.toString("utf8");
      const lines = text.slice(stat.size > length ? text.indexOf("\n") + 1 : 0).split(/\r?\n/);
      let lastTurnEvent = null;
      for (const line of lines) {
        if (!line) continue;
        try {
          const record = JSON.parse(line);
          const type = record?.payload?.type ?? record?.type;
          if (["task_started", "task_complete", "turn_aborted"].includes(type)) {
            lastTurnEvent = type === 'task_complete' && isCodexCapacityError(record.payload?.error) ? 'capacity_failed' : type;
          }
        } catch {
          // A rollout may be appended while the tail is being read.
        }
      }
      const complete = lastTurnEvent === "task_complete" || lastTurnEvent === "turn_aborted";
      this.cache.set(transcriptPath, { size: stat.size, mtimeMs: stat.mtimeMs, complete });
      if (this.cache.size > MAX_CACHED_FILES) this.cache.delete(this.cache.keys().next().value);
      return complete;
    } catch {
      return false;
    }
  }
}
