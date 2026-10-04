import { describe, expect, it } from "vitest";
import type { Agent } from "../types";
import { canParentSession, layoutSessionHierarchy, normalizeSessionHierarchy, removeSessionFromHierarchy, repairSessionHierarchy, resolveSessionSettings, withSessionModelOverride } from "./sessionHierarchy";
import { loadStoredAgents } from "./persistence";

const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, projectId: "p", name: id, folder: "C:/project", aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1, ...extra });
const projects = [{ id: "p", name: "Project", folder: "C:/project", createdAt: 1 }];
describe("session hierarchy", () => {
  it("restores legacy roots, custom folders and creation provenance", () => {
    const stored = [agent("parent"), agent("child", { folder: "C:/custom", sessionHierarchy: { parentId: "parent", createdById: "parent", inheritFolder: false, folderOverride: "C:/custom", resumeContext: { sessionId: "own-chat", folder: "C:/original" } } })];
    const restored = loadStoredAgents(stored, projects);
    expect(restored[0].sessionHierarchy).toBeUndefined();
    expect(restored[1]).toMatchObject({ folder: "C:/custom", sessionHierarchy: stored[1].sessionHierarchy });
  });
  it("blocks missing, cross-project, self and descendant parents and repairs malformed storage", () => {
    const catalog = [agent("root"), agent("child", { sessionHierarchy: { parentId: "root" } }), agent("leaf", { sessionHierarchy: { parentId: "child" } }), agent("other", { projectId: "q" })];
    for (const parent of ["missing", "other", "root", "leaf"]) expect(canParentSession(catalog, "root", parent)).toBe(false);
    expect(canParentSession(catalog, "leaf", "root")).toBe(true);
    expect(canParentSession(catalog, "leaf", undefined)).toBe(true);
    const broken = [agent("a", { sessionHierarchy: { parentId: "b" } }), agent("b", { sessionHierarchy: { parentId: "a" } }), agent("orphan", { sessionHierarchy: { parentId: "missing", createdById: "deleted" } })];
    expect(repairSessionHierarchy(broken).every((item) => !item.sessionHierarchy?.parentId)).toBe(true);
    expect(repairSessionHierarchy(broken)[2].sessionHierarchy?.createdById).toBe("deleted");
  });
  it("inherits settings through several levels and preserves explicit child overrides", () => {
    const root = agent("root", { modelSettings: { model: "parent-model", effort: "high" }, sessionHierarchy: { folderOverride: "C:/root-work", instructions: "Root rules" } });
    const child = agent("child", { modelSettings: { model: "own-model", effort: "low" }, sessionHierarchy: { parentId: "root", inheritModel: true, instructions: "Child rules" } });
    const leaf = agent("leaf", { sessionHierarchy: { parentId: "child", inheritFolder: false, folderOverride: "C:/leaf-work", instructions: "Leaf rules" } });
    const catalog = [root, child, leaf];
    expect(resolveSessionSettings(child, catalog)).toMatchObject({ folder: "C:/root-work", instructions: "Root rules\n\nChild rules", modelSettings: root.modelSettings });
    expect(resolveSessionSettings(leaf, catalog)).toMatchObject({ folder: "C:/leaf-work", instructions: "Root rules\n\nChild rules\n\nLeaf rules" });
    expect(child.modelSettings?.model).toBe("own-model");
    child.sessionHierarchy!.inheritModel = false;
    child.sessionHierarchy!.inheritInstructions = false;
    expect(resolveSessionSettings(child, catalog)).toMatchObject({ instructions: "Child rules", modelSettings: child.modelSettings });
  });
  it("does not copy cross-provider models, permission bypass or accounts", () => {
    const root = agent("root", { modelSettings: { model: "codex-only" }, dangerous: true, codexAccountId: "parent-account" });
    const child = agent("child", { aiToolId: "claude", modelSettings: { model: "sonnet" }, sessionHierarchy: { parentId: "root", inheritModel: true } });
    expect(resolveSessionSettings(child, [root, child]).modelSettings).toEqual({ model: "sonnet" });
    expect(child.dangerous).toBe(false);
    expect(child.codexAccountId).toBeUndefined();
  });
  it("promotes children when deleting a parent while preserving effective settings and conversations", () => {
    const root = agent("root", { modelSettings: { model: "root-model" }, sessionHierarchy: { instructions: "Root rules", folderOverride: "C:/root-work" } });
    const middle = agent("middle", { sessionHierarchy: { parentId: "root", inheritModel: true, instructions: "Middle rules" } });
    const child = agent("child", { lastSessionId: "independent-chat", sessionHierarchy: { parentId: "middle", createdById: "middle", inheritModel: true, instructions: "Child rules" } });
    const before = [root, middle, child];
    const result = removeSessionFromHierarchy(before, "middle");
    expect(result[1].sessionHierarchy).toMatchObject({ parentId: "root", createdById: "middle", inheritFolder: false, inheritInstructions: false, inheritModel: false });
    expect(result[1].lastSessionId).toBe("independent-chat");
    expect(resolveSessionSettings(result[1], result)).toEqual(resolveSessionSettings(child, before));
  });
  it("places sibling branches separately and hides only collapsed descendants", () => {
    const catalog = [agent("root"), agent("left", { sessionHierarchy: { parentId: "root" } }), agent("right", { sessionHierarchy: { parentId: "root" } })];
    const layout = layoutSessionHierarchy(catalog, new Set());
    expect(layout.nodes).toHaveLength(3);
    expect(layout.nodes[1].x).toBeLessThan(layout.nodes[2].x);
    expect(layout.nodes[1].y).toBeGreaterThan(layout.nodes[0].y);
    expect(layoutSessionHierarchy(catalog, new Set(["root"])).nodes.map((item) => item.agent.id)).toEqual(["root"]);
  });
  it("keeps local project metadata separate from inherited SSH working folders", () => {
    const root = agent("root", { sshHostId: "host", remoteFolder: "/project", sessionHierarchy: { folderOverride: "/remote/custom" } });
    const child = agent("child", { sshHostId: "host", remoteFolder: "/project", sessionHierarchy: { parentId: "root" } });
    expect(resolveSessionSettings(child, [root, child])).toMatchObject({ folder: "C:/project", remoteFolder: "/remote/custom" });
  });
  it("turns an explicitly changed child model into an override without changing provenance", () => {
    const root = agent("root", { modelSettings: { model: "parent-model" } });
    const child = agent("child", { sessionHierarchy: { parentId: "root", createdById: "root", inheritModel: true } });
    const edited = withSessionModelOverride(child, { model: "child-model" });
    expect(edited.sessionHierarchy).toMatchObject({ parentId: "root", createdById: "root", inheritModel: false });
    expect(resolveSessionSettings(edited, [root, edited]).modelSettings).toEqual({ model: "child-model" });
  });
  it("sanitizes optional metadata without mutating storage", () => {
    const raw = { parentId: " parent ", createdById: 42, inheritFolder: false, instructions: " rules ", unknown: true };
    expect(normalizeSessionHierarchy(raw)).toEqual({ parentId: "parent", inheritFolder: false, instructions: "rules" });
    expect(raw.parentId).toBe(" parent ");
    expect(normalizeSessionHierarchy({ resumeContext: { sessionId: "own-chat", folder: "bad\0folder" } })).toBeUndefined();
  });
});
