// A running child alone is not evidence that its parent delegated this work.
// Use the current task attempt or an exactly started/read handoff, and keep
// this display projection separate from turn results and read receipts.
const waitTool = /(?:^|__)(?:acedia_task_wait|acedia_session_run_status|acedia_session_delivery)$/;
export function delegatedWaitProjection({ sessions, transfers, runs, completedAt, hook, waitingSince = () => 0 }) {
  const byId = new Map(sessions.map(s => [s.id, s])), children = new Map();
  const eligible = s => s?.runtime === 'running' && ['working', 'background', 'waiting_external'].includes(s.state);
  const add = (ownerId, childId) => {
    const owner = byId.get(ownerId), child = byId.get(childId);
    if (!owner || owner.id === childId || !eligible(child) || owner.runtime !== 'running'
      || ['done', 'cancelled', 'canceled', 'interrupted', 'aborted'].includes(hook(childId)?.event)) return;
    const event = hook(ownerId);
    const since = waitingSince(ownerId);
    const waiting = ['idle', 'review', 'responded', 'completed', 'background', 'waiting_external'].includes(owner.state)
      || owner.state === 'working' && (since > 0 && since >= owner.lastActivityAt
        || ['tool-start', 'tool-end'].includes(event?.event) && waitTool.test(event?.tool_name || ''));
    if (!waiting) return; // Foreground work, questions, failures and pauses win.
    if (!children.has(ownerId)) children.set(ownerId, new Set());
    children.get(ownerId).add(childId);
  };
  for (const run of runs) {
    if (!['running', 'paused'].includes(run.state)) continue; // Pausing new assignments does not stop existing workers.
    for (const task of run.tasks || []) {
      const attempt = task.attempts?.at(-1);
      if (task.state === 'running' && attempt?.sessionId && Number.isFinite(attempt.startedAt)
        && (completedAt.get(attempt.sessionId) || 0) < attempt.startedAt) add(run.ownerId, attempt.sessionId);
    }
  }
  // A newer incoming request supersedes an old sender, even when it is queued.
  const latest = new Map();
  for (const transfer of transfers) {
    if (!Number.isFinite(transfer.savedAt)) continue;
    const previous = latest.get(transfer.to);
    if (!previous || transfer.savedAt > previous.savedAt) latest.set(transfer.to, transfer);
  }
  for (const transfer of latest.values()) {
    const child = byId.get(transfer.to);
    if (!child || child.parentId !== transfer.from || transfer.status !== 'started'
      || !Number.isFinite(transfer.startedAt) || transfer.startedAt <= 0
      || transfer.isMessage && !transfer.readAt
      || (completedAt.get(child.id) || 0) >= transfer.startedAt
      || child.lastActivityAt < transfer.startedAt) continue;
    add(transfer.from, child.id);
  }
  return new Map([...children].map(([ownerId, ids]) => [ownerId, {
    childIds: [...ids].sort(), count: ids.size,
    observedAt: Math.max(byId.get(ownerId).lastActivityAt || 0, hook(ownerId)?.received_at || hook(ownerId)?.lastTs || 0),
  }]));
}
