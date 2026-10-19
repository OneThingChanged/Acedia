import { useEffect, useState } from 'react';
import type { Agent } from '../types';
import { invoke } from '../platform/runtime';

export type TaskSessionNavigation = {
  ownerId: string; runId: string; taskId: string; role: string; state: string; attempt: number;
  model?: { model: string; effort?: string; serviceTier?: string | null };
};

// A thin projection of the host's task states, shared by both sidebar lists.
// No worker transcript, goal, result body, or image is fetched for navigation.
export function useTaskSessionNavigation(agents: Agent[], enabled: boolean) {
  const [sessions, setSessions] = useState<Record<string, TaskSessionNavigation>>({});
  const ids = JSON.stringify(agents.filter(a => a.sessionHierarchy?.createdById).map(a => a.id).sort());
  useEffect(() => {
    if (!enabled || ids === '[]') return;
    let stopped = false, pending = false;
    const values: string[] = JSON.parse(ids), batches: string[][] = [];
    for (let i = 0; i < values.length; i += 1024) batches.push(values.slice(i, i + 1024));
    const revisions = batches.map(() => -1), snapshots: Record<string, TaskSessionNavigation>[] = batches.map(() => ({}));
    const refresh = async () => {
      if (stopped || pending || document.hidden) return;
      pending = true;
      try {
        const results = await Promise.allSettled(batches.map((sessionIds, i) => invoke<{ revision: number; unchanged?: boolean; sessions?: Record<string, TaskSessionNavigation> }>('task_orchestration', { action: 'navigation', body: { sessionIds, revision: revisions[i] } })));
        let changed = false;
        results.forEach((result, i) => {
          if (result.status === 'fulfilled' && result.value?.sessions && !result.value.unchanged) { revisions[i] = result.value.revision; snapshots[i] = result.value.sessions; changed = true; }
        });
        if (!stopped && changed) setSessions(Object.assign({}, ...snapshots));
      } catch { /* A disconnected host leaves the last known task state visible. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [enabled, ids]);
  return sessions;
}
