import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSidebarFilter, loadSidebarWidth, matchesSidebarFilter, recentSidebarSessions, searchSidebarItems, sidebarDateGroup, sidebarScreens, sidebarWidth } from "./sidebarNavigation";
import { loadStoredAgents, normalizeStoredGroups } from "./persistence";
import type { Agent, Group, Project } from "../types";

const projects: Project[] = [{ id: "p", name: "Acedia", folder: "C:/Acedia", createdAt: 1 }, { id: "ssh", name: "Server", folder: "", sshHostId: "server", remoteFolder: "/work/remote", createdAt: 1 }];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, projectId: "p", name: id, folder: "C:/Acedia", aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1, ...extra });

describe("sidebar navigation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sorts by user visits, pins before recent entries, and never uses runtime progress to reorder", () => {
    const input = [agent("created", { createdAt: 200 }), agent("visited", { lastOpenedAt: 300 }), agent("pinned", { sidebarPinned: true }), agent("busy", { activity: { receivedAt: 9999, stateStartedAt: 9999, workStatus: "working", source: "hook" } })];
    expect(recentSidebarSessions(input, projects, [], { projectId: null, filter: "all", query: "" }).map(a => a.id)).toEqual(["pinned", "visited", "created", "busy"]);
    expect(input.map(a => a.id)).toEqual(["created", "visited", "pinned", "busy"]);
  });
  it("intersects project scope, search and state while preserving archived data", () => {
    const archived = agent("archived", { sidebarArchived: true, status: "working" });
    const input = [agent("working", { status: "working" }), agent("sleeping", { resumeEligible: true, deferredStart: true }), agent("remote", { projectId: "ssh", status: "working", remoteFolder: "/work/remote" }), archived];
    const result = (projectId: string | null, filter: "all" | "active" | "sleeping", query: string) => recentSidebarSessions(input, projects, [], { projectId, filter, query }).map(a => a.id);
    expect(result("p", "active", "C:/Acedia")).toEqual(["working"]);
    expect(result(null, "all", "/work/remote")).toEqual(["remote"]);
    expect(result("p", "sleeping", "Acedia")).toEqual(["sleeping"]);
    expect(result("p", "sleeping", "working")).toEqual([]);
    expect(archived.sidebarArchived).toBe(true);
    expect(archived.status).toBe("working");
  });
  it("finds sessions by virtual folder names", () => {
    const p = { ...projects[0], projectFolderId: "folder" };
    expect(recentSidebarSessions([agent("one")], [p], [{ id: "folder", name: "업무", machineKey: "local", createdAt: 1 }], { projectId: null, filter: "all", query: "업무" })).toHaveLength(1);
  });
  it("searches projects and all session states together, including empty projects", () => {
    const input = [agent("working", { status: "working" }), agent("sleeping", { deferredStart: true, resumeEligible: true }),
      agent("new", { deferredStart: true }), agent("hidden", { sidebarArchived: true }), agent("orphan", { projectId: "deleted" })];
    const empty = { ...projects[0], id: "empty", name: "Acedia docs" };
    const result = searchSidebarItems(input, [...projects, empty], [], " ACEDIA ");
    expect(result.projects.map(project => project.id)).toEqual(["p", "empty"]);
    expect(result.sessions.map(session => session.id)).toEqual(["new", "sleeping", "working"]);
    expect(input.find(session => session.id === "hidden")?.sidebarArchived).toBe(true);
  });
  it("matches normalized local paths, remote paths and virtual folders across projects", () => {
    const folder = { id: "f", name: "게임 개발", machineKey: "local", createdAt: 1 };
    const allProjects = [{ ...projects[0], projectFolderId: "f" }, projects[1]];
    const input = [agent("local"), agent("remote", { projectId: "ssh", folder: "", remoteFolder: "/work/remote" })];
    for (const query of ["C:\\ACEDIA", "게임"]) {
      const result = searchSidebarItems(input, allProjects, [folder], query);
      expect(result.projects.map(project => project.id)).toEqual(["p"]);
      expect(result.sessions.map(session => session.id)).toEqual(["local"]);
    }
    const result = searchSidebarItems(input, allProjects, [folder], "/WORK/remote");
    expect(result.projects.map(project => project.id)).toEqual(["ssh"]);
    expect(result.sessions.map(session => session.id)).toEqual(["remote"]);
  });
  it("finds session titles/providers and retains pinned/recent ordering", () => {
    const input = [agent("older", { aiToolId: "claude", name: "이미지 확인" }),
      agent("recent", { aiToolId: "claude", lastOpenedAt: 50 }), agent("pin", { aiToolId: "claude", sidebarPinned: true }), agent("codex")];
    expect(searchSidebarItems(input, projects, [], "claude").sessions.map(session => session.id)).toEqual(["pin", "recent", "older"]);
    expect(searchSidebarItems(input, projects, [], "이미지").sessions.map(session => session.id)).toEqual(["older"]);
    expect(searchSidebarItems(input, projects, [], "이미지").projects).toEqual([]);
    expect(searchSidebarItems(input, projects, [], " ")).toEqual({ projects: [], sessions: [] });
    expect(searchSidebarItems(input, projects, [], "not-found")).toEqual({ projects: [], sessions: [] });
  });
  it("keeps restored sleep distinct from never-started, live questions and running sessions", () => {
    expect(matchesSidebarFilter(agent("new", { deferredStart: true, resumeEligible: false }), "sleeping")).toBe(false);
    expect(matchesSidebarFilter(agent("sleep", { deferredStart: true, resumeEligible: true }), "active")).toBe(false);
    expect(matchesSidebarFilter(agent("question", { status: "question", runtimeStatus: "running" }), "active")).toBe(true);
  });
  it("uses calendar boundaries and pinned groups", () => {
    const now = new Date(2026, 9, 8, 14).getTime();
    expect(sidebarDateGroup(agent("today", { lastOpenedAt: new Date(2026, 9, 8, 0).getTime() }), now)).toBe("today");
    expect(sidebarDateGroup(agent("yesterday", { lastOpenedAt: new Date(2026, 9, 7, 23, 59).getTime() }), now)).toBe("yesterday");
    expect(sidebarDateGroup(agent("week", { lastOpenedAt: new Date(2026, 9, 5, 12).getTime() }), now)).toBe("week");
    expect(sidebarDateGroup(agent("old"), now)).toBe("older");
    expect(sidebarDateGroup(agent("pin", { sidebarPinned: true }), now)).toBe("pinned");
  });
  it("loads migrated filters and safely clamps stored width", () => {
    const values = new Map<string, string>(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
    expect(loadSidebarWidth()).toBe(286);
    values.set("multiagent.sidebarWidth.v1", "broken"); expect(loadSidebarWidth()).toBe(286);
    values.set("multiagent.sidebarWidth.v1", "9000"); expect(loadSidebarWidth()).toBe(360);
    values.set("multiagent.activeOnly.v1", "1"); expect(loadSidebarFilter()).toBe("active");
    values.set("multiagent.sessionFilter.v1", "sleeping"); expect(loadSidebarFilter()).toBe("sleeping");
    expect(sidebarWidth(-1)).toBe(244); expect(sidebarWidth(Infinity)).toBe(286);
  });
  it("restores navigation metadata independently of pinned tabs and runtime", () => {
    const saved = { ...agent("saved"), sidebarPinned: true, sidebarArchived: true, lastOpenedAt: 123, pinned: false };
    const [restored] = loadStoredAgents([saved], projects);
    expect(restored).toMatchObject({ sidebarPinned: true, sidebarArchived: true, lastOpenedAt: 123, status: "idle" });
    expect(restored.pinned).toBeUndefined();
    const [invalid] = loadStoredAgents([{ ...saved, lastOpenedAt: Infinity, sidebarArchived: "false" } as unknown as typeof saved], projects);
    expect(invalid.lastOpenedAt).toBeUndefined(); expect(invalid.sidebarArchived).toBeUndefined();
  });
  it("preserves named splits and archived members but excludes tab-only groups", () => {
    const members = [agent("a"), agent("b", { sidebarArchived: true })];
    const split: Group = { id: "split", name: "  검토 화면  ", layout: { type: "split", id: "layout", direction: "h", sizes: [.5, .5], children: [{ type: "leaf", id: "a", tabs: ["a"], activeIndex: 0 }, { type: "leaf", id: "b", tabs: ["b"], activeIndex: 0 }] } };
    const tab: Group = { id: "tab", layout: { type: "leaf", id: "tabs", tabs: ["a", "b"], activeIndex: 0 } };
    const normalized = normalizeStoredGroups([split], new Set(["a", "b"]), new Map());
    expect(normalized[0].name).toBe("검토 화면");
    const screens = sidebarScreens([normalized[0], tab], members, projects, "b");
    expect(screens).toHaveLength(1); expect(screens[0].members).toHaveLength(2); expect(screens[0].targetAgentId).toBe("b");
  });
});
