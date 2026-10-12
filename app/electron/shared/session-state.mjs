export const SESSION_FILTERS = ['all', 'active', 'sleeping'];

export function normalizeSessionFilter(value) {
  if (SESSION_FILTERS.includes(value)) return value;
  // Old status links now select the corresponding lifecycle category.
  return ['working', 'attention', 'starting', 'recovering', 'done'].includes(value) ? 'active' : 'all';
}

export function isSleepingSession(agent) {
  return agent?.deferredStart === true && agent?.resumeEligible === true;
}

function runtimeStatus(agent) {
  if (agent?.runtimeStatus) return agent.runtimeStatus;
  const status = agent?.status;
  if (['idle', 'starting', 'recovering', 'running', 'exited', 'unreachable', 'offline'].includes(status)) return status;
  return status ? 'running' : 'idle';
}

export function matchesSessionFilter(agent, value) {
  const filter = normalizeSessionFilter(value);
  if (filter === 'all') return true;
  const sleeping = isSleepingSession(agent);
  return filter === 'sleeping' ? sleeping
    : !sleeping && ['running', 'starting', 'recovering'].includes(runtimeStatus(agent));
}

export function sessionFilterCounts(agents) {
  const counts = { all: agents.length, active: 0, sleeping: 0 };
  for (const agent of agents) {
    if (matchesSessionFilter(agent, 'sleeping')) counts.sleeping++;
    else if (matchesSessionFilter(agent, 'active')) counts.active++;
  }
  return counts;
}

// The renderer can keep its previous work status after a completion hook.
// Runtime transitions still win; otherwise use the latest host-owned hook.
export function resolveSessionWorkStatus(agent) {
  const status = String(agent?.status || '').toLowerCase();
  if (['exited', 'unreachable', 'offline'].includes(status)) return status;
  const runtime = String(agent?.runtimeStatus || '').toLowerCase();
  if (['starting', 'recovering'].includes(runtime)) return runtime;
  if (['starting', 'recovering'].includes(status)) return status;
  const event = String(agent?.hook?.event || '').toLowerCase();
  if (event === 'done') return 'done';
  if (['cancelled', 'canceled', 'interrupted', 'aborted'].includes(event)) return 'idle';
  if (['working', 'tool-start', 'tool-end'].includes(event)) return 'working';
  if (event === 'question' || (event === 'waiting' && agent.hook?.interactive_question)) return 'question';
  if (['waiting', 'blocked', 'permission-request'].includes(event)) return event;
  if (['idle', 'session-start'].includes(event)) return 'idle';
  return status;
}

// Live PTYs win over delayed renderer metadata. Without a PTY, only an
// explicit startup/recovery remains Active; old running/hook states do not.
export function projectSessionRuntime(agent, live) {
  const state = runtimeStatus(agent);
  const initializing = ['starting', 'recovering'].includes(state);
  return {
    runtimeStatus: live ? initializing ? state : 'running'
      : initializing || ['exited', 'unreachable'].includes(state) ? state : 'idle',
    deferredStart: live ? false : agent.deferredStart,
    resumeEligible: live ? true : agent.resumeEligible,
  };
}
