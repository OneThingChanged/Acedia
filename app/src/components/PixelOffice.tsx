import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Agent, Project } from '../types';
import { toolForId } from '../types';
import { useAppLanguage } from '../lib/appLanguage';
import { resolveSessionSettings } from '../lib/sessionHierarchy';
import { layoutOfficeSeats, officeRooms, officeState, OFFICE_COLORS, OFFICE_PAGE_SIZE, OFFICE_ROLE_COLORS, type OfficeState, type OfficeRole, type OfficeRoomData } from '../lib/pixelOffice';
import { drawOffice, loadOfficeAssets, officeBackground, OFFICE_ASSETS } from '../lib/pixelOfficeRenderer';
import { ProviderLogo } from './ProviderLogo';
import './PixelOffice.css';

type Props = {
  agents: Agent[]; projects: Project[]; activeProjectId: string | null;
  mode?: 'board' | 'sidebar'; selectedId?: string | null; onSelect?: (id: string) => void;
  onOpenSession: (id: string) => void; onOpenNote?: (id: string) => void;
  onBack?: () => void; onDock?: () => void; onExpand?: () => void; onClose?: () => void;
};
const labels: Record<OfficeState, [string, string]> = {
  working: ['작업 중', 'Working'], reading: ['읽는 중', 'Reading'], waiting: ['응답 대기', 'Needs you'], blocked: ['확인 필요', 'Blocked'],
  done: ['응답 완료', 'Turn complete'], sleeping: ['잠든 세션', 'Sleeping'], stopped: ['정지됨', 'Stopped'],
  starting: ['시작 중', 'Starting'], idle: ['대기 중', 'Ready'], disconnected: ['연결 끊김', 'Disconnected'],
};
const roleLabels: Record<OfficeRole, [string, string]> = { lead: ['팀장', 'Team lead'], manager: ['중간 관리자', 'Manager'], member: ['부하 직원', 'Team member'], independent: ['일반 직원', 'Independent'] };
function RoleBadge({ role }: { role: OfficeRole }) {
  const { text } = useAppLanguage();
  return <span className={`po-role po-role-${role}`} style={{ '--po-role': OFFICE_ROLE_COLORS[role] } as CSSProperties}>{role === 'lead' ? '♔ ' : role === 'manager' ? '◆ ' : ''}{text(...roleLabels[role])}</span>;
}
export function PixelOfficeIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 11V4h18v7M5 11h14v9H5zM3 15h18M9 15v5M15 15v5"/><path d="M9 7h6"/></svg>;
}
function StateLabel({ agent }: { agent: Agent }) {
  const { text } = useAppLanguage(); const state = officeState(agent);
  return <span className="po-status" style={{ '--po-state': OFFICE_COLORS[state] } as CSSProperties}><i/>{text(...labels[state])}</span>;
}

function OfficeRoom({ room, selectedId, onSelect }: { room: OfficeRoomData; selectedId: string | null; onSelect: (id: string) => void }) {
  const { text } = useAppLanguage();
  const { project, sessions: agents, roles } = room;
  const stage = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(400), [page, setPage] = useState(0), [missingAssets, setMissingAssets] = useState(false);
  const pages = Math.ceil(agents.length / OFFICE_PAGE_SIZE), currentPage = Math.min(page, pages - 1);
  const members = agents.slice(currentPage * OFFICE_PAGE_SIZE, (currentPage + 1) * OFFICE_PAGE_SIZE);
  const layout = useMemo(() => layoutOfficeSeats(members, width, roles), [width, members.map(a => `${a.id}:${a.sessionHierarchy?.parentId || ''}:${roles.get(a.id)?.role}`).join('|')]);
  const latest = useRef(members); latest.current = members;
  // Observe the room, not each character. Far-away rooms have no animation timer.
  useEffect(() => {
    const node = stage.current; if (!node) return;
    const resize = () => setWidth(Math.max(220, Math.floor(node.clientWidth)));
    resize(); const observer = new ResizeObserver(resize); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = stage.current, target = canvas.current;
    if (!node || !target) return;
    let disposed = false, visible = false, timer: number | undefined, repaint: (() => void) | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animate = () => {};
    const stop = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; };
    const resume = () => { stop(); if (!disposed && visible && !document.hidden) animate(); };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; resume(); }); observer.observe(node);
    document.addEventListener('visibilitychange', resume); reduced.addEventListener('change', resume);
    void loadOfficeAssets().then(images => {
      if (disposed) return;
      setMissingAssets(images.size !== Object.keys(OFFICE_ASSETS).length);
      const background = officeBackground(width, layout.height, layout.seats, images), context = target.getContext('2d');
      if (!context) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      target.width = Math.round(width * scale); target.height = Math.round(layout.height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const started = performance.now();
      repaint = () => {
        const byId = new Map(latest.current.map(agent => [agent.id, agent]));
        drawOffice(context, background, images, layout.seats.map(seat => ({ ...seat, agent: byId.get(seat.agent.id) || seat.agent })), performance.now() - started, reduced.matches);
      };
      animate = () => {
        repaint?.();
        // Four frames/second is sufficient for two-frame pixel animations.
        // Reduced motion still receives host-state/staleness updates, once/sec.
        timer = window.setTimeout(() => { if (!disposed && visible && !document.hidden) animate(); }, reduced.matches ? 1000 : 250);
      };
      resume();
    });
    return () => { disposed = true; stop(); observer.disconnect(); document.removeEventListener('visibilitychange', resume); reduced.removeEventListener('change', resume); };
  }, [width, layout]);
  const lookup = new Map(room.allSessions.map(agent => [agent.id, agent]));
  const leaders = [...roles.values()].filter(info => info.role === 'lead').length;
  const managers = [...roles.values()].filter(info => info.role === 'manager').length;
  return <article className="po-room" data-office-project={project.id} data-office-team={room.teamKey}>
    <header><div><span className="po-room-light"/><strong title={project.remoteFolder || project.folder}>{project.name} <em>{text('팀', 'team')}</em></strong></div><span className="po-team-count">{room.active} {text('활성', 'active')} / {room.total}<small>{text('팀장', 'Leads')} {leaders}{managers ? ` · ${text('중간 관리자', 'Managers')} ${managers}` : ''}</small></span></header>
    <div className="po-room-stage" ref={stage} style={{ height: layout.height }}>
      <canvas ref={canvas} aria-hidden="true"/>
      {layout.seats.map(seat => {
        const agent = lookup.get(seat.agent.id) || seat.agent, state = officeState(agent), parent = agent.sessionHierarchy?.parentId && lookup.get(agent.sessionHierarchy.parentId);
        const namesakes = room.allSessions.filter(a => a.name === agent.name), ordinal = namesakes.length > 1 ? namesakes.findIndex(a => a.id === agent.id) + 1 : 0;
        return <button key={agent.id} className={`po-seat${selectedId === agent.id ? ' selected' : ''}`} data-office-agent={agent.id} data-office-state={state} data-office-role={seat.role} aria-pressed={selectedId === agent.id}
          aria-label={`${agent.name}${ordinal ? ` #${ordinal}` : ''} · ${text(...roleLabels[seat.role])} · ${text(...labels[state])}`} title={`${agent.name}\n${text(...roleLabels[seat.role])}${roles.get(agent.id)?.reports ? ` · ${roles.get(agent.id)!.reports} ${text('직속 직원', 'direct reports')}` : ''}\n${parent ? `${text('상위', 'Parent')}: ${parent.name}\n` : ''}${text(...labels[state])}`}
          onClick={() => onSelect(agent.id)} style={{ left: seat.x, top: seat.y, '--po-state': OFFICE_COLORS[state] } as CSSProperties}>
          <RoleBadge role={seat.role}/><span className="po-seat-name"><ProviderLogo toolId={agent.aiToolId}/><strong>{agent.name}{ordinal ? ` #${ordinal}` : ''}</strong></span><StateLabel agent={agent}/>
          {parent && <small className="po-seat-parent">↳ {parent.name}</small>}
        </button>;
      })}
    </div>
    {pages > 1 && <nav className="po-pages" aria-label={text('사무실 세션 페이지', 'Office session pages')}><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>←</button><span>{currentPage + 1} / {pages} · {agents.length} {text('세션', 'sessions')}</span><button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>→</button></nav>}
    {missingAssets && <p className="po-asset-error" role="status">{text('일부 사무실 이미지를 불러오지 못했습니다. 세션 상태는 계속 표시합니다.', 'Some office images are unavailable. Session status remains visible.')}</p>}
  </article>;
}

export function PixelOffice({ agents, projects, activeProjectId, mode = 'board', selectedId: selectedProp, onSelect, onOpenSession, onOpenNote, onBack, onDock, onExpand, onClose }: Props) {
  const { text } = useAppLanguage();
  const [scope, setScope] = useState(mode === 'sidebar' ? 'follow' : 'all'), [query, setQuery] = useState(''), [activeOnly, setActiveOnly] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [, setClock] = useState(0);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setClock(tick => tick + 1); };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const projectId = scope === 'follow' ? activeProjectId : scope === 'all' ? null : scope;
  const teamOptions = useMemo(() => officeRooms(agents, projects), [agents, projects]);
  const rooms = useMemo(() => officeRooms(agents, projects, { projectId, query, activeOnly }), [agents, projects, projectId, query, activeOnly]);
  const selectedId = selectedProp === undefined ? selection : selectedProp;
  const selected = rooms.flatMap(room => room.sessions).find(a => a.id === selectedId);
  const selectedRoom = rooms.find(room => room.sessions.some(a => a.id === selectedId));
  const selectedRole = selectedId && selectedRoom?.roles.get(selectedId);
  const settings = selected && resolveSessionSettings(selected, agents, projects);
  const choose = (id: string) => { setSelection(id); setInspectorOpen(true); onSelect?.(id); };
  return <section className={`pixel-office po-${mode}${mode === 'board' ? ' terminal-area' : ''}`} aria-label="Pixel Office">
    <header className="po-header"><div><h2><PixelOfficeIcon/> Pixel Office</h2><p>{text('프로젝트 폴더별 팀 · 세션 직급', 'Folder teams · session roles')}</p></div><div className="po-header-actions">
      {onBack && <button onClick={onBack}>{text('← Project Board', '← Project Board')}</button>}
      {onDock && <button onClick={onDock} title={text('우측 사이드바에서 보기', 'Show in right sidebar')}>{text('우측에 고정', 'Dock right')}</button>}
      {onExpand && <button onClick={onExpand} aria-label={text('Project Board에서 크게 보기', 'Expand in Project Board')}>⛶</button>}
      {onClose && <button onClick={onClose} aria-label={text('Office 닫기', 'Close Office')}>×</button>}
    </div></header>
    <div className="po-toolbar"><select aria-label={text('Office 프로젝트', 'Office project')} value={scope === 'follow' || scope === 'all' ? scope : teamOptions.find(room => room.projectIds.includes(scope))?.project.id || scope} onChange={e => setScope(e.target.value)}>
      {mode === 'sidebar' && <option value="follow">{text('현재 프로젝트 따라가기', 'Follow current project')}</option>}<option value="all">{text('전체 팀', 'All teams')}</option>{teamOptions.map(({ project: p }) => <option value={p.id} key={p.id}>{p.name}</option>)}
    </select><input aria-label={text('Office 세션 검색', 'Search Office sessions')} placeholder={text('세션·프로젝트 찾기', 'Find a session or project')} value={query} onChange={e => setQuery(e.target.value)}/><label><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)}/>{text('활성 팀', 'Active teams')}</label></div>
    <div className="po-body"><div className="po-rooms">
      {rooms.map(room => <OfficeRoom key={room.teamKey} room={room} selectedId={selectedId || null} onSelect={choose}/>)}
      {!rooms.length && <div className="po-empty"><PixelOfficeIcon/><h3>{text('표시할 세션이 없습니다', 'No sessions to display')}</h3><p>{text('프로젝트·검색·활성 팀 필터를 확인해 주세요.', 'Check the project, search and active teams filter.')}</p></div>}
    </div>{selected && inspectorOpen && <aside className="po-inspector" aria-label={text('Office 세션 정보', 'Office session info')}>
      <div className="po-inspector-title"><ProviderLogo toolId={selected.aiToolId}/><strong>{selected.name}</strong><button className="po-inspector-close" aria-label={text('세션 정보 접기', 'Collapse session info')} onClick={() => setInspectorOpen(false)}>×</button><StateLabel agent={selected}/></div>
      <p>{projects.find(p => p.id === selected.projectId)?.name} · {toolForId(selected.aiToolId).label}</p>
      {selectedRole && <div className="po-role-info"><RoleBadge role={selectedRole.role}/>{selectedRole.reports > 0 && <span>{text('직속 직원', 'Direct reports')} {selectedRole.reports}</span>}</div>}
      {settings?.modelSettings?.model && <p>{settings.modelSettings.model} {settings.modelSettings.effort || ''}</p>}
      <p className="po-folder" title={settings?.folder}>{settings?.folder}</p>
      {officeState(selected) === 'done' && <p>{text('현재 응답이 끝났습니다. 작업 검토 완료와는 별도입니다.', 'The current turn ended. Task review is separate.')}</p>}
      <div className="po-inspector-actions"><button className="po-open" onClick={() => onOpenSession(selected.id)}>{text('대화 열기', 'Open conversation')}</button>{onOpenNote && <button onClick={() => onOpenNote(selected.id)}>{text('메모', 'Notes')}</button>}</div>
    </aside>}</div>
    <footer className="po-footer"><span><i style={{ background: OFFICE_COLORS.working }}/>{text('작업', 'Work')}</span><span><i style={{ background: OFFICE_COLORS.waiting }}/>{text('응답 대기', 'Needs you')}</span><span><i style={{ background: OFFICE_COLORS.sleeping }}/>{text('Sleeping · 정지', 'Sleeping · stopped')}</span><small title="Pixel Agents © 2026 Pablo De Lucca · MIT. Characters based on MetroCity by JIK-A-4 (CC0).">Pixel Agents · MIT</small></footer>
  </section>;
}
