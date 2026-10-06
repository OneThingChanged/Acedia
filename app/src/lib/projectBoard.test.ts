import { describe, expect, it } from "vitest";
import type { Agent, Project } from "../types";
import { boardProjects, folderProjectParents, layoutProjectBoard, PROJECT_CARD_WIDTH } from "./projectBoard";
const project = (id: string, folder = `C:/${id}`, extra: Partial<Project> = {}): Project => ({ id, name: id, folder, createdAt: 1, ...extra });
const agent = (projectId: string, extra: Partial<Agent> = {}): Agent => ({ id: projectId, projectId, name: projectId, folder: "C:/", aiToolId: "codex", aiLabel: "Codex", dangerous: false, createdAt: 1, status: "running", ...extra });

describe("project board visibility and folder hierarchy", () => {
  it("hides projects without a live runtime even when they have saved sessions or active descendants", () => {
    const projects = [project("root"), project("child", "C:/root/child"), project("idle"), project("exited"), project("deferred"), project("empty"), project("done")];
    const agents = [agent("root", { runtimeStatus: "idle" }), agent("child"), agent("idle", { status: "idle" }), agent("exited", { runtimeStatus: "exited", status: "working" }), agent("deferred", { status: "starting", deferredStart: true }), agent("done", { runtimeStatus: "running", activity: { workStatus: "done", source: "hook", receivedAt: 1, stateStartedAt: 1 } })];
    expect(boardProjects(projects, agents, true).map(p => p.id)).toEqual(["child", "done"]);
    expect(boardProjects(projects, agents, false)).toEqual(projects);
    expect(boardProjects(projects, [], true)).toEqual([]);
  });
  it("finds the nearest Windows ancestor across separators, case and dot segments, using folder boundaries", () => {
    const projects = [project("root", "G:\\AI\\"), project("project", "g:/ai/ProjectA/"), project("plugin", "G:\\AI\\ProjectA\\UnrealTF\\..\\UnrealTF\\Plugins\\AXManager"), project("sibling", "G:/AI/ProjectAB"), project("same", "G:/AI/PROJECTA"), project("relative", "G:AI/ProjectA/Child")];
    expect([...folderProjectParents(projects)]).toEqual([["project", "root"], ["plugin", "project"], ["sibling", "root"], ["same", "root"]]);
    expect(folderProjectParents(projects.filter(p => p.id !== "project" && p.id !== "same")).get("plugin")).toBe("root");
    expect(folderProjectParents([project("drive", "C:/"), project("child", "c:/root")]).get("child")).toBe("drive");
  });
  it("respects SSH machine boundaries, case-sensitive remote folders and UNC share boundaries", () => {
    const projects = [project("local", "/repo"), project("ssh", "", { sshHostId: "a", remoteFolder: "/repo" }), project("ssh-child", "", { sshHostId: "a", remoteFolder: "/repo/sub" }), project("ssh-case", "", { sshHostId: "a", remoteFolder: "/Repo/sub" }), project("other-host", "", { sshHostId: "b", remoteFolder: "/repo/sub" }), project("share", "\\\\Server\\Share"), project("share-child", "//server/SHARE/project"), project("other-share", "//server/share-other/project")];
    expect([...folderProjectParents(projects)]).toEqual([["ssh-child", "ssh"], ["share-child", "share"]]);
  });
  it("places parents above children without overlapping cards, and packs independent trees into rows", () => {
    const projects = [project("root"), project("a", "C:/root/a"), project("b", "C:/root/b"), project("leaf", "C:/root/a/leaf"), ...Array.from({ length: 7 }, (_, i) => project(`other${i}`))];
    const height = (id: string) => id === "a" ? 400 : 190;
    const positions = layoutProjectBoard(projects, folderProjectParents(projects), height);
    expect(positions.size).toBe(projects.length);
    for (const [child, parent] of folderProjectParents(projects)) expect(positions.get(child)!.y).toBeGreaterThan(positions.get(parent)!.y + height(parent));
    expect(positions.get("a")!.y).toBe(positions.get("b")!.y);
    for (let i = 0; i < projects.length; i++) for (let j = i + 1; j < projects.length; j++) {
      const a = positions.get(projects[i].id)!, b = positions.get(projects[j].id)!;
      expect(a.x + PROJECT_CARD_WIDTH <= b.x || b.x + PROJECT_CARD_WIDTH <= a.x || a.y + height(projects[i].id) <= b.y || b.y + height(projects[j].id) <= a.y).toBe(true);
    }
    expect(new Set([...positions.values()].map(p => p.y)).size).toBeGreaterThan(3);
  });
  it("keeps manual relationships as a layout fallback without cycling through folder ancestry or changing settings", () => {
    const projects = [project("root", "C:/root", { hierarchy: { parentId: "child" } }), project("child", "C:/root/child"), project("manual", "D:/independent", { hierarchy: { parentId: "child" } })];
    const snapshot = JSON.stringify(projects);
    const positions = layoutProjectBoard(projects, folderProjectParents(projects), () => 190);
    expect(positions.size).toBe(3);
    expect(positions.get("root")!.y).toBe(0);
    expect(positions.get("manual")!.y).toBeGreaterThan(positions.get("child")!.y);
    expect(JSON.stringify(projects)).toBe(snapshot);
    const cycle = [project("a", undefined, { hierarchy: { parentId: "b" } }), project("b", undefined, { hierarchy: { parentId: "a" } })];
    expect(layoutProjectBoard(cycle, new Map(), () => 190).size).toBe(2);
  });
});
