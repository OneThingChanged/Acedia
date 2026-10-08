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
    expect(html).toMatch(/data-sidebar-agent-id="foreign"[^>]+tabindex="-1" aria-disabled="true"/);
    expect(html).not.toContain('aria-label="foreign 대화 메뉴"');
  });
  it("retains configured keyboard hints and an accessible collapsed rail", () => {
    const html = render([], { collapsed: true, quickOpenShortcut: "Alt+K", newSessionShortcut: "Ctrl+T", onToggleCollapsed: vi.fn() });
    expect(html).toContain("sidebar-workspace-collapsed"); expect(html).toContain('aria-label="사이드바 펼치기"');
    expect(html).toContain("Alt+K"); expect(html).toContain("Ctrl+T");
  });
  it("uses header icons for Quick Open and notifications with no duplicate search field or settings", () => {
    const html = render([], { onQuickOpen: vi.fn(), onOpenAttention: vi.fn(), attentionUnreadCount: 7 });
    expect(html).toContain("sidebar-search-button"); expect(html).toContain("sidebar-notifications-unread");
    expect(html).toContain("읽지 않은 항목 7개"); expect(html).toContain('class="sidebar-notification-count"');
    expect(html).not.toContain('<input'); expect(html).not.toContain('sidebar-settings');
    expect(html).not.toContain("sidebar-routing"); expect(html).not.toContain("sidebar-account");
  });
});
