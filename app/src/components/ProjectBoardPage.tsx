import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { boardCounts, boardItems, boardLayout, type BoardItem, type BoardSession, type BoardSnapshot, type BoardState } from '../lib/workBoard';
import { ProviderLogo } from './ProviderLogo';
import './ProjectBoardPage.css';
import './BackgroundWork.css';
import { backgroundWaitingLabels } from '../lib/agentActivity';

const labels: Record<BoardState, [string, string]> = {
  idle: ['대기', 'Idle'], planned: ['배정 대기', 'Planned'], working: ['작업 중', 'Working'], waiting: ['내 답변 필요', 'Needs your answer'],
  waiting_external: ['외부 응답 대기', 'Waiting for a tool'], paused: ['일시정지', 'Paused'], review: ['결과 도착', 'Response ready'],
  completed: ['업무 검증 완료', 'Task verified'], interrupted: ['중단됨', 'Interrupted'], failed: ['오류', 'Error'], unknown: ['상태 확인 불가', 'Status unknown'],
  background: ['백그라운드 대기', 'Background wait'],
};
const kinds: Record<BoardItem['kind'], [string, string]> = { question: ['질문', 'Questions'], error: ['오류', 'Errors'], result: ['결과', 'Results'] };
function StateIcon({ state }: { state: BoardState | 'result' | 'question' | 'error' }) {
  const glyph = state === 'waiting' || state === 'question' ? '?' : ['failed', 'error'].includes(state) ? '!'
    : state === 'paused' || state === 'interrupted' ? 'Ⅱ' : ['result', 'review', 'completed'].includes(state) ? '✓'
    : state === 'unknown' ? '−' : state === 'waiting_external' ? '⌛' : '';
  return <span className="wb-state-icon" data-state={state} aria-hidden="true">{glyph}</span>;
}
function elapsed(start: number | undefined, now: number) {
  if (!start || start > now) return '';
  const seconds = Math.floor((now - start) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
function systemReducedMotion() { return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }

export function ProjectBoardPage({ initialSnapshot }: { initialSnapshot?: BoardSnapshot } = {}) {
  const { text } = useAppLanguage();
  const [data, setData] = useState<BoardSnapshot | null>(initialSnapshot || null), [error, setError] = useState('');
  const [selected, setSelected] = useState<{ sessionId: string; itemId?: string } | null>(null);
  const [projectId, setProject] = useState(''), [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'question' | 'error' | 'result'>('all');
  const [workingOnly, setWorkingOnly] = useState(false), [backgroundOnly, setBackgroundOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ zoom: .8, x: 24, y: 24 }), [motion, setMotion] = useState(true), [reducedMotion, setReducedMotion] = useState(systemReducedMotion);
  const [busy, setBusy] = useState(false), [sampledAt, setSampledAt] = useState(initialSnapshot?.sampledAt || Date.now());
  const [connected, setConnected] = useState(true);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null), [selectedReference, setSelectedReference] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), inspector = useRef<HTMLElement>(null), returnFocus = useRef<HTMLElement | SVGElement | null>(null);
  const inboxScroll = useRef(0), revision = useRef<string | undefined>(undefined), initialized = useRef(false);
  const returnItemId = useRef('');
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReducedMotion(media.matches); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let stopped = false, loading = false;
    const refresh = async () => {
      if (loading || stopped || document.hidden) return;
      loading = true;
      try {
        const result = await invoke<BoardSnapshot & { unchanged?: boolean }>('project_board_snapshot', { revision: revision.current });
        if (stopped) return;
        setConnected(true);
        setSampledAt(result.sampledAt || Date.now());
        if (!result.unchanged) {
          revision.current = result.revision; setData(result);
          if (!initialized.current) {
            initialized.current = true;
            const p = result.preferences;
            setView({ zoom: p.zoom ?? .8, x: p.x ?? 24, y: p.y ?? 24 }); setCollapsed(new Set(p.collapsed || []));
            setCollapsedProjects(new Set(p.collapsedProjects || [])); setProject(p.projectId || ''); setMotion(p.motion ?? true);
          }
        }
        setError('');
      } catch (reason) { if (!stopped) { setConnected(false); setError(String(reason)); } }
      finally { loading = false; }
    };
    refreshRef.current = refresh; void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    const visibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!initialized.current) return;
    const preferences = { ...view, collapsed: [...collapsed], projectId,
      ...(data?.items ? { collapsedProjects: [...collapsedProjects], motion } : {}) };
    const timer = setTimeout(() => { void invoke('project_board_preferences', { preferences }).catch(reason => setError(String(reason))); }, 500);
    return () => clearTimeout(timer);
  }, [view, collapsed, projectId, collapsedProjects, motion, !!data?.items]);
  const allItems = useMemo(() => data ? boardItems(data) : [], [data]);
  const itemsBySession = useMemo(() => {
    const map = new Map<string, BoardItem[]>(); for (const item of allItems) map.set(item.sessionId, [...(map.get(item.sessionId) || []), item]); return map;
  }, [allItems]);
  const sessionsById = useMemo(() => new Map(data?.sessions.map(s => [s.id, s])), [data]);
  const projectSessions = useMemo(() => data?.sessions.filter(s => !projectId || s.projectId === projectId) || [], [data, projectId]);
  const counts = useMemo(() => boardCounts(projectSessions, allItems), [projectSessions, allItems]);
  const layout = useMemo(() => data ? boardLayout(data, { projectId, collapsed }) : null, [data, projectId, collapsed]);
  const nodes = useMemo(() => layout?.nodes.filter(n => !collapsedProjects.has(n.session.projectId)) || [], [layout, collapsedProjects]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.session.id, n])), [nodes]);
  const groupById = useMemo(() => new Map(layout?.groups.map(g => [g.id, g])), [layout]);
  const matches = useCallback((s: BoardSession) => (!workingOnly || s.state === 'working') && (!backgroundOnly || s.state === 'background') && (kind === 'all' || itemsBySession.get(s.id)?.some(i => i.kind === kind))
    && (!query || `${s.name} ${s.folder} ${s.task?.title || ''} ${s.reason} ${data?.projects.find(p => p.id === s.projectId)?.name || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [workingOnly, backgroundOnly, kind, query, data, itemsBySession]);
  const highlighted = useMemo(() => {
    const ids = new Set<string>();
    for (const s of data?.sessions || []) if (matches(s)) { let current: BoardSession | undefined = s; const seen = new Set<string>();
      while (current && !seen.has(current.id)) { seen.add(current.id); ids.add(current.id); current = sessionsById.get(current.parentId || ''); } }
    return ids;
  }, [data, matches, sessionsById]);
  const inbox = useMemo(() => allItems.filter(i => {
    const s = sessionsById.get(i.sessionId);
    return s && (!projectId || s.projectId === projectId) && (!backgroundOnly || s.state === 'background') && (!workingOnly || s.state === 'working') && (kind === 'all' || i.kind === kind)
      && (!query || `${s.name} ${i.summary} ${s.task?.title || ''} ${s.folder}`.toLowerCase().includes(query.trim().toLowerCase()));
  }).sort((a, b) => ({ question: 0, error: 1, result: 2 }[a.kind] - { question: 0, error: 1, result: 2 }[b.kind] || b.createdAt - a.createdAt)), [allItems, sessionsById, projectId, kind, query, backgroundOnly, workingOnly]);
  useEffect(() => { if (data && projectId && !data.projects.some(p => p.id === projectId)) setProject(''); }, [data, projectId]);
  useEffect(() => { setVisibleCount(50); }, [projectId, query, kind]);
  useEffect(() => {
    if (!pendingFocus) return;
    const node = nodeById.get(pendingFocus), rect = viewport.current?.getBoundingClientRect();
    if (node && rect) { setView(v => { const zoom = Math.max(.65, v.zoom); return { zoom, x: rect.width / 2 - (node.x + node.width / 2) * zoom, y: rect.height / 2 - (node.y + 38) * zoom }; }); setPendingFocus(null); }
  }, [pendingFocus, nodeById]);
  useEffect(() => { if (!selected && !selectedReference && inspector.current) inspector.current.scrollTop = inboxScroll.current; }, [selected, selectedReference]);
  useEffect(() => { if (selected || selectedReference) inspector.current?.querySelector<HTMLButtonElement>('.wb-back')?.focus({ preventScroll: true }); }, [selected?.sessionId, selected?.itemId, selectedReference]);
  const selectedSession = selected ? sessionsById.get(selected.sessionId) : null;
  const selectedItem = selected?.itemId ? allItems.find(i => i.id === selected.itemId) : null;
  const reference = data?.references?.find(r => r.id === selectedReference);
  const open = useCallback(async (id: string, compose = false) => {
    if (busy) return; setBusy(true);
    try { await invoke('project_board_open_session', { id, compose }); } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }, [busy]);
  const choose = (sessionId: string, itemId?: string, trigger?: HTMLElement) => {
    if (!selected && !selectedReference) inboxScroll.current = inspector.current?.scrollTop || 0;
    if (trigger) returnFocus.current = trigger;
    if (itemId) returnItemId.current = itemId;
    setSelected({ sessionId, itemId }); setSelectedReference(null);
  };
  const back = () => {
    setSelected(null); setSelectedReference(null);
    window.requestAnimationFrame(() => {
      const target = returnFocus.current?.isConnected ? returnFocus.current
        : inspector.current?.querySelector<HTMLButtonElement>(`[data-item-id="${returnItemId.current}"]`) || inspector.current?.querySelector<HTMLButtonElement>('.wb-inbox-filters [aria-pressed="true"]');
      target?.focus({ preventScroll: true });
    });
  };
  const locate = (id: string) => {
    const session = sessionsById.get(id); if (!session) return;
    if (projectId && session.projectId !== projectId) setProject('');
    setCollapsedProjects(current => { const next = new Set(current); next.delete(session.projectId); return next; });
    setCollapsed(current => { const next = new Set(current), seen = new Set<string>(); let s: BoardSession | undefined = session;
      while (s?.parentId && !seen.has(s.id)) { seen.add(s.id); next.delete(s.parentId); s = sessionsById.get(s.parentId); } return next; });
    setPendingFocus(id);
  };
  const fit = () => {
    const rect = viewport.current?.getBoundingClientRect();
    if (rect && layout?.groups.length) {
      const left = Math.min(...layout.groups.map(g => g.x)), top = Math.min(...layout.groups.map(g => g.y));
      const width = Math.max(...layout.groups.map(g => g.x + g.width)) - left;
      const height = Math.max(...layout.groups.map(g => g.y + (collapsedProjects.has(g.id) ? 52 : g.height))) - top;
      const zoom = Math.max(.2, Math.min(1, (rect.width - 48) / width, (rect.height - 48) / height));
      setView({ zoom, x: 24 - left * zoom, y: 24 - top * zoom });
    }
  };
  const acknowledge = async (item: BoardItem) => {
    if (busy) return; setBusy(true);
    try { const result = await invoke<BoardSnapshot>('project_board_ack', { id: item.sessionId, fingerprint: item.fingerprint, ...(data?.items ? { itemId: item.id } : {}) });
      revision.current = result.revision; setData(result); back();
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const step = (s: BoardSession) => s.state === 'background' ? text(...backgroundWaitingLabels(s.backgroundCount || undefined))
    : s.reason || s.step || s.task?.title || (s.state === 'idle' || s.state === 'planned' ? text('할당된 작업 없음', 'No assigned work') : text(...labels[s.state]));
  const actionLabel = (item: BoardItem) => item.kind === 'question' ? text('답변하기', 'Answer') : item.kind === 'error' ? text('원인 보기', 'View cause') : text('결과 보기', 'View result');
  const relationPoint = (id: string, end = false) => {
    const node = nodeById.get(id); if (node && view.zoom >= .5) return { x: node.x + (end ? 0 : node.width), y: node.y + 36 };
    const s = sessionsById.get(id), g = s && groupById.get(s.projectId); return g ? { x: g.x + (end ? 0 : g.width), y: g.y + 26 } : null;
  };
  return <main className="work-board-page" data-motion={motion && !reducedMotion && connected ? 'on' : 'off'} data-density={view.zoom < .5 ? 'overview' : 'detail'} onKeyDown={e => { if (e.key === 'Escape' && (selected || selectedReference)) { e.stopPropagation(); back(); } }}>
    <header className="wb-header"><div className="wb-brand"><span aria-hidden="true">⌘</span><div><h1>{text('프로젝트 보드', 'Project Board')}</h1><small>{text('지금 하는 일과 내가 확인할 일을 함께.', 'Current work and what needs your attention.')}</small></div></div>
      <label className="wb-project-picker"><span className="wb-sr-only">{text('프로젝트 선택', 'Select project')}</span><select value={projectId} onChange={e => { setProject(e.target.value); setSelected(null); }}><option value="">{text('전체 프로젝트', 'All projects')}</option>{data?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={text('세션·작업·경로 검색', 'Search sessions, work or paths')} aria-label={text('보드 검색', 'Search board')}/>
      <button className="wb-refresh" onClick={() => { void refreshRef.current(); }}>{text('새로고침', 'Refresh')}</button></header>
    <nav className="wb-summary" aria-label={text('업무 요약', 'Work summary')}>
      <span className={`wb-connection ${!connected ? 'warning' : ''}`}><i/>{!connected ? text('수신 실패 · 마지막 기록', 'Disconnected · last known data') : text('상태 수신', 'Receiving state')}</span>
      <button aria-pressed={workingOnly} onClick={() => { setWorkingOnly(v => !v); setBackgroundOnly(false); setKind('all'); }}><StateIcon state="working"/>{text('작업 중', 'Working')} <b>{connected ? counts.working : '—'}</b></button>
      <button aria-pressed={backgroundOnly} onClick={() => { setBackgroundOnly(v => !v); setWorkingOnly(false); setKind('all'); }}><StateIcon state="background"/>{text('백그라운드', 'Background')} <b>{connected ? counts.background : '—'}</b></button>
      <button aria-pressed={kind === 'question'} onClick={() => { setKind(kind === 'question' ? 'all' : 'question'); setWorkingOnly(false); setBackgroundOnly(false); }}><StateIcon state="question"/>{text('질문', 'Questions')} <b>{counts.questions}</b></button>
      <button aria-pressed={kind === 'error'} onClick={() => { setKind(kind === 'error' ? 'all' : 'error'); setWorkingOnly(false); setBackgroundOnly(false); }}><StateIcon state="error"/>{text('오류', 'Errors')} <b>{counts.errors}</b></button>
      <button aria-pressed={kind === 'result'} onClick={() => { setKind(kind === 'result' ? 'all' : 'result'); setWorkingOnly(false); setBackgroundOnly(false); }}><StateIcon state="result"/>{text('미확인 결과', 'Unreviewed results')} <b>{counts.results}</b></button>
      <span className="wb-sampled" title={text('작업 진행 시각이 아닌 상태 수신 시각입니다.', 'State sampling time, not evidence of work progress.')}>{text('수신', 'Received')} {new Date(sampledAt).toLocaleTimeString()}</span>
      <button className="wb-motion" aria-pressed={motion && !reducedMotion} disabled={reducedMotion} title={reducedMotion ? text('시스템의 모션 줄이기 설정 적용 중', 'System reduced-motion setting is active') : ''} onClick={() => setMotion(v => !v)}>{text('모션', 'Motion')} <span>{motion && !reducedMotion ? 'ON' : 'OFF'}</span></button>
    </nav>
    {(error || data?.storageError) && <div role="alert" className="wb-error">{error || data?.storageError}</div>}
    <div className="wb-body"><section className="wb-canvas-wrap"><div className="wb-legend"><span className="hierarchy">{text('계층', 'Hierarchy')}</span><span className="reference">{text('관측된 읽기 참조', 'Observed message reads')}</span><small>{text('선택·필터로 위치가 바뀌지 않습니다', 'Selection and filters keep positions')}</small></div>
      <div className="wb-canvas" ref={viewport} tabIndex={0} aria-label={text('업무 노드 · 빈 공간 드래그로 이동', 'Work nodes · drag empty space to pan')}
        onPointerDown={e => { if (e.button !== 0 || (e.target as Element).closest('button, select, input, [role="button"]')) return; drag.current = { x: e.clientX, y: e.clientY, left: view.x, top: view.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { const anchor = drag.current; if (!anchor) return; const x = anchor.left + e.clientX - anchor.x, y = anchor.top + e.clientY - anchor.y; setView(v => ({ ...v, x, y })); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onWheel={e => { const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; setView(v => { const zoom = Math.max(.2, Math.min(2, v.zoom * (e.deltaY > 0 ? .9 : 1.1))); return { zoom, x: px - (px - v.x) * zoom / v.zoom, y: py - (py - v.y) * zoom / v.zoom }; }); }}>
        {!data ? <p className="wb-empty">{text('업무 현황을 불러오는 중…', 'Loading work status…')}</p> : !layout?.groups.length ? <p className="wb-empty">{text('표시할 세션이 없습니다.', 'No matching sessions.')}</p> : <div className="wb-world" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {layout.groups.map(g => {
            const members = data.sessions.filter(s => s.projectId === g.id), c = boardCounts(members, allItems), folded = collapsedProjects.has(g.id);
            return <section className={`wb-project ${folded ? 'collapsed' : ''}`} key={g.id} style={{ left: g.x, top: g.y, width: g.width, height: folded ? 52 : g.height }}>
              <button className="wb-project-header" aria-expanded={!folded} onClick={() => setCollapsedProjects(current => { const next = new Set(current); if (!next.delete(g.id)) next.add(g.id); return next; })}>
                <span className="wb-project-name"><span aria-hidden="true">{folded ? '▸' : '▾'} ▱</span>{g.name}</span><span className="wb-project-counts">{c.working > 0 && <span data-state="working">{text('작업', 'Work')} {c.working}</span>}{c.background > 0 && <span data-state="background">{text("백그라운드", "BG")} {c.background}</span>}{c.questions > 0 && <span data-state="waiting">? {c.questions}</span>}{c.errors > 0 && <span data-state="failed">! {c.errors}</span>}{c.results > 0 && <span data-state="review">✓ {c.results}</span>}{!c.working && !c.background && !c.attention && <small>{members.length} {text('세션', 'sessions')}</small>}</span>
              </button></section>;
          })}
          <svg className="wb-edges" width={layout.width} height={layout.height} aria-hidden="true">{layout.edges.map(edge => {
            const a = nodeById.get(edge.from), b = nodeById.get(edge.to); return a && b ? <path key={`${edge.from}:${edge.to}`} d={`M ${a.x + 5} ${a.y + 70} V ${b.y + 35} H ${b.x}`}/> : null;
          })}</svg>
          {nodes.map(n => {
            const session = n.session, results = itemsBySession.get(session.id)?.filter(i => i.kind === 'result').length || 0;
            return <div key={session.id} className={`wb-node ${session.state === 'background' ? 'has-background-work' : ''} ${selected?.sessionId === session.id ? 'selected' : ''} ${highlighted.has(session.id) ? '' : 'dimmed'}`} data-state={session.state} style={{ left: n.x, top: n.y, width: n.width }}>
              <button className="wb-node-open" aria-pressed={selected?.sessionId === session.id} onClick={e => choose(session.id, undefined, e.currentTarget)} onDoubleClick={() => { void open(session.id); }}>
                <StateIcon state={session.state}/><span className="wb-node-copy"><span className="wb-node-title"><ProviderLogo toolId={session.provider}/><strong title={session.name}>{session.name}</strong></span><small title={step(session)}>{step(session)}{session.runtime === 'sleeping' && ' · Sleeping'}{session.state === 'working' && elapsed(session.startedAt, sampledAt) && ` · ${elapsed(session.startedAt, sampledAt)}`}</small></span>
                <span className="wb-node-badges"><span data-state={session.state}>{text(...labels[session.state])}</span>{results > 0 && <span className="wb-result-badge">{text('미확인 결과', 'Results')} {results}</span>}</span>
              </button>{n.children > 0 && <button className="wb-collapse" aria-expanded={!collapsed.has(session.id)} aria-label={text('자식 세션 접기·펼치기', 'Collapse or expand child sessions')} onClick={() => setCollapsed(current => { const next = new Set(current); if (!next.delete(session.id)) next.add(session.id); return next; })}>{collapsed.has(session.id) ? '+' : '−'} {n.children}</button>}
            </div>;
          })}
          <svg className="wb-reference-edges" width={layout.width} height={layout.height} aria-label={text('세션 간 관측된 참조', 'Observed session references')}>
            <defs><marker id="wb-reference-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z"/></marker></defs>
            {data.references?.map(r => {
              const a = relationPoint(r.from), b = relationPoint(r.to, true); if (!a || !b) return null;
              const description = `${sessionsById.get(r.from)?.name} → ${sessionsById.get(r.to)?.name} · ${text('수신함 기록 읽기', 'Message read')}`;
              const d = `M ${a.x} ${a.y} C ${a.x + 90} ${a.y}, ${b.x - 90} ${b.y}, ${b.x} ${b.y}`;
              return <g key={r.id} tabIndex={0} role="button" aria-label={description} data-active={r.active} className={selected && ![r.from, r.to].includes(selected.sessionId) ? 'dimmed' : ''}
                onClick={e => { inboxScroll.current = inspector.current?.scrollTop || 0; returnFocus.current = e.currentTarget; setSelected(null); setSelectedReference(r.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inboxScroll.current = inspector.current?.scrollTop || 0; returnFocus.current = e.currentTarget; setSelected(null); setSelectedReference(r.id); } }}><title>{description}</title><path className="wb-ref-hit" d={d}/><path className="wb-ref-line" d={d} markerEnd="url(#wb-reference-arrow)"/></g>;
            })}
          </svg>
        </div>}
      </div><div className="wb-zoom"><button aria-label={text('축소', 'Zoom out')} onClick={() => setView(v => ({ ...v, zoom: Math.max(.2, v.zoom - .1) }))}>−</button><span>{Math.round(view.zoom * 100)}%</span><button aria-label={text('확대', 'Zoom in')} onClick={() => setView(v => ({ ...v, zoom: Math.min(2, v.zoom + .1) }))}>＋</button><button onClick={fit}>{text('전체 보기', 'Fit board')}</button><button onClick={() => { setCollapsed(new Set()); setCollapsedProjects(new Set()); }}>{text('모두 펼치기', 'Expand all')}</button></div>
      <div className="wb-device-strip"><span>{text('컴퓨터 사용', 'Computer activity')}</span>{!data?.devices.length ? <small>{text('현재 수신된 사용 신호 없음', 'No current activity signals')}</small> : data.devices.map((device, i) => <button key={`${device.sessionId}:${i}`} onClick={() => choose(device.sessionId)}>{device.kind === 'desktop' ? '🖱' : '🌐'} {sessionsById.get(device.sessionId)?.name} · {device.tool}{device.state === 'unconfirmed' ? ` · ${text('종료 신호 확인 필요', 'Awaiting end signal')}` : ''}</button>)}</div>
    </section>
    <aside className="wb-inspector" ref={inspector} aria-label={text('내 확인', 'Your attention')}>
      {reference ? <div className="wb-detail"><button className="wb-back" onClick={back}>← {text('목록으로', 'Back to list')}</button><small>{text('관측된 읽기 참조', 'Observed reference')}</small><h2>{sessionsById.get(reference.from)?.name} → {sessionsById.get(reference.to)?.name}</h2><p>{reference.active ? text('실제 수신함 읽기 진행 중', 'Reading message records') : text('읽기 종료 · 마지막 관측 기록', 'Read ended · last observation')}</p><p>{text('참조 대상의 실행 상태는 바뀌지 않습니다.', 'Reading does not start the target session.')}</p><dl><dt>{text('관측 범위', 'Evidence')}</dt><dd>acedia_session_message_receive</dd><dt>{text('시작', 'Started')}</dt><dd>{new Date(reference.startedAt).toLocaleString()}</dd>{reference.endedAt && <><dt>{text('종료', 'Ended')}</dt><dd>{new Date(reference.endedAt).toLocaleString()}</dd></>}</dl><button onClick={() => locate(reference.to)}>{text('참조 대상을 보드에서 찾기', 'Locate target')}</button></div>
      : selectedSession ? <div className="wb-detail"><button className="wb-back" onClick={back}>← {text('내 확인 목록', 'Back to inbox')}</button><small>{data?.projects.find(p => p.id === selectedSession.projectId)?.name}</small><h2>{selectedSession.name}</h2>
        <div className="wb-detail-state"><StateIcon state={selectedSession.state}/><strong>{text(...labels[selectedSession.state])}</strong><span>{selectedSession.runtime === 'sleeping' ? 'Sleeping' : selectedSession.runtime}</span></div>
        <p className="wb-copy">{step(selectedSession)}</p><button className="wb-locate" onClick={() => locate(selectedSession.id)}>{text('보드에서 찾기', 'Locate on board')}</button>
        {selectedItem ? <article className="wb-result-detail"><span className="wb-detail-kind"><StateIcon state={selectedItem.kind}/>{text(...kinds[selectedItem.kind])}</span><h3>{selectedItem.kind === 'result' ? text('선택한 결과', 'Selected result') : actionLabel(selectedItem)}</h3><time>{new Date(selectedItem.createdAt).toLocaleString()}</time><p className="wb-copy">{selectedItem.summary || text('요약이 없습니다. 세션 대화에서 확인해 주세요.', 'Open the conversation for details.')}</p>
          {selectedItem.kind === 'result' && <><small>{selectedItem.scope === 'task' ? text('업무 검증 완료 결과', 'Verified task result') : selectedItem.scope === 'partial' ? text('부분 결과 · 업무 검증 전', 'Partial result · not verified') : text('응답 종료 결과 · 전체 업무 완료 판정 아님', 'Response result · not task verification')}</small><button className="wb-primary" disabled={busy || !!data?.storageError} onClick={() => { void acknowledge(selectedItem); }}>✓ {text('확인했어요', 'Reviewed')}</button><small>{text('이 결과 한 개만 확인 처리합니다. 승인·배포·세션 실행과는 무관합니다.', 'Reviews only this result; does not approve, publish or run work.')}</small></>}
          {!!selectedItem.artifacts?.length && <div className="wb-artifacts"><h3>{text('제출된 산출물', 'Submitted artifacts')}</h3>{selectedItem.artifacts.map((file, index) => <p className="wb-copy" key={index}>{file}</p>)}<small>{text('파일 열기·다운로드는 세션 대화에서 이용하세요.', 'Open or download these files in the conversation.')}</small></div>}
          {selectedItem.kind === 'question' && <button className="wb-primary" disabled={busy} onClick={() => { void open(selectedSession.id, true); }}>{text('세션에서 답변하기', 'Answer in session')}</button>}
          {selectedItem.kind === 'error' && <button disabled={busy || !!data?.storageError} onClick={() => { void acknowledge(selectedItem); }}>{text('이 오류 알림 정리', 'Dismiss this error notice')}</button>}
        </article> : selected?.itemId ? <p>{text('이 항목은 확인 또는 해결되었습니다.', 'This item was reviewed or resolved.')}</p> : <><h3>{text('미확인 항목', 'Unreviewed items')}</h3>{(itemsBySession.get(selectedSession.id) || []).map(item => <button className="wb-session-item" key={item.id} onClick={() => choose(selectedSession.id, item.id)}><StateIcon state={item.kind}/><span>{item.summary || text(...kinds[item.kind])}</span></button>)}{!itemsBySession.get(selectedSession.id)?.length && <p>{text('확인할 새 항목이 없습니다.', 'No new items to review.')}</p>}</>}
        <div className="wb-actions"><button disabled={busy} onClick={() => { void open(selectedSession.id); }}>{text('세션 대화 열기', 'Open conversation')}</button><button disabled={busy} onClick={() => { void open(selectedSession.id, true); }}>{text('추가 지시 작성', 'Write follow-up')}</button></div>
        <dl><dt>{text('실행 경과', 'Execution elapsed')}</dt><dd>{elapsed(selectedSession.startedAt, ['working', 'background'].includes(selectedSession.state) && connected ? sampledAt : selectedSession.lastActivityAt || selectedSession.updatedAt) || '—'}</dd><dt>{text('마지막 활동', 'Last activity')}</dt><dd>{selectedSession.lastActivityAt ? new Date(selectedSession.lastActivityAt).toLocaleString() : '—'}</dd><dt>{text('내부 이름', 'Internal name')}</dt><dd>{selectedSession.name}</dd><dt>{text('작업 폴더', 'Working folder')}</dt><dd>{selectedSession.folder}</dd></dl>
      </div> : <><header className="wb-inbox-heading"><span aria-hidden="true">☑</span><h2>{text('내 확인', 'Your attention')}</h2><b>{counts.attention}</b></header><nav className="wb-inbox-filters" aria-label={text('확인 유형', 'Attention type')}>{(['all', 'question', 'error', 'result'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setWorkingOnly(false); setBackgroundOnly(false); }}>{k === 'all' ? text('전체', 'All') : text(...kinds[k])} <b>{k === 'all' ? counts.attention : k === 'question' ? counts.questions : k === 'error' ? counts.errors : counts.results}</b></button>)}</nav>
        <div className="wb-inbox-list">{inbox.slice(0, visibleCount).map(item => {
          const s = sessionsById.get(item.sessionId)!; return <article key={item.id} className="wb-inbox-item" data-kind={item.kind}><StateIcon state={item.kind}/><div><strong>{s.name}</strong><p>{item.summary || text(...kinds[item.kind])}</p><small>{data?.projects.find(p => p.id === s.projectId)?.name} · {new Date(item.createdAt).toLocaleTimeString()}</small></div><button data-item-id={item.id} onClick={e => choose(s.id, item.id, e.currentTarget)}>{actionLabel(item)} ›</button></article>;
        })}{inbox.length > visibleCount && <button onClick={() => setVisibleCount(n => n + 50)}>{text('더 보기', 'Show more')} · {inbox.length - visibleCount}</button>}{!inbox.length && <div className="wb-inbox-empty"><span>✓</span><p>{query ? text('검색과 일치하는 항목이 없습니다.', 'No matching items.') : text('확인할 새 항목이 없습니다.', 'Nothing needs your attention.')}</p></div>}</div><p className="wb-inbox-help">{text('열어보기만 해서는 결과 배지가 사라지지 않습니다.', 'Opening a result does not mark it reviewed.')}</p></>}
    </aside></div>
    <footer className="wb-footer"><span><StateIcon state="working"/>{text('작업 중에만 회전', 'Spin only during execution')}</span><span className="wb-ref-legend">{text('실제 읽기 구간에서만 흐름', 'Flow only during observed reads')}</span><span>{text('이전 미확인 결과는 새 작업과 함께 유지', 'Earlier results remain during new work')}</span><small>{text('참조 관측: Acedia 메시지 수신함 · 일반 파일/외부 도구의 내부 참조는 알 수 없음', 'Read evidence: Acedia inbox; external/internal file references are not inferred')}</small></footer>
  </main>;
}
