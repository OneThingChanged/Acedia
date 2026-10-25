import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Agent, Project } from "../types";
import { resolveSessionDocumentLink } from "./sessionFileLinks";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-session-links-")) throw new Error("Unexpected fixture path");
    fs.rmSync(directory, { recursive: true });
  }
});

function fixture(relativePath = "Saved/Tests/report.html") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-session-links-"));
  directories.push(directory);
  const projectFolder = path.join(directory, "RnDHub"), childFolder = path.join(projectFolder, "RnDProject");
  for (const [folder, text] of [[projectFolder, "parent report"], [childFolder, "child report"]]) {
    const file = path.join(folder, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
  }
  const project: Project = { id: "project", name: "RnDHub", folder: projectFolder, createdAt: 1 };
  const root: Agent = { id: "root", projectId: project.id, name: "Manager", folder: projectFolder,
    aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1 };
  const child: Agent = { ...root, id: "child", name: "RnDProject", folder: childFolder,
    sessionHierarchy: { parentId: root.id, inheritFolder: false, folderOverride: childFolder } };
  const calls: { folder: string; path: string }[] = [];
  // The IPC returns paths relative to the supplied working folder, or absolute
  // paths for external documents. Use real files with conflicting parent names.
  const resolvePath = async (args: { folder: string; path: string }) => {
    calls.push(args);
    const resolved = fs.realpathSync(path.resolve(args.folder, args.path));
    const relative = path.relative(args.folder, resolved);
    return relative.startsWith("..") ? resolved : relative.replace(/\\/g, "/");
  };
  return { project, root, child, projectFolder, childFolder, relativePath, resolvePath, calls, directory };
}

describe("session document links", () => {
  it.each(["Saved/Tests/report.html", "Docs/Status.md", "Saved/Results with spaces/report.html"])
  ("opens the child session's %s instead of the same-named parent file", async relativePath => {
    const f = fixture(relativePath);
    const result = await resolveSessionDocumentLink(f.child, [f.root, f.child], [f.project], relativePath, f.resolvePath);
    expect(f.calls[0].folder).toBe(f.childFolder);
    expect(result.relativePath).toBe("RnDProject/" + relativePath);
    expect(fs.readFileSync(result.absolutePath, "utf8")).toBe("child report");
    // The tab reads from the registered project root, not the session root.
    expect(fs.readFileSync(path.join(f.projectFolder, result.relativePath!), "utf8")).toBe("child report");
  });
  it("follows inherited effective folders rather than stale stored child folders", async () => {
    const f = fixture();
    const parent = { ...f.root, sessionHierarchy: { folderOverride: f.childFolder } };
    const child = { ...f.child, folder: f.projectFolder, sessionHierarchy: { parentId: parent.id } };
    const leaf = { ...child, id: "leaf", sessionHierarchy: { parentId: child.id } };
    const result = await resolveSessionDocumentLink(leaf, [parent, child, leaf], [f.project], f.relativePath, f.resolvePath);
    expect(f.calls[0].folder).toBe(f.childFolder);
    expect(result.relativePath).toBe("RnDProject/" + f.relativePath);
  });
  it("keeps ordinary project sessions and absolute child links pointing to the same tab", async () => {
    const f = fixture();
    const parent = await resolveSessionDocumentLink(f.root, [f.root, f.child], [f.project], f.relativePath, f.resolvePath);
    expect(parent.relativePath).toBe(f.relativePath);
    const child = await resolveSessionDocumentLink(f.child, [f.root, f.child], [f.project], path.join(f.childFolder, f.relativePath), f.resolvePath);
    expect(child.relativePath).toBe("RnDProject/" + f.relativePath);
    expect(fs.readFileSync(parent.absolutePath, "utf8")).toBe("parent report");
  });
  it("preserves an external document's absolute path without treating a matching root prefix as inside", async () => {
    const f = fixture();
    const outside = path.join(f.directory, "RnDHub-other", "report.md");
    fs.mkdirSync(path.dirname(outside)); fs.writeFileSync(outside, "external");
    const result = await resolveSessionDocumentLink(f.child, [f.root, f.child], [f.project], outside, f.resolvePath);
    expect(result.relativePath).toBeNull(); expect(result.absolutePath).toBe(fs.realpathSync(outside));
  });
  it("propagates missing child files instead of opening an identically named parent report", async () => {
    const f = fixture();
    fs.unlinkSync(path.join(f.childFolder, f.relativePath));
    await expect(resolveSessionDocumentLink(f.child, [f.root, f.child], [f.project], f.relativePath, f.resolvePath)).rejects.toThrow();
  });
});
