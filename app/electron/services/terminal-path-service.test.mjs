import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveTerminalPath } from "./terminal-path-service.mjs";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => {
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("multiagent-path-")) throw Error("Unsafe test cleanup path");
  fs.rmSync(root, { recursive: true });
}));

describe("terminal path resolver", () => {
  it("opens Chat Markdown drive links, dot-relative files and source anchors", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    const file = path.join(root, "미리보기 %20.html");
    fs.writeFileSync(file, "<h1>Preview</h1>");
    const candidates = ["./미리보기 %20.html", `${file}#L12C3-L15C2`, `${file}:12:3`];
    if (process.platform === "win32") candidates.push(`/${file.replaceAll("\\", "/")}`);
    for (const candidate of candidates) expect(resolveTerminalPath(root, candidate)).toEqual({ kind: "html", path: fs.realpathSync(file) });
  });
  it('resolves generated output-relative links while preferring a matching project-relative file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'multiagent-path-'));
    roots.push(root);
    const results = path.join(root, 'output', 'akari-parts-v1-2026-10-07');
    fs.mkdirSync(results, { recursive: true });
    fs.writeFileSync(path.join(results, 'character-four-view.png'), 'fixture');
    expect(resolveTerminalPath(root, 'akari-parts-v1-2026-10-07/character-four-view.png').path).toBe(path.join(results, 'character-four-view.png'));
    expect(resolveTerminalPath(root, 'akari-parts-v1-2026-10-07/').kind).toBe('folder');
    fs.mkdirSync(path.join(root, 'akari-parts-v1-2026-10-07'));
    fs.writeFileSync(path.join(root, 'akari-parts-v1-2026-10-07', 'character-four-view.png'), 'root fixture');
    expect(resolveTerminalPath(root, 'akari-parts-v1-2026-10-07/character-four-view.png').path).toBe(path.join(root, 'akari-parts-v1-2026-10-07', 'character-four-view.png'));
  });
  it("resolves project-relative markdown paths and line suffixes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "docs", "guide.md"), "# guide");
    const result = resolveTerminalPath(root, "docs/guide.md:42");
    expect(result.kind).toBe("markdown");
    expect(result.path).toBe(fs.realpathSync(path.join(root, "docs", "guide.md")));
  });

  it("rejects traversal outside the project", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    expect(() => resolveTerminalPath(root, "../secret.md")).toThrow(/상대경로/);
  });

  it("opens file URLs outside the project and decodes their filenames once", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    const project = path.join(root, "project");
    fs.mkdirSync(project);
    const image = path.join(root, "노란 우비 #1 %20.png");
    fs.writeFileSync(image, "image fixture");
    const url = pathToFileURL(image).href;
    for (const candidate of [url, url.replace(/^file:/, "FILE:"), url.replace("file:///", "file://localhost/"), `<${url}>`]) {
      expect(resolveTerminalPath(project, candidate)).toEqual({
        kind: "image", path: fs.realpathSync(image),
      });
    }
  });

  it("resolves file URL documents and folders without project-relative lookup", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    const document = path.join(root, "guide.md");
    fs.writeFileSync(document, "# guide");
    expect(resolveTerminalPath("", `${pathToFileURL(document).href}#L42`))
      .toEqual({ kind: "markdown", path: fs.realpathSync(document) });
    expect(resolveTerminalPath("", pathToFileURL(root).href))
      .toEqual({ kind: "folder", path: fs.realpathSync(root) });
  });

  it("rejects malformed file URLs and missing files without opening a shorter path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-path-"));
    roots.push(root);
    const image = path.join(root, "result.png");
    fs.writeFileSync(image, "image fixture");
    const url = pathToFileURL(image).href;
    for (const candidate of [`${url}%zz`, `${url}%2Fmissing.png`]) {
      expect(() => resolveTerminalPath(root, candidate)).toThrow(/파일 URL/);
    }
    expect(() => resolveTerminalPath(root, `${url}%20missing`)).toThrow(/찾을 수 없습니다/);
  });
});
