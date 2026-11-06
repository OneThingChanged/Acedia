import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { boardLayout, type BoardSnapshot, type BoardState } from '../lib/workBoard';
import './ProjectBoardPage.css';
import { ProviderLogo } from './ProviderLogo';

const labels: Record<BoardState, [string, string]> = { idle: ['대기', 'Idle'], working: ['진행 중', 'Working'], waiting: ['응답·승인 필요', 'Response needed'],
  review: ['결과 확인 필요', 'Result ready'], completed: ['완료', 'Completed'], interrupted: ['중단됨', 'Interrupted'], failed: ['실패·막힘', 'Failed / blocked'],
  unknown: ['상태 확인 필요', 'Check status'], planned: ['배정 대기', 'Planned'] };
export function ProjectBoardPage({ initialSnapshot }: { initialSnapshot?: BoardSnapshot } = {}) {
  const { text } = useAppLanguage();
  const [data, setData] = useState<BoardSnapshot | null>(initialSnapshot || null), [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null), [projectId, setProject] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [view, setView] = useState({ zoom: .8, x: 24, y: 24 });
  const [busy, setBusy] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null), revision = useRef<string | undefined>(undefined), initialized = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let stopped = false, loading = false;
    const refresh = async () => {
      if (loading || stopped || document.hidden) return;
      loading = true;
      try {
        const result = await invoke<BoardSnapshot & { unchanged?: boolean }>('project_board_snapshot', { revision: revision.current });
        if (stopped) return;
        if (!result.unchanged) {
          revision.current = result.revision; setData(result);
          if (!initialized.current) {
            initialized.current = true;
            const p = result.preferences;
            setView({ zoom: p.zoom ?? .8, x: p.x ?? 24, y: p.y ?? 24 }); setCollapsed(new Set(p.collapsed || [])); setProject(p.projectId || '');
          }
        }
        setError('');
      } catch (reason) { if (!stopped) setError(String(reason)); }
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
    const timer = setTimeout(() => { void invoke('project_board_preferences', { preferences: { ...view, collapsed: [...collapsed], projectId } }).catch(reason => setError(String(reason))); }, 500);
    return () => clearTimeout(timer);
  }, [view, collapsed, projectId]);
  const layout = useMemo(() => data ? boardLayout(data, { projectId, query, filter, collapsed }) : null, [data, projectId, query, filter, collapsed]);
  const nodeById = useMemo(() => new Map(layout?.nodes.map(n => [n.session.id, n])), [layout]);
  useEffect(() => {
    if (data && projectId && !data.projects.some(p => p.id === projectId)) setProject('');
  }, [data, projectId]);
  useEffect(() => {
    if (!pendingFocus) return;
    const node = nodeById.get(pendingFocus), rect = viewport.current?.getBoundingClientRect();
    if (node && rect) setView(v => ({ ...v, x: rect.width / 2 - (node.x + 125) * v.zoom, y: rect.height / 2 - (node.y + 50) * v.zoom }));
    setPendingFocus(null);
  }, [pendingFocus, nodeById]);
  const session = data?.sessions.find(s => s.id === selected);
  const inbox = data?.sessions.filter(s => s.needsAttention && (!projectId || s.projectId === projectId)).sort((a, b) => (
    Number(b.state === 'waiting') - Number(a.state === 'waiting') || b.updatedAt - a.updatedAt)) || [];
  const open = useCallback(async (id: string, compose = false) => {
    if (busy) return; setBusy(true);
    try { await invoke('project_board_open_session', { id, compose }); } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }, [busy]);
  const fit = () => {
    const rect = viewport.current?.getBoundingClientRect();
    if (rect && layout) setView({ zoom: Math.max(.2, Math.min(1, (rect.width - 48) / layout.width, (rect.height - 48) / layout.height)), x: 24, y: 24 });
  };
  const pick = (id: string, locate = false) => {
    setSelected(id);
    if (locate) {
      setQuery(''); setFilter('all'); setCollapsed(new Set());
      const s = data?.sessions.find(item => item.id === id);
      if (s && projectId && s.projectId !== projectId) setProject(s.projectId);
      setPendingFocus(id);
    }
  };
  const acknowledge = async () => {
    if (!session || busy) return; setBusy(true);
    try { const result = await invoke<BoardSnapshot>('project_board_ack', { id: session.id, fingerprint: session.fingerprint }); revision.current = result.revision; setData(result); }
    catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  };
  return <main className="work-board-page">
    <header className="wb-header"><div><small>Acedia</small><h1>{text('프로젝트 보드', 'Project Board')}</h1></div><select aria-label={text('프로젝트 선택', 'Select project')} value={projectId} onChange={e => setProject(e.target.value)}><option value="">{text('전체 프로젝트', 'All projects')}</option>{data?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={text('프로젝트·세션·경로 검색', 'Search projects, sessions or paths')} aria-label={text('보드 검색', 'Search board')}/><button onClick={() => { void refreshRef.current(); }}>{text('새로고침', 'Refresh')}</button></header>
    <nav className="wb-filters" aria-label={text('업무 상태', 'Work status')}>{[['all', text('전체', 'All')], ['attention', text('내 확인 필요', 'Needs your attention')], ...Object.entries(labels).filter(([s]) => s !== 'idle' && s !== 'planned').map(([s, label]) => [s, text(...label)])].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<b>{data?.sessions.filter(s => (!projectId || s.projectId === projectId) && (key === 'all' || (key === 'attention' ? s.needsAttention : s.state === key))).length || 0}</b></button>)}</nav>
    <div className="wb-devices" aria-live="polite"><strong>{text('컴퓨터 사용', 'Computer activity')}</strong>{!data?.devices.length ? <span>{text('현재 수신된 사용 신호 없음', 'No current activity signals')}</span> : data.devices.map((device, i) => {
      const s = data.sessions.find(s => s.id === device.sessionId), p = data.projects.find(p => p.id === s?.projectId);
      return <button key={`${device.sessionId}:${i}`} disabled={busy} onClick={() => { void open(device.sessionId); }}>{device.kind === 'desktop' ? '🖱' : '🌐'} {p?.name} / {s?.name} · {device.state === 'unconfirmed' ? text('종료 신호 확인 필요', 'Awaiting end signal') : text(device.kind === 'desktop' ? '데스크톱 조작 중' : '브라우저 작업 중', device.kind === 'desktop' ? 'Desktop interaction' : 'Browser activity')}<small>{device.tool}</small></button>;
    })}</div>
    {(error || data?.storageError) && <div role="alert" className="wb-error">{error || data?.storageError}</div>}
    <div className="wb-body"><section className="wb-canvas-wrap"><div className="wb-canvas" ref={viewport} tabIndex={0} aria-label={text('업무 노드 · 빈 공간 드래그로 이동', 'Work nodes · drag empty space to pan')}
      onPointerDown={e => { if (e.button !== 0 || (e.target as Element).closest('button')) return; drag.current = { x: e.clientX, y: e.clientY, left: view.x, top: view.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) setView(v => ({ ...v, x: drag.current!.left + e.clientX - drag.current!.x, y: drag.current!.top + e.clientY - drag.current!.y })); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onWheel={e => { const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; setView(v => { const zoom = Math.max(.2, Math.min(2, v.zoom * (e.deltaY > 0 ? .9 : 1.1))); return { zoom, x: px - (px - v.x) * zoom / v.zoom, y: py - (py - v.y) * zoom / v.zoom }; }); }}>
      {!data ? <p className="wb-empty">{error ? text('보드를 불러오지 못했습니다. 새로고침해 주세요.', 'Could not load the board. Refresh to retry.') : text('업무 현황을 불러오는 중…', 'Loading work status…')}</p> : !layout?.nodes.length ? <p className="wb-empty">{text('표시할 세션이 없습니다.', 'No matching sessions.')}</p> : <div className="wb-world" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        {layout.groups.map(p => <section className="wb-project" key={p.id} style={{ left: p.x, top: p.y, width: p.width, height: p.height }}><h2>{p.name}</h2></section>)}
        <svg className="wb-edges" width={layout.width} height={layout.height} aria-hidden="true">{layout.edges.map(edge => { const a = nodeById.get(edge.from), b = nodeById.get(edge.to); return a && b ? <path key={`${a.session.id}:${b.session.id}`} d={`M ${a.x + 248} ${a.y + 46} C ${a.x + 265} ${a.y + 46}, ${b.x - 15} ${b.y + 46}, ${b.x} ${b.y + 46}`}/> : null; })}</svg>
        {layout.nodes.map(n => <div key={n.session.id} className={`wb-node ${selected === n.session.id ? 'selected' : ''}`} data-state={n.session.state} style={{ left: n.x, top: n.y }}>
          <button className="wb-node-open" aria-pressed={selected === n.session.id} onClick={() => pick(n.session.id)} onDoubleClick={() => { void open(n.session.id); }}><span className="wb-node-title"><ProviderLogo toolId={n.session.provider}/>{n.session.needsAttention && <i aria-label={text('미확인', 'Unreviewed')}/>}<strong>{n.session.name}</strong></span><span>{text(...labels[n.session.state])}<small>{n.session.runtime === 'running' ? text('실행 중', 'Running') : n.session.runtime === 'sleeping' ? 'Sleeping' : text('종료·비활성', 'Stopped')}</small></span><small>{n.session.task?.title || n.session.provider}</small></button>
          {n.children > 0 && <button className="wb-collapse" aria-label={text('자식 세션 접기·펼치기', 'Collapse or expand child sessions')} onClick={() => setCollapsed(current => { const next = new Set(current); if (!next.delete(n.session.id)) next.add(n.session.id); return next; })}>{collapsed.has(n.session.id) ? '+' : '−'} {n.children}</button>}
        </div>)}
      </div>}
    </div><div className="wb-zoom"><button onClick={() => setView(v => ({ ...v, zoom: Math.max(.2, v.zoom - .1) }))}>−</button><span>{Math.round(view.zoom * 100)}%</span><button onClick={() => setView(v => ({ ...v, zoom: Math.min(2, v.zoom + .1) }))}>＋</button><button onClick={fit}>{text('전체 보기', 'Fit board')}</button><button onClick={() => setCollapsed(new Set())}>{text('모두 펼치기', 'Expand all')}</button><button onClick={() => setCollapsed(new Set(data?.sessions.filter(s => s.state === 'completed').map(s => s.id)))}>{text('완료 항목 접기', 'Collapse completed')}</button></div></section>
    <aside className="wb-inspector">{session ? <><header><small>{data?.projects.find(p => p.id === session.projectId)?.name}</small><h2>{session.name}</h2><button onClick={() => setSelected(null)}>{text('확인 목록으로', 'Back to inbox')}</button></header><p data-state={session.state}>{text(...labels[session.state])} · {session.runtime}</p>{session.updatedAt > 0 && <time>{new Date(session.updatedAt).toLocaleString()}</time>}{session.task && <h3>{session.task.title}</h3>}<p className="wb-copy">{session.summary || text('새 결과 요약이 아직 없습니다. 대화에서 자세히 확인할 수 있습니다.', 'No result summary yet. Open the conversation for details.')}</p>{session.reason && <p className="wb-copy">{session.reason}</p>}<p className="wb-folder">{session.folder}</p><div className="wb-actions"><button disabled={busy} onClick={() => { void open(session.id); }}>{text('대화 열기', 'Open conversation')}</button><button disabled={busy} onClick={() => { void open(session.id, true); }}>{text('추가 지시 작성', 'Write follow-up')}</button><button disabled={busy || !session.needsAttention || !!data?.storageError} onClick={() => { void acknowledge(); }}>{session.needsAttention ? text('확인 완료', 'Mark reviewed') : text('확인함', 'Reviewed')}</button></div><small>{text('결과 확인은 업무의 검증 통과나 세션 실행 상태를 바꾸지 않습니다.', 'Reviewing a result does not change task verification or session runtime.')}</small></> : <><header><h2>{text('내 확인 필요', 'Needs your attention')} <b>{inbox.length}</b></h2><p>{text('노드를 선택하면 요약을, 더블클릭하면 해당 대화를 엽니다.', 'Select a node for details. Double-click to open its conversation.')}</p></header>{inbox.map(s => <button className="wb-inbox-item" key={s.id} onClick={() => pick(s.id, true)} onDoubleClick={() => { void open(s.id); }}><strong>{s.name}</strong><span>{text(...labels[s.state])}</span><small>{data?.projects.find(p => p.id === s.projectId)?.name}</small></button>)}{!inbox.length && <p>{text('확인할 새 항목이 없습니다.', 'No new items to review.')}</p>}</>}</aside></div>
  </main>;
}
