import { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import { invoke } from '../platform/runtime';
import { useAppLanguage } from '../lib/appLanguage';

type AccountStatus = {
  mode: 'pool' | 'pool_next' | 'direct' | 'inactive';
  label: string | null;
  assigned?: boolean;
  preferred?: boolean;
};

type AccountQuery = { id: string; aiToolId: string; accountId: string; codexPoolAccountId?: string };

export function useSessionAccountLabel(agent: Agent | undefined): string | null {
  const { text } = useAppLanguage();
  const id = agent?.id, aiToolId = agent?.aiToolId, codexPoolAccountId = agent?.codexPoolAccountId;
  const accountId = (aiToolId === 'claude' ? agent?.claudeAccountId : agent?.codexAccountId) || 'default';
  const query = useMemo<AccountQuery | null>(() => id && aiToolId ? { id, aiToolId, accountId, codexPoolAccountId } : null,
    [id, aiToolId, accountId, codexPoolAccountId]);
  const [result, setResult] = useState<{ query: AccountQuery; status: AccountStatus | null } | null>(null);

  useEffect(() => {
    if (!query) return;
    let disposed = false, pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      let status: AccountStatus | null = null;
      try { status = await invoke<AccountStatus>('account_session_status', query); }
      catch { /* The session account can be unavailable during a host restart. */ }
      finally { pending = false; }
      if (!disposed) setResult({ query, status });
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [query]);

  if (!query) return null;
  if (result?.query !== query) return text('계정 확인 중', 'Checking account');
  const { status } = result;
  if (!status) return text('계정 확인 실패', 'Account unavailable');
  const account = status.label || text('계정 확인 필요', 'Account unavailable');
  if (status.mode === 'pool') return status.assigned
    ? `${text('분산', 'Routing')} · ${account}`
    : text('분산 · 배정 대기', 'Routing · awaiting assignment');
  if (status.mode === 'pool_next') return status.preferred
    ? `${text('다음 시작', 'Next launch')} · ${account}`
    : text('다음 시작 · 자동 배정', 'Next launch · Automatic');
  if (status.mode === 'inactive') return `${text('선택', 'Selected')} · ${account}`;
  return account;
}
