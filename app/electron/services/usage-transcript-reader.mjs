import { promises as fs } from "node:fs";

export const USAGE_READ_BYTES = 256 * 1024;
export const MAX_USAGE_LINE_BYTES = 64 * 1024 * 1024;

// Yield complete JSONL records in bounded reads. An unfinished final record is
// deliberately not checkpointed so the next refresh can read its completed form.
export async function* readUsageBatches(file, start, size, stopped = () => false) {
  const handle = await fs.open(file, "r");
  let position = start;
  let lineStart = start;
  let parts = [];
  let lineBytes = 0;
  try {
    while (position < size && !stopped()) {
      const chunk = Buffer.alloc(Math.min(USAGE_READ_BYTES, size - position));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (!bytesRead || stopped()) break;
      position += bytesRead;
      const records = [];
      let cursor = 0;
      let oversized = false;
      while (cursor < bytesRead) {
        const newline = chunk.indexOf(0x0a, cursor);
        const end = newline < 0 || newline >= bytesRead ? bytesRead : newline;
        const fragment = chunk.subarray(cursor, end);
        lineBytes += fragment.length;
        if (lineBytes > MAX_USAGE_LINE_BYTES) {
          oversized = true;
          break;
        }
        if (end === bytesRead) {
          parts.push(fragment);
          break;
        }
        const line = parts.length ? Buffer.concat([...parts, fragment], lineBytes) : fragment;
        records.push({ text: line.toString("utf8"), offset: lineStart });
        lineStart += lineBytes + 1;
        parts = [];
        lineBytes = 0;
        cursor = end + 1;
      }
      // Commit preceding records before reporting a pathological record. Never
      // silently skip it or mark its following usage as fully indexed.
      if (records.length) yield { records, endOffset: lineStart };
      if (oversized) throw new Error("Transcript record exceeds 64 MiB");
    }
  } finally {
    await handle.close();
  }
}
