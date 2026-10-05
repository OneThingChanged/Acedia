import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Agent, Project, ProjectHierarchy, ProjectReference } from "../types";
import { toolForId } from "../types";
import { useAppLanguage } from "../lib/appLanguage";
import { canParentProject, resolveProjectSettings, updateProjectHierarchy } from "../lib/projectHierarchy";
import { isAgentRuntimeActive } from "../lib/agentActivity";
import "./ProjectBoard.css";

export type ProjectBoardChange = { id: string; hierarchy?: ProjectHierarchy; boardPosition?: Project["boardPosition"] };
type Props = {
  projects: Project[]; agents: Agent[];
  activeAgents: Agent[];
  renderSessionState: (agent: Agent) => ReactNode;
  onUpdate: (changes: ProjectBoardChange[]) => void;
  onScope: (id: string) => void;
  onSelectSession: (id: string) => void;
  onOpenSession: (id: string) => void;
  renderSessionInspector: (id: string, close: () => void) => ReactNode;
};
type Edge = { kind: "parent" | "reference"; from: string; to: string; owner: string };
type Link = { kind: Edge["kind"]; owner: string; target: string; path: string; scopes: ProjectReference["scopes"]; access: ProjectReference["access"] };
type History = { before: ProjectBoardChange[]; after: ProjectBoardChange[] };
const WIDTH = 274;
const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest("input,textarea,select,[contenteditable=true]");
const signature = (p: ProjectBoardChange) => JSON.stringify([p.hierarchy || {}, p.boardPosition]);

export function ProjectBoard(props: Props) {
  const { text } = useAppLanguage();
  const viewport = useRef<HTMLDivElement>(null), root = useRef<HTMLElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, zoom: 1 });
  const viewRef = useRef(view); viewRef.current = view;
  const [bounds, setBounds] = useState({ width: 900, height: 600 });
  const [activeOnly, setActiveOnly] = useState(false), [query, setQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState(props.projects[0]?.id || ""), [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [edge, setEdge] = useState<Edge | null>(null), [link, setLink] = useState<Link | null>(null);
  const [message, setMessage] = useState(""), [patch, setPatch] = useState<ProjectHierarchy | null>(null);
  const [snap, setSnap] = useState(true), [inspector, setInspector] = useState(true);
  const [past, setPast] = useState<History[]>([]), [future, setFuture] = useState<History[]>([]);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [wire, setWire] = useState<{ from: string; kind: Edge["kind"]; x: number; y: number } | null>(null);
  const space = useRef(false), fitted = useRef(false);
  const gesture = useRef<null | { kind: "pan" | "card" | "wire"; id?: string; type?: Edge["kind"]; startX: number; startY: number; x: number; y: number; moved: boolean }>(null);
  const members = useMemo(() => new Map(props.projects.map(p => {
    const rows = (activeOnly ? props.activeAgents : props.agents).filter(a => a.projectId === p.id), ordered: Agent[] = [];
    const visit = (a: Agent) => { ordered.push(a); rows.filter(child => child.sessionHierarchy?.parentId === a.id).forEach(visit); };
    rows.filter(a => !rows.some(parent => parent.id === a.sessionHierarchy?.parentId)).forEach(visit);
    return [p.id, ordered];
  })), [props.projects, props.agents, props.activeAgents, activeOnly]);
  const positions = new Map(props.projects.map((p, i) => [p.id, preview?.id === p.id ? preview : p.boardPosition || { x: (i % 4) * 340, y: Math.floor(i / 4) * 460 }]));
  const height = (id: string) => 144 + Math.min(members.get(id)?.length || 0, 6) * 45;
  const edges: Edge[] = props.projects.flatMap(p => [
    ...(p.hierarchy?.parentId && canParentProject(props.projects, p.id, p.hierarchy.parentId) ? [{ kind: "parent" as const, from: p.hierarchy.parentId, to: p.id, owner: p.id }] : []),
    ...(p.hierarchy?.references || []).filter(ref => props.projects.some(other => other.id === ref.projectId)).map(ref => ({ kind: "reference" as const, from: p.id, to: ref.projectId, owner: p.id })),
  ]);
  const extent = props.projects.length ? {
    x: Math.min(...[...positions.values()].map(p => p.x)) - 40,
    y: Math.min(...[...positions.values()].map(p => p.y)) - 40,
    right: Math.max(...[...positions.values()].map(p => p.x + WIDTH)) + 40,
    bottom: Math.max(...props.projects.map(p => positions.get(p.id)!.y + height(p.id))) + 40,
  } : { x: 0, y: 0, right: 900, bottom: 600 };
  const project = props.projects.find(p => p.id === selectedProject);
  const hierarchy = { ...project?.hierarchy, ...patch };
  const settings = project ? resolveProjectSettings({ ...project, hierarchy }, props.projects.map(p => p.id === project.id ? { ...p, hierarchy } : p)) : null;
  const matches = (p: Project) => !query.trim() || `${p.name} ${p.folder} ${props.agents.filter(a => a.projectId === p.id).map(a => a.name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
  const choose = (id: string) => { setSelectedProject(id); setSelectedSession(null); setEdge(null); setPatch(null); setMessage(""); setInspector(true); };
  const fit = () => {
    const zoom = Math.max(.25, Math.min(1, (bounds.width - 70) / (extent.right - extent.x), (bounds.height - 70) / (extent.bottom - extent.y)));
    setView({ zoom, x: (bounds.width - (extent.right - extent.x) * zoom) / 2 - extent.x * zoom, y: (bounds.height - (extent.bottom - extent.y) * zoom) / 2 - extent.y * zoom });
  };
  const focus = (id: string) => { const p = positions.get(id); if (p) setView(v => ({ ...v, x: bounds.width / 2 - (p.x + WIDTH / 2) * v.zoom, y: bounds.height / 2 - (p.y + height(id) / 2) * v.zoom })); };
  const zoomAt = (zoom: number, x = bounds.width / 2, y = bounds.height / 2) => setView(v => { const z = Math.max(.25, Math.min(1.8, zoom)); return { zoom: z, x: x - (x - v.x) * z / v.zoom, y: y - (y - v.y) * z / v.zoom }; });
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const observer = new ResizeObserver(() => setBounds({ width: el.clientWidth, height: el.clientHeight })); observer.observe(el);
    const wheel = (e: WheelEvent) => { if (editable(e.target)) return; e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(viewRef.current.zoom * Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener("wheel", wheel); };
  }, []);
  useEffect(() => { if (!fitted.current && props.projects.length && bounds.width > 50) { fitted.current = true; fit(); } }, [bounds, props.projects.length]);
  useEffect(() => { if (project && selectedProject === project.id) setPatch(null); }, [project?.hierarchy]);
  useEffect(() => { if (selectedSession && !props.agents.some(a => a.id === selectedSession)) setSelectedSession(null); }, [props.agents, selectedSession]);

  function commit(changes: ProjectBoardChange[]) {
    try {
      const before = changes.map(c => { const i = props.projects.findIndex(p => p.id === c.id), p = props.projects[i]; return { id: c.id, ...(c.hierarchy !== undefined ? { hierarchy: p.hierarchy || {} } : {}), ...(c.boardPosition ? { boardPosition: p.boardPosition || { x: (i % 4) * 340, y: Math.floor(i / 4) * 460 } } : {}) }; });
      // Store effective normalized results, including folder preservation on detach.
      let afterProjects = props.projects;
      for (const c of changes) {
        if (c.hierarchy !== undefined) afterProjects = updateProjectHierarchy(afterProjects, c.id, c.hierarchy);
        if (c.boardPosition) afterProjects = afterProjects.map(p => p.id === c.id ? { ...p, boardPosition: c.boardPosition } : p);
      }
      const after = changes.map(c => { const p = afterProjects.find(p => p.id === c.id)!; return { id: c.id, ...(c.hierarchy !== undefined ? { hierarchy: p.hierarchy || {} } : {}), ...(c.boardPosition ? { boardPosition: p.boardPosition } : {}) }; });
      props.onUpdate(after); setPast(old => [...old.slice(-49), { before, after }]); setFuture([]); setPatch(null); setMessage(text("저장했습니다. 설정은 다음 실행부터 적용됩니다.", "Saved. Settings apply on the next launch."));
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return false; }
  }
  function history(redo: boolean) {
    const stack = redo ? future : past, item = stack[stack.length - 1]; if (!item) return;
    const expected = redo ? item.before : item.after, changes = redo ? item.after : item.before;
    // A peer edit must not be overwritten by an obsolete undo snapshot.
    if (expected.some(c => { const p = props.projects.find(p => p.id === c.id); return !p || signature({ id: p.id, ...(c.hierarchy !== undefined ? { hierarchy: p.hierarchy || {} } : {}), ...(c.boardPosition ? { boardPosition: p.boardPosition || positions.get(p.id) } : {}) }) !== signature(c); })) {
      setMessage(text("다른 창에서 변경된 항목은 되돌릴 수 없습니다.", "This item changed in another window.")); return;
    }
    try { props.onUpdate(changes); setPatch(null); setPast(old => redo ? [...old, item] : old.slice(0, -1)); setFuture(old => redo ? old.slice(0, -1) : [...old, item]); }
    catch (error) { setMessage(String(error)); }
  }
  function unlink(e: Edge) {
    const p = props.projects.find(p => p.id === e.owner); if (!p) return;
    const next = e.kind === "parent" ? { ...p.hierarchy, parentId: undefined } : { ...p.hierarchy, references: p.hierarchy?.references?.filter(r => r.projectId !== e.to) };
    if (commit([{ id: p.id, hierarchy: next }])) setEdge(null);
  }
  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (editable(e.target) || link) return;
      if (e.code === "Space") { space.current = true; e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) { e.preventDefault(); history(e.key.toLowerCase() === "y" || e.shiftKey); }
      if (e.key === "Delete" && edge) { e.preventDefault(); unlink(edge); }
      if (e.key === "Escape") { setEdge(null); setWire(null); gesture.current = null; setPreview(null); }
    };
    const keyUp = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    const blur = () => { space.current = false; gesture.current = null; setWire(null); setPreview(null); };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur); };
  });
  function begin(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Element, card = target.closest<HTMLElement>("[data-project-card]"), port = target.closest<HTMLElement>("[data-port]");
    const p = card ? positions.get(card.dataset.projectCard!) : null;
    const kind = space.current || e.button === 1 ? "pan" : port ? "wire" : target.closest(".pb-card-header") && card ? "card" : target.closest("button,input,select,[data-edge]") || card ? null : "pan";
    if (!kind) return;
    e.preventDefault();
    gesture.current = { kind, id: card?.dataset.projectCard, type: port?.dataset.port as Edge["kind"], startX: e.clientX, startY: e.clientY, x: kind === "pan" ? view.x : p?.x || 0, y: kind === "pan" ? view.y : p?.y || 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (kind === "wire") move(e);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current; if (!g) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    g.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    if (g.kind === "pan") setView(v => ({ ...v, x: g.x + dx, y: g.y + dy }));
    if (g.kind === "card" && g.id) {
      const grid = snap ? 16 : 1;
      setPreview({ id: g.id, x: Math.round((g.x + dx / view.zoom) / grid) * grid, y: Math.round((g.y + dy / view.zoom) / grid) * grid });
    }
    if (g.kind === "wire" && g.id && g.type) { const r = e.currentTarget.getBoundingClientRect(); setWire({ from: g.id, kind: g.type, x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom }); }
  }
  function end(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current; gesture.current = null;
    if (g?.kind === "card") {
      if (g.moved && preview) commit([{ id: preview.id, boardPosition: { x: preview.x, y: preview.y } }]);
      else if (g.id) choose(g.id);
    }
    if (g?.kind === "wire" && g.id) {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-project-card]")?.dataset.projectCard;
      if (target && target !== g.id) openLink(g.type!, g.type === "parent" ? target : g.id, g.type === "parent" ? g.id : target);
    }
    setPreview(null); setWire(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function openLink(kind: Edge["kind"], owner = selectedProject, target = "") {
    const ref = props.projects.find(p => p.id === owner)?.hierarchy?.references?.find(r => r.projectId === target);
    setLink({ kind, owner, target, scopes: ref?.scopes || ["instructions", "code", "docs"], access: ref?.access || "read", path: ref?.path || "" }); setMessage("");
  }
  function saveLink() {
    if (!link) return;
    const p = props.projects.find(p => p.id === link.owner); if (!p || !link.target) return;
    if (/[\x00-\x1f]/.test(link.path) || /^(?:[\\/]|[A-Za-z]:)/.test(link.path) || link.path.replace(/\\/g, "/").split("/").includes("..")) { setMessage(text("프로젝트 안의 상대 폴더 경로를 입력하세요.", "Enter a relative folder path within the project.")); return; }
    if (link.kind === "reference" && !link.scopes.length) { setMessage(text("참조 범위를 하나 이상 선택하세요.", "Choose a reference scope.")); return; }
    const h = link.kind === "parent" ? { ...p.hierarchy, parentId: link.target } : { ...p.hierarchy, references: [...(p.hierarchy?.references || []).filter(r => r.projectId !== link.target), { projectId: link.target, scopes: link.scopes, access: link.access, path: link.path }] };
    if (commit([{ id: p.id, hierarchy: h }])) { choose(p.id); setLink(null); }
  }
  const miniScale = Math.min(180 / (extent.right - extent.x), 110 / (extent.bottom - extent.y));
  function mini(e: React.PointerEvent<SVGSVGElement>) {
    if (e.type === "pointermove" && !e.buttons) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) * 200 / r.width - 10) / miniScale + extent.x, y = ((e.clientY - r.top) * 130 / r.height - 10) / miniScale + extent.y;
    setView(v => ({ ...v, x: bounds.width / 2 - x * v.zoom, y: bounds.height / 2 - y * v.zoom }));
  }
  const selectedEdge = edge && edges.find(e => e.kind === edge.kind && e.owner === edge.owner && e.to === edge.to);
  return <section ref={root} className={`terminal-area session-organization project-board${!inspector ? " org-inspector-collapsed" : " org-inspector-shown"}`} aria-label={text("프로젝트 관계 보드", "Project relationship board")}>
    <header className="org-header"><div><small>{text("프로젝트 / 세션 관리", "Projects / Session management")}</small><h1>▥ {text("프로젝트 관계 보드", "Project relationship board")}</h1><p>{text("부모·자식은 설정 상속, 참조는 다른 폴더의 자료 활용입니다.", "Parents share settings. References bring in resources from other folders.")}</p></div><div className="org-header-actions"><select aria-label={text("조직도 프로젝트", "Organization project")} value="all" onChange={e => props.onScope(e.target.value)}><option value="all">{text("전체 프로젝트", "All projects")}</option>{props.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="btn-primary" disabled={!props.projects.length} onClick={() => openLink("parent")}>＋ {text("관계 연결", "Connect projects")}</button><button className="org-icon-button" aria-label={text("정보 패널 전환", "Toggle inspector")} onClick={() => setInspector(!inspector)}>▥</button></div></header>
    <div className="org-toolbar"><div className="org-view-switch"><button aria-pressed={!activeOnly} className={!activeOnly ? "active" : ""} onClick={() => setActiveOnly(false)}>{text("전체 세션", "All sessions")} <span>{props.agents.length}</span></button><button aria-pressed={activeOnly} className={activeOnly ? "active" : ""} onClick={() => setActiveOnly(true)}>{text("활성 세션", "Active sessions")} <span>{props.agents.filter(a => isAgentRuntimeActive(a) && !a.deferredStart).length}</span></button></div><div className="pb-history"><button aria-label={text("되돌리기", "Undo")} disabled={!past.length} onClick={() => history(false)}>↶</button><button aria-label={text("다시 실행", "Redo")} disabled={!future.length} onClick={() => history(true)}>↷</button><label><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)}/>{text("격자 맞춤", "Snap")}</label></div><label className="org-search"><input aria-label={text("프로젝트·세션 찾기", "Find projects or sessions")} placeholder={text("프로젝트·세션 찾기", "Find projects or sessions")} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { const p = props.projects.find(matches); if (p) { choose(p.id); focus(p.id); } } }}/></label></div>
    <div className="org-body"><div className="org-map">
      <div className="pb-viewport" ref={viewport} tabIndex={0} aria-label={text("보드 · 빈 공간 드래그로 이동, 휠로 확대", "Board · drag empty space to pan, wheel to zoom")} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { gesture.current = null; setPreview(null); setWire(null); }} style={{ backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
        <div className="pb-world" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})` }}>
          <svg className="pb-edges" aria-label={text("프로젝트 연결", "Project connections")}><defs><marker id="pb-parent-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#41c7a3"/></marker><marker id="pb-reference-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#af8eff"/></marker></defs>{edges.map(e => {
            const a = positions.get(e.from)!, b = positions.get(e.to)!, x = a.x + WIDTH, y = a.y + (e.kind === "parent" ? 36 : 60), endX = b.x, endY = b.y + (e.kind === "parent" ? 36 : 60), bend = Math.max(70, Math.abs(endX - x) / 2);
            const routeY = Math.min(a.y, b.y) - (e.kind === "parent" ? 55 : 90);
            const d = endX > x ? `M${x} ${y}C${x + bend} ${y},${endX - bend} ${endY},${endX} ${endY}` : `M${x} ${y}C${x + 55} ${y},${x + 55} ${routeY},${x} ${routeY}L${endX - 55} ${routeY}C${endX - 100} ${routeY},${endX - 100} ${endY},${endX} ${endY}`, chosen = selectedEdge?.kind === e.kind && selectedEdge.owner === e.owner && selectedEdge.to === e.to;
            return <g key={`${e.kind}:${e.from}:${e.to}`} data-edge="true" className={`pb-edge ${e.kind}${chosen ? " selected" : ""}`} onClick={() => { setEdge(e); setSelectedSession(null); setSelectedProject(e.owner); setPatch(null); setInspector(true); }}><path className="pb-edge-line" d={d} markerEnd={`url(#pb-${e.kind}-arrow)`}/><path className="pb-edge-hit" d={d} role="button" tabIndex={0} aria-label={`${props.projects.find(p => p.id === e.from)?.name} → ${props.projects.find(p => p.id === e.to)?.name}`} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setEdge(e); setSelectedProject(e.owner); setSelectedSession(null); setInspector(true); } }}/></g>;
          })}{wire && <path className={`pb-wire ${wire.kind}`} d={`M${positions.get(wire.from)!.x + WIDTH} ${positions.get(wire.from)!.y + (wire.kind === "parent" ? 36 : 60)} L${wire.x} ${wire.y}`}/>}</svg>
          {props.projects.map(p => { const pos = positions.get(p.id)!, rows = members.get(p.id) || []; return <article key={p.id} data-project-card={p.id} className={`pb-card org-project-group${selectedProject === p.id && !selectedSession ? " selected" : ""}${!matches(p) ? " dimmed" : ""}`} style={{ left: pos.x, top: pos.y, width: WIDTH, zIndex: preview?.id === p.id ? 4 : selectedProject === p.id ? 2 : 1 }}>
            <div className="pb-card-header" role="button" tabIndex={0} aria-label={`${text("프로젝트 선택", "Select project")} ${p.name}`} onClick={() => choose(p.id)} onKeyDown={e => { if (["Enter", " "].includes(e.key)) choose(p.id); }}><span>▱</span><strong title={p.name}>{p.name}</strong><small>{rows.length}</small></div><div className="pb-card-folder" title={p.sshHostId ? p.remoteFolder : p.folder}>{p.sshHostId ? p.remoteFolder : p.folder}</div>
            <button className="pb-port parent" data-port="parent" aria-label={`${p.name} ${text("자식 프로젝트 연결", "connect child project")}`} title={text("자식으로 연결할 프로젝트에 드래그", "Drag onto a project to make it a child")}>●</button><button className="pb-port reference" data-port="reference" aria-label={`${p.name} ${text("참조 연결", "connect reference")}`} title={text("참조할 프로젝트에 드래그", "Drag onto a project to reference it")}>●</button>
            <div className="pb-sessions">{rows.slice(0, 6).map(a => <button key={a.id} className={`org-overview-row${selectedSession === a.id ? " selected" : ""}`} onClick={() => { setSelectedProject(p.id); setSelectedSession(a.id); setEdge(null); setInspector(true); props.onSelectSession(a.id); }} onDoubleClick={() => props.onOpenSession(a.id)} style={{ marginLeft: a.sessionHierarchy?.parentId ? 12 : 0 }}><span className="org-provider" style={{ color: toolForId(a.aiToolId).iconColor }}>{toolForId(a.aiToolId).icon}</span><span className="org-overview-name">{a.name}<small>{a.sessionHierarchy?.parentId ? text("자식 세션", "Child session") : toolForId(a.aiToolId).label}</small></span>{props.renderSessionState(a)}</button>)}{!rows.length && <p className="pb-no-sessions">{text("표시할 세션 없음", "No sessions to display")}</p>}{rows.length > 6 && <button className="pb-more" onClick={() => props.onScope(p.id)}>＋{rows.length - 6} {text("세션 보기", "sessions")}</button>}</div>
            <button className="pb-card-footer" onClick={() => props.onScope(p.id)}>{text("세션 트리 보기", "View session tree")} →</button>
          </article>; })}
        </div>
        {!props.projects.length && <div className="org-empty"><h2>{text("프로젝트를 추가해 보드를 시작하세요.", "Add a project to start your board.")}</h2></div>}
      </div>
      <div className="pb-legend"><span>━ {text("부모 → 자식", "Parent → child")}</span><span>┄ {text("사용 → 참조", "Consumer → reference")}</span></div>
      <svg className="pb-minimap" width="200" height="130" viewBox="0 0 200 130" aria-label={text("보드 미니맵 · 드래그로 이동", "Board minimap · drag to navigate")} onPointerDown={mini} onPointerMove={mini}>{props.projects.map(p => { const pos = positions.get(p.id)!; return <rect key={p.id} x={10 + (pos.x - extent.x) * miniScale} y={10 + (pos.y - extent.y) * miniScale} width={WIDTH * miniScale} height={height(p.id) * miniScale} className={p.id === selectedProject ? "selected" : ""}/>; })}<rect className="pb-mini-view" x={10 + (-view.x / view.zoom - extent.x) * miniScale} y={10 + (-view.y / view.zoom - extent.y) * miniScale} width={bounds.width / view.zoom * miniScale} height={bounds.height / view.zoom * miniScale}/></svg>
      <div className="org-zoom"><button aria-label={text("축소", "Zoom out")} onClick={() => zoomAt(view.zoom / 1.15)}>−</button><button aria-label={text("100%로 보기", "Reset zoom")} onClick={() => zoomAt(1)}>{Math.round(view.zoom * 100)}%</button><button aria-label={text("확대", "Zoom in")} onClick={() => zoomAt(view.zoom * 1.15)}>＋</button><button aria-label={text("전체 보드 맞춤", "Fit board")} onClick={fit}>⛶</button></div>
      <div className="org-map-note">{text("카드 제목 드래그 · 빈 공간/Space+드래그로 보드 이동 · 휠 확대 · 배치는 연결을 변경하지 않습니다.", "Drag card headers · empty space or Space+drag to pan · wheel to zoom · moving cards preserves relationships.")}</div>
    </div>
    {inspector && (selectedSession ? props.renderSessionInspector(selectedSession, () => setInspector(false)) : project && <aside className="org-inspector pb-inspector"><header className="org-inspector-heading">▱ {text("프로젝트 정보", "Project inspector")}<button className="org-icon-button" aria-label={text("정보 닫기", "Close inspector")} onClick={() => setInspector(false)}>×</button></header><div className="org-inspector-scroll"><div className="org-selected-summary"><small>{text("프로젝트", "Project")}</small><h2>{project.name}</h2><code>{project.sshHostId ? project.remoteFolder : project.folder}</code></div>
      {selectedEdge && <section className="org-detail-section pb-edge-detail"><strong>{text("선택한 연결", "Selected connection")}</strong><p>{props.projects.find(p => p.id === selectedEdge.from)?.name} → {props.projects.find(p => p.id === selectedEdge.to)?.name}</p><button className="btn-secondary" onClick={() => unlink(selectedEdge)}>{text("이 연결 해제", "Disconnect this link")}</button>{selectedEdge.kind === "reference" && <button className="btn-secondary" onClick={() => openLink("reference", selectedEdge.owner, selectedEdge.to)}>{text("참조 편집", "Edit reference")}</button>}</section>}
      <section className="org-detail-section"><label><span className="org-field-label">{text("부모 프로젝트", "Parent project")}</span><select aria-label={text("부모 프로젝트", "Parent project")} value={hierarchy.parentId || ""} onChange={e => setPatch({ ...hierarchy, parentId: e.target.value || undefined })}><option value="">{text("없음 · 독립 프로젝트", "None · Root project")}</option>{props.projects.filter(p => p.id !== project.id && canParentProject(props.projects, project.id, p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{project.hierarchy?.parentId && <button className="pb-text-button" onClick={() => unlink({ kind: "parent", from: project.hierarchy!.parentId!, to: project.id, owner: project.id })}>{text("부모 연결 해제", "Detach parent")}</button>}{!!hierarchy.parentId && <><label className="org-check"><input type="checkbox" checked={hierarchy.inheritInstructions !== false} onChange={e => setPatch({ ...hierarchy, inheritInstructions: e.target.checked })}/>{text("부모의 공통 지침 상속", "Inherit parent instructions")}</label><label className="org-check"><input type="checkbox" checked={hierarchy.inheritModel === true} onChange={e => setPatch({ ...hierarchy, inheritModel: e.target.checked })}/>{text("부모의 모델 기본값 상속", "Inherit parent model defaults")}</label><label className="org-check"><input type="checkbox" checked={hierarchy.inheritFolder === true} onChange={e => setPatch({ ...hierarchy, inheritFolder: e.target.checked, ...(!e.target.checked ? { folderOverride: project.sshHostId ? settings?.remoteFolder : settings?.folder } : {}) })}/>{text("부모의 작업 폴더 사용", "Use parent's working folder")}</label></>}</section>
      <section className="org-detail-section"><span className="org-field-label">{text("적용할 작업 폴더", "Effective working folder")}</span><code>{project.sshHostId ? settings?.remoteFolder : settings?.folder}</code><p className="org-help">{text("기본은 각 프로젝트의 폴더입니다. 대화·계정·실행 상태는 상속하지 않습니다.", "Each project keeps its folder by default. Conversations, accounts and running state stay independent.")}</p><label><span className="org-field-label">{text("공통 지침", "Shared instructions")}</span><textarea aria-label={text("프로젝트 공통 지침", "Project shared instructions")} maxLength={20000} value={hierarchy.instructions || ""} onChange={e => setPatch({ ...hierarchy, instructions: e.target.value })}/></label>{(["codex", "claude"] as const).map(provider => <label key={provider}><span className="org-field-label">{provider} {text("모델 기본값", "model default")}</span><input aria-label={`${provider} ${text("모델 기본값", "model default")}`} placeholder={text("CLI 기본 설정", "CLI defaults")} value={hierarchy.models?.[provider]?.model || ""} onChange={e => setPatch({ ...hierarchy, models: { ...hierarchy.models, [provider]: e.target.value ? { ...hierarchy.models?.[provider], model: e.target.value } : undefined } })}/></label>)}</section>
      <section className="org-detail-section"><span className="org-field-label">{text("참조 프로젝트", "References")}<button className="pb-text-button" onClick={() => openLink("reference", project.id)}>＋ {text("추가", "Add")}</button></span>{(project.hierarchy?.references || []).map(ref => <div className="pb-reference" key={ref.projectId}><button onClick={() => openLink("reference", project.id, ref.projectId)}><strong>{props.projects.find(p => p.id === ref.projectId)?.name || text("삭제된 프로젝트", "Deleted project")}</strong><small>{ref.scopes.map(scope => text(scope === "instructions" ? "지침" : scope === "code" ? "코드" : "문서", scope)).join(" · ")} / {ref.access === "write" ? text("수정 허용", "Edits allowed") : text("참조 지침", "Reference guidance")}</small></button><button aria-label={`${text("참조 해제", "Remove reference")} ${ref.projectId}`} onClick={() => unlink({ kind: "reference", from: project.id, to: ref.projectId, owner: project.id })}>×</button></div>)}{!project.hierarchy?.references?.length && <p className="org-help">{text("다른 폴더의 코드·문서·지침을 선택해 활용합니다.", "Use code, documents and instructions from another folder.")}</p>}<p className="org-help">{text("참조는 수정하지 않도록 지침을 전달합니다. 파일 접근 권한은 CLI의 승인·샌드박스 설정을 따릅니다.", "Reference guidance requests no edits. File access follows the CLI's approval and sandbox settings.")}</p></section>
      <section className="org-detail-section"><span className="org-field-label">{text("자식 프로젝트", "Child projects")}</span>{props.projects.filter(p => p.hierarchy?.parentId === project.id).map(p => <div className="pb-reference" key={p.id}><button onClick={() => { choose(p.id); focus(p.id); }}>{p.name}</button><button aria-label={`${text("자식 연결 해제", "Detach child")} ${p.name}`} onClick={() => unlink({ kind: "parent", from: project.id, to: p.id, owner: p.id })}>×</button></div>)}</section>
      <section className="org-detail-section org-save-section"><p className="org-help" role="status">{message || text("설정은 다음 실행부터 적용됩니다.", "Settings apply on the next launch.")}</p><button className="btn-primary" disabled={!patch} onClick={() => commit([{ id: project.id, hierarchy }])}>{text("변경 저장", "Save changes")}</button></section></div><footer className="org-inspector-footer"><button className="btn-secondary" onClick={() => props.onScope(project.id)}>{text("세션 트리", "Session tree")}</button><button className="btn-secondary" onClick={() => focus(project.id)}>{text("보드에서 찾기", "Find on board")}</button></footer></aside>)}
    </div>
    {link && <div className="pb-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setLink(null); }}><form className="pb-modal" role="dialog" aria-modal="true" aria-label={text("프로젝트 연결", "Connect projects")} onSubmit={e => { e.preventDefault(); saveLink(); }} onKeyDown={e => { if (e.key === "Escape") setLink(null); }}><header><h2>{text("프로젝트 연결", "Connect projects")}</h2><button type="button" aria-label={text("닫기", "Close")} onClick={() => setLink(null)}>×</button></header><div className="org-view-switch"><button type="button" className={link.kind === "parent" ? "active" : ""} onClick={() => setLink({ ...link, kind: "parent", target: "" })}>{text("부모·자식", "Parent / child")}</button><button type="button" className={link.kind === "reference" ? "active" : ""} onClick={() => setLink({ ...link, kind: "reference", target: "" })}>{text("참조", "Reference")}</button></div><label>{link.kind === "parent" ? text("자식 프로젝트", "Child project") : text("사용할 프로젝트", "Consumer project")}<select value={link.owner} onChange={e => setLink({ ...link, owner: e.target.value, target: "" })}>{props.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{link.kind === "parent" ? text("부모 프로젝트", "Parent project") : text("참조 대상", "Reference source")}<select aria-label={text("연결 대상", "Connection target")} value={link.target} onChange={e => setLink({ ...link, target: e.target.value })}><option value="">{text("선택하세요", "Choose a project")}</option>{props.projects.filter(p => p.id !== link.owner && (p.sshHostId || "") === (props.projects.find(p => p.id === link.owner)?.sshHostId || "") && (link.kind !== "parent" || canParentProject(props.projects, link.owner, p.id))).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {link.kind === "reference" ? <><label>{text("참조 폴더 · 비우면 프로젝트 전체", "Reference folder · leave empty for project root")}<input aria-label={text("참조 상대 경로", "Reference relative path")} value={link.path} placeholder="docs / Client / src" onChange={e => setLink({ ...link, path: e.target.value })}/></label><div className="pb-reference-scopes">{(["instructions", "code", "docs"] as const).map(scope => <label key={scope}><input type="checkbox" checked={link.scopes.includes(scope)} onChange={e => setLink({ ...link, scopes: e.target.checked ? [...link.scopes, scope] : link.scopes.filter(s => s !== scope) })}/>{text(scope === "instructions" ? "공통 지침" : scope === "code" ? "코드" : "문서", scope)}</label>)}</div><label>{text("사용 방식", "Access guidance")}<select value={link.access} onChange={e => setLink({ ...link, access: e.target.value as Link["access"] })}><option value="read">{text("참조 · 수정 요청 안 함", "Reference · no edits requested")}</option><option value="write" disabled={!!props.projects.find(p => p.id === link.owner)?.sshHostId}>{text("수정 허용 · CLI 작업 폴더 추가", "Allow edits · add CLI working folder")}</option></select></label><p className="org-help">{text("폴더를 복사하거나 현재 작업 폴더를 바꾸지 않습니다. 지침은 대상 프로젝트에 저장한 공통 지침을 사용합니다.", "Keeps your working folder and uses the target's saved shared instructions.")}</p></> : <p className="org-help">{text("공통 지침을 기본으로 상속합니다. 작업 폴더와 모델 상속은 프로젝트 정보에서 선택하세요.", "Shares instructions by default. Choose folder and model inheritance in the inspector.")}</p>}
      <p role="alert" className="org-error">{message}</p><footer><button type="button" className="btn-secondary" onClick={() => setLink(null)}>{text("취소", "Cancel")}</button><button type="submit" className="btn-primary" disabled={!link.target}>{text("연결 저장", "Save connection")}</button></footer></form></div>}
  </section>;
}
