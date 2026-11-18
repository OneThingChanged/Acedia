import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { BOARD_CARD, BOARD_LAYOUT_VERSION, boardCounts, boardItems, boardLayout, boardProjectHeight, boardDisplayState, boardPriorityOrder, boardWorkingOrder, boardTransferLabel, boardVisibleSessionIds, type BoardItem, type BoardSession, type BoardSnapshot, type BoardState } from '../lib/workBoard';
import { workBoardConnections } from '../lib/workBoardConnections';
import { boardProjectPositions, boardSessionOrder, canReorderBoardSession, placeBoardProject, reorderBoardSession, type BoardProjectPositions } from '../lib/boardPlacement';
import { ProviderLogo } from './ProviderLogo';
import './ProjectBoardPage.css';
import './BackgroundWork.css';
import { backgroundWaitingLabels } from '../lib/agentActivity';
import { SessionTableView } from './SessionTableView';
import { PixelOffice } from './PixelOffice';
import { boardOfficeData } from '../lib/boardOffice';
import { SessionLifecycleButton } from './SessionLifecycleButton';
import { BoardRequestDetail } from './BoardRequestDetail';
import { latestIncoming, sessionTableMatches, transferTitle } from '../lib/sessionTable';
import type { BoardSessionManagement, BoardViewMode } from '../lib/workBoard';

const labels: Record<BoardState, [string, string]> = {
  idle: ['대기', 'Idle'], planned: ['배정 대기', 'Planned'], working: ['작업 중', 'Working'], waiting: ['내 답변 필요', 'Needs your answer'],
  waiting_external: ['외부 응답 대기', 'Waiting for a tool'], paused: ['일시정지', 'Paused'], review: ['결과 도착', 'Response ready'],
  completed: ['업무 검증 완료', 'Task verified'], responded: ['응답 확인됨', 'Response read'], interrupted: ['중단됨', 'Interrupted'], failed: ['오류', 'Error'], unknown: ['상태 확인 불가', 'Status unknown'],
  background: ['백그라운드 대기', 'Background wait'],
};
const kinds: Record<BoardItem['kind'], [string, string]> = { question: ['질문', 'Questions'], error: ['오류', 'Errors'], result: ['결과', 'Results'] };
function BoardIcon({ name }: { name: 'folder' | 'chevron' | 'board' | 'inbox' }) {
  return <svg className="wb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'folder' ? <><path d="M3 7h6l2-3h7a2 2 0 0 1 2 2v2"/><path d="M3 7v12h15l3-11H7L4 19"/></> : name === 'chevron' ? <path d="m9 5 7 7-7 7"/> : name === 'inbox' ? <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/></> : <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M6.5 10v7.5H14M10 6.5h7.5V14"/></>}
  </svg>;
}
function StateIcon({ state, active = true }: { state: BoardState | 'result' | 'question' | 'error'; active?: boolean }) {
  return <span className="wb-state-icon" data-state={state} data-active={active} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {state === 'working' || state === 'background' ? null : state === 'idle' || state === 'planned' ? <path d="M20 14.3A8.8 8.8 0 0 1 9.7 4a9 9 0 1 0 10.3 10.3Z"/>
      : state === 'waiting' || state === 'question' ? <><path d="M20 10a8 8 0 0 1-10 8l-6 3 1-6a8 8 0 1 1 15-5Z"/><path d="M9 8a2.4 2.4 0 0 1 4.7.5c0 1.7-2.2 1.9-2.2 3.5M11.5 15h.01"/></>
      : state === 'waiting_external' ? <><path d="M7 3h10M7 21h10M8 3v4l8 10v4M16 3v4L8 17v4"/></>
      : <><circle cx="12" cy="12" r="9"/>{state === 'paused' || state === 'interrupted' ? <path d="M9.5 8v8m5-8v8"/> : ['result', 'review', 'responded', 'completed'].includes(state) ? <path d="m7.5 12 3 3 6-6"/> : <path d="M12 7v6m0 4h.01"/>}</>}
  </svg></span>;
}
function elapsed(start: number | undefined, now: number) {
  if (!start || start > now) return '';
  const seconds = Math.floor((now - start) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
function systemReducedMotion() { return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }
function itemTime(value: number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { dateTime: date.toISOString(), label: date.toLocaleTimeString() } : { dateTime: undefined, label: '—' };
}
type ProjectDrag = { id: string; pointerId: number; clientX: number; clientY: number; x: number; y: number; zoom: number; point: { x: number; y: number }; moved: boolean };
type BoardBounds = { x: number; y: number; width: number; height: number };
const FOLD_CLICK_DELAY_MS = 500;

export function ProjectBoardPage({ initialSnapshot }: { initialSnapshot?: BoardSnapshot } = {}) {
  const { text } = useAppLanguage();
  const [data, setData] = useState<BoardSnapshot | null>(initialSnapshot || null), [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<BoardViewMode>(initialSnapshot?.preferences.viewMode || 'sessions');
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ sessionId: string; itemId?: string } | null>(null);
  const [selectedResult, setSelectedResult] = useState<BoardItem | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; results: { id: string; fingerprint: string }[] } | null>(null);
  const [projectId, setProject] = useState(''), [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'question' | 'error' | 'result'>('all');
  const [workingOnly, setWorkingOnly] = useState(false), [backgroundOnly, setBackgroundOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(initialSnapshot?.preferences.collapsed || [])), [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set(initialSnapshot?.preferences.collapsedProjects || []));
  const [view, setView] = useState({ zoom: initialSnapshot?.preferences.zoom ?? .8, x: initialSnapshot?.preferences.x ?? 24, y: initialSnapshot?.preferences.y ?? 24 }), [motion, setMotion] = useState(true), [reducedMotion, setReducedMotion] = useState(systemReducedMotion);
  const [busy, setBusy] = useState(false), [sampledAt, setSampledAt] = useState(initialSnapshot?.sampledAt || Date.now());
  const [connected, setConnected] = useState(true);
  const [groupScroll, setGroupScroll] = useState<Record<string, number>>({});
  const [showSleeping, setShowSleeping] = useState(initialSnapshot?.preferences.showSleeping === true), [showStopped, setShowStopped] = useState(initialSnapshot?.preferences.showStopped === true);
  const [activeOnly, setActiveOnly] = useState(initialSnapshot?.preferences.activeOnly === true);
  const [revealedSession, setRevealedSession] = useState<string | null>(null);
  const [projectPositions, setProjectPositions] = useState<BoardProjectPositions>(() => boardProjectPositions(initialSnapshot?.preferences.projectPositions)), [sessionOrder, setSessionOrder] = useState<string[]>(() => boardSessionOrder(initialSnapshot?.preferences.sessionOrder));
  const [compactPlacement, setCompactPlacement] = useState<{ key: string; positions: BoardProjectPositions }>({ key: '', positions: {} });
  const [projectPreview, setProjectPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [sessionDragging, setSessionDragging] = useState<string | null>(null), [sessionDrop, setSessionDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [placementStatus, setPlacementStatus] = useState<'saved' | 'saving' | 'failed'>('saved'), [placementError, setPlacementError] = useState('');
  const [pendingFocus, setPendingFocus] = useState<string | null>(null), [selectedReference, setSelectedReference] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), inspector = useRef<HTMLElement>(null), returnFocus = useRef<HTMLElement | SVGElement | null>(null);
  const inboxScroll = useRef(0), revision = useRef<string | undefined>(undefined), initialized = useRef(false);
  const returnItemId = useRef('');
  const projectBodies = useRef(new Map<string, HTMLDivElement>()), resetView = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const projectDrag = useRef<ProjectDrag | null>(null), sessionDrag = useRef<string | null>(null), suppressProjectClick = useRef<string | null>(null), placementSave = useRef(0);
  const foldClicks = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const menuPanel = useRef<HTMLDivElement>(null), menuTrigger = useRef<HTMLButtonElement | null>(null);
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
            setViewMode(p.viewMode === 'board' || p.viewMode === 'transfers' || p.viewMode === 'office' ? p.viewMode : 'sessions');
            resetView.current = p.layoutVersion !== BOARD_LAYOUT_VERSION;
            setView(resetView.current ? { zoom: .8, x: 24, y: 24 } : { zoom: p.zoom ?? .8, x: p.x ?? 24, y: p.y ?? 24 }); setCollapsed(new Set(p.collapsed || []));
            setCollapsedProjects(new Set(p.collapsedProjects || [])); setProject(p.projectId || ''); setMotion(p.motion ?? true);
            setProjectPositions(boardProjectPositions(p.projectPositions)); setSessionOrder(boardSessionOrder(p.sessionOrder));
            setShowSleeping(p.showSleeping === true); setShowStopped(p.showStopped === true); setActiveOnly(p.activeOnly === true);
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
    const preferences = { viewMode, layoutVersion: resetView.current ? 2 : BOARD_LAYOUT_VERSION, ...view, collapsed: [...collapsed], projectId,
      ...(data?.items ? { collapsedProjects: [...collapsedProjects], motion } : {}) };
    const timer = setTimeout(() => { void invoke('project_board_preferences', { preferences }).catch(reason => setError(String(reason))); }, 500);
    return () => clearTimeout(timer);
  }, [viewMode, view, collapsed, projectId, collapsedProjects, motion, !!data?.items]);
  useEffect(() => {
    const clicks = foldClicks.current;
    return () => { for (const timer of clicks.values()) clearTimeout(timer); clicks.clear(); };
  }, [viewMode]);
  useEffect(() => { menuPanel.current?.querySelector('button')?.focus({ preventScroll: true }); }, [menu]);
  const allItems = useMemo(() => data ? boardItems(data) : [], [data]);
  const itemsBySession = useMemo(() => {
    const map = new Map<string, BoardItem[]>(); for (const item of allItems) map.set(item.sessionId, [...(map.get(item.sessionId) || []), item]); return map;
  }, [allItems]);
  const sessionsById = useMemo(() => new Map(data?.sessions.map(s => [s.id, s])), [data]);
  const office = useMemo(() => viewMode === 'office' && data ? boardOfficeData(data, sampledAt, connected) : null,
    [viewMode, data, sampledAt, connected]);
  const projectSessions = useMemo(() => data?.sessions.filter(s => !projectId || s.projectId === projectId) || [], [data, projectId]);
  const counts = useMemo(() => boardCounts(projectSessions, allItems), [projectSessions, allItems]);
  const overview = view.zoom < .62;
  const compactKey = activeOnly || !showSleeping || !showStopped ? JSON.stringify([activeOnly, showSleeping, showStopped]) : '';
  const placementPositions = useMemo(() => compactKey ? compactPlacement.key === compactKey ? compactPlacement.positions : {} : projectPositions, [compactKey, compactPlacement, projectPositions]);
  const displayedPositions = useMemo(() => projectPreview ? { ...placementPositions, [projectPreview.id]: { x: projectPreview.x, y: projectPreview.y } } : placementPositions, [placementPositions, projectPreview]);
  const effectiveOrder = useMemo(() => boardWorkingOrder(data?.sessions || [], sessionOrder), [data?.sessions, sessionOrder]);
  const delegationEdges = useMemo(() => new Set(data?.delegations?.map(d => `${d.from}:${d.to}`)), [data?.delegations]);
  const layout = useMemo(() => data && viewMode === 'board' ? boardLayout(data, { projectId, collapsed, collapsedProjects, overview, projectPositions: displayedPositions, sessionOrder: effectiveOrder, showSleeping, showStopped, activeOnly, revealId: revealedSession }) : null,
    [data, viewMode, projectId, collapsed, collapsedProjects, overview, displayedPositions, effectiveOrder, showSleeping, showStopped, activeOnly, revealedSession]);
  const nodes = useMemo(() => layout?.nodes.filter(n => !collapsedProjects.has(n.session.projectId)) || [], [layout, collapsedProjects]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.session.id, n])), [nodes]);
  const groupById = useMemo(() => new Map(layout?.groups.map(g => [g.id, g])), [layout]);
  const previousWorking = useRef(new Set<string>());
  useEffect(() => {
    if (viewMode !== 'board' || !layout || overview) return;
    const current = new Set(nodes.filter(n => n.session.runtime === 'running' && n.session.state === 'working').map(n => n.session.id));
    const newlyWorking = nodes.filter(n => current.has(n.session.id) && !previousWorking.current.has(n.session.id));
    previousWorking.current = current;
    // Reveal a promoted worker once, without undoing a user's later scrolling.
    for (const projectId of new Set(newlyWorking.map(n => n.session.projectId))) {
      const node = newlyWorking.filter(n => n.session.projectId === projectId).sort((a, b) => b.depth - a.depth || a.y - b.y)[0];
      const group = groupById.get(projectId), body = projectBodies.current.get(projectId);
      if (!group || !body) continue;
      const top = node.y - group.y - BOARD_CARD.header;
      if (top < body.scrollTop || top + node.height > body.scrollTop + group.bodyHeight) {
        const next = Math.max(0, top - BOARD_CARD.padding);
        body.scrollTop = next; setGroupScroll(value => ({ ...value, [projectId]: next }));
      }
    }
  }, [data?.sessions, layout, nodes, groupById, viewMode, overview]);
  const temporarySession = viewMode === 'office' ? null : revealedSession;
  const visibleSessionIds = useMemo(() => boardVisibleSessionIds(data?.sessions || [], showSleeping, showStopped, temporarySession, activeOnly), [data?.sessions, showSleeping, showStopped, temporarySession, activeOnly]);
  const displayedReferences = useMemo(() => data?.references?.filter(r => visibleSessionIds.has(r.from) && visibleSessionIds.has(r.to)) || [], [data?.references, visibleSessionIds]);
  const connections = useMemo(() => workBoardConnections(layout, data?.sessions || [], displayedReferences, collapsedProjects, groupScroll, view.zoom < .62),
    [layout, data?.sessions, displayedReferences, collapsedProjects, groupScroll, view.zoom < .62]);
  useEffect(() => {
    if (viewMode !== 'board' || !resetView.current || !layout?.groups.length) return;
    const rect = viewport.current?.getBoundingClientRect(); if (!rect) return;
    resetView.current = false;
    const left = Math.min(...layout.groups.map(g => g.x)), top = Math.min(...layout.groups.map(g => g.y));
    const width = Math.max(...layout.groups.map(g => g.x + g.width)) - left, height = Math.max(...layout.groups.map(g => g.y + g.height)) - top;
    // Migrate only the old column layout's viewport, once. Never pan on new events.
    const zoom = Math.max(overview ? .2 : .65, Math.min(overview ? .61 : 1, (rect.width - 48) / width, (rect.height - 48) / height));
    setView({ zoom, x: width * zoom <= rect.width - 48 ? (rect.width - width * zoom) / 2 - left * zoom : 24 - left * zoom, y: 24 - top * zoom });
  }, [layout, viewMode, overview]);
  const matches = useCallback((s: BoardSession) => (!workingOnly || s.state === 'working') && (!backgroundOnly || s.state === 'background') && (kind === 'all' || itemsBySession.get(s.id)?.some(i => i.kind === kind))
    && (!data || sessionTableMatches(data, s, query)), [workingOnly, backgroundOnly, kind, query, data, itemsBySession]);
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
    if (node && rect) {
      const group = groupById.get(node.session.projectId)!, body = projectBodies.current.get(group.id);
      const top = node.y - group.y - BOARD_CARD.header;
      const scroll = Math.max(0, Math.min(group.rows * BOARD_CARD.row + BOARD_CARD.padding * 2 - group.bodyHeight, top - (group.bodyHeight - node.height) / 2));
      if (body) body.scrollTop = scroll;
      setGroupScroll(current => ({ ...current, [group.id]: scroll }));
      setView(v => { const zoom = Math.max(.65, v.zoom); return { zoom, x: rect.width / 2 - (node.x + node.width / 2) * zoom, y: rect.height / 2 - (node.y - scroll + node.height / 2) * zoom }; }); setPendingFocus(null);
    }
  }, [pendingFocus, nodeById, groupById]);
  useEffect(() => { if (!selected && !selectedReference && inspector.current) inspector.current.scrollTop = inboxScroll.current; }, [selected, selectedReference]);
  useEffect(() => { if (selected || selectedReference) inspector.current?.querySelector<HTMLButtonElement>('.wb-back')?.focus({ preventScroll: true }); }, [selected?.sessionId, selected?.itemId, selectedReference]);
  const selectedSession = selected ? sessionsById.get(selected.sessionId) : null;
  const selectedTransfer = data && selectedSession && selectedTransferId ? data.transfers?.find(t => t.id === selectedTransferId && t.to === selectedSession.id) : undefined;
  const selectedItem = selected?.itemId ? allItems.find(i => i.id === selected.itemId) || (selectedResult?.id === selected.itemId ? selectedResult : null) : null;
  const reference = data?.references?.find(r => r.id === selectedReference);
  const transfersBySession = useMemo(() => { const map = new Map<string, NonNullable<BoardSnapshot['transfers']>>();
    for (const t of data?.transfers || []) for (const id of new Set([t.from, t.to])) map.set(id, [...(map.get(id) || []), t]); return map;
  }, [data?.transfers]);
  const open = useCallback(async (id: string, compose = false) => {
    if (busy) return; setBusy(true);
    const reviewResults = allItems.filter(i => i.sessionId === id && i.kind === 'result').map(i => ({ id: i.id, fingerprint: i.fingerprint }));
    try { const result = await invoke<{ snapshot?: BoardSnapshot }>('project_board_open_session', { id, compose, ...(!compose && reviewResults.length ? { reviewResults } : {}) });
      if (result?.snapshot) { revision.current = result.snapshot.revision; setData(result.snapshot); }
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }, [busy, allItems]);
  const choose = (sessionId: string, itemId?: string, trigger?: HTMLElement) => {
    setSelectedTransferId(data ? latestIncoming(data, sessionId)?.id || null : null);
    if (!selected && !selectedReference) inboxScroll.current = inspector.current?.scrollTop || 0;
    if (trigger) returnFocus.current = trigger;
    if (itemId) returnItemId.current = itemId;
    const result = allItems.find(i => i.id === itemId && i.kind === 'result'); setSelectedResult(result || null);
    setSelected({ sessionId, itemId }); setSelectedReference(null);
    if (result) void acknowledge(result, false);
  };
  const back = () => {
    setSelected(null); setSelectedReference(null); setSelectedResult(null);
    window.requestAnimationFrame(() => {
      const target = returnFocus.current?.isConnected ? returnFocus.current
        : inspector.current?.querySelector<HTMLButtonElement>(`[data-item-id="${returnItemId.current}"]`) || inspector.current?.querySelector<HTMLButtonElement>('.wb-inbox-filters [aria-pressed="true"]');
      target?.focus({ preventScroll: true });
    });
  };
  const locate = (id: string) => {
    setViewMode('board');
    setView(v => v.zoom < .62 ? { ...v, zoom: .65 } : v);
    const session = sessionsById.get(id); if (!session) return;
    setRevealedSession(boardVisibleSessionIds(data?.sessions || [], showSleeping, showStopped, null, activeOnly).has(id) ? null : id);
    if (projectId && session.projectId !== projectId) setProject('');
    setCollapsedProjects(current => { const next = new Set(current); next.delete(session.projectId); return next; });
    setCollapsed(current => { const next = new Set(current), seen = new Set<string>(); let s: BoardSession | undefined = session;
      while (s?.parentId && !seen.has(s.id)) { seen.add(s.id); next.delete(s.parentId); s = sessionsById.get(s.parentId); } return next; });
    setPendingFocus(id);
  };
  const cancelFold = (key: string) => {
    clearTimeout(foldClicks.current.get(key));
    foldClicks.current.delete(key);
  };
  const foldOnClick = (key: string, detail: number, toggle: () => void) => {
    cancelFold(key);
    if (detail === 0) toggle();
    if (detail === 1) foldClicks.current.set(key, setTimeout(() => {
      foldClicks.current.delete(key);
      toggle();
    }, FOLD_CLICK_DELAY_MS));
  };
  const zoomTo = (key: string, target: BoardBounds, minimum: number) => {
    cancelFold(key);
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return;
    const fitWidth = (rect.width - 48) / target.width;
    setView(current => {
      const zoom = Math.min(2, Math.max(.65, current.zoom, Math.min(minimum, fitWidth)));
      return { zoom, x: (rect.width - target.width * zoom) / 2 - target.x * zoom,
        y: Math.max(24, (rect.height - target.height * zoom) / 2) - target.y * zoom };
    });
  };
  const showSessionMenu = (id: string, x: number, y: number, trigger?: HTMLButtonElement | null) => {
    menuTrigger.current = trigger ?? null;
    setMenu({ id, x: Math.max(8, Math.min(x, window.innerWidth - 248)), y: Math.max(8, Math.min(y, window.innerHeight - 304)),
      results: (itemsBySession.get(id) || []).filter(i => i.kind === 'result').map(({ id, fingerprint }) => ({ id, fingerprint })) });
  };
  const closeSessionMenu = () => {
    setMenu(null);
    menuTrigger.current?.focus({ preventScroll: true });
  };
  const manageSession = (request: BoardSessionManagement) => {
    setMenu(null);
    void invoke('project_board_manage_session', request).catch(reason => setError(String(reason)));
  };
  const fit = () => {
    const rect = viewport.current?.getBoundingClientRect();
    if (rect && layout?.groups.length) {
      const left = Math.min(...layout.groups.map(g => g.x)), top = Math.min(...layout.groups.map(g => g.y));
      const width = Math.max(...layout.groups.map(g => g.x + g.width)) - left;
      const height = Math.max(...layout.groups.map(g => g.y + (collapsedProjects.has(g.id) ? BOARD_CARD.header : g.height))) - top;
      const zoom = Math.max(.2, Math.min(overview ? .61 : 1, (rect.width - 48) / width, (rect.height - 48) / height));
      setView({ zoom, x: 24 - left * zoom, y: 24 - top * zoom });
    }
  };
  const savePlacement = (placement: { projectPositions: BoardProjectPositions; sessionOrder: string[]; showSleeping?: boolean; showStopped?: boolean; activeOnly?: boolean }) => {
    const preferences = { showSleeping, showStopped, activeOnly, ...placement };
    const sequence = ++placementSave.current;
    setPlacementStatus('saving'); setPlacementError('');
    // Save each completed drop immediately to the host's local board file. The
    // debounced viewport preference writer deliberately excludes placement.
    void invoke('project_board_preferences', { preferences }).then(() => {
      if (placementSave.current === sequence) setPlacementStatus('saved');
    }).catch(reason => {
      if (placementSave.current === sequence) { setPlacementStatus('failed'); setPlacementError(String(reason)); }
    });
  };
  const cancelProjectDrag = () => {
    if (projectDrag.current?.moved) suppressProjectClick.current = projectDrag.current.id;
    projectDrag.current = null; setProjectPreview(null);
  };
  const moveProject = (e: PointerEvent<HTMLButtonElement>) => {
    const anchor = projectDrag.current; if (!anchor || anchor.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - anchor.clientX, dy = e.clientY - anchor.clientY;
    if (!anchor.moved && Math.hypot(dx, dy) < 6) return;
    if (!anchor.moved) cancelFold(`project:${anchor.id}`);
    e.preventDefault(); anchor.moved = true;
    anchor.point = { x: Math.max(-1_000_000, Math.min(1_000_000, anchor.x + dx / anchor.zoom)), y: Math.max(-1_000_000, Math.min(1_000_000, anchor.y + dy / anchor.zoom)) };
    setProjectPreview({ id: anchor.id, ...anchor.point });
  };
  const endProjectDrag = (e: PointerEvent<HTMLButtonElement>) => {
    const anchor = projectDrag.current; if (!anchor || anchor.pointerId !== e.pointerId) return;
    moveProject(e); e.stopPropagation(); projectDrag.current = null; setProjectPreview(null);
    if (!anchor.moved) return;
    suppressProjectClick.current = anchor.id;
    const group = groupById.get(anchor.id); if (!group) return;
    const point = placeBoardProject({ ...group, ...anchor.point }, (layout?.groups || []).filter(g => g.id !== anchor.id));
    const next = { ...placementPositions, [anchor.id]: point };
    if (compactKey) setCompactPlacement({ key: compactKey, positions: next });
    else { setProjectPositions(next); savePlacement({ projectPositions: next, sessionOrder }); }
  };
  const moveSessionOrder = (from: string, to: string, after: boolean) => {
    if (!data) return;
    const next = reorderBoardSession(data.sessions, sessionOrder, from, to, after);
    if (next) { setSessionOrder(next); savePlacement({ projectPositions, sessionOrder: next }); }
  };
  const acknowledge = async (item: BoardItem, returnToInbox = true) => {
    if (busy) return; setBusy(true);
    try { const result = await invoke<BoardSnapshot>('project_board_ack', { id: item.sessionId, fingerprint: item.fingerprint, ...(data?.items ? { itemId: item.id } : {}) });
      revision.current = result.revision; setData(result); if (returnToInbox) back();
    } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const reviewSession = async (id: string, results: { id: string; fingerprint: string }[]) => {
    if (busy || !results.length) return; setBusy(true); setMenu(null);
    try { const result = await invoke<BoardSnapshot>('project_board_ack_results', { id, results }); revision.current = result.revision; setData(result); }
    catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  const step = (s: BoardSession) => s.delegatedWait?.count ? text(`자식 작업 ${s.delegatedWait.count}개 대기`, `Waiting for ${s.delegatedWait.count} child task${s.delegatedWait.count === 1 ? '' : 's'}`)
    : boardDisplayState(s, itemsBySession.get(s.id)?.filter(i => i.kind === 'result').length || 0) === 'responded' ? text('응답 확인 완료 · 새 지시 대기', 'Response read · awaiting a new instruction') : s.state === 'background' ? text(...backgroundWaitingLabels(s.backgroundCount || undefined))
    : s.reason || s.step || s.task?.title || (s.state === 'idle' || s.state === 'planned' ? text('할당된 작업 없음', 'No assigned work') : text(...labels[s.state]));
  const actionLabel = (item: BoardItem) => item.kind === 'question' ? text('답변하기', 'Answer') : item.kind === 'error' ? text('원인 보기', 'View cause') : text('결과 보기', 'View result');
  const motionSwitch = <button className="wb-motion" role="switch" aria-checked={motion && !reducedMotion} disabled={reducedMotion} title={reducedMotion ? text('시스템의 모션 줄이기 설정 적용 중', 'System reduced-motion setting is active') : ''} onClick={() => setMotion(v => !v)}>{text('모션', 'Motion')} <span className="wb-switch-track"/></button>;
  return <main className="work-board-page" data-motion={motion && !reducedMotion && connected ? 'on' : 'off'} data-density={view.zoom < .62 ? 'overview' : 'detail'} onKeyDown={e => { if (e.key === 'Escape') {
    if (menu) { e.stopPropagation(); closeSessionMenu(); }
    else if (projectDrag.current) { e.stopPropagation(); cancelProjectDrag(); }
    else if (selected || selectedReference) { e.stopPropagation(); back(); }
  } }} onPointerDown={e => { if (menu && !(e.target as Element).closest('.wb-context-menu')) setMenu(null); }}>
    <header className="wb-header"><div className="wb-brand"><BoardIcon name="board"/><div><h1>{text('세션 현황', 'Session overview')}</h1><small>{text('세션의 현재 상태와 실제 업무 전달 기록.', 'Current session state and recorded handoffs.')}</small></div></div>
      <nav className="wb-view-tabs" aria-label={text('현황 표시 방식', 'Overview view')}>
        {([['sessions', '세션', 'Sessions'], ['transfers', '업무 전달', 'Handoffs'], ['board', '보드', 'Board'], ['office', 'Pixel Office', 'Pixel Office']] as const).map(([mode, ko, en]) => <button key={mode} aria-pressed={viewMode === mode} onClick={() => { setMenu(null); cancelProjectDrag(); setViewMode(mode); }}>{text(ko, en)}</button>)}
      </nav>
      <label className="wb-project-picker" hidden={viewMode === 'office'}><span className="wb-sr-only">{text('프로젝트 선택', 'Select project')}</span><select value={projectId} onChange={e => { setProject(e.target.value); setSelected(null); }}><option value="">{text('전체 프로젝트', 'All projects')}</option>{data?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <input type="search" hidden={viewMode === 'office'} value={query} onChange={e => setQuery(e.target.value)} placeholder={text('세션·작업·경로 검색', 'Search sessions, work or paths')} aria-label={text('보드 검색', 'Search board')}/>
      <div className="wb-visibility" role="group" aria-label={text('세션 표시 옵션', 'Session visibility')}>
        <button role="switch" aria-checked={activeOnly} aria-label={text('활성 세션만 표시', 'Show active sessions only')} title={text('실행 중인 세션만 표시합니다. Sleeping을 켜면 활성 부모의 sleeping 자식도 표시합니다.', 'Show running sessions. Sleeping also shows sleeping descendants of active parents.')}
          onClick={() => { const next = !activeOnly; cancelProjectDrag(); setActiveOnly(next); setRevealedSession(null); resetView.current = true; savePlacement({ projectPositions, sessionOrder, activeOnly: next }); }}>{text('Active만', 'Active only')} <span className="wb-switch-track"/></button>
        <button role="switch" aria-checked={showSleeping} aria-label={text('Sleeping 세션 표시', 'Show sleeping sessions')} title={text('Sleeping 세션 표시·숨김. Active만 보기에서는 활성 부모 아래의 자식만 표시합니다.', 'Show sleeping sessions. In Active only, include only descendants of active parents.')}
          onClick={() => { const next = !showSleeping; cancelProjectDrag(); setShowSleeping(next); setRevealedSession(null); resetView.current = true; savePlacement({ projectPositions, sessionOrder, showSleeping: next }); }}>Sleeping <span className="wb-switch-track"/></button>
        <button role="switch" aria-checked={showStopped} aria-label={text('대기·정지 세션 표시', 'Show idle and stopped sessions')} title={text('Idle·일시정지·중단·종료 세션 표시·숨김. 보이는 자식의 부모는 유지합니다.', 'Show or hide idle, paused, interrupted and stopped sessions. Parents of visible children stay.')}
          onClick={() => { const next = !showStopped; cancelProjectDrag(); setShowStopped(next); setRevealedSession(null); resetView.current = true; savePlacement({ projectPositions, sessionOrder, showStopped: next }); }}>{text('대기·정지', 'Idle / stopped')} <span className="wb-switch-track"/></button>
      </div>
      {viewMode === 'office' && motionSwitch}
      <button className="wb-refresh" onClick={() => { void refreshRef.current(); }}>{text('새로고침', 'Refresh')}</button></header>

    {(placementError || error || data?.storageError) && <div role="alert" className="wb-error">{placementError || error || data?.storageError}</div>}
    {viewMode === 'office' && <div className="wb-office">{office ? <PixelOffice agents={office.agents} projects={office.projects} activeProjectId={projectId || null} visibleSessionIds={visibleSessionIds} motion={motion && connected}
      onOpenSession={id => { void open(id); }} onBack={() => setViewMode('board')}/>
      : <p className="wb-empty" role="status">{text('사무실을 불러오는 중…', 'Loading office…')}</p>}</div>}
    {viewMode !== 'office' && revealedSession && <div className="wb-revealed">{sessionsById.get(revealedSession)?.name} · {text('보드에서 찾기로 임시 표시 중', 'Temporarily shown by Locate on board')}<button onClick={() => setRevealedSession(null)}>{text('다시 숨기기', 'Hide again')}</button></div>}
    <div className="wb-body" hidden={viewMode === 'office'}><section className="wb-canvas-wrap">    <nav className="wb-summary" aria-label={text('업무 요약', 'Work summary')}>
      <span className={`wb-connection ${!connected ? 'warning' : ''}`}><i/>{!connected ? text('수신 실패 · 마지막 기록', 'Disconnected · last known data') : text('상태 수신', 'Receiving state')}</span>
      <button aria-pressed={!workingOnly && !backgroundOnly && kind === 'all'} onClick={() => { setWorkingOnly(false); setBackgroundOnly(false); setKind('all'); }}>{text('전체', 'All')} <b>{projectSessions.length}</b></button>
      <button aria-pressed={workingOnly} title={text('이 세션이 응답이나 명령을 직접 실행 중입니다.', 'This session is actively producing a response or running commands.')} onClick={() => { setWorkingOnly(v => !v); setBackgroundOnly(false); setKind('all'); }}><StateIcon state="working" active={connected && counts.working > 0}/>{text('작업 중', 'Working')} <b>{connected ? counts.working : '—'}</b></button>
      <button aria-pressed={backgroundOnly} title={text('CLI 내부 하위 에이전트 등 백그라운드 작업의 완료를 기다립니다. Acedia 자식 세션 수와는 다릅니다.', 'Waiting for background work, such as internal CLI agents; this is not an Acedia child-session count.')} onClick={() => { setBackgroundOnly(v => !v); setWorkingOnly(false); setKind('all'); }}><StateIcon state="background" active={connected && counts.background > 0}/>{text('하위 작업 대기', 'Background wait')} <b>{connected ? counts.background : '—'}</b></button>
      <button aria-pressed={kind === 'question'} onClick={() => { setKind(kind === 'question' ? 'all' : 'question'); setWorkingOnly(false); setBackgroundOnly(false); }}><StateIcon state="question"/>{text('질문', 'Questions')} <b>{counts.questions}</b></button>
      <button aria-pressed={kind === 'error'} onClick={() => { setKind(kind === 'error' ? 'all' : 'error'); setWorkingOnly(false); setBackgroundOnly(false); }}><StateIcon state="error"/>{text('오류', 'Errors')} <b>{counts.errors}</b></button>
      <button aria-pressed={kind === 'result'} onClick={() => { setKind(kind === 'result' ? 'all' : 'result'); setWorkingOnly(false); setBackgroundOnly(false); }}><StateIcon state="result"/>{text('미확인 결과', 'Unreviewed results')} <b>{counts.results}</b></button>
      <span className="wb-sampled" title={text('작업 진행 시각이 아닌 상태 수신 시각입니다.', 'State sampling time, not evidence of work progress.')}>{text('수신', 'Received')} {new Date(sampledAt).toLocaleTimeString()}</span>
      <details className="wb-state-help"><summary>{text('상태 안내', 'State guide')}</summary><p>{text('작업 중: 현재 대화가 직접 실행 중입니다. 하위 작업 대기: CLI가 내부 백그라운드 작업의 완료를 기다립니다. 미확인 결과: 새로 도착한 응답입니다. 대화나 결과를 열면 확인 처리하며, 새 응답과 질문은 따로 유지합니다.', 'Working: this conversation is executing. Background wait: its CLI is waiting for internal background work. Unread results: new responses; opening the result or conversation marks the captured results read, while new responses and questions remain.')}</p></details>
    </nav>
      {(viewMode === 'sessions' || viewMode === 'transfers') && data && <SessionTableView data={data} mode={viewMode} projectId={projectId} query={query} visible={visibleSessionIds}
        filterSession={s => (!workingOnly || s.state === 'working') && (!backgroundOnly || s.state === 'background') && (kind === 'all' || !!itemsBySession.get(s.id)?.some(i => i.kind === kind))}
        selectedId={selected?.sessionId} selectedTransferId={selectedTransferId} step={step}
        state={s => { const current = boardDisplayState(s, itemsBySession.get(s.id)?.filter(i => i.kind === 'result').length || 0); return <span className="st-state" data-state={current}><StateIcon state={current} active={connected}/>{text(...labels[current])}</span>; }}
        onChoose={(id, trigger, transferId) => { choose(id, undefined, trigger); if (transferId) setSelectedTransferId(transferId); }} onOpen={id => { void open(id); }}/>}
      {(viewMode === 'sessions' || viewMode === 'transfers') && !data && <p className="wb-empty" role="status">{text('세션 현황을 불러오는 중…', 'Loading sessions…')}</p>}
      <div className="wb-canvas" hidden={viewMode !== 'board'} ref={viewport} tabIndex={0} aria-label={text('업무 노드 · 빈 공간 드래그로 이동', 'Work nodes · drag empty space to pan')}
        onPointerDown={e => { if (e.button !== 0 && e.button !== 1 || e.button === 0 && (e.target as Element).closest('button, select, input, summary, [role="button"], .wb-project-body')) return; if (e.button === 1) e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, left: view.x, top: view.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onAuxClick={e => { if (e.button === 1) e.preventDefault(); }}
        onPointerMove={e => { const anchor = drag.current; if (!anchor) return; const x = anchor.left + e.clientX - anchor.x, y = anchor.top + e.clientY - anchor.y; setView(v => ({ ...v, x, y })); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onWheel={e => { if (projectDrag.current) return; const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; setView(v => { const zoom = Math.max(.2, Math.min(2, v.zoom * (e.deltaY > 0 ? .9 : 1.1))); return { zoom, x: px - (px - v.x) * zoom / v.zoom, y: py - (py - v.y) * zoom / v.zoom }; }); }}>
        <div className="wb-legend"><span className="hierarchy">{text('계층', 'Hierarchy')}</span><span className="reference">{text('관측된 읽기 참조', 'Observed message reads')}</span><small>{compactKey ? text('보이는 항목 자동 정렬 · 드래그 배치는 이 보기에서만 유지', 'Visible items auto-arranged · drag placement stays in this view') : text('제목을 끌어 배치 · 이 컴퓨터에 저장', 'Drag project headers to arrange · saved on this computer')}</small></div>
        {!data ? <p className="wb-empty">{text('업무 현황을 불러오는 중…', 'Loading work status…')}</p> : !layout?.groups.length ? <p className="wb-empty">{text('표시할 세션이 없습니다.', 'No matching sessions.')}</p> : <div className="wb-world" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {layout.groups.map(g => {
            const members = data.sessions.filter(s => s.projectId === g.id), c = boardCounts(members, allItems), folded = collapsedProjects.has(g.id);
            const rows = nodes.filter(n => n.session.projectId === g.id);
            return <section className={`wb-project ${folded ? 'collapsed' : ''} ${projectPreview?.id === g.id ? 'dragging' : ''}`} key={g.id} data-project-id={g.id} style={{ left: g.x, top: g.y, width: g.width, height: folded ? BOARD_CARD.header : g.height }}>
              <button className="wb-project-header" aria-expanded={!folded} title={text('드래그: 이동 · 클릭: 접기·펼치기 · 더블클릭: 확대', 'Drag to move · click to fold · double-click to zoom')}
                onPointerDown={e => { if (e.button !== 0) return; e.stopPropagation(); suppressProjectClick.current = null;
                  projectDrag.current = { id: g.id, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, x: g.x, y: g.y, zoom: view.zoom, point: { x: g.x, y: g.y }, moved: false };
                  e.currentTarget.setPointerCapture(e.pointerId); }}
                onPointerMove={moveProject} onPointerUp={endProjectDrag} onPointerCancel={cancelProjectDrag}
                onLostPointerCapture={() => { if (projectDrag.current?.id === g.id) cancelProjectDrag(); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') suppressProjectClick.current = null; }}
                onClick={e => { if (suppressProjectClick.current === g.id) { suppressProjectClick.current = null; return; }
                  foldOnClick(`project:${g.id}`, e.detail, () => setCollapsedProjects(current => { const next = new Set(current); if (!next.delete(g.id)) next.add(g.id); return next; })); }}
                onDoubleClick={() => zoomTo(`project:${g.id}`, { ...g, height: folded ? BOARD_CARD.header : boardProjectHeight(g.rows) }, 1.25)}>
                <span className="wb-project-name"><BoardIcon name="folder"/><strong title={g.name}>{g.name}</strong><BoardIcon name="chevron"/></span>
                <span className="wb-project-counts"><span>{members.length} {text('세션', 'sessions')}</span>{c.working > 0 && <span data-state="working">{text('작업 중', 'Working')} {c.working}</span>}{c.background > 0 && <span data-state="background">{text('백그라운드', 'Background')} {c.background}</span>}{c.questions > 0 && <span data-state="waiting">{text('질문', 'Questions')} {c.questions}</span>}{c.errors > 0 && <span data-state="failed">{text('오류', 'Errors')} {c.errors}</span>}{c.results > 0 && <span data-state="review">{text('결과', 'Results')} {c.results}</span>}</span>
              </button>
              {!folded && <><div className="wb-project-body" data-scroll-project={g.id} ref={element => { if (element) { projectBodies.current.set(g.id, element); element.scrollTop = groupScroll[g.id] || 0; } else projectBodies.current.delete(g.id); }}
                style={{ top: BOARD_CARD.header, height: g.bodyHeight }} onScroll={e => { const top = e.currentTarget.scrollTop; setGroupScroll(current => ({ ...current, [g.id]: top })); }}
                onWheel={e => { if (!e.ctrlKey && g.rows > BOARD_CARD.visibleRows) e.stopPropagation(); }}
                aria-label={`${g.name} · ${text('세션 목록', 'Sessions')}`} tabIndex={g.rows > BOARD_CARD.visibleRows ? 0 : undefined}>
                <div className="wb-project-content" style={{ height: g.rows * BOARD_CARD.row + BOARD_CARD.padding * 2 }}>
                  <svg className="wb-edges wb-session-edges" width={g.width} height={g.rows * BOARD_CARD.row + BOARD_CARD.padding * 2} aria-hidden="true">{[...(connections.internal.get(g.id) || [])].map(([id, route]) => <path key={id} data-delegated={delegationEdges.has(id) || undefined} d={route.path}/>)}</svg>
                  {rows.map(n => {
                    const session = n.session, results = itemsBySession.get(session.id)?.filter(i => i.kind === 'result').length || 0, displayState = boardDisplayState(session, results);
                    const sessionFolded = collapsed.has(session.id), key = `session:${session.id}`;
                    const zoomToSession = () => zoomTo(key, { ...n, y: n.y - (projectBodies.current.get(g.id)?.scrollTop ?? groupScroll[g.id] ?? 0) }, 1.5);
                    return <div key={session.id} data-session-id={session.id} className={`wb-node ${session.runtime !== 'running' || ['idle', 'responded', 'paused', 'interrupted'].includes(displayState) ? 'inactive' : ''} ${displayState === 'background' ? 'has-background-work' : ''} ${selected?.sessionId === session.id ? 'selected' : ''} ${highlighted.has(session.id) ? '' : 'dimmed'} ${sessionDragging === session.id ? 'dragging-session' : ''}`} data-state={displayState} data-drop={sessionDrop?.id === session.id ? sessionDrop.after ? 'after' : 'before' : undefined} style={{ left: n.x - g.x, top: n.y - g.y - BOARD_CARD.header, width: n.width, height: n.height }}
                      onContextMenu={e => { e.preventDefault(); showSessionMenu(session.id, e.clientX, e.clientY, e.currentTarget?.querySelector<HTMLButtonElement>('.wb-node-menu')); }}
                      onDragOver={e => { if (!sessionDrag.current || !canReorderBoardSession(data.sessions, sessionDrag.current, session.id)) return;
                        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect(); setSessionDrop({ id: session.id, after: e.clientY > rect.top + rect.height / 2 }); }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSessionDrop(null); }}
                      onDrop={e => { if (!sessionDrag.current) return; e.preventDefault(); e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect(); moveSessionOrder(sessionDrag.current, session.id, e.clientY > rect.top + rect.height / 2);
                        sessionDrag.current = null; setSessionDragging(null); setSessionDrop(null);
                      }}>
              <button className="wb-node-drag" draggable aria-label={`${session.name} · ${text('세션 순서 이동', 'Reorder session')}`} title={text('같은 부모 아래에서 순서 변경 · 드래그 또는 ↑↓ 키', 'Reorder under the same parent · drag or use ↑↓ keys')}
                onKeyDown={e => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault(); e.stopPropagation();
                  const rank = new Map(sessionOrder.map((id, i) => [id, i]));
                  const siblings = data.sessions.filter(s => visibleSessionIds.has(s.id) && (s.id === session.id || canReorderBoardSession(data.sessions, session.id, s.id))).sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
                  const target = siblings[siblings.findIndex(s => s.id === session.id) + (e.key === 'ArrowUp' ? -1 : 1)];
                  if (target) moveSessionOrder(session.id, target.id, e.key === 'ArrowDown'); }}
                onPointerDown={e => { if (e.button !== 1) e.stopPropagation(); }} onDragStart={e => { e.stopPropagation(); sessionDrag.current = session.id; setSessionDragging(session.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-acedia-board-session', session.id); }}
                onDragEnd={() => { sessionDrag.current = null; setSessionDragging(null); setSessionDrop(null); }}>⠿</button>
              <button className="wb-node-open" aria-expanded={n.children ? !sessionFolded : undefined}
                title={n.children ? text('클릭: 자식 세션 접기·펼치기 · 더블클릭: 확대', 'Click to fold child sessions · double-click to zoom') : text('더블클릭: 세션 확대', 'Double-click to zoom')}
                onClick={e => {
                  if (n.children) foldOnClick(key, e.detail, () => setCollapsed(current => { const next = new Set(current); if (!next.delete(session.id)) next.add(session.id); return next; }));
                  else if (e.detail === 0) zoomToSession();
                }} onDoubleClick={zoomToSession}>
                <StateIcon state={displayState}/><span className="wb-node-copy"><span className="wb-node-top"><span className="wb-node-title"><ProviderLogo toolId={session.provider}/><strong title={session.name}>{session.name}</strong></span><span className="wb-status-badge" data-state={displayState} title={text(...labels[displayState])}>{text(...labels[displayState])}</span></span><small title={step(session)}>{step(session)}{session.runtime === 'sleeping' && ' · Sleeping'}{session.state === 'working' && elapsed(session.startedAt, sampledAt) && ` · ${elapsed(session.startedAt, sampledAt)}`}</small>
                  {results > 0 && <span className="wb-node-extra"><span className="wb-result-badge">{text('미확인 결과', 'Results')} {results}</span></span>}</span>
                {(transfersBySession.get(session.id) || []).slice(-1).map(t => <span key={t.id} className="wb-transfer-badge" data-status={t.status} title={`${t.from === session.id ? '→' : '←'} ${sessionsById.get(t.from === session.id ? t.to : t.from)?.name} · ${text(...boardTransferLabel(t))}${t.reason ? ` · ${t.reason}` : ''}`}>{t.from === session.id ? '→' : '←'} {text(...boardTransferLabel(t))}</span>)}
                {n.children > 0 && <span className="wb-collapse" aria-hidden="true">{sessionFolded ? '+' : '−'} {n.children}</span>}
              </button>
              <button className="wb-node-menu" aria-haspopup="menu" aria-expanded={menu?.id === session.id}
                aria-label={`${session.name} · ${text('세션 메뉴', 'Session menu')}`} title={text('세션 메뉴', 'Session menu')}
                onClick={e => { const rect = e.currentTarget.getBoundingClientRect(); showSessionMenu(session.id, rect.left, rect.bottom, e.currentTarget); }}>⋯</button>
                    </div>;
                  })}
                </div>
              </div>{g.rows > BOARD_CARD.visibleRows && <div className="wb-project-scroll-hint">{text('카드 안에서 스크롤하여 전체 세션 보기', 'Scroll inside this card for all sessions')} · {g.rows}</div>}</>}
            </section>;
          })}
          <svg className="wb-edges wb-project-edges" width={layout.width} height={layout.height} aria-hidden="true">{layout.projectEdges.map(edge => {
            const route = connections.routes.get(`project:${edge.from}:${edge.to}`);
            return route ? <path key={`${edge.from}:${edge.to}`} data-edge-kind="project" data-from={edge.from} data-to={edge.to} d={route.path}/> : null;
          })}{layout.edges.map(edge => {
            const route = connections.routes.get(`session:${edge.from}:${edge.to}`);
            return route ? <path key={`session:${edge.from}:${edge.to}`} data-delegated={delegationEdges.has(`${edge.from}:${edge.to}`) || undefined} data-edge-kind="session" data-from={edge.from} data-to={edge.to} d={route.path}/> : null;
          })}</svg>
          <svg className="wb-reference-edges" width={layout.width} height={layout.height} aria-label={text('세션 간 관측된 참조', 'Observed session references')}>
            <defs><marker id="wb-reference-arrow" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10Z"/></marker></defs>
            {data.references?.map(r => {
              const route = connections.routes.get(`read:${r.id}`); if (!route) return null;
              const description = `${sessionsById.get(r.from)?.name} → ${sessionsById.get(r.to)?.name} · ${text('수신함 기록 읽기', 'Message read')}`;
              const d = route.path;
              return <g key={r.id} tabIndex={0} role="button" aria-label={description} data-active={r.active} className={selected && ![r.from, r.to].includes(selected.sessionId) ? 'dimmed' : ''}
                onClick={e => { inboxScroll.current = inspector.current?.scrollTop || 0; returnFocus.current = e.currentTarget; setSelected(null); setSelectedReference(r.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inboxScroll.current = inspector.current?.scrollTop || 0; returnFocus.current = e.currentTarget; setSelected(null); setSelectedReference(r.id); } }}><title>{description}</title><path className="wb-ref-hit" d={d}/><path className="wb-ref-line" d={d} markerEnd="url(#wb-reference-arrow)"/></g>;
            })}
          </svg>
        </div>}
      </div><div className="wb-controls" hidden={viewMode !== 'board'}><div className="wb-zoom"><button aria-label={text('축소', 'Zoom out')} onClick={() => setView(v => ({ ...v, zoom: Math.max(.2, v.zoom - .1) }))}>−</button><span>{Math.round(view.zoom * 100)}%</span><button aria-label={text('확대', 'Zoom in')} onClick={() => setView(v => ({ ...v, zoom: Math.min(2, v.zoom + .1) }))}>＋</button><button onClick={fit}>{text('전체 보기', 'Fit board')}</button><button onClick={() => { cancelProjectDrag(); for (const key of foldClicks.current.keys()) cancelFold(key); setCollapsed(new Set()); setCollapsedProjects(new Set()); }}>{text('모두 펼치기', 'Expand all')}</button>
        <button disabled={!Object.keys(placementPositions).length && !sessionOrder.length} onClick={() => { cancelProjectDrag(); if (compactKey) setCompactPlacement({ key: compactKey, positions: {} }); else setProjectPositions({}); setSessionOrder([]); savePlacement({ projectPositions: compactKey ? projectPositions : {}, sessionOrder: [] }); resetView.current = true; }}>{text('배치 초기화', 'Reset layout')}</button></div>
        <button className="wb-align" disabled={!data?.sessions.length} title={text('한 번 정렬합니다. 답변 필요·실행·하위 작업 대기 순으로 부모 트리를 유지해 정렬하고 이후 수동 배치를 보존합니다.', 'Arrange once by attention, execution and background wait, preserving parent trees. Later manual placement is retained.')}
          onClick={() => { if (!data) return; cancelProjectDrag(); const order = boardPriorityOrder(data.sessions, allItems, sessionOrder);
            if (compactKey) { setCompactPlacement({ key: compactKey, positions: {} }); savePlacement({ projectPositions, sessionOrder: order }); }
            else { const automatic = boardLayout(data, { collapsed, sessionOrder: order }), positions = Object.fromEntries(automatic.groups.map(g => [g.id, { x: g.x, y: g.y }])); setProjectPositions(positions); savePlacement({ projectPositions: positions, sessionOrder: order }); }
            setSessionOrder(order); resetView.current = true; }}>{text('업무순 정렬', 'Align by work')}</button>
        <span className="wb-placement-status" role="status" data-status={placementStatus}>{placementStatus === 'saving' ? text('배치 저장 중…', 'Saving layout…') : placementStatus === 'failed' ? text('배치 저장 실패', 'Layout save failed') : compactKey ? text('보이는 항목 기준 자동 정렬', 'Auto-arranged for visible items') : text('이 컴퓨터에 배치 저장', 'Layout saved on this computer')}{placementStatus === 'failed' && <button onClick={() => savePlacement({ projectPositions, sessionOrder })}>{text('다시 저장', 'Retry save')}</button>}</span>
        {viewMode === 'board' && motionSwitch}</div>
      <div className="wb-device-strip"><span>{text('컴퓨터 사용', 'Computer activity')}</span>{!data?.devices.length ? <small>{text('현재 수신된 사용 신호 없음', 'No current activity signals')}</small> : data.devices.map((device, i) => <button key={`${device.sessionId}:${i}`} onClick={() => choose(device.sessionId)}>{device.kind === 'desktop' ? '🖱' : '🌐'} {sessionsById.get(device.sessionId)?.name} · {device.tool}{device.state === 'unconfirmed' ? ` · ${text('종료 신호 확인 필요', 'Awaiting end signal')}` : ''}</button>)}</div>
    </section>
    <aside className="wb-inspector" ref={inspector} aria-label={text('내 확인', 'Your attention')}>
      {reference ? <div className="wb-detail"><button className="wb-back" onClick={back}>← {text('목록으로', 'Back to list')}</button><small>{text('관측된 읽기 참조', 'Observed reference')}</small><h2>{sessionsById.get(reference.from)?.name} → {sessionsById.get(reference.to)?.name}</h2><p>{reference.active ? text('실제 수신함 읽기 진행 중', 'Reading message records') : text('읽기 종료 · 마지막 관측 기록', 'Read ended · last observation')}</p><p>{text('참조 대상의 실행 상태는 바뀌지 않습니다.', 'Reading does not start the target session.')}</p><dl><dt>{text('관측 범위', 'Evidence')}</dt><dd>acedia_session_message_receive</dd><dt>{text('시작', 'Started')}</dt><dd>{new Date(reference.startedAt).toLocaleString()}</dd>{reference.endedAt && <><dt>{text('종료', 'Ended')}</dt><dd>{new Date(reference.endedAt).toLocaleString()}</dd></>}</dl><button onClick={() => locate(reference.to)}>{text('참조 대상을 보드에서 찾기', 'Locate target')}</button></div>
      : selectedSession ? <div className="wb-detail"><button className="wb-back" onClick={back}>← {text('내 확인 목록', 'Back to inbox')}</button><small>{data?.projects.find(p => p.id === selectedSession.projectId)?.name}</small><h2>{selectedSession.name}</h2>
        <div className="wb-detail-state"><StateIcon state={boardDisplayState(selectedSession, itemsBySession.get(selectedSession.id)?.filter(i => i.kind === 'result').length || 0)}/><strong>{text(...labels[boardDisplayState(selectedSession, itemsBySession.get(selectedSession.id)?.filter(i => i.kind === 'result').length || 0)])}</strong><span>{selectedSession.runtime === 'sleeping' ? 'Sleeping' : selectedSession.runtime}</span></div>
        <p className="wb-copy">{step(selectedSession)}</p><button className="wb-locate" onClick={() => locate(selectedSession.id)}>{text('보드에서 찾기', 'Locate on board')}</button>
        {!!transfersBySession.get(selectedSession.id)?.length && <section className="wb-transfers"><h3>{text('업무 전달', 'Handoffs')}</h3>{[...(transfersBySession.get(selectedSession.id) || [])].reverse().slice(0, 8).map(t => <p key={t.id} data-status={t.status}>
          <button onClick={() => { choose(t.to); setSelectedTransferId(t.id); }}>{t.from === selectedSession.id ? '→' : '←'} {sessionsById.get(t.from === selectedSession.id ? t.to : t.from)?.name} · {text(...transferTitle(t, sessionsById.get(t.from)?.name || text('이전 세션', 'Former session')))}
            {t.summary?.trim() && <small>{t.savedAt ? new Date(t.savedAt).toLocaleString() : ''} · #{t.id.slice(0, 8)}</small>}</button><br/>{text(...boardTransferLabel(t))}{t.reason && <small> · {t.reason}</small>}</p>)}</section>}
        {selectedTransfer && <BoardRequestDetail transfer={selectedTransfer} sender={sessionsById.get(selectedTransfer.from)?.name || text('이전 세션', 'Former session')} receiver={selectedSession.name}/>}
        {selectedTransferId && !selectedTransfer && <p role="status">{text('선택한 전달 기록이 목록 범위를 벗어났습니다. 업무 전달 표에서 다시 선택하세요.', 'The selected handoff is no longer in this snapshot. Select a record from Handoffs.')}</p>}
        {selectedItem ? <article className="wb-result-detail"><span className="wb-detail-kind"><StateIcon state={selectedItem.kind}/>{text(...kinds[selectedItem.kind])}</span><h3>{selectedItem.kind === 'result' ? text('선택한 결과', 'Selected result') : actionLabel(selectedItem)}</h3><time>{new Date(selectedItem.createdAt).toLocaleString()}</time><p className="wb-copy">{selectedItem.summary || text('요약이 없습니다. 세션 대화에서 확인해 주세요.', 'Open the conversation for details.')}</p>
          {selectedItem.kind === 'result' && <><small>{selectedItem.scope === 'task' ? text('업무 검증 완료 결과', 'Verified task result') : selectedItem.scope === 'partial' ? text('부분 결과 · 업무 검증 전', 'Partial result · not verified') : text('응답 종료 결과 · 전체 업무 완료 판정 아님', 'Response result · not task verification')}</small><button className="wb-primary" disabled={busy || !!data?.storageError || !allItems.some(i => i.id === selectedItem.id)} onClick={() => { void acknowledge(selectedItem); }}>✓ {allItems.some(i => i.id === selectedItem.id) ? text('확인했어요', 'Reviewed') : text('확인 완료', 'Read')}</button><small>{text('이 결과 한 개만 확인 처리합니다. 승인·배포·세션 실행과는 무관합니다.', 'Reviews only this result; does not approve, publish or run work.')}</small></>}
          {!!selectedItem.artifacts?.length && <div className="wb-artifacts"><h3>{text('제출된 산출물', 'Submitted artifacts')}</h3>{selectedItem.artifacts.map((file, index) => <p className="wb-copy" key={index}>{file}</p>)}<small>{text('파일 열기·다운로드는 세션 대화에서 이용하세요.', 'Open or download these files in the conversation.')}</small></div>}
          {selectedItem.kind === 'question' && <button className="wb-primary" disabled={busy} onClick={() => { void open(selectedSession.id, true); }}>{text('세션에서 답변하기', 'Answer in session')}</button>}
          {selectedItem.kind === 'error' && <button disabled={busy || !!data?.storageError} onClick={() => { void acknowledge(selectedItem); }}>{text('이 오류 알림 정리', 'Dismiss this error notice')}</button>}
        </article> : selected?.itemId ? <p>{text('이 항목은 확인 또는 해결되었습니다.', 'This item was reviewed or resolved.')}</p> : <><h3>{text('미확인 항목', 'Unreviewed items')}</h3>{(itemsBySession.get(selectedSession.id) || []).map(item => <button className="wb-session-item" key={item.id} onClick={() => choose(selectedSession.id, item.id)}><StateIcon state={item.kind}/><span>{item.summary || text(...kinds[item.kind])}</span></button>)}{!itemsBySession.get(selectedSession.id)?.length && <p>{text('확인할 새 항목이 없습니다.', 'No new items to review.')}</p>}</>}
        <div className="wb-actions"><button disabled={busy} onClick={() => { void open(selectedSession.id); }}>{text('세션 대화 열기', 'Open conversation')}</button><button disabled={busy} onClick={() => { void open(selectedSession.id, true); }}>{text('추가 지시 작성', 'Write follow-up')}</button></div>
        <dl><dt>{text('부모 세션 · 조직 관계', 'Parent session · organization')}</dt><dd>{sessionsById.get(selectedSession.parentId || '')?.name || text('독립 세션', 'Independent session')}</dd><dt>{text('실행 모델', 'Running model')}</dt><dd>{selectedSession.model ? [selectedSession.model.model, selectedSession.model.effort, selectedSession.model.serviceTier].filter(Boolean).join(' · ') : text('미확인', 'Unknown')}</dd><dt>{text('사용 계정', 'Account')}</dt><dd>{selectedSession.accountLabel || text('미확인', 'Unknown')}</dd><dt>{text('실행 경과', 'Execution elapsed')}</dt><dd>{elapsed(selectedSession.startedAt, ['working', 'background'].includes(selectedSession.state) && connected ? sampledAt : selectedSession.lastActivityAt || selectedSession.updatedAt) || '—'}</dd><dt>{text('마지막 활동', 'Last activity')}</dt><dd>{selectedSession.lastActivityAt ? new Date(selectedSession.lastActivityAt).toLocaleString() : '—'}</dd><dt>{text('내부 이름', 'Internal name')}</dt><dd>{selectedSession.name}</dd><dt>{text('작업 폴더', 'Working folder')}</dt><dd>{selectedSession.folder}</dd></dl>
      </div> : <><header className="wb-inbox-heading"><BoardIcon name="inbox"/><h2>{text('내 확인', 'Your attention')}</h2><b>{counts.attention}</b></header><p className="wb-inbox-description">{text('답변하거나 확인해야 할 일을 모았어요.', 'Questions, errors and results that need your attention.')}</p><nav className="wb-inbox-filters" aria-label={text('확인 유형', 'Attention type')}>{(['all', 'question', 'error', 'result'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setWorkingOnly(false); setBackgroundOnly(false); }}>{k === 'all' ? text('전체', 'All') : text(...kinds[k])} <b>{k === 'all' ? counts.attention : k === 'question' ? counts.questions : k === 'error' ? counts.errors : counts.results}</b></button>)}</nav>
        <div className="wb-inbox-list">{inbox.slice(0, visibleCount).map(item => {
          const s = sessionsById.get(item.sessionId)!, time = itemTime(item.createdAt); return <article key={item.id} className="wb-inbox-item" data-kind={item.kind}><div className="wb-inbox-item-top"><StateIcon state={item.kind}/><strong>{s.name}</strong><span data-state={item.kind}>{text(...kinds[item.kind])}</span></div><p>{item.summary || text(...kinds[item.kind])}</p><time dateTime={time.dateTime}>{time.label}</time><div className="wb-inbox-item-bottom"><small>{data?.projects.find(p => p.id === s.projectId)?.name}</small><button data-item-id={item.id} onClick={e => choose(s.id, item.id, e.currentTarget)}>{actionLabel(item)} ›</button></div></article>;
        })}{inbox.length > visibleCount && <button onClick={() => setVisibleCount(n => n + 50)}>{text('더 보기', 'Show more')} · {inbox.length - visibleCount}</button>}{!inbox.length && <div className="wb-inbox-empty"><span>✓</span><p>{query ? text('검색과 일치하는 항목이 없습니다.', 'No matching items.') : text('확인할 새 항목이 없습니다.', 'Nothing needs your attention.')}</p></div>}</div><p className="wb-inbox-help">{text('결과나 대화를 열면 기존 결과를 확인 처리합니다. 이후 새 결과와 질문은 유지합니다.', 'Opening a result or conversation marks captured results read; later results and questions remain.')}</p></>}
    </aside></div>
    {menu && sessionsById.has(menu.id) && <div ref={menuPanel} className="wb-context-menu" role="menu" aria-label={text('세션 메뉴', 'Session menu')} style={{ left: menu.x, top: menu.y }}>
      <strong>{sessionsById.get(menu.id)?.name}</strong>
      <button role="menuitem" onClick={() => { setMenu(null); choose(menu.id, undefined, menuTrigger.current ?? undefined); }}>{text('세션 세부정보', 'Session details')}</button>
      <button role="menuitem" onClick={() => { setMenu(null); void open(menu.id); }}>{text('세션 대화 열기', 'Open conversation')}</button>
      <SessionLifecycleButton key={menu.id} id={menu.id} active={sessionsById.get(menu.id)?.runtime === 'running'} onSuccess={() => { setMenu(null); void refreshRef.current(); }} onError={setError}/>
      <button role="menuitem" onClick={() => manageSession({ id: menu.id, action: 'properties' })}>{text('세션 속성', 'Session properties')}</button>
      <button role="menuitem" onClick={() => manageSession({ id: menu.id, action: 'rename' })}>{text('이름 변경', 'Rename')}</button>
      <button role="menuitem" disabled={busy || !!data?.storageError || !menu.results.length} onClick={() => { void reviewSession(menu.id, menu.results); }}>{text('현재 결과 확인완료', 'Mark current results read')} · {menu.results.length}</button>
      <button role="menuitem" className="wb-delete-session" onClick={() => manageSession({ id: menu.id, action: 'delete' })}>{text('세션 삭제…', 'Delete session…')}</button>
      <button role="menuitem" onClick={closeSessionMenu}>{text('닫기', 'Close')}</button></div>}
    <footer className="wb-footer" hidden={viewMode === 'office'}><span><StateIcon state="working" active={false}/>{text('작업 중에만 회전', 'Spin only during execution')}</span><span className="wb-ref-legend">{text('보라색: 읽기 참조 · 밝기 강조: 하달 진행 중', 'Purple: observed reads · glow: outstanding delegation')}</span><span>{text('이전 미확인 결과는 새 작업과 함께 유지', 'Earlier results remain during new work')}</span><small>{text('참조 관측: Acedia 메시지 수신함 · 일반 파일/외부 도구의 내부 참조는 알 수 없음', 'Read evidence: Acedia inbox; external/internal file references are not inferred')}</small></footer>
  </main>;
}
