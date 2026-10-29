import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Agent, Project } from '../types';
import { toolForId } from '../types';
import { useAppLanguage } from '../lib/appLanguage';
import { resolveSessionSettings } from '../lib/sessionHierarchy';
import { layoutOfficeScene, fitOfficeViewport, constrainOfficeViewport, zoomOfficeViewport, officeRooms, officeState, OFFICE_COLORS, OFFICE_ROLE_COLORS, type OfficeState, type OfficeRole, type OfficeRoomData, type OfficeViewport } from '../lib/pixelOffice';
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

function SharedOffice({ rooms, selectedId, onSelect }: { rooms: OfficeRoomData[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { text } = useAppLanguage();
  const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 }), [customView, setCustomView] = useState<OfficeViewport | null>(null);
  const [missingAssets, setMissingAssets] = useState(false);
  const geometryKey = rooms.map(room => `${room.teamKey}:${room.sessions.map(a => `${a.id}/${a.sessionHierarchy?.parentId || ''}/${room.roles.get(a.id)?.role}`).join(',')}`).join('|');
  const scene = useMemo(() => layoutOfficeScene(rooms), [geometryKey]);
  const view = useMemo(() => customView ? constrainOfficeViewport(scene, { ...customView, ...size, x: customView.x + (size.width - customView.width) / 2, y: customView.y + (size.height - customView.height) / 2 }) : fitOfficeViewport(scene, size.width, size.height), [scene, size, customView]);
  const viewRef = useRef(view); viewRef.current = view;
  const metadata = useMemo(() => {
    const agents = new Map<string, Agent>(), byId = new Map<string, { room: OfficeRoomData; ordinal: number }>(), byTeam = new Map<string, OfficeRoomData>();
    for (const room of rooms) {
      byTeam.set(room.teamKey, room);
      const names = new Map<string, Agent[]>();
      for (const agent of room.allSessions) { agents.set(agent.id, agent); const peers = names.get(agent.name) || []; peers.push(agent); names.set(agent.name, peers); }
      for (const peers of names.values()) peers.forEach((agent, index) => byId.set(agent.id, { room, ordinal: peers.length > 1 ? index + 1 : 0 }));
    }
    return { agents, byId, byTeam };
  }, [rooms]);
  const latest = useRef(metadata.agents); latest.current = metadata.agents;
  useEffect(() => setCustomView(null), [scene]);
  useEffect(() => {
    const node = viewport.current; if (!node) return;
    const resize = () => { const width = Math.max(1, Math.floor(node.clientWidth)), height = Math.max(1, Math.floor(node.clientHeight)); setSize(previous => previous.width === width && previous.height === height ? previous : { width, height }); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = viewport.current; if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); const rect = node.getBoundingClientRect(), current = viewRef.current;
      setCustomView(zoomOfficeViewport(scene, current, current.zoom * Math.exp(-event.deltaY * .002), event.clientX - rect.left, event.clientY - rect.top));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [scene]);
  useEffect(() => {
    const node = viewport.current, target = canvas.current; if (!node || !target) return;
    let disposed = false, visible = false, timer: number | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animate = () => {};
    const stop = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; };
    const resume = () => { stop(); if (!disposed && visible && !document.hidden) animate(); };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; resume(); }); observer.observe(node);
    document.addEventListener('visibilitychange', resume); reduced.addEventListener('change', resume);
    void loadOfficeAssets().then(images => {
      if (disposed) return;
      setMissingAssets(images.size !== Object.keys(OFFICE_ASSETS).length);
      const background = officeBackground(scene, images, view), context = target.getContext('2d'); if (!context) return;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      target.width = Math.round(view.width * scale); target.height = Math.round(view.height * scale); context.setTransform(scale, 0, 0, scale, 0, 0);
      const started = performance.now();
      animate = () => {
        drawOffice(context, background, images, scene.seats.map(seat => ({ ...seat, agent: latest.current.get(seat.agent.id) || seat.agent })), performance.now() - started, reduced.matches, view);
        // Four frames/second; reduced motion keeps fresh host-state poses at 1Hz.
        timer = window.setTimeout(() => { if (!disposed && visible && !document.hidden) animate(); }, reduced.matches ? 1000 : 250);
      };
      resume();
    });
    return () => { disposed = true; stop(); observer.disconnect(); document.removeEventListener('visibilitychange', resume); reduced.removeEventListener('change', resume); };
  }, [scene, view]);
  const drag = useRef<{ id: number; x: number; y: number; view: OfficeViewport } | null>(null);
  const zoom = (amount: number) => setCustomView(zoomOfficeViewport(scene, view, amount));
  const focusRegion = (region: { x: number; y: number; width: number; height: number }, keepZoom = false) => {
    const scale = Math.min(1, (size.width - 32) / region.width, (size.height - 32) / region.height);
    const zoom = Math.max(fitOfficeViewport(scene, size.width, size.height).zoom, keepZoom ? Math.max(view.zoom, scale) : scale);
    setCustomView(constrainOfficeViewport(scene, { ...size, zoom, x: size.width / 2 - (region.x + region.width / 2) * zoom, y: size.height / 2 - (region.y + region.height / 2) * zoom }));
  };
  return <div className="po-office-map">
    <div className="po-map-tools"><span>{rooms.length} {text('부서', 'departments')} · {scene.seats.length} {text('직원', 'employees')}</span><div>
      <button data-office-fit onClick={() => setCustomView(null)}>{text('전체 보기', 'Fit office')}</button><button aria-label={text('축소', 'Zoom out')} onClick={() => zoom(view.zoom / 1.3)}>−</button><output aria-label={text('확대 비율', 'Office zoom')}>{Math.round(view.zoom * 100)}%</output><button aria-label={text('확대', 'Zoom in')} onClick={() => zoom(view.zoom * 1.3)}>+</button><button data-office-readable onClick={() => zoom(1)}>100%</button>
    </div></div>
    <nav className="po-departments" aria-label={text('프로젝트 부서 이동', 'Project department navigation')}>{scene.departments.map(department => {
      const room = metadata.byTeam.get(department.room.teamKey)!;
      return <button key={room.teamKey} onClick={() => focusRegion(department)} style={{ '--po-department': department.color } as CSSProperties} title={room.project.remoteFolder || room.project.folder}>{room.project.name}<small>{room.sessions.length}</small></button>;
    })}</nav>
    <div className="po-map-viewport" ref={viewport} tabIndex={0} role="region" aria-label={text('공유 사무실 · 드래그 이동, 휠 확대, 화살표 이동, 0 전체 보기', 'Shared office · drag to pan, wheel to zoom, arrow keys to pan, 0 to fit')}
      data-office-zoom={view.zoom} data-office-x={view.x} data-office-y={view.y} data-office-world-width={scene.width} data-office-world-height={scene.height}
      onPointerDown={event => { if (event.button !== 0 && event.button !== 1 || event.button === 0 && (event.target as HTMLElement).closest('button')) return; event.preventDefault(); viewport.current?.focus(); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; setCustomView(constrainOfficeViewport(scene, { ...start.view, x: start.view.x + event.clientX - start.x, y: start.view.y + event.clientY - start.y })); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; const delta: Record<string, [number, number]> = { ArrowLeft: [70, 0], ArrowRight: [-70, 0], ArrowUp: [0, 70], ArrowDown: [0, -70] }; if (delta[event.key]) { event.preventDefault(); const [x, y] = delta[event.key]; setCustomView(constrainOfficeViewport(scene, { ...view, x: view.x + x, y: view.y + y })); } else if (event.key === '0') setCustomView(null); else if (event.key === '+' || event.key === '=') zoom(view.zoom * 1.3); else if (event.key === '-') zoom(view.zoom / 1.3); }}>
      <canvas ref={canvas} aria-hidden="true"/>
      <div className="po-world" style={{ width: scene.width, height: scene.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {scene.departments.map(department => {
          const room = metadata.byTeam.get(department.room.teamKey)!;
          return <div key={room.teamKey} className="po-department-label" data-office-project={room.project.id} data-office-team={room.teamKey} style={{ left: department.x + 12, top: department.y + 12, width: department.width - 60, color: department.color, fontSize: Math.min(view.zoom < .45 ? 42 : 28, 13 / view.zoom) }}><strong>{room.project.name}</strong>{view.zoom >= .45 && <small>{room.active} {text('활성', 'active')} / {room.total}</small>}</div>;
        })}
        {scene.seats.map(seat => {
          const agent = latest.current.get(seat.agent.id) || seat.agent, { room, ordinal } = metadata.byId.get(seat.agent.id)!;
          const state = officeState(agent), parent = seat.parentId ? latest.current.get(seat.parentId) : undefined;
          return <button key={agent.id} className={`po-seat${selectedId === agent.id ? ' selected' : ''}`} data-office-agent={agent.id} data-office-state={state} data-office-role={seat.role} aria-pressed={selectedId === agent.id}
            aria-label={`${agent.name}${ordinal ? ` #${ordinal}` : ''} · ${room.project.name} · ${text(...roleLabels[seat.role])} · ${text(...labels[state])}`} title={`${agent.name}\n${text(...roleLabels[seat.role])}${room.roles.get(agent.id)?.reports ? ` · ${room.roles.get(agent.id)!.reports} ${text('직속 직원', 'direct reports')}` : ''}\n${parent ? `${text('상위', 'Parent')}: ${parent.name}\n` : ''}${text(...labels[state])}`}
            onClick={() => onSelect(agent.id)} onFocus={() => { const x = view.x + seat.x * view.zoom, y = view.y + seat.y * view.zoom; if (x < 0 || y < 0 || x + 124 * view.zoom > view.width || y + 154 * view.zoom > view.height) focusRegion({ ...seat, width: 124, height: 154 }, true); }} style={{ left: seat.x, top: seat.y, '--po-state': OFFICE_COLORS[state] } as CSSProperties}>
            <RoleBadge role={seat.role}/><span className="po-seat-name"><ProviderLogo toolId={agent.aiToolId}/><strong>{agent.name}{ordinal ? ` #${ordinal}` : ''}</strong></span><StateLabel agent={agent}/>{parent && <small className="po-seat-parent">↳ {parent.name}</small>}
          </button>;
        })}
      </div>
      {!rooms.length && <div className="po-empty"><PixelOfficeIcon/><h3>{text('표시할 세션이 없습니다', 'No sessions to display')}</h3><p>{text('프로젝트·검색·활성 팀 필터를 확인해 주세요.', 'Check the project, search and active teams filter.')}</p></div>}
    </div>
    <div className="po-map-hint">{text('한 사무실 · 부서명을 눌러 이동 · 드래그 이동 · 휠 확대', 'One shared office · choose a department · drag to pan · wheel to zoom')}</div>
    {missingAssets && <p className="po-asset-error" role="status">{text('일부 사무실 이미지를 불러오지 못했습니다. 세션 상태는 계속 표시합니다.', 'Some office images are unavailable. Session status remains visible.')}</p>}
  </div>;
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
    <div className="po-body"><SharedOffice rooms={rooms} selectedId={selectedId || null} onSelect={choose}/>{selected && inspectorOpen && <aside className="po-inspector" aria-label={text('Office 세션 정보', 'Office session info')}>
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
