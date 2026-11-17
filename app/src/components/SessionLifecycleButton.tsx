import { useRef, useState } from 'react';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';

export function SessionLifecycleButton({ id, active, onSuccess, onError }: {
  id: string; active: boolean; onSuccess: () => void; onError: (error: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const { text } = useAppLanguage();
  return <button role="menuitem" disabled={pending} onClick={async () => {
    if (locked.current) return;
    locked.current = true; setPending(true); onError('');
    try { await invoke('project_board_session_action', { id, action: active ? 'stop' : 'start', expectedActive: active }); onSuccess(); }
    catch (error) { onError(String(error)); }
    finally { locked.current = false; setPending(false); }
  }}>{pending ? text('처리 중…', 'Applying…') : active ? text('세션 중지', 'Stop session') : text('세션 시작', 'Start session')}</button>;
}
