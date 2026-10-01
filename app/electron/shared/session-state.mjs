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
