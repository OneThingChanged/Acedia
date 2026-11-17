import { useEffect, useRef, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';
import { useNativeViewOcclusion } from '../hooks/useNativeViewOcclusion';
import type { RecoveryStatus } from '../lib/sessionRecovery';
import './SessionRecoveryPrompt.css';

export function SessionRecoveryPrompt({ enabled, onRestore, onOpenSession }: {
  enabled: boolean; onRestore: (checkpointId: string, ids: string[]) => Promise<unknown>; onOpenSession: (id: string) => void;
}) {
  const { text } = useAppLanguage();
  const [offer, setOffer] = useState<RecoveryStatus | null>(null), [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const acting = useRef(false);
  useNativeViewOcclusion(!!offer);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    void invoke<RecoveryStatus>('session_recovery', { action: 'offer' }).then(value => {
      if (!stopped && (value.activeCount || value.error)) setOffer(value);
    }).catch(() => { if (!stopped) setError(text('이전 실행 상태를 확인하지 못했습니다.', 'Could not read the previous session state.')); });
    return () => { stopped = true; };
  }, [enabled]);
  useEffect(() => {
    if (!status?.checkpointId || !status.sessions.some(r => ['pending', 'launching', 'waiting-ready'].includes(r.state))) return;
    let stopped = false;
    const poll = async () => {
      try { const next = await invoke<RecoveryStatus>('session_recovery', { action: 'status' }); if (!stopped) setStatus(next); }
      catch { if (!stopped) setError(text('복구 상태를 확인하지 못했습니다.', 'Could not check recovery progress.')); }
    };
    const timer = setInterval(() => { void poll(); }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [status?.checkpointId, status?.sessions.some(r => ['pending', 'launching', 'waiting-ready'].includes(r.state))]);
  const decide = async (restore: boolean) => {
    if (acting.current || !offer) return;
    if (!offer.checkpointId) { setOffer(null); return; }
    acting.current = true; setBusy(true); setError('');
    try {
      const result = await invoke<RecoveryStatus & { sessionIds: string[] }>('session_recovery', { action: 'decide', checkpointId: offer.checkpointId, restore });
      if (!restore) { setOffer(null); return; }
      setStatus(result); setOffer(null);
      await onRestore(offer.checkpointId, result.sessionIds);
      setStatus(await invoke<RecoveryStatus>('session_recovery', { action: 'status' }));
    } catch { setError(text('일부 세션을 복구하지 못했습니다. 기존 세션을 확인해 주세요.', 'Some sessions could not be restored. Check the existing sessions.')); }
    finally { acting.current = false; setBusy(false); }
  };
  const waiting = status?.sessions.filter(r => ['pending', 'launching', 'waiting-ready'].includes(r.state)).length || 0;
  const attention = status?.sessions.filter(r => ['needs-attention', 'uncertain', 'skipped'].includes(r.state)) || [];
  const reason = (value: string | null) => value === 'startup-timeout' ? text('시작 준비 시간 초과', 'Startup timed out')
    : value === 'question-or-login-pending' ? text('로그인·질문 확인 필요', 'Login or question needs attention')
    : value === 'input-already-provided' || value === 'already-active' ? text('기존 입력·실행 상태 유지', 'Existing input or session preserved')
    : text('기존 대화·설정 확인 필요', 'Check the existing conversation and settings');
  return <>
    {offer && <div className="modal-backdrop session-recovery-backdrop" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' && !busy) { event.preventDefault(); void decide(false); }
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const edge = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
        if (buttons.length && document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? buttons[buttons.length - 1] : buttons[0])?.focus(); }
      }
    }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="session-recovery-title" aria-describedby="session-recovery-description">
      <h2 className="modal-title" id="session-recovery-title">{text('이전 실행 세션을 복구할까요?', 'Restore sessions from the previous run?')}</h2>
      <p id="session-recovery-description" style={{ whiteSpace: 'pre-line' }}>{offer.error || text(
        `종료 전에 실행 중이던 세션 ${offer.activeCount}개를 기존 대화로 복원합니다.\n작업 중이던 ${offer.workingCount}개 세션에는 이어서 진행하도록 한 번 전달합니다. 질문·승인은 자동으로 답변하지 않습니다.\n아니오를 선택하면 세션 목록과 배치를 유지하고 자동으로 실행하지 않습니다.`,
        `Restore ${offer.activeCount} previously active sessions to their existing conversations.\nAsk ${offer.workingCount} working sessions to continue once. Questions and approvals wait for you.\nNo keeps the session list and layout without starting sessions.`)}</p>
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions"><button className="btn-secondary" autoFocus disabled={busy} onClick={() => { void decide(false); }}>{text('아니오', 'No')}</button>
        {!offer.error && <button className="btn-primary" disabled={busy} onClick={() => { void decide(true); }}>{text('예, 복구', 'Yes, restore')}</button>}</div>
    </div></div>}
    {!offer && (status || error) && <aside className="session-recovery-status" aria-label={text('이전 세션 복구 상태', 'Previous session recovery status')}>
      <button className="session-recovery-dismiss" aria-label={text('복구 안내 닫기', 'Dismiss recovery status')} onClick={() => { setStatus(null); setError(''); }}>×</button>
      <p role="status">{waiting || busy ? text(`이전 세션 복구 중 · 준비 대기 ${waiting}개`, `Restoring previous sessions · ${waiting} waiting`)
        : text(`이전 세션 복구 처리됨 · 확인 필요 ${attention.length}개`, `Previous session recovery processed · ${attention.length} need attention`)}</p>
      {error && <p role="alert">{error}</p>}
      {attention.length > 0 && <details><summary>{text('확인할 세션', 'Sessions to check')}</summary>{attention.map(r => <p key={r.id}><button onClick={() => onOpenSession(r.id)}>{r.name}</button> · {reason(r.reason)}</p>)}</details>}
    </aside>}
  </>;
}
