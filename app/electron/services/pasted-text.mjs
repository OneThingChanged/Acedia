import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_REMOTE_DOCUMENT_BYTES } from "../shared/remote-attachments.mjs";

export async function savePastedText(directory, text) {
  if (!text.length || Buffer.byteLength(text, "utf8") > MAX_REMOTE_DOCUMENT_BYTES) {
    throw new RangeError("Pasted text must be a non-empty UTF-8 document up to 8 MiB.");
  }
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `pasted-text-${randomUUID()}.txt`);
  await fs.writeFile(file, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return file;
}
