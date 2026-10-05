import { describe, expect, it } from "vitest";
import type { Agent, Project } from "../types";
import { canParentProject, normalizeBoardPosition, normalizeProjectHierarchy, removeProjectRelationships, resolveProjectSettings, updateProjectHierarchy } from "./projectHierarchy";
import { resolveSessionSettings } from "./sessionHierarchy";
const p = (id: string, extra: Partial<Project> = {}): Project => ({ id, name: id, folder: `C:/${id}`, createdAt: 1, ...extra });
describe("project relationships", () => {
  it("rejects cycles and machine mismatches and permits independent cross-folder references", () => {
    const projects = [p("root"), p("child", { hierarchy: { parentId: "root" } }), p("leaf", { hierarchy: { parentId: "child" } }), p("remote", { sshHostId: "ssh" })];
    expect(canParentProject(projects, "root", "leaf")).toBe(false);
    expect(canParentProject(projects, "root", "root")).toBe(false);
    expect(canParentProject(projects, "child", "remote")).toBe(false);
    expect(() => updateProjectHierarchy(projects, "root", { parentId: "leaf" })).toThrow("Invalid parent");
    const next = updateProjectHierarchy(projects, "root", { references: [{ projectId: "leaf", scopes: ["code"], access: "read" }] });
    expect(resolveProjectSettings(next[0], next).references[0].path).toBe("C:/leaf");
  });
  it("inherits instructions once, keeps own folder and conversation, and respects explicit session models", () => {
    const projects = [p("root", { hierarchy: { instructions: "Root guidance", models: { codex: { model: "parent-model" } } } }), p("child", { hierarchy: { parentId: "root", inheritModel: true, instructions: "Child guidance" } })];
    const root = { id: "a", projectId: "child", folder: "C:/child", aiToolId: "codex", lastSessionId: "own-chat", sessionHierarchy: { instructions: "Session guidance" } } as Agent;
    const leaf = { ...root, id: "b", modelSettings: { model: "explicit" }, sessionHierarchy: { parentId: "a", instructions: "Leaf guidance" } };
    expect(resolveSessionSettings(leaf, [root, leaf], projects)).toMatchObject({ folder: "C:/child", modelSettings: { model: "explicit" }, instructions: "Root guidance\n\nChild guidance\n\nSession guidance\n\nLeaf guidance" });
    expect(resolveSessionSettings(root, [root], projects).modelSettings).toEqual({ model: "parent-model" });
    expect(root.lastSessionId).toBe("own-chat");
  });
  it("preserves effective folder on detach or deletion without changing the registered project root", () => {
    const projects = [p("root"), p("child", { hierarchy: { parentId: "root", inheritFolder: true } }), p("reference", { hierarchy: { references: [{ projectId: "root", scopes: ["docs"], access: "read" }] } })];
    const detached = updateProjectHierarchy(projects, "child", { inheritFolder: true });
    expect(detached[1].folder).toBe("C:/child");
    expect(resolveProjectSettings(detached[1], detached).folder).toBe("C:/root");
    const removed = removeProjectRelationships(projects, "root");
    expect(resolveProjectSettings(removed[0], removed).folder).toBe("C:/root");
    expect(removed[1].hierarchy?.references).toBeUndefined();
  });
  it("references only the chosen root/subfolder and saved instructions, without recursing references", () => {
    const projects = [p("a", { hierarchy: { references: [{ projectId: "b", path: "Client/Docs", scopes: ["instructions", "docs"], access: "read" }] } }), p("b", { hierarchy: { instructions: "B rules", references: [{ projectId: "a", scopes: ["code"], access: "write" }] } })];
    const resolved = resolveProjectSettings(projects[0], projects);
    expect(resolved.references).toHaveLength(1);
    expect(resolved.instructions).toContain("C:/b/Client/Docs");
    expect(resolved.instructions).toContain("B rules");
    expect(resolved.instructions).toContain("Do not modify");
    expect(normalizeProjectHierarchy({ references: [{ projectId: "b", path: "../secret", scopes: ["code"] }] })).toBeUndefined();
    expect(normalizeBoardPosition({ x: Infinity, y: 0 })).toBeUndefined();
  });
});
