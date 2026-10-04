import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, Project, SessionHierarchy } from "../types";
import { toolForId } from "../types";
import { isAgentRuntimeActive, runtimeStatusOf } from "../lib/agentActivity";
import { isStandbySession } from "../lib/sessionStandby";
import { useAppLanguage } from "../lib/appLanguage";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { canParentSession, layoutSessionHierarchy, normalizeSessionHierarchy, repairSessionHierarchy, resolveSessionSettings } from "../lib/sessionHierarchy";
import "./SessionOrganization.css";

type Props = {
  agents: Agent[];
  projects: Project[];
  activeProjectId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSession: (id: string) => void;
  onOpenProperties: (id: string) => void;
  onCreateChild: (id: string) => void;
  onUpdateHierarchy: (id: string, hierarchy: SessionHierarchy) => void;
};

export function organizationAgents(agents: Agent[], activeOnly: boolean): Agent[] {
  const repaired = repairSessionHierarchy(agents);
  if (!activeOnly) return repaired;
  const byId = new Map(repaired.map((agent) => [agent.id, agent]));
  const included = new Set<string>();
  repaired.filter((agent) => isAgentRuntimeActive(agent) && !agent.deferredStart).forEach((agent) => {
    let current: Agent | undefined = agent;
    while (current && !included.has(current.id)) {
      included.add(current.id);
      current = current.sessionHierarchy?.parentId ? byId.get(current.sessionHierarchy.parentId) : undefined;
    }
  });
  return repaired.filter((agent) => included.has(agent.id));
}

function NetworkIcon() {
  return <svg className="org-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="3" width="8" height="5" rx="1"/><rect x="2" y="16" width="7" height="5" rx="1"/><rect x="15" y="16" width="7" height="5" rx="1"/><path d="M12 8v4M5.5 16v-4h13v4"/></svg>;
}

function SessionState({ agent }: { agent: Agent }) {
  const { text } = useAppLanguage();
  const work = agent.activity?.workStatus;
  const active = isAgentRuntimeActive(agent) && !agent.deferredStart;
  const waiting = active && (work === "waiting" || work === "blocked" || agent.status === "question");
  const runtime = runtimeStatusOf(agent);
  const inactiveLabel = runtime === "exited" ? text("종료됨", "Exited") : runtime === "unreachable" ? text("연결 끊김", "Disconnected") : isStandbySession(agent) ? text("잠든 세션", "Sleeping") : text("비활성", "Inactive");
  const label = !active ? inactiveLabel : runtime === "starting" ? text("시작 중", "Starting") : runtime === "recovering" ? text("복구 중", "Recovering") : work === "done" ? text("완료", "Done") : waiting ? text("응답 대기", "Waiting") : work === "working" ? text("작업 중", "Working") : text("실행 중", "Running");
  return <span className={`org-state${!active ? " sleeping" : waiting ? " waiting" : ""}`}><i/>{label}</span>;
}

export function SessionOrganization(props: Props) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState(props.activeProjectId || "all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [bounds, setBounds] = useState({ width: 900, height: 600 });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  const catalog = useMemo(() => repairSessionHierarchy(props.agents), [props.agents]);
  const visible = useMemo(() => organizationAgents(catalog, activeOnly), [catalog, activeOnly]);
  const scoped = visible.filter((agent) => scope === "all" || agent.projectId === scope);
  const available = catalog.filter((agent) => scope === "all" || agent.projectId === scope);
  const selected = available.find((agent) => agent.id === props.selectedId) || scoped[0] || available[0];
  const project = props.projects.find((item) => item.id === scope);
  const layout = useMemo(() => layoutSessionHierarchy(scoped, collapsed), [visible, scope, collapsed]);
  const matches = (agent: Agent) => !query.trim() || `${agent.name} ${toolForId(agent.aiToolId).label} ${props.projects.find((item) => item.id === agent.projectId)?.name || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  const activeCount = catalog.filter((agent) => isAgentRuntimeActive(agent) && !agent.deferredStart).length;

  useEffect(() => { if (scope !== "all" && !props.projects.some((item) => item.id === scope)) setScope("all"); }, [scope, props.projects]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => setBounds({ width: viewport.clientWidth, height: viewport.clientHeight }));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [scope]);
  const fit = () => setZoom(Math.max(.35, Math.min(1, (bounds.width - 64) / layout.width, (bounds.height - 110) / layout.height)));
  useEffect(() => { fit(); }, [layout.width, layout.height, bounds.width, bounds.height]);
  const choose = (id: string) => { props.onSelect(id); if ((rootRef.current?.clientWidth || 1200) < 820) setMobileInspector(true); };
  function toggleInspector() {
    if ((rootRef.current?.clientWidth || 1200) < 820) setMobileInspector((current) => !current);
    else setInspectorCollapsed((current) => !current);
  }
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  return <section ref={rootRef} className={`terminal-area session-organization${inspectorCollapsed ? " org-inspector-collapsed" : ""}${mobileInspector ? " org-inspector-shown" : ""}`} aria-label={text("세션 조직도", "Session organization")}>
    <header className="org-header"><div><small>{text("프로젝트 / 세션 관리", "Projects / Session management")}</small><h1><NetworkIcon/>{text("세션 조직도", "Session organization")}</h1><p>{text("작업을 묶고, 필요한 설정을 이어받습니다.", "Group work and inherit the settings you need.")}</p></div><div className="org-header-actions">
      <select aria-label={text("조직도 프로젝트", "Organization project")} value={scope} onChange={(event) => { setScope(event.target.value); setQuery(""); }}><option value="all">{text("전체 프로젝트", "All projects")}</option>{props.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button className="btn-primary" disabled={!selected} onClick={() => selected && props.onCreateChild(selected.id)}>＋ {text("자식 세션", "Child session")}</button><button className="org-icon-button" aria-label={text("세션 정보 패널 전환", "Toggle session inspector")} onClick={toggleInspector}>▥</button>
    </div></header>
    <div className="org-toolbar"><div className="org-view-switch"><button aria-pressed={activeOnly} className={activeOnly ? "active" : ""} onClick={() => setActiveOnly(true)}>{text("활성 세션", "Active sessions")} <span>{activeCount}</span></button><button aria-pressed={!activeOnly} className={!activeOnly ? "active" : ""} onClick={() => setActiveOnly(false)}>{text("전체 세션", "All sessions")} <span>{catalog.length}</span></button></div><label className="org-search"><span aria-hidden="true">⌕</span><input value={query} aria-label={text("조직도 세션 검색", "Search organization sessions")} placeholder={text("세션 찾기", "Find a session")} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setCollapsed(new Set()); }}/></label></div>
    <div className="org-body"><div className="org-map">
      <div className="org-canvas" ref={viewportRef} onPointerDown={(event) => {
        if (scope === "all" || event.button !== 0 || (event.target as Element).closest("button, input, select")) return;
        const viewport = event.currentTarget;
        dragRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
        viewport.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => { const drag = dragRef.current; if (drag) { event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX; event.currentTarget.scrollTop = drag.top + drag.y - event.clientY; } }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
        {scope === "all" ? <div className="org-overview">{props.projects.filter((item) => scoped.some((agent) => agent.projectId === item.id && matches(agent))).map((item) => {
          const members = scoped.filter((agent) => agent.projectId === item.id);
          const rows: { agent: Agent; depth: number }[] = [];
          function visit(agent: Agent, depth: number) { rows.push({ agent, depth }); members.filter((child) => child.sessionHierarchy?.parentId === agent.id).forEach((child) => visit(child, depth + 1)); }
          members.filter((agent) => !agent.sessionHierarchy?.parentId || !members.some((candidate) => candidate.id === agent.sessionHierarchy?.parentId)).forEach((agent) => visit(agent, 0));
          return <section key={item.id} className="org-project-group"><button className="org-project-heading" onClick={() => setScope(item.id)}><span aria-hidden="true">▱</span><strong>{item.name}</strong><small>{members.length}</small></button><div className="org-overview-rows">{rows.map(({ agent, depth }) => <button key={agent.id} className={`org-overview-row${selected?.id === agent.id ? " selected" : ""}${!matches(agent) ? " dimmed" : ""}`} style={{ marginLeft: Math.min(depth, 5) * 17 }} onClick={() => choose(agent.id)}><span className="org-provider" style={{ color: toolForId(agent.aiToolId).iconColor }}>{toolForId(agent.aiToolId).icon}</span><span className="org-overview-name">{agent.name}<small>{agent.sessionHierarchy?.parentId ? text("자식 세션", "Child session") : toolForId(agent.aiToolId).label}</small></span><SessionState agent={agent}/></button>)}</div></section>;
        })}</div> : <div className="org-stage" style={{ width: layout.width * zoom, height: layout.height * zoom }}><div className="org-content" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
          <svg className="org-edges" width={layout.width} height={layout.height} aria-hidden="true">{layout.nodes.map((node) => {
            const parent = layout.nodes.find((item) => item.agent.id === node.agent.sessionHierarchy?.parentId);
            const from = parent ? { x: parent.x + 130, y: parent.y + 140 } : { x: layout.width / 2, y: 86 };
            const middle = parent ? from.y + 34 : 118;
            return <path key={node.agent.id} className={selected?.id === node.agent.id ? "selected" : ""} d={`M${from.x} ${from.y} V${middle} H${node.x + 130} V${node.y}`}/>;
          })}</svg>
          <div className="org-project-root" style={{ left: (layout.width - 220) / 2 }}><span aria-hidden="true">▱</span><div><strong>{project?.name}</strong><small>{text("프로젝트 · 기본 설정", "Project · Default settings")}</small></div></div>
          {layout.nodes.map((node) => { const childCount = catalog.filter((agent) => agent.sessionHierarchy?.parentId === node.agent.id).length; return <div key={node.agent.id} className="org-node-wrap" style={{ left: node.x, top: node.y }}>
            <button className={`org-node${selected?.id === node.agent.id ? " selected" : ""}${!matches(node.agent) ? " dimmed" : ""}`} aria-pressed={selected?.id === node.agent.id} onClick={() => choose(node.agent.id)}><div className="org-node-top"><span className="org-provider" style={{ color: toolForId(node.agent.aiToolId).iconColor }}>{toolForId(node.agent.aiToolId).icon}</span><div><strong title={node.agent.name}>{node.agent.name}</strong><small>{toolForId(node.agent.aiToolId).label}{childCount ? ` · ${text("자식", "Children")} ${childCount}` : ` · ${text("독립 대화", "Independent chat")}`}</small></div></div><p>{node.agent.activity?.lastPrompt || (node.agent.sessionHierarchy?.parentId ? text("부모의 설정을 이어받는 세션", "Session with inherited settings") : text("프로젝트에 직접 연결된 세션", "Session under the project"))}</p><div className="org-node-bottom"><SessionState agent={node.agent}/><span>{node.agent.sessionHierarchy?.parentId ? text("↳ 설정 상속", "↳ Inherited settings") : text("프로젝트 직속", "Under project")}</span></div></button>
            {!!childCount && <button className="org-collapse" aria-label={collapsed.has(node.agent.id) ? text("자식 펼치기", "Expand children") : text("자식 접기", "Collapse children")} aria-expanded={!collapsed.has(node.agent.id)} onClick={() => setCollapsed((current) => { const next = new Set(current); next.has(node.agent.id) ? next.delete(node.agent.id) : next.add(node.agent.id); return next; })}>{collapsed.has(node.agent.id) ? "+" : "−"}</button>}
          </div>; })}
        </div></div>}
        {!scoped.length && <div className="org-empty"><NetworkIcon/><h2>{text("표시할 세션이 없습니다.", "No sessions to display.")}</h2><p>{text("전체 세션을 선택하면 잠든 세션도 볼 수 있습니다.", "Choose All sessions to include sleeping sessions.")}</p></div>}
        {!!query && scoped.length > 0 && !scoped.some(matches) && <div className="org-search-empty" role="status">{text("일치하는 세션이 없습니다.", "No matching sessions.")}</div>}
      </div>
      {scope !== "all" && <><div className="org-legend"><span>— {text("부모·자식", "Parent / child")}</span><span><i/>{text("활성 세션", "Active session")}</span></div><div className="org-zoom"><button aria-label={text("축소", "Zoom out")} disabled={zoom <= .35} onClick={() => setZoom((current) => Math.max(.35, current - .1))}>−</button><button aria-label={text("100%로 보기", "Reset zoom")} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button aria-label={text("확대", "Zoom in")} disabled={zoom >= 1.5} onClick={() => setZoom((current) => Math.min(1.5, current + .1))}>＋</button><button aria-label={text("전체 조직도 맞춤", "Fit organization")} onClick={fit}>⛶</button></div></>}
      <div className="org-map-note">{text("폴더 관계는 설정 상속의 기준입니다. 각 세션은 독립적으로 실행됩니다.", "Folder relationships define inheritance. Each session runs independently.")}</div>
    </div>
    {selected && <HierarchyInspector key={selected.id} agent={selected} agents={catalog} projects={props.projects} onUpdate={props.onUpdateHierarchy} onCreate={props.onCreateChild} onOpen={props.onOpenSession} onProperties={props.onOpenProperties} onClose={() => { if ((rootRef.current?.clientWidth || 1200) < 820) setMobileInspector(false); else setInspectorCollapsed(true); }}/>}</div>
  </section>;
}

function HierarchyInspector({ agent, agents, projects, onUpdate, onCreate, onOpen, onProperties, onClose }: {
  agent: Agent; agents: Agent[]; projects: Project[];
  onUpdate: Props["onUpdateHierarchy"]; onCreate: Props["onCreateChild"]; onOpen: Props["onOpenSession"]; onProperties: Props["onOpenProperties"]; onClose: () => void;
}) {
  const { text } = useAppLanguage();
  const [patch, setPatch] = useState<Partial<SessionHierarchy> | null>(null);
  const [tab, setTab] = useState("inherit");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hierarchy = { ...agent.sessionHierarchy, ...patch };
  const preview = { ...agent, sessionHierarchy: hierarchy };
  const settings = resolveSessionSettings(preview, agents.map((item) => item.id === agent.id ? preview : item), projects);
  const parent = agents.find((item) => item.id === hierarchy.parentId);
  const creator = agents.find((item) => item.id === agent.sessionHierarchy?.createdById);
  const project = projects.find((item) => item.id === agent.projectId);
  const folder = agent.sshHostId ? settings.remoteFolder || "" : settings.folder;
  const instructionSupported = agent.aiToolId === "codex" || (agent.aiToolId === "claude" && !agent.sshHostId);
  const modelSupported = !!parent && parent.aiToolId === agent.aiToolId && !agent.sshHostId && ["codex", "claude"].includes(agent.aiToolId);
  const edit = (next: Partial<SessionHierarchy>) => { setPatch((current) => ({ ...current, ...next })); setMessage(""); setError(""); };
  function save() {
    try {
      if (settings.instructions.length > 20000 || settings.instructions.includes("\0")) throw new Error(text("상속을 포함한 추가 지침은 제어 문자 없이 20,000자 이내로 입력하세요.", "Effective instructions must be within 20,000 characters and contain no null characters."));
      if (!agent.sshHostId && hierarchy.folderOverride && !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(hierarchy.folderOverride)) throw new Error(text("작업 폴더의 절대 경로를 입력하세요.", "Enter an absolute working-folder path."));
      if (hierarchy.folderOverride && /[\x00-\x1f]/.test(hierarchy.folderOverride)) throw new Error(text("폴더 경로에 제어 문자를 사용할 수 없습니다.", "Folder paths cannot contain control characters."));
      onUpdate(agent.id, normalizeSessionHierarchy(hierarchy) || {});
      setPatch(null);
      setMessage(text("저장했습니다. 다음 실행부터 적용됩니다.", "Saved. Applies on the next launch."));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  return <aside className="org-inspector" aria-label={text("세션 정보", "Session inspector")}><header className="org-inspector-heading"><NetworkIcon/>{text("세션 정보", "Session inspector")}<button className="org-icon-button" aria-label={text("세션 정보 닫기", "Close session inspector")} onClick={onClose}>×</button></header><div className="org-inspector-scroll">
    <div className="org-selected-summary"><div className="org-breadcrumb">{project?.name} {parent ? ` › ${parent.name}` : ""}</div><h2><span style={{ color: toolForId(agent.aiToolId).iconColor }}>{toolForId(agent.aiToolId).icon}</span>{agent.name}</h2><SessionState agent={agent}/><span className="org-selected-tool">{toolForId(agent.aiToolId).label}</span></div>
    <div className="org-detail-tabs"><button className={tab === "inherit" ? "active" : ""} onClick={() => setTab("inherit")}>{text("설정 상속", "Inheritance")}</button><button className={tab === "relation" ? "active" : ""} onClick={() => setTab("relation")}>{text("관계·실행", "Relationships")}</button></div>
    <section className="org-detail-section"><label><span className="org-field-label">{text("부모 세션", "Parent session")}</span><select value={hierarchy.parentId || ""} aria-label={text("부모 세션", "Parent session")} onChange={(event) => { const next = agents.find((item) => item.id === event.target.value); edit({ parentId: event.target.value || undefined, ...(next && next.aiToolId !== agent.aiToolId ? { inheritModel: false } : {}) }); }}><option value="">{project?.name} · {text("프로젝트 직속", "Under project")}</option>{agents.filter((item) => item.id !== agent.id && canParentSession(agents, agent.id, item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {toolForId(item.aiToolId).label}</option>)}</select></label><p className="org-help">{text("작업 폴더와 공통 설정을 이어받는 기준입니다.", "The source of inherited folders and shared settings.")}</p></section>
    {tab === "inherit" ? <>
      <section className="org-detail-section"><label><span className="org-field-label">{text("작업 폴더", "Working folder")}<small>{parent && hierarchy.inheritFolder !== false ? text("↳ 부모에서 상속", "↳ Inherited") : text("직접 지정", "Custom")}</small></span><input className="org-folder-value" aria-label={text("작업 폴더", "Working folder")} value={folder} readOnly={!!parent && hierarchy.inheritFolder !== false} title={folder} onChange={(event) => edit({ folderOverride: event.target.value })}/></label>{!!parent && <label className="org-check"><input type="checkbox" checked={hierarchy.inheritFolder !== false} onChange={(event) => edit({ inheritFolder: event.target.checked, ...(!event.target.checked ? { folderOverride: folder } : {}) })}/>{text("부모의 작업 폴더 사용", "Use parent's working folder")}</label>}</section>
      <section className="org-detail-section"><label><span className="org-field-label">{text("추가 지침", "Additional instructions")}</span><textarea aria-label={text("추가 지침", "Additional instructions")} value={hierarchy.instructions || ""} maxLength={20000} disabled={!instructionSupported} placeholder={text("이 세션에 필요한 작업 지침", "Instructions for this session")} onChange={(event) => edit({ instructions: event.target.value })}/></label>{!!parent && <label className="org-check"><input type="checkbox" checked={instructionSupported && hierarchy.inheritInstructions !== false} disabled={!instructionSupported} onChange={(event) => edit({ inheritInstructions: event.target.checked })}/>{text("상위 세션의 추가 지침 상속", "Inherit parent instructions")}</label>}<p className="org-help">{instructionSupported ? text("작업 폴더의 프로젝트 지침에 이 세션의 지침을 추가합니다.", "Adds these instructions to the working folder's project guidance.") : text("추가 지침은 Codex와 로컬 Claude 세션에서 지원합니다.", "Additional instructions support Codex and local Claude sessions.")}</p>{settings.instructions && parent && hierarchy.inheritInstructions !== false && <details className="org-instruction-preview"><summary>{text("적용할 지침 보기", "Preview effective instructions")}</summary><pre>{settings.instructions}</pre></details>}</section>
      <section className="org-detail-section"><span className="org-field-label">{text("모델 · effort", "Model · effort")}</span><div className="org-effective-value">{settings.modelSettings?.model || text("CLI 기본 설정", "CLI defaults")}{settings.modelSettings?.effort ? ` · ${settings.modelSettings.effort}` : ""}</div>{!!parent && <label className="org-check"><input type="checkbox" disabled={!modelSupported} checked={modelSupported && hierarchy.inheritModel === true} onChange={(event) => edit({ inheritModel: event.target.checked })}/>{text("같은 제공자의 기본값 상속", "Inherit same-provider defaults")}</label>}<p className="org-help">{text("상속을 끄면 이 세션에 지정한 모델 설정을 사용합니다.", "Disable inheritance to use this session's model settings.")}</p></section>
    </> : <><section className="org-detail-section"><span className="org-field-label">{text("세션을 만든 주체", "Created by")}</span><div className="org-effective-value" title={agent.sessionHierarchy?.createdById}>{creator?.name || (agent.sessionHierarchy?.createdById ? text("삭제된 세션", "Deleted session") : text("사용자", "User"))}</div><span className="org-field-label" style={{ marginTop: 16 }}>{text("대화 기록", "Conversation history")}</span><div className="org-effective-value">{text("독립 대화", "Independent conversation")}</div></section><section className="org-detail-section"><p className="org-relation-note">{text("폴더 관계와 생성 관계는 별도로 유지됩니다. 부모를 옮겨도 생성 주체와 기존 대화가 바뀌지 않습니다. 각 세션은 독립적으로 실행하고 종료합니다.", "Organization and creation provenance are separate. Moving a parent preserves the creator and conversation. Each session runs and stops independently.")}</p></section></>}
    <section className="org-detail-section org-save-section"><p role={error ? "alert" : "status"} className={error ? "org-error" : "org-help"}>{error || message || text("설정 변경은 다음 실행부터 적용됩니다.", "Setting changes apply on the next launch.")}</p><button className="btn-primary" disabled={!patch} onClick={save}>{text("변경 저장", "Save changes")}</button></section>
    </div><footer className="org-inspector-footer"><button className="btn-secondary" onClick={() => onOpen(agent.id)}>{text("대화 열기", "Open session")}</button><button className="btn-secondary" onClick={() => onCreate(agent.id)}>{text("자식 추가", "Add child")}</button><button className="org-icon-button" aria-label={text("세션 속성", "Session properties")} onClick={() => onProperties(agent.id)}>⚙</button></footer></aside>;
}
