import { useEffect, useState } from 'react';
import type { Agent } from '../types';
import type { BoardSession } from '../lib/workBoard';
import { isAgentRuntimeActive } from '../lib/agentActivity';
import { isStandbySession } from '../lib/sessionStandby';
import { invoke } from '../platform/runtime';

type Wait = NonNullable<BoardSession['delegatedWait']>;
export function visibleDelegatedWait(agents: Agent[], waits: Record<string, Wait>) {
  const byId = new Map(agents.map(a => [a.id, a])), visible: Record<string, Wait> = {};
  const active = (a?: Agent) => a && !isStandbySession(a) && isAgentRuntimeActive(a)
    && !['question', 'waiting', 'blocked', 'unreachable', 'starting', 'recovering'].includes(a.status)
    && !['waiting', 'blocked', 'paused', 'suspended'].includes(a.activity?.workStatus || '');
  for (const [id, wait] of Object.entries(waits)) {
    const agent = byId.get(id);
    // A fresh foreground/question/stop event wins before the next host poll.
    if (!active(agent) || (agent?.activity?.receivedAt || 0) > wait.observedAt) continue;
    const childIds = wait.childIds.filter(childId => active(byId.get(childId)) && byId.get(childId)?.activity?.workStatus !== 'done');
    if (childIds.length) visible[id] = { ...wait, childIds, count: childIds.length };
  }
  return visible;
}

// Fetch only counts/IDs, never prompts, result bodies or an inbox as its owner.
export function useDelegatedWait(agents: Agent[], enabled = true) {
  const [waits, setWaits] = useState<Record<string, Wait>>({});
  const hasChildren = agents.some(a => a.sessionHierarchy?.parentId || a.sessionHierarchy?.createdById);
  useEffect(() => {
    if (!enabled || !hasChildren) { setWaits({}); return; }
    let stopped = false, pending = false, revision: string | undefined, lastSuccess = 0;
    const refresh = async () => {
      if (stopped) return;
      if (lastSuccess && Date.now() - lastSuccess > 6000) { revision = undefined; lastSuccess = 0; setWaits({}); }
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await invoke<{ revision: string; unchanged?: boolean; sessions: Record<string, Wait> }>('project_board_delegated_wait', revision ? { revision } : {});
        if (stopped) return;
        lastSuccess = Date.now();
        if (!data.unchanged) {
          revision = data.revision;
          setWaits(data.sessions);
        }
      } catch { if (!stopped) { revision = undefined; setWaits({}); } }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [enabled, hasChildren]);
  return enabled && hasChildren ? visibleDelegatedWait(agents, waits) : {};
}
