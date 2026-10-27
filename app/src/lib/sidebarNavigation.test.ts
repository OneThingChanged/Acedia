import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSidebarFilter, loadSidebarWidth, matchesSidebarFilter, recentSidebarSessions, searchSidebarItems, sidebarDateGroup, sidebarScreens, sidebarWidth } from "./sidebarNavigation";
import { loadStoredAgents, normalizeStoredGroups } from "./persistence";
import type { Agent, Group, Project } from "../types";
import { sidebarSessionFamilies, sidebarInactiveChildrenVisible, loadSidebarCollapsedFamilies, LS_SIDEBAR_COLLAPSED_FAMILIES } from './sidebarNavigation';

const projects: Project[] = [{ id: "p", name: "Acedia", folder: "C:/Acedia", createdAt: 1 }, { id: "ssh", name: "Server", folder: "", sshHostId: "server", remoteFolder: "/work/remote", createdAt: 1 }];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, projectId: "p", name: id, folder: "C:/Acedia", aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1, ...extra });

describe("sidebar navigation", () => {
  it('hides inactive branches by default while retaining active descendants and their required ancestors', () => {
    const all = [agent('parent', { status: 'working' }),
      agent('sleep', { deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'parent' } }),
      agent('stopped', { deferredStart: true, resumeEligible: false, sessionHierarchy: { parentId: 'parent' } }),
      agent('active', { status: 'working', sessionHierarchy: { parentId: 'stopped' } })];
    const tree = sidebarSessionFamilies([all[0], all[3]], all, { includeDescendants: true, respectInactiveChildrenVisibility: true });
    expect(tree.children.get('parent')?.map(a => a.id)).toEqual(['stopped']);
    expect(tree.children.get('stopped')?.map(a => a.id)).toEqual(['active']);
    expect(sidebarInactiveChildrenVisible(all[0], all)).toBe(false);
    expect(all[1].resumeEligible).toBe(true);
  });
  it('uses each parent choice, inherits Show through inactive intermediates and honors explicit child Hide', () => {
    const all = [agent('parent', { status: 'working', sidebarShowInactiveChildren: true }),
      agent('child', { sessionHierarchy: { parentId: 'parent' } }),
      agent('grandchild', { deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'child' } }),
      agent('other', { status: 'working' }), agent('other-sleep', { sessionHierarchy: { parentId: 'other' } })];
    const options = { includeDescendants: true, respectInactiveChildrenVisibility: true };
    let tree = sidebarSessionFamilies([all[0], all[3]], all, options);
    expect(tree.children.get('parent')?.map(a => a.id)).toEqual(['child']);
    expect(tree.children.get('child')?.map(a => a.id)).toEqual(['grandchild']);
    expect(tree.children.has('other')).toBe(false);
    all[1].sidebarShowInactiveChildren = false;
    tree = sidebarSessionFamilies([all[0], all[3]], all, options);
    expect(tree.children.get('parent')?.map(a => a.id)).toEqual(['child']); expect(tree.children.has('child')).toBe(false);
    expect(sidebarInactiveChildrenVisible(all[1], all)).toBe(false);
  });
  it('lets an inactive contextual parent opt in without hiding active children when it opts out', () => {
    const parent = agent('parent', { sidebarShowInactiveChildren: true });
    const active = agent('active', { status: 'working', sessionHierarchy: { parentId: 'parent' } });
    const sleep = agent('sleep', { deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'parent' } });
    const options = { includeDescendants: true, respectInactiveChildrenVisibility: true };
    expect(new Set(sidebarSessionFamilies([active], [parent, active, sleep], options).children.get('parent')?.map(a => a.id))).toEqual(new Set(['active', 'sleep']));
    parent.sidebarShowInactiveChildren = false;
    expect(sidebarSessionFamilies([active], [parent, active, sleep], options).children.get('parent')?.map(a => a.id)).toEqual(['active']);
  });
  it('keeps All, Sleeping and search discoverable regardless of inactive-child visibility', () => {
    const parent = agent('parent', { status: 'working', sidebarShowInactiveChildren: false });
    const sleep = agent('sleep', { deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'parent' } });
    const all = [parent, sleep];
    expect(sidebarSessionFamilies(all, all, { respectInactiveChildrenVisibility: true }).children.get('parent')?.map(a => a.id)).toEqual(['sleep']);
    expect(sidebarSessionFamilies([sleep], all, { respectInactiveChildrenVisibility: true }).children.get('parent')?.map(a => a.id)).toEqual(['sleep']);
    expect(searchSidebarItems(all, projects, [], 'sleep').sessions.map(a => a.id)).toEqual(['sleep']);
  });
  it.each([true, false, undefined])('restores an explicit %s child-visibility choice without changing session state', choice => {
    const restored = loadStoredAgents([{ id: 'a', name: 'A', projectId: 'p', folder: 'C:/Acedia', aiToolId: 'codex', createdAt: 1,
      sidebarShowInactiveChildren: choice, lastSessionId: 'conversation', resumeEligible: true }], projects);
    expect(restored[0]).toMatchObject({ lastSessionId: 'conversation', resumeEligible: true });
    expect(restored[0].sidebarShowInactiveChildren).toBe(choice);
  });
  it('retains stopped, exited and never-started descendants below active parents and traverses inactive branches', () => {
    const parent=agent('parent',{status:'working',runtimeStatus:'running'});
    const stopped=agent('stopped',{deferredStart:true,resumeEligible:false,sessionHierarchy:{parentId:parent.id}});
    const exited=agent('exited',{status:'exited',runtimeStatus:'exited',sessionHierarchy:{parentId:parent.id}});
    const fresh=agent('fresh',{deferredStart:true,resumeEligible:false,sessionHierarchy:{parentId:parent.id}});
    const grandchild=agent('grandchild',{deferredStart:true,resumeEligible:true,sessionHierarchy:{parentId:stopped.id}});
    const leaf=agent('leaf',{status:'idle',sessionHierarchy:{parentId:grandchild.id}});
    const all=[parent,stopped,exited,fresh,grandchild,leaf,agent('unrelated'),agent('archived',{sidebarArchived:true,sessionHierarchy:{parentId:parent.id}}),agent('other-project',{projectId:'ssh',sessionHierarchy:{parentId:parent.id}})];
    const before=structuredClone(all);
    const visible=recentSidebarSessions(all,projects,[],{projectId:'p',filter:'active',query:''});
    const tree=sidebarSessionFamilies(visible,all,{includeDescendants:true});
    expect(tree.roots.map(a=>a.id)).toEqual(['parent']);
    expect(new Set(tree.children.get(parent.id)?.map(a=>a.id))).toEqual(new Set(['stopped','exited','fresh']));
    expect(tree.children.get(stopped.id)?.map(a=>a.id)).toEqual(['grandchild']);
    expect(tree.children.get(grandchild.id)?.map(a=>a.id)).toEqual(['leaf']);
    expect(visible.map(a=>a.id)).toEqual(['parent']);
    expect(all.filter(a=>matchesSidebarFilter(a,'sleeping')).map(a=>a.id)).toEqual(['grandchild']);
    expect(all).toEqual(before);
  });
  it('keeps sleeping descendants under an active parent without changing runtime, counts or unrelated sessions', () => {
    const parent=agent('parent',{status:'working',runtimeStatus:'running'});
    const sleeping=(id:string,parentId?:string,extra:Partial<Agent>={})=>agent(id,{deferredStart:true,resumeEligible:true,sessionHierarchy:parentId?{parentId}:undefined,...extra});
    const child=sleeping('child','parent'),grandchild=sleeping('grandchild','child');
    const all=[parent,child,grandchild,sleeping('unrelated'),sleeping('archived','parent',{sidebarArchived:true}),sleeping('other-project','parent',{projectId:'ssh'})];
    const before=structuredClone(all);
    const visible=recentSidebarSessions(all,projects,[],{projectId:'p',filter:'active',query:''});
    expect(visible.map(a=>a.id)).toEqual(['parent']);
    const tree=sidebarSessionFamilies(visible,all,{includeDescendants:true});
    expect(tree.roots.map(a=>a.id)).toEqual(['parent']);
    expect(tree.children.get('parent')?.map(a=>a.id)).toEqual(['child']);
    expect(tree.children.get('child')?.map(a=>a.id)).toEqual(['grandchild']);
    expect(matchesSidebarFilter(child,'active')).toBe(false);expect(matchesSidebarFilter(child,'sleeping')).toBe(true);
    expect(all).toEqual(before);
    expect(sidebarSessionFamilies(visible,all).children.size).toBe(0);
  });
  it('does not expose sleeping siblings through an inactive contextual parent and hides them when the parent stops', () => {
    const parent=agent('parent'),active=agent('active',{status:'working',sessionHierarchy:{parentId:'parent'}});
    const sleeping=agent('sleeping',{deferredStart:true,resumeEligible:true,sessionHierarchy:{parentId:'parent'}});
    const stopped=agent('stopped',{deferredStart:true,resumeEligible:false,sessionHierarchy:{parentId:'parent'}});
    const tree=sidebarSessionFamilies([active],[parent,active,sleeping,stopped],{includeDescendants:true});
    expect(tree.roots.map(a=>a.id)).toEqual(['parent']);expect(tree.children.get('parent')?.map(a=>a.id)).toEqual(['active']);
    expect(sidebarSessionFamilies([],[parent,sleeping,stopped],{includeDescendants:true}).roots).toEqual([]);
  });
  it('orders sleeping context by the same visits, pins and name preference as other tree children', () => {
    const parent=agent('parent',{status:'working'});
    const children=[agent('b',{deferredStart:true,resumeEligible:true,lastOpenedAt:20,sessionHierarchy:{parentId:'parent'}}),agent('a',{deferredStart:true,resumeEligible:true,lastOpenedAt:10,sessionHierarchy:{parentId:'parent'}})];
    expect(sidebarSessionFamilies([parent],[parent,...children],{includeDescendants:true}).children.get('parent')?.map(a=>a.id)).toEqual(['b','a']);
    expect(sidebarSessionFamilies([parent],[parent,...children],{includeDescendants:true,sortByName:true}).children.get('parent')?.map(a=>a.id)).toEqual(['a','b']);
  });
  it('groups all organized children below the current parent, including manually organized sessions', () => {
    const parent = agent('A'), child = agent('worker', { sessionHierarchy: { parentId: 'A', createdById: 'A' } }), manual = agent('manual', { sessionHierarchy: { parentId: 'A' } });
    const all = [child, manual, parent], family = sidebarSessionFamilies(all, all);
    expect(family.roots.map(a => a.id)).toEqual(['A']); expect(family.children.get('A')?.map(a => a.id)).toEqual(['worker', 'manual']);
    expect(sidebarSessionFamilies([child], all).roots.map(a => a.id)).toEqual(['A']);
    const archived = { ...parent, sidebarArchived: true };
    expect(sidebarSessionFamilies([child], [child, archived]).roots.map(a => a.id)).toEqual(['worker']);
    expect(all[0].sessionHierarchy?.parentId).toBe('A');
  });
  it('follows RnDHub after reparenting AIHub-created sessions and retains filtered ancestor context', () => {
    const creator = agent('AIHub', { projectId:'other' }), parent = agent('RnDHub');
    const children = ['ShaderLevelUp','ShaderNoiseBall','ShaderSkinner'].map(id => agent(id, { status:'working', sessionHierarchy:{parentId:parent.id,createdById:creator.id} }));
    const all = [creator,...children,parent], before = structuredClone(all);
    const family = sidebarSessionFamilies(children,all);
    expect(family.roots.map(a=>a.id)).toEqual(['RnDHub']);
    expect(family.children.get('RnDHub')?.map(a=>a.id)).toEqual(children.map(a=>a.id));
    expect(family.children.has('AIHub')).toBe(false);
    expect(all).toEqual(before);
    expect(searchSidebarItems(all,projects,[],'ShaderSkinner').sessions.map(a=>a.id)).toEqual(['ShaderSkinner']);
  });
  it('retains nested ancestor chains but detaches missing, archived, cross-project and cyclic parents', () => {
    const grandparent=agent('grandparent'), parent=agent('parent',{sessionHierarchy:{parentId:'grandparent'}}), child=agent('child',{sessionHierarchy:{parentId:'parent',createdById:'old'}});
    const family=sidebarSessionFamilies([child],[child,parent,grandparent]);
    expect(family.roots.map(a=>a.id)).toEqual(['grandparent']);
    expect(family.children.get('grandparent')?.map(a=>a.id)).toEqual(['parent']);
    expect(family.children.get('parent')?.map(a=>a.id)).toEqual(['child']);
    for(const input of [[child],[child,{...parent,sidebarArchived:true}],[child,{...parent,projectId:'other'}],[child,{...parent,sessionHierarchy:{parentId:'child'}}]]) {
      expect(sidebarSessionFamilies([child],input).roots.map(a=>a.id)).toEqual(['child']);
    }
  });
  it('loads remembered collapsed families and safely defaults malformed data to expanded', () => {
    for(const raw of ['null','{}','broken']) {
      vi.stubGlobal('localStorage',{getItem:()=>raw}); expect([...loadSidebarCollapsedFamilies()]).toEqual([]);
    }
    vi.stubGlobal('localStorage',{getItem:(key:string)=>key===LS_SIDEBAR_COLLAPSED_FAMILIES?'["RnDHub",null,42,"","RnDHub"]':null});
    expect([...loadSidebarCollapsedFamilies()]).toEqual(['RnDHub']);
  });
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
