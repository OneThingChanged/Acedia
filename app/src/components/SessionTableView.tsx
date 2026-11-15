import { Fragment, type ReactNode } from 'react';
import { useAppLanguage } from '../lib/appLanguage';
import { boardTransferLabel, type BoardSession, type BoardSnapshot, type BoardTransfer } from '../lib/workBoard';
import { latestIncoming, sessionTableMatches, sessionTableRows, transferTime } from '../lib/sessionTable';
import { ProviderLogo } from './ProviderLogo';
import './SessionTableView.css';

type Props = {
  data: BoardSnapshot; mode: 'sessions' | 'transfers'; projectId: string; query: string; visible: Set<string>;
  filterSession: (session: BoardSession) => boolean; selectedId?: string; selectedTransferId?: string | null;
  state: (session: BoardSession) => ReactNode; step: (session: BoardSession) => string;
  onChoose: (id: string, trigger: HTMLElement, transferId?: string) => void; onOpen: (id: string) => void;
};
export function SessionTableView({ data, mode, projectId, query, visible, filterSession, selectedId, selectedTransferId, state, step, onChoose, onOpen }: Props) {
  const { text } = useAppLanguage();
  const byId = new Map(data.sessions.map(s => [s.id, s]));
  const rows = sessionTableRows(data, visible, s => filterSession(s) && sessionTableMatches(data, s, query), projectId);
  const transfers = [...(data.transfers || [])].filter(t => {
    const s = byId.get(t.to); if (!s || !visible.has(s.id) || projectId && s.projectId !== projectId || !filterSession(s)) return false;
    const q = query.trim().toLowerCase().split('\\').join('/');
    return !q || [t.summary, byId.get(t.from)?.name, s.name, s.folder, data.projects.find(p => p.id === s.projectId)?.name].join(' ').toLowerCase().split('\\').join('/').includes(q);
  }).sort((a, b) => transferTime(b) - transferTime(a) || a.id.localeCompare(b.id));
  const time = (at?: number | null) => at && Number.isFinite(at) ? <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>{new Date(at).toLocaleString()}</time> : <span>—</span>;
  const source = (t?: BoardTransfer) => t ? byId.get(t.from)?.name || text('이전 세션', 'Former session') : text('출처 미기록', 'Source not recorded');
  const origin = (t?: BoardTransfer) => <><strong>{source(t)}</strong><small>{t ? text(...boardTransferLabel(t)) : text('수신 지시 기록 없음', 'No recorded incoming request')}</small></>;
  const identity = (s: BoardSession, t?: BoardTransfer, context = false) => <button type="button" className="st-identity" aria-pressed={selectedId === s.id && (mode === 'sessions' || selectedTransferId === t?.id)}
    onClick={e => onChoose(s.id, e.currentTarget, mode === 'transfers' ? t?.id : undefined)}>
    <ProviderLogo toolId={s.provider}/><span><strong>{mode === 'transfers' ? t?.summary || text('본문은 상세에서 확인', 'View request in details') : s.name}</strong>
      <small>{mode === 'transfers' ? s.name : s.task?.title || (t?.summary ? `${text('최근 수신', 'Last request')}: ${t.summary}` : step(s))}</small>
      {s.parentId && <small className="st-parent">↳ {byId.get(s.parentId)?.name || text('부모 세션', 'Parent session')}</small>}
      {context && <small className="st-context">{text('하위 세션의 부모 · 관계 표시', 'Parent context for a matching session')}</small>}
    </span></button>;
  const sessionRow = (s: BoardSession) => {
    const t = latestIncoming(data, s.id), context = !rows.direct.has(s.id);
    return <tr key={s.id} data-table-session-id={s.id} data-selected={selectedId === s.id} data-context={context}
      onClick={e => { if (!(e.target as Element).closest('button')) onChoose(s.id, e.currentTarget); }} onDoubleClick={() => onOpen(s.id)}>
      <td>{identity(s, t, context)}</td><td className="st-origin">{origin(t)}</td><td>{state(s)}<small>{step(s)}</small>{s.runtime !== 'running' && <small>{s.runtime === 'sleeping' ? 'Sleeping' : text('중지', 'Stopped')}</small>}</td><td>{time(s.lastActivityAt || s.updatedAt)}</td>
    </tr>;
  };
  return <section className="session-table-view" aria-label={text(mode === 'sessions' ? '프로젝트별 세션 표' : '업무 전달 표', mode === 'sessions' ? 'Sessions by project' : 'Handoff history')}>
    <div className="st-scroll" tabIndex={0} aria-label={text('표 가로·세로 스크롤', 'Scroll table')}><table>
      <thead><tr><th scope="col">{text(mode === 'sessions' ? '세션 · 업무' : '수신 업무', mode === 'sessions' ? 'Session · work' : 'Incoming request')}</th><th scope="col">{text(mode === 'sessions' ? '최근 요청 출처' : '요청자 → 수행 세션', mode === 'sessions' ? 'Last request sender' : 'Sender → receiver')}</th><th scope="col">{text(mode === 'sessions' ? '현재 상태' : '전달 상태', mode === 'sessions' ? 'Current state' : 'Delivery state')}</th><th scope="col">{text(mode === 'sessions' ? '마지막 활동' : '저장 시각', mode === 'sessions' ? 'Last activity' : 'Saved at')}</th></tr></thead>
      <tbody>{mode === 'sessions' ? data.projects.map(p => {
        const members = rows.sessions.filter(s => s.projectId === p.id); if (!members.length) return null;
        return <Fragment key={p.id}><tr className="st-project"><th scope="rowgroup" colSpan={4}><strong>{p.name}</strong><span>{members.length} {text('세션', 'sessions')}</span><small>{p.folder}</small></th></tr>{members.map(sessionRow)}</Fragment>;
      }) : transfers.map(t => {
        const s = byId.get(t.to)!;
        return <tr key={t.id} data-transfer-id={t.id} data-selected={selectedTransferId === t.id}
          onClick={e => { if (!(e.target as Element).closest('button')) onChoose(s.id, e.currentTarget, t.id); }} onDoubleClick={() => onOpen(s.id)}>
          <td>{identity(s, t)}<small className="st-project-label">{data.projects.find(p => p.id === s.projectId)?.name}</small></td>
          <td className="st-origin"><strong>{source(t)} → {s.name}</strong><small>{text(t.isMessage ? 'Acedia 세션 메시지' : '직접 전달', t.isMessage ? 'Acedia session message' : 'Direct handoff')}</small></td>
          <td><span className="st-delivery" data-status={t.status}>{text(...boardTransferLabel(t))}</span>{t.reason && <small>{t.reason}</small>}</td><td>{time(t.savedAt)}</td>
        </tr>;
      })}</tbody>
    </table>{!(mode === 'sessions' ? rows.sessions.length : transfers.length) && <p className="st-empty">{text('조건에 맞는 기록이 없습니다.', 'No records match these filters.')}</p>}</div>
    <footer className="st-note"><span>{text('단일 클릭 · 상세 / 더블 클릭 · 대화', 'Click for details · double-click for conversation')}</span><span>{text('Acedia 세션만 표시 · 부모는 조직 관계 · 최근 수신 지시는 현재 작업과 다를 수 있습니다.', 'Acedia sessions only · parents describe organization · the last request may differ from current work.')}</span></footer>
  </section>;
}
