import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { savePastedText } from "./pasted-text.mjs";

it("stores concurrent clipboard pastes in distinct TXT files without altering UTF-8 text", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-pasted-text-"));
  try {
    const text = "\ufeff  한글🙂\r\n".repeat(900) + "\n마지막  \r\n";
    const files = await Promise.all([savePastedText(root, text), savePastedText(root, text)]);
    expect(new Set(files).size).toBe(2);
    for (const file of files) {
      expect(path.dirname(file)).toBe(root);
      expect(path.extname(file)).toBe(".txt");
      expect(await fs.readFile(file)).toEqual(Buffer.from(text, "utf8"));
    }
    await expect(savePastedText(root, "가".repeat(3 * 1024 * 1024))).rejects.toThrow(/8 MiB/);
    expect(await fs.readdir(root)).toHaveLength(2);
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-pasted-text-")) {
      throw new Error("Unexpected paste test directory");
    }
    await fs.rm(root, { recursive: true });
  }
});
