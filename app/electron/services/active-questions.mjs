import fs from 'node:fs/promises';
import { derivePendingQuestion, deriveTurnLifecycle } from './chat-transcript.mjs';
import { isTranscriptInsideRoot } from './transcript-path.mjs';

export const QUESTION_TAIL_BYTES = 256 * 1024;

// Only live, account-scoped transcripts. No catalog scan or whole-file read.
export class ActiveQuestions {
  constructor() { this.cache = new Map(); this.pending = new Map(); }
  prune(ids) {
    const live = new Set(ids);
    for (const id of this.cache.keys()) if (!live.has(id)) this.cache.delete(id);
  }
  async read({ id, tool, root, transcriptPath, sessionId, startedAt = 0 }) {
    if (!['codex', 'claude'].includes(tool) || !sessionId || !transcriptPath || !root
      || !transcriptPath.toLowerCase().includes(sessionId.toLowerCase()) || !isTranscriptInsideRoot(root, transcriptPath)) return null;
    if (this.pending.has(id)) { await this.pending.get(id); return this.read({ id, tool, root, transcriptPath, sessionId, startedAt }); }
    const operation = this.#read({ id, tool, transcriptPath, sessionId, startedAt });
    this.pending.set(id, operation);
    try { return await operation; } finally { this.pending.delete(id); }
  }
  async #read({ id, tool, transcriptPath, sessionId, startedAt }) {
    let handle;
    try {
      handle = await fs.open(transcriptPath, 'r');
      const stat = await handle.stat();
      if (!stat.isFile() || stat.mtimeMs < startedAt) return null;
      const previous = this.cache.get(id);
      const same = previous?.path === transcriptPath && previous.startedAt === startedAt;
      if (same && previous.size === stat.size && previous.mtime === stat.mtimeMs) return previous.result;
      const length = Math.min(stat.size, QUESTION_TAIL_BYTES);
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await handle.read(bytes, 0, length, stat.size - length);
      let text = bytes.subarray(0, bytesRead).toString('utf8');
      if (stat.size > length) text = text.slice(text.indexOf('\n') + 1);
      // An append in progress must not erase a question or fabricate an answer.
      text = text.slice(0, text.lastIndexOf('\n') + 1);
      const question = derivePendingQuestion(text, tool, same && stat.size >= previous.size ? previous.result.question : null);
      const hasTurnMarker = /"type"\s*:\s*"(?:task_started|task_complete|turn_aborted)"/.test(text);
      const lifecycle = tool === 'codex' && !hasTurnMarker ? same ? previous.result.lifecycle : 'working' : deriveTurnLifecycle(text, tool);
      const result = { question, lifecycle, sessionId };
      this.cache.set(id, { path: transcriptPath, startedAt, size: stat.size, mtime: stat.mtimeMs, result });
      return result;
    } catch { return null; } finally { await handle?.close(); }
  }
}
