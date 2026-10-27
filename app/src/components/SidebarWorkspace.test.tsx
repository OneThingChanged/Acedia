import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Agent } from "../types";

const project = { id: "p", name: "Acedia", folder: "C:/Acedia", createdAt: 1 };
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, projectId: "p", name: id, folder: project.folder, aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1, ...extra });
const callbacks = { onSelectProject: vi.fn(), onSelect: vi.fn(), onSelectScreen: vi.fn(), onRenameSession: vi.fn(), onContextMenu: vi.fn(), onNewProject: vi.fn(), onNewProjectFolder: vi.fn(), onNewSessionForProject: vi.fn(), onDeactivate: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(), onMoveProject: vi.fn(), onReorderProjectFolder: vi.fn(), onProjectContextMenu: vi.fn(), onProjectFolderContextMenu: vi.fn() };
function render(agents: Agent[], extra: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return renderToStaticMarkup(<Sidebar {...callbacks} projects={[project]} projectFolders={[]} agents={agents} groups={[]} activeProjectId="p" activeGroupId={null} activeAgentId={null} inGroupAgentIds={new Set()} detachedAgentIds={new Set()} unreadCompletedAgentIds={new Set()} dragState={null} {...extra} />);
}

describe("workspace sidebar", () => {
  it('labels child sessions with their dedicated effective folder rather than a stale parent-project folder', () => {
    const html = render([agent('parent'), agent('child', { folder: 'C:/stale', sessionHierarchy: { parentId: 'parent', inheritFolder: false, folderOverride: 'D:/AI2/PCGLab' } })]);
    expect(html).toContain('title="D:/AI2/PCGLab"');
    expect(html).toContain('.../AI2/PCGLab'); expect(html).not.toContain('C:/stale');
    expect(html).toContain('상위 세션: parent');
  });
  it('defaults to hiding sleeping and stopped children in both Active lists while preserving active children and counts', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'multiagent.sessionFilter.v1' ? 'active' : key === 'multiagent.sidebarExpandedProjects.v1' ? '["p"]' : null, setItem: vi.fn() });
    const parent = agent('parent', { status: 'working', runtimeStatus: 'running' });
    const sleeping = agent('sleep', { deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'parent' } });
    const stopped = agent('stopped', { status: 'exited', runtimeStatus: 'exited', sessionHierarchy: { parentId: 'parent' } });
    const active = agent('active', { status: 'working', runtimeStatus: 'running', sessionHierarchy: { parentId: 'parent' } });
    const html = render([parent, sleeping, stopped, active]);
    expect(html).not.toContain('data-sidebar-agent-id="sleep"'); expect(html).not.toContain('data-sidebar-agent-id="stopped"');
    expect(html.match(/data-sidebar-agent-id="active"/g)).toHaveLength(2);
    expect(html).toMatch(/data-session-filter="active" aria-pressed="true"[^]*?sidebar-session-filter-count">2</);
    expect(html).toMatch(/data-session-filter="sleeping" aria-pressed="false"[^]*?sidebar-session-filter-count">1</);
  });
  it('keeps stopped children and their sleeping descendants visible in both Active trees without starting or counting them as active', () => {
    const saved:Record<string,string>={'multiagent.sessionFilter.v1':'active','multiagent.sidebarExpandedProjects.v1':'["p"]'};
    vi.stubGlobal('localStorage',{getItem:(key:string)=>saved[key]??null,setItem:vi.fn()});
    const parent=agent('parent',{status:'working',runtimeStatus:'running',sidebarShowInactiveChildren:true});
    const child=agent('stopped',{deferredStart:true,resumeEligible:false,sessionHierarchy:{parentId:parent.id}});
    const sleeping=agent('sleep',{deferredStart:true,resumeEligible:true,sessionHierarchy:{parentId:child.id}});
    const html=render([parent,child,sleeping,agent('unrelated')]);
    for(const id of ['stopped','sleep']) expect(html.match(new RegExp(`data-sidebar-agent-id="${id}"`,'g'))).toHaveLength(2);
    expect(html.match(/data-sidebar-parent-id="stopped"/g)).toHaveLength(2);
    expect(html).not.toContain('data-sidebar-agent-id="unrelated"');
    expect(html).toMatch(/data-session-filter="active" aria-pressed="true"[^]*?sidebar-session-filter-count">1</);
    expect(html).toMatch(/data-session-filter="sleeping" aria-pressed="false"[^]*?sidebar-session-filter-count">1</);
  });
  it('shows sleeping children of an active parent in both lists, keeping their status and runtime-only counts', () => {
    const saved:Record<string,string>={'multiagent.sessionFilter.v1':'active','multiagent.sidebarExpandedProjects.v1':'["p"]'};
    vi.stubGlobal('localStorage',{getItem:(key:string)=>saved[key]??null,setItem:vi.fn()});
    const parent=agent('RnDHub',{status:'working',runtimeStatus:'running',sidebarShowInactiveChildren:true});
    const child=agent('Shader',{deferredStart:true,resumeEligible:true,sessionHierarchy:{parentId:'RnDHub',createdById:'AIHub'}});
    const unrelated=agent('unrelated',{deferredStart:true,resumeEligible:true});
    const html=render([parent,child,unrelated]);
    expect(html.match(/data-sidebar-agent-id="Shader"/g)).toHaveLength(2);
    expect(html.match(/data-sidebar-parent-id="RnDHub"/g)).toHaveLength(2);
    expect(html).toContain('status-sleeping');expect(html).toContain('Sleeping');
    expect(html).not.toContain('data-sidebar-agent-id="unrelated"');
    expect(html).toMatch(/data-session-filter="active" aria-pressed="true"[^]*?sidebar-session-filter-count">1</);
    expect(html).toMatch(/data-session-filter="sleeping" aria-pressed="false"[^]*?sidebar-session-filter-count">2</);
  });
  it('renders reparented Shader sessions once under RnDHub with their current parent label', () => {
    const children=['ShaderLevelUp','ShaderNoiseBall','ShaderSkinner'].map(id=>agent(id,{sessionHierarchy:{parentId:'RnDHub',createdById:'AIHub'}}));
    const html=render([agent('RnDHub'),...children]);
    expect(html).toContain('data-sidebar-parent-id="RnDHub"');
    expect(html).toContain('aria-label="RnDHub 하위 세션 접기"');
    for(const child of children) {
      expect(html.match(new RegExp(`data-sidebar-agent-id="${child.id}"`,'g'))).toHaveLength(1);
      expect(html.indexOf(`data-sidebar-agent-id="${child.id}"`)).toBeGreaterThan(html.indexOf('data-sidebar-parent-id="RnDHub"'));
    }
    expect(html).toContain('상위 세션: RnDHub'); expect(html).not.toContain('↳ AIHub');
  });
  it('restores collapsed families while retaining their parent toggle and counts', () => {
    vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='multiagent.sidebarCollapsedSessionFamilies.v1'?'["RnDHub"]':null,setItem:vi.fn()});
    const html=render([agent('RnDHub'),agent('Shader',{sessionHierarchy:{parentId:'RnDHub',createdById:'AIHub'}})]);
    expect(html).toContain('data-sidebar-agent-id="RnDHub"');
    expect(html).toContain('aria-expanded="false" aria-controls="sidebar-session-children-recent-RnDHub"');
    expect(html).not.toContain('data-sidebar-agent-id="Shader"');
    expect(html).toContain('하위 세션 1개');
  });
  it('keeps an inactive parent as tree context for active child results without counting it as active', () => {
    vi.stubGlobal('localStorage',{getItem:(key:string)=>key==='multiagent.sessionFilter.v1'?'active':null,setItem:vi.fn()});
    const html=render([agent('RnDHub'),agent('Shader',{status:'working',sessionHierarchy:{parentId:'RnDHub',createdById:'AIHub'}})]);
    expect(html).toContain('data-sidebar-agent-id="RnDHub"'); expect(html).toContain('data-sidebar-parent-id="RnDHub"');
    expect(html).toContain('data-sidebar-agent-id="Shader"');
    expect(html).toMatch(/data-session-filter="active" aria-pressed="true"[^]*?sidebar-session-filter-count">1</);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps recent conversations available even when their project folder is collapsed", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "multiagent.collapsedProjectFolders.v1" ? '["f"]' : null, setItem: vi.fn() });
    const html = render([agent("RECENT")], { projects: [{ ...project, projectFolderId: "f" }], projectFolders: [{ id: "f", name: "개발", machineKey: "local", createdAt: 1 }] });
    expect(html).toContain('data-sidebar-agent-id="RECENT"');
    expect(html).toContain("새 대화"); expect(html).toContain("최근 대화");
    expect(html).not.toContain("project-session-list");
  });
  it("starts projects folded independently of the session picker's saved expansion", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "multiagent.expandedProjects.v1" ? '["p"]' : null, setItem: vi.fn() });
    const html = render([agent("RECENT")]);
    expect(html).toContain('aria-expanded="false" aria-controls="sidebar-project-sessions-p"');
    expect(html).not.toContain('class="project-session-list"');
    expect(html).toContain('data-sidebar-agent-id="RECENT"');
  });
  it("restores only expanded projects, orders their conversations and excludes archived entries", () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "multiagent.sidebarExpandedProjects.v1" ? '["p","deleted"]' : null, setItem: vi.fn() });
    const html = render([
      agent("old", { createdAt: 1 }), agent("recent", { lastOpenedAt: 20 }),
      agent("pinned", { sidebarPinned: true }), agent("archived", { sidebarArchived: true }),
      agent("other", { projectId: "q" }),
    ], { projects: [project, { ...project, id: "q", name: "Other project" }], detachedAgentIds: new Set(["recent"]) });
    const nested = html.match(/<ul class="project-session-list"[^>]*>([\s\S]*?)<\/ul>/)?.[1] || "";
    expect(nested.indexOf('data-sidebar-agent-id="pinned"')).toBeLessThan(nested.indexOf('data-sidebar-agent-id="recent"'));
    expect(nested.indexOf('data-sidebar-agent-id="recent"')).toBeLessThan(nested.indexOf('data-sidebar-agent-id="old"'));
    expect(nested).not.toContain('data-sidebar-agent-id="archived"');
    expect(nested).not.toContain('data-sidebar-agent-id="other"');
    expect(nested).toMatch(/data-sidebar-agent-id="recent"[^>]+tabindex="-1" aria-disabled="true"/);
    expect(nested).not.toContain('aria-label="recent 대화 메뉴"');
    expect(html).not.toContain('id="sidebar-project-sessions-q"');
    expect(nested).not.toContain("deactivate-btn");
  });
  it("applies the selected status to folded project sessions as well as recents", () => {
    const saved: Record<string, string> = { "multiagent.sidebarExpandedProjects.v1": '["p"]', "multiagent.sessionFilter.v1": "sleeping" };
    vi.stubGlobal("localStorage", { getItem: (key: string) => saved[key] ?? null, setItem: vi.fn() });
    const html = render([agent("sleeping", { deferredStart: true, resumeEligible: true }), agent("running", { status: "working", runtimeStatus: "running" })]);
    const nested = html.match(/<ul class="project-session-list"[^>]*>([\s\S]*?)<\/ul>/)?.[1] || "";
    expect(nested).toContain('data-sidebar-agent-id="sleeping"');
    expect(nested).not.toContain('data-sidebar-agent-id="running"');
  });
  it("offers archived restoration without rendering hidden conversations in navigation", () => {
    const html = render([agent("hidden", { sidebarArchived: true }), agent("visible", { sidebarPinned: true })]);
    expect(html).not.toContain('data-sidebar-agent-id="hidden"');
    expect(html).toContain('data-sidebar-agent-id="visible"');
    expect(html).toContain("고정"); expect(html).toContain("보관한 대화");
    expect(html).not.toContain("deactivate-btn");
  });
  it("shows textual question state, unread completion, and marks foreign sessions unavailable", () => {
    const html = render([agent("question", { status: "question", runtimeStatus: "running" }), agent("foreign")], { detachedAgentIds: new Set(["foreign"]), unreadCompletedAgentIds: new Set(["question"]) });
    expect(html).toContain("답변 필요"); expect(html).toContain("읽지 않은 작업 완료");
    expect(html).not.toContain('agent-completion-badge');
    expect(html).toMatch(/data-sidebar-agent-id="foreign"[^>]+tabindex="-1" aria-disabled="true"/);
    expect(html).not.toContain('aria-label="foreign 대화 메뉴"');
  });
  it("retains configured keyboard hints and an accessible collapsed rail", () => {
    const html = render([], { collapsed: true, newSessionShortcut: "Ctrl+T", onToggleCollapsed: vi.fn() });
    expect(html).toContain("sidebar-workspace-collapsed"); expect(html).toContain('aria-label="사이드바 펼치기"');
    expect(html).toContain("Ctrl+T");
  });
  it("provides inline session/project search and notifications without duplicate search buttons or settings", () => {
    const html = render([], { onOpenAttention: vi.fn(), attentionUnreadCount: 7 });
    expect(html).not.toContain("sidebar-search-button"); expect(html).toContain("sidebar-notifications-unread");
    expect(html).toContain("읽지 않은 항목 7개"); expect(html).toContain('class="sidebar-notification-count"');
    expect(html).toContain('type="search"'); expect(html).toContain('aria-label="세션과 프로젝트 검색"'); expect(html).not.toContain('sidebar-settings');
    expect(html).not.toContain("sidebar-routing"); expect(html).not.toContain("sidebar-account");
  });
});
