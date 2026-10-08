import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Agent } from "../types";
import { toolForId } from "../types";
import { useAppLanguage } from "../lib/appLanguage";
import { isStandbySession } from "../lib/sessionStandby";
import { LS_SIDEBAR_FILTER, loadSidebarFilter, matchesSidebarFilter, recentSidebarSessions, searchSidebarItems, sidebarDateGroup, sidebarScreens, sidebarWidth, type SidebarDateGroup } from "../lib/sidebarNavigation";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { SidebarProjectTree, type SidebarProjectTreeProps } from "./SidebarProjectTree";
import { SidebarIcon } from "./SidebarIcon";
import "./Sidebar.css";

type SidebarProps = SidebarProjectTreeProps & {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
  onNewSession?: () => void;
  onRestoreSession?: (id: string) => void;
  onShowSessions?: () => void;
  onOpenAttention?: () => void;
  attentionUnreadCount?: number;
  newSessionShortcut?: string;
};

export function Sidebar(props: SidebarProps) {
  return props.sessionPickerMode ? <SidebarProjectTree {...props} /> : <WorkspaceSidebar {...props} />;
}

function ArchiveSessionsDialog({ agents, projects, onRestore, onClose }: {
  agents: Agent[]; projects: SidebarProps["projects"]; onRestore?: (id: string) => void; onClose: () => void;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const buttons = [...(closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal sidebar-archive-dialog" role="dialog" aria-modal="true" aria-labelledby="sidebar-archive-title">
      <header><div><h2 id="sidebar-archive-title">{text("보관한 대화", "Archived conversations")}</h2><p>{text("목록에서 보관한 대화입니다. 대화 기록과 실행 상태는 유지됩니다.", "Archived from navigation. Conversation history and runtime are preserved.")}</p></div><button ref={closeRef} className="sidebar-icon-button" onClick={onClose} aria-label={text("닫기", "Close")}><SidebarIcon name="close" /></button></header>
      <div className="sidebar-archive-list">{agents.length ? agents.map(agent => <div key={agent.id}><span><strong>{agent.name}</strong><small>{projects.find(project => project.id === agent.projectId)?.name} · {toolForId(agent.aiToolId).label}</small></span><button className="btn-secondary" disabled={!onRestore} onClick={() => onRestore?.(agent.id)}>{text("복원", "Restore")}</button></div>) : <p>{text("보관한 대화가 없습니다.", "No archived conversations.")}</p>}</div>
    </section>
  </div>;
}

function WorkspaceSidebar(props: SidebarProps) {
  const { text } = useAppLanguage();
  const { agents, projects, projectFolders, activeAgentId, activeGroupId, collapsed = false } = props;
  const [filter, setFilter] = useState(loadSidebarFilter);
  const [scope, setScope] = useState<string | null>(null);
  const [sortByName, setSortByName] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searching = searchQuery.trim().length > 0;
  const [revealProject, setRevealProject] = useState<{ id: string }>();
  const focusedProjectRef = useRef(revealProject);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const browseScrollRef = useRef(0);
  const closeArchive = useCallback(() => setShowArchive(false), []);
  const [projectsOpen, setProjectsOpen] = useState(() => readBoolean("multiagent.sidebarProjectsOpen.v1", true));
  const [screensOpen, setScreensOpen] = useState(() => readBoolean("multiagent.sidebarScreensOpen.v1", false));
  const sidebarRef = useRef<HTMLElement>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [today, setToday] = useState(Date.now);
  useEffect(() => () => pointerCleanupRef.current?.(), []);
  useEffect(() => { const timer = window.setInterval(() => setToday(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { try { localStorage.setItem(LS_SIDEBAR_FILTER, filter); } catch {} }, [filter]);
  useEffect(() => { try { localStorage.setItem("multiagent.sidebarProjectsOpen.v1", String(projectsOpen)); } catch {} }, [projectsOpen]);
  useEffect(() => { try { localStorage.setItem("multiagent.sidebarScreensOpen.v1", String(screensOpen)); } catch {} }, [screensOpen]);
  useEffect(() => { if (scope && !projects.some(project => project.id === scope)) setScope(null); }, [projects, scope]);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = searching ? 0 : browseScrollRef.current;
  }, [searching]);
  useEffect(() => {
    if (!revealProject || focusedProjectRef.current === revealProject) return;
    focusedProjectRef.current = revealProject;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const row = [...(sidebarRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-project-id]") || [])]
          .find(row => row.dataset.sidebarProjectId === revealProject.id);
        row?.querySelector<HTMLButtonElement>(".project-item")?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: "nearest" });
        setRevealProject(undefined);
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [revealProject]);
  const archived = useMemo(() => agents.filter(agent => agent.sidebarArchived), [agents]);
  const navigable = useMemo(() => agents.filter(agent => !agent.sidebarArchived), [agents]);
  const scoped = useMemo(() => navigable.filter(agent => !scope || agent.projectId === scope), [navigable, scope]);
  const counts = { all: scoped.length, active: scoped.filter(agent => matchesSidebarFilter(agent, "active")).length, sleeping: scoped.filter(agent => matchesSidebarFilter(agent, "sleeping")).length };
  const recent = useMemo(() => recentSidebarSessions(agents, projects, projectFolders, { projectId: scope, filter, query: "", sortByName }), [agents, projects, projectFolders, scope, filter, sortByName]);
  const searchResults = useMemo(() => searchSidebarItems(agents, projects, projectFolders, searchQuery), [agents, projects, projectFolders, searchQuery]);
  const screens = useMemo(() => sidebarScreens(props.groups, agents, projects, activeAgentId), [props.groups, agents, projects, activeAgentId]);
  const projectById = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const screenByAgent = new Map(screens.flatMap((screen, index) => screen.members.map(agent => [agent.id, index + 1] as const)));
  const labels: Record<SidebarDateGroup, string> = { pinned: text("고정", "Pinned"), today: text("오늘", "Today"), yesterday: text("어제", "Yesterday"), week: text("이번 주", "This week"), older: text("이전 대화", "Earlier") };
  const clearFilters = () => { setScope(null); setFilter("all"); };
  const changeSearch = (value: string) => {
    if (!searching && value.trim()) browseScrollRef.current = scrollRef.current?.scrollTop || 0;
    setSearchQuery(value);
  };
  const clearSearch = () => { setSearchQuery(""); searchInputRef.current?.focus({ preventScroll: true }); };
  const selectSearchProject = (id: string) => {
    setSearchQuery(""); setFilter("all"); setScope(id); setProjectsOpen(true); setRevealProject({ id });
    props.onSelectProject(id); props.onShowSessions?.();
  };
  const selectAgent = (id: string, fromSearch = false) => {
    if (props.detachedAgentIds.has(id)) return;
    if (fromSearch) { setSearchQuery(""); props.onShowSessions?.(); }
    props.onSelect(id);
  };
  const searchKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const target = event.target as HTMLElement;
    const inField = target.closest(".sidebar-workspace-search");
    const result = target.closest<HTMLElement>("[data-sidebar-search-result]");
    if (!inField && target !== result) return;
    if (event.key === "Escape" && searchQuery) {
      event.preventDefault(); event.stopPropagation(); clearSearch(); return;
    }
    if (!searching || (inField && target !== searchInputRef.current)) return;
    const results = [...(searchResultsRef.current?.querySelectorAll<HTMLElement>('[data-sidebar-search-result]:not([aria-disabled="true"])') || [])];
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      const index = result ? results.indexOf(result) : -1;
      if (event.key === "ArrowUp" && index === 0) searchInputRef.current?.focus({ preventScroll: true });
      else {
        const next = index < 0 ? (event.key === "ArrowDown" ? 0 : results.length - 1)
          : Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        results[next]?.focus({ preventScroll: true }); results[next]?.scrollIntoView({ block: "nearest" });
      }
    } else if (event.key === "Enter") {
      const selected = result || results[0];
      if (!selected || selected.getAttribute("aria-disabled") === "true") return;
      event.preventDefault(); event.stopPropagation();
      if (selected.dataset.sidebarSearchResult === "project") selectSearchProject(selected.dataset.searchId!);
      else selectAgent(selected.dataset.searchId!, true);
    }
  };
  const highlight = (value: string) => {
    const term = searchQuery.trim();
    const start = value.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
    return !term || start < 0 ? value : <>{value.slice(0, start)}<mark>{value.slice(start, start + term.length)}</mark>{value.slice(start + term.length)}</>;
  };
  const newSession = () => {
    setFilter("all");
    if (scope) props.onNewSessionForProject(scope);
    else if (props.onNewSession) props.onNewSession();
    else if (props.activeProjectId) props.onNewSessionForProject(props.activeProjectId);
    else props.onNewProject();
  };
  const menuPosition = (event: React.MouseEvent<HTMLButtonElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return [rect.left, rect.bottom] as const; };
  const startPointer = (agent: Agent, event: ReactPointerEvent<HTMLElement>, fromSearch = false) => {
    if (event.button !== 0 || props.detachedAgentIds.has(agent.id) || (event.target as HTMLElement).closest("button")) return;
    pointerCleanupRef.current?.();
    const start = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    const cleanup = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", cancel, true); pointerCleanupRef.current = null; };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== start.id) return;
      if (!start.dragging && Math.hypot(next.clientX - start.x, next.clientY - start.y) > 4) { start.dragging = true; props.onDragStart(agent.id); }
      if (start.dragging) next.preventDefault();
    };
    const up = (next: PointerEvent) => { if (next.pointerId !== start.id) return; cleanup(); if (start.dragging) next.preventDefault(); else if (!(next.target as HTMLElement)?.closest("button")) selectAgent(agent.id, fromSearch); };
    const cancel = (next: PointerEvent) => { if (next.pointerId !== start.id) return; cleanup(); if (start.dragging) props.onDragEnd(); };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", cancel, true);
  };

  const renderAgent = (agent: Agent, nested = false, fromSearch = false) => {
    const sleeping = isStandbySession(agent);
    const detached = props.detachedAgentIds.has(agent.id);
    const unread = props.unreadCompletedAgentIds.has(agent.id);
    const project = projectById.get(agent.projectId);
    const statusTitle = sleeping ? agent.idleResumeSessionId
      ? text("Sleeping · 유휴 자동 중지 · 클릭하면 원래 대화 복원", "Sleeping · suspended while idle · click to resume the original conversation")
      : text("Sleeping · 클릭하면 시작", "Sleeping · click to start")
      : agent.status === "question" ? text("질문 · 답변 대기", "Question · answer needed") : agent.status;
    return <li key={agent.id} data-sidebar-agent-id={agent.id} data-sidebar-search-result={fromSearch ? "session" : undefined} data-search-id={fromSearch ? agent.id : undefined} className={`agent-item sidebar-recent-row${nested ? " sidebar-project-session-row" : ""}${activeAgentId === agent.id && !props.browserHubActive && !props.organizationActive ? " active" : ""}${props.dragState?.fromAgentId === agent.id ? " agent-dragging" : ""}${unread ? " agent-completion-unread" : ""}${detached ? " agent-detached" : ""}`}
      role="button" tabIndex={detached ? -1 : 0} aria-disabled={detached} aria-current={activeAgentId === agent.id && !props.browserHubActive && !props.organizationActive ? "page" : undefined}
      title={`${agent.name}\n${project?.name || ""} · ${toolForId(agent.aiToolId).label} · ${project?.sshHostId ? `SSH: ${agent.remoteFolder || project.remoteFolder}` : agent.folder}\n${statusTitle}`}
      onPointerDown={event => startPointer(agent, event, fromSearch)}
      onKeyDown={event => { if (event.target !== event.currentTarget || detached || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectAgent(agent.id, fromSearch); } }}
      onDoubleClick={event => { if (!detached && !(event.target as HTMLElement).closest("button")) { pointerCleanupRef.current?.(); props.onRenameSession(agent.id); } }}
      onContextMenu={event => { if (detached) return; event.preventDefault(); pointerCleanupRef.current?.(); props.onContextMenu(agent.id, event.clientX, event.clientY); }}>
      <span className={`status status-${sleeping ? "sleeping" : agent.status}`} role="img" aria-label={statusTitle} title={statusTitle} />
      <div className="sidebar-session-copy"><span className="agent-name">{fromSearch ? highlight(agent.name) : agent.name}</span>{!nested && <span className="sidebar-session-meta"><span title={project?.folder}>{fromSearch ? highlight(project?.name || text("미분류", "Uncategorized")) : project?.name || text("미분류", "Uncategorized")}</span><span aria-hidden="true">·</span><span>{toolForId(agent.aiToolId).label}</span>{project?.sshHostId && <span className="sidebar-ssh-label">SSH</span>}{agent.status === "question" || agent.status === "waiting" || agent.status === "blocked" ? <span className="sidebar-question-label">{agent.status === "question" ? text("답변 필요", "Answer needed") : text("확인 필요", "Attention")}</span> : sleeping ? <span className="sidebar-sleep-label">{text("휴면", "Sleeping")}</span> : null}</span>}</div>
      {unread && <span className="agent-completion-dot" title={text("작업 완료 · 클릭해서 확인", "Work completed · click to review")} aria-label={text("읽지 않은 작업 완료", "Unread completion")} />}
      {screenByAgent.has(agent.id) && <span className="agent-screen-badge" title={text("분할 화면에 포함된 대화", "Conversation in a split view")}>S{screenByAgent.get(agent.id)}</span>}
      {agent.dangerous && <span className="agent-danger" title={text("권한 확인을 생략하는 세션", "Session skips permission prompts")}>!</span>}
      {detached ? <span className="agent-detached-badge">{props.detachedLabel || text("사용 중", "In use")}</span> : <button className="sidebar-icon-button sidebar-row-menu" aria-label={text(`${agent.name} 대화 메뉴`, `${agent.name} conversation menu`)} title={text("대화 메뉴", "Conversation menu")} aria-haspopup="menu" onClick={event => { event.stopPropagation(); pointerCleanupRef.current?.(); props.onContextMenu(agent.id, ...menuPosition(event)); }}>···</button>}
    </li>;
  };

  return <>
    <aside ref={sidebarRef} className={`sidebar sidebar-workspace${collapsed ? " sidebar-workspace-collapsed" : ""}`} aria-label={text("작업 공간 탐색", "Workspace navigation")} onKeyDownCapture={searchKeyDown}>
      <header className="sidebar-workspace-head">
        <span className="sidebar-brand"><img className="sidebar-brand-icon" src="app-icon.png" alt="" /><strong>Acedia</strong></span>
        <div className="sidebar-header-actions">
          <button className="sidebar-icon-button sidebar-collapse" onClick={props.onToggleCollapsed}
            aria-label={collapsed ? text("사이드바 펼치기", "Expand sidebar") : text("사이드바 접기", "Collapse sidebar")}
            aria-expanded={!collapsed} title={collapsed ? text("사이드바 펼치기", "Expand sidebar") : text("사이드바 접기", "Collapse sidebar")}>
            <SidebarIcon name="panel" />
          </button>
          <button className={`sidebar-icon-button sidebar-notifications${props.attentionUnreadCount ? " sidebar-notifications-unread" : ""}`}
            onClick={props.onOpenAttention} disabled={!props.onOpenAttention} aria-haspopup="dialog"
            title={text("알림 센터", "Notifications")}
            aria-label={text(`알림 센터 · 읽지 않은 항목 ${props.attentionUnreadCount || 0}개`, `Notifications · ${props.attentionUnreadCount || 0} unread`)}>
            <SidebarIcon name="bell" />
            {!!props.attentionUnreadCount && <span className="sidebar-notification-count" aria-hidden="true">{props.attentionUnreadCount > 99 ? "99+" : props.attentionUnreadCount}</span>}
          </button>
        </div>
      </header>
      <div className="sidebar-workspace-top"><button className="sidebar-new-chat" onClick={newSession} title={text("새 대화", "New conversation")}><SidebarIcon name="plus" /><span className="sidebar-nav-label">{text("새 대화", "New conversation")}</span>{props.newSessionShortcut && <kbd>{props.newSessionShortcut}</kbd>}</button>
        <div className="sidebar-workspace-search" role="search" aria-label={text("프로젝트·세션 검색", "Project and session search")}>
          <SidebarIcon name="search" />
          <input ref={searchInputRef} type="search" value={searchQuery} onChange={event => changeSearch(event.target.value)}
            placeholder={text("세션과 프로젝트 검색", "Search sessions and projects")} aria-label={text("세션과 프로젝트 검색", "Search sessions and projects")}
            aria-controls={searching ? "sidebar-search-results" : undefined} autoComplete="off" spellCheck={false} />
          {searchQuery && <button className="sidebar-inline-search-clear sidebar-icon-button" type="button" onClick={clearSearch} aria-label={text("검색 지우기", "Clear search")} title={text("검색 지우기 · Esc", "Clear search · Esc")}><SidebarIcon name="close" /></button>}
        </div>
        <nav className="sidebar-primary-nav" aria-label={text("주요 메뉴", "Main navigation")}><button className="sidebar-nav-row" aria-current={!props.browserHubActive && !props.organizationActive && !scope ? "page" : undefined} onClick={() => { clearFilters(); props.onShowSessions?.(); }} title={text("모든 대화", "All conversations")}><SidebarIcon name="chat" /><span className="sidebar-nav-label">{text("모든 대화", "All conversations")}</span></button>
          {props.onOpenBrowserHub && <div className="browser-hub-sidebar-slot"><button className="sidebar-nav-row browser-hub-sidebar-btn" onClick={props.onOpenBrowserHub} aria-current={props.browserHubActive ? "page" : undefined} title={text("브라우저 모아보기", "Browser hub")}><SidebarIcon name="globe" /><span className="sidebar-nav-label">{text("브라우저", "Browsers")}</span><span className="sidebar-nav-count browser-hub-sidebar-count">{props.browserCount || 0}</span></button></div>}
          {props.onOpenOrganization && <div className="organization-sidebar-slot"><button className="sidebar-nav-row" onClick={props.onOpenOrganization} aria-current={props.organizationActive ? "page" : undefined} title={text("프로젝트 보드 · 조직도", "Project board · Organization")}><SidebarIcon name="board" /><span className="sidebar-nav-label">{text("프로젝트 보드", "Project board")}</span></button></div>}
        </nav>
      </div>
      <div ref={scrollRef} className="sidebar-workspace-scroll">
        {searching && <div ref={searchResultsRef} id="sidebar-search-results" className="sidebar-search-results">
          <p className="sidebar-search-summary" role="status">{text(`${searchResults.projects.length + searchResults.sessions.length}개 결과 · 모든 프로젝트와 세션`, `${searchResults.projects.length + searchResults.sessions.length} results · All projects and sessions`)}</p>
          {!!searchResults.projects.length && <section className="sidebar-search-group" aria-label={text("프로젝트 검색 결과", "Project results")}>
            <h2>{text("프로젝트", "Projects")} <span>{searchResults.projects.length}</span></h2>
            {searchResults.projects.map(project => <button key={project.id} type="button" className="sidebar-search-project"
              data-sidebar-search-result="project" data-search-id={project.id} onClick={() => selectSearchProject(project.id)} title={project.remoteFolder || project.folder}>
              <SidebarIcon name="folder" /><span className="sidebar-search-project-copy"><strong>{highlight(project.name)}</strong><small>{project.remoteFolder || project.folder}</small></span>
              {project.sshHostId && <span className="sidebar-ssh-label">SSH</span>}<SidebarIcon name="chevron" />
            </button>)}
          </section>}
          {!!searchResults.sessions.length && <section className="sidebar-search-group" aria-label={text("세션 검색 결과", "Session results")}>
            <h2>{text("세션", "Sessions")} <span>{searchResults.sessions.length}</span></h2><ul className="sidebar-recent-list">{searchResults.sessions.map(agent => renderAgent(agent, false, true))}</ul>
          </section>}
          {!searchResults.projects.length && !searchResults.sessions.length && <div className="sidebar-empty"><p>{text("일치하는 프로젝트나 세션이 없습니다.", "No matching projects or sessions.")}</p><button onClick={clearSearch}>{text("검색 지우기", "Clear search")}</button></div>}
          <p className="sidebar-search-hint">{text("↑↓ 이동 · Enter 열기 · Esc 지우기", "↑↓ Move · Enter Open · Esc Clear")}</p>
        </div>}
        <div className="sidebar-workspace-browse" hidden={searching}><section className="sidebar-section"><header className="sidebar-section-head"><button className="sidebar-section-toggle" aria-expanded={projectsOpen} onClick={() => setProjectsOpen(value => !value)}><SidebarIcon name="chevron" />{text("프로젝트", "Projects")}</button><span className="sidebar-section-count">{projects.length}</span><button className="sidebar-icon-button sidebar-add-folder" onClick={() => props.onNewProjectFolder("local")} title={text("새 프로젝트 폴더", "New project folder")} aria-label={text("새 프로젝트 폴더", "New project folder")}><SidebarIcon name="folder" /></button><button className="sidebar-icon-button" onClick={props.onNewProject} title={text("새 프로젝트", "New project")} aria-label={text("새 프로젝트", "New project")}><SidebarIcon name="plus" /></button></header>
        {projectsOpen && <SidebarProjectTree {...props} agents={navigable} navigationOnly navigationSearch="" navigationFilter={filter} revealProject={revealProject} renderProjectSession={agent => renderAgent(agent, true)} activeProjectId={scope} onSelectProject={id => { setScope(id); props.onSelectProject(id); props.onShowSessions?.(); }} />}
      </section>
      {screens.length > 0 && <section className="sidebar-section screen-groups"><header className="sidebar-section-head"><button className="sidebar-section-toggle" aria-expanded={screensOpen} onClick={() => setScreensOpen(value => !value)}><SidebarIcon name="chevron" />{text("분할 화면", "Split views")}</button><span className="sidebar-section-count">{screens.length}</span></header>{screensOpen && <div className="sidebar-screen-list">{screens.map((screen, index) => <div className="sidebar-screen-item" key={screen.group.id}><button className={`screen-group-row${screen.group.id === activeGroupId ? " screen-group-row-active" : ""}`} title={screen.members.map(agent => `${projectById.get(agent.projectId)?.name} / ${agent.name}`).join("\n")} onClick={() => props.onSelectScreen(screen.group.id, screen.targetAgentId)} onContextMenu={event => { event.preventDefault(); props.onScreenContextMenu?.(screen.group.id, event.clientX, event.clientY); }}><SidebarIcon name="split" /><span className="screen-group-name">{screen.name}</span><span className="sidebar-section-count">{screen.members.length}</span><span className="sidebar-screen-number" aria-label={`Screen ${index + 1}`}>S{index + 1}</span></button><button className="sidebar-icon-button sidebar-row-menu" title={text("분할 화면 메뉴", "Split view menu")} aria-label={text(`${screen.name} 분할 화면 메뉴`, `${screen.name} split view menu`)} aria-haspopup="menu" onClick={event => props.onScreenContextMenu?.(screen.group.id, ...menuPosition(event))}>···</button></div>)}</div>}</section>}
      <section className="sidebar-section sidebar-recents"><header className="sidebar-section-head"><span className="sidebar-recent-heading">{scope ? projectById.get(scope)?.name : text("최근 대화", "Recent conversations")}</span>{scope && <button className="sidebar-scope-reset" onClick={() => setScope(null)}>{text("전체로", "All")}</button>}<button className="sidebar-icon-button sidebar-sort" aria-label={sortByName ? text("정렬: 이름순", "Sort: name") : text("정렬: 최근 사용 순", "Sort: recently opened")} title={sortByName ? text("이름순 · 최근 사용 순으로 변경", "Name · switch to recently opened") : text("최근 사용 순 · 이름순으로 변경", "Recently opened · switch to name")} onClick={() => setSortByName(value => !value)}><SidebarIcon name="sort" /></button></header>
        <div className="sidebar-session-filters" role="group" aria-label={text("대화 상태 필터", "Conversation status filter")}>{(["all", "active", "sleeping"] as const).map(value => <button key={value} className="sidebar-session-filter" data-session-filter={value} aria-pressed={filter === value} onClick={() => setFilter(value)}><span className="sidebar-session-filter-label">{value === "all" ? text("전체", "All") : value === "active" ? text("활성", "Active") : text("휴면", "Sleeping")}</span><span className="sidebar-session-filter-count">{counts[value]}</span></button>)}</div>
        {sortByName ? <><span className="sidebar-date-label">{text("이름순", "By name")}</span><ul className="sidebar-recent-list">{recent.map(agent => renderAgent(agent))}</ul></> : (["pinned", "today", "yesterday", "week", "older"] as const).map(bucket => { const members = recent.filter(agent => sidebarDateGroup(agent, today) === bucket); return members.length > 0 ? <Fragment key={bucket}><span className="sidebar-date-label">{bucket === "pinned" && <SidebarIcon name="pin" />}{labels[bucket]}</span><ul className="sidebar-recent-list">{members.map(agent => renderAgent(agent))}</ul></Fragment> : null; })}
        {!recent.length && <div className="sidebar-empty"><p>{filter === "sleeping" ? text("휴면 대화가 없습니다.", "No sleeping conversations.") : filter === "active" ? text("활성 대화가 없습니다.", "No active conversations.") : text("대화를 시작해 보세요.", "Start a conversation.")}</p>{filter !== "all" || scope ? <button onClick={clearFilters}>{text("필터 초기화 · 전체 보기", "Clear filters · show all")}</button> : <button onClick={newSession}>{text("새 대화", "New conversation")}</button>}</div>}
      </section></div></div>
      {archived.length > 0 && (
        <footer className="sidebar-workspace-footer">
          <button className="sidebar-archive-link" onClick={() => setShowArchive(true)} title={text("보관한 대화", "Archived conversations")}>
            <SidebarIcon name="archive" /><span>{text("보관한 대화", "Archived conversations")}</span><small>{archived.length}</small>
          </button>
        </footer>
      )}
      {!collapsed && props.onWidthChange && <div className="sidebar-resize-handle" role="separator" aria-label={text("사이드바 너비", "Sidebar width")} aria-orientation="vertical" aria-valuemin={244} aria-valuemax={360} aria-valuenow={props.width || 286} tabIndex={0} onPointerDown={event => { event.preventDefault(); const handle = event.currentTarget; handle.setPointerCapture(event.pointerId); const left = sidebarRef.current?.getBoundingClientRect().left || 0; handle.onpointermove = move => { if (handle.hasPointerCapture(move.pointerId)) props.onWidthChange?.(sidebarWidth(move.clientX - left)); }; }} onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); event.currentTarget.onpointermove = null; }} onPointerCancel={event => { event.currentTarget.onpointermove = null; }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); props.onWidthChange?.(sidebarWidth((props.width || 286) + (event.key === "ArrowLeft" ? -8 : 8))); } }} />}
    </aside>
    {showArchive && <ArchiveSessionsDialog agents={archived} projects={projects} onRestore={props.onRestoreSession} onClose={closeArchive} />}
  </>;
}

function readBoolean(key: string, fallback: boolean) {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : raw !== "false"; } catch { return fallback; }
}
