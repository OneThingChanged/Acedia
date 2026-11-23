import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Agent } from "../types";
import { organizationAgents, SessionOrganization } from "./SessionOrganization";
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, projectId: "p", name: id, folder: "C:/project", aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1, ...extra });
describe("organization sessions", () => {
  it("keeps sleeping ancestors visible for active descendants", () => {
    const catalog = [agent("root"), agent("child", { status: "running", sessionHierarchy: { parentId: "root" } }), agent("sleeping"), agent("deferred", { status: "starting", deferredStart: true })];
    expect(organizationAgents(catalog, true).map((item) => item.id)).toEqual(["root", "child"]);
    expect(organizationAgents(catalog, false)).toHaveLength(4);
  });
  it("renders actual relationships without mock sessions", () => {
    const catalog = [agent("Parent", { status: "running" }), agent("Real child", { status: "running", sessionHierarchy: { parentId: "Parent", createdById: "Parent", inheritFolder: true } })];
    const html = renderToStaticMarkup(<SessionOrganization agents={catalog} projects={[{ id: "p", name: "Project", folder: "C:/project", createdAt: 1 }]} activeProjectId="p" selectedId="Real child" onSelect={() => {}} onOpenSession={() => {}} onOpenProperties={() => {}} onCreateChild={() => {}} onUpdateHierarchy={() => {}} onUpdateProjects={() => {}}/>);
    expect(html).toContain("Real child");
    expect(html).toContain("프로젝트 관계 보드");
    expect(html).toContain("세션 트리 보기");
    expect(html).not.toContain("UI 구현");
    expect(html).not.toContain("HTML 초안");
  });
  it("opens the requested session hierarchy directly, with navigation back to the work board", () => {
    const catalog = [agent("Parent"), agent("Selected child", { sessionHierarchy: { parentId: "Parent" } })];
    const html = renderToStaticMarkup(<SessionOrganization agents={catalog} projects={[{ id: "p", name: "Project", folder: "C:/project", createdAt: 1 }]}
      activeProjectId={null} selectedId="Selected child" initialProjectId="p" initialSessionId="Selected child" onWorkBoard={() => {}}
      onSelect={() => {}} onOpenSession={() => {}} onOpenProperties={() => {}} onCreateChild={() => {}} onUpdateHierarchy={() => {}} onUpdateProjects={() => {}}/>);
    expect(html).toContain("업무 보드");
    expect(html).toContain('aria-label="부모 세션"');
    expect(html).toContain('<option value="Parent" selected="">');
  });
  it("reuses the selected project editor without creating a second canvas", () => {
    const html = renderToStaticMarkup(<SessionOrganization agents={[agent("Session")]} projects={[{ id: "p", name: "Project", folder: "C:/project", createdAt: 1 }]}
      activeProjectId="p" selectedId={null} initialProjectId="p" inspectorOnly onCloseInspector={() => {}}
      onSelect={() => {}} onOpenSession={() => {}} onOpenProperties={() => {}} onCreateChild={() => {}} onUpdateHierarchy={() => {}} onUpdateProjects={() => {}}/>);
    expect(html).toContain('aria-label="부모 프로젝트"');
    expect(html).toContain('aria-label="정보 닫기"');
    expect(html).not.toContain('class="pb-viewport"');
  });
});
