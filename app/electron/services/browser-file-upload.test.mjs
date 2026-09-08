import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateUploadFiles, uploadBrowserFiles } from "./browser-file-upload.mjs";

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "browser-upload-test-")); roots.push(root);
  const file = path.join(root, "테스트 file.txt"); await fs.writeFile(file, "upload fixture");
  return { root, file };
}
describe("browser upload file boundary", () => {
  it("accepts existing explicit files, including spaces and Unicode", async () => {
    const { file } = await fixture();
    expect(await validateUploadFiles([file])).toEqual([await fs.realpath(file)]);
  });
  it("rejects relative, missing, duplicate and directory paths without exposing paths", async () => {
    const { root, file } = await fixture();
    for (const files of [[], ["relative.txt"], [root], [path.join(root, "private-missing")], [file, file], Array(21).fill(file)]) {
      await expect(validateUploadFiles(files)).rejects.toThrow();
    }
    const result = await uploadBrowserFiles(null, { selector: "input", files: [path.join(root, "private-missing")] });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain("private-missing");
  });
  it("does not touch another debugger connection", async () => {
    const { file } = await fixture();
    const result = await uploadBrowserFiles({ isDestroyed: () => false, debugger: { isAttached: () => true } }, { selector: "#file", files: [file] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("busy");
  });
});
