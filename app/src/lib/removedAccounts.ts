import { LS_AGENTS, LS_GROUPS, LS_PROJECTS, type Agent, type Group, type StoredAgent } from "../types";

export type RemovedAccounts = { codex: string[]; claude: string[] };
export const REMOVED_ACCOUNTS_KEY = "multiagent.removedAccounts.v1";
const defaultsKey = "multiagent.agentDefaults.v1";
export function removedAccounts(): RemovedAccounts {
  try {
    const value = JSON.parse(localStorage.getItem(REMOVED_ACCOUNTS_KEY) || "{}");
    return { codex: Array.isArray(value.codex) ? value.codex : [], claude: Array.isArray(value.claude) ? value.claude : [] };
  } catch { return { codex: [], claude: [] }; }
}
export function availableAccountId(provider: "codex" | "claude", id: string): string {
  return removedAccounts()[provider].includes(id) ? "default" : id;
}
export function accountBindingChanged(before: StoredAgent | Agent, after: StoredAgent | Agent): boolean {
  return before.aiToolId === "codex" ? before.codexAccountId !== after.codexAccountId
    : before.aiToolId === "claude" && before.claudeAccountId !== after.claudeAccountId;
}
export function resetRemovedAccount<T extends StoredAgent | Agent>(agent: T, removed = removedAccounts(), remote = Boolean((agent as Agent).sshHostId)): T {
  let next = agent;
  for (const provider of ["codex", "claude"] as const) {
    const field = provider === "codex" ? "codexAccountId" : "claudeAccountId";
    const sessionsField = provider === "codex" ? "codexAccountSessions" : "claudeAccountSessions";
    const selected = removed[provider].includes(agent[field] || "default");
    const handoffRemoved = agent.aiToolId === provider && !!agent.pendingAccountHandoff &&
      removed[provider].some(id => id === agent.pendingAccountHandoff?.fromAccountId || id === agent.pendingAccountHandoff?.toAccountId);
    const sessions = { ...next[sessionsField] };
    const removedSession = Object.keys(sessions).some(id => removed[provider].includes(id));
    if (!selected && !removedSession && !handoffRemoved) continue;
    for (const id of removed[provider]) delete sessions[id];
    next = { ...next, [sessionsField]: sessions, ...(selected ? { [field]: "default" } : {}),
      ...(handoffRemoved ? { pendingAccountHandoff: undefined } : {}) };
    if (selected && agent.aiToolId === provider && !remote) next = { ...next,
      lastSessionId: undefined, lastClaudeSessionId: undefined, lastResumeToken: undefined,
      idleResumeSessionId: undefined, resumeEligible: false, deferredStart: true,
      status: "idle", runtimeStatus: "idle", activity: undefined,
    };
  }
  return next;
}
export function clearAccountPins(groups: Group[], ids: Set<string>): Group[] {
  return groups.map(group => {
    if (!Object.keys(group.sessionPins || {}).some(id => ids.has(id))) return group;
    const sessionPins = { ...group.sessionPins };
    for (const id of ids) delete sessionPins[id];
    return { ...group, sessionPins };
  });
}
export function applyRemovedAccounts(removed: RemovedAccounts): Set<string> {
  const previous = removedAccounts();
  removed = { codex: [...new Set([...previous.codex, ...removed.codex])], claude: [...new Set([...previous.claude, ...removed.claude])] };
  // Persist recovery markers first: a failed later storage write is repaired on
  // the next launch, before any deleted profile can be resumed.
  const marker = JSON.stringify(removed);
  if (localStorage.getItem(REMOVED_ACCOUNTS_KEY) !== marker) localStorage.setItem(REMOVED_ACCOUNTS_KEY, marker);
  if (!removed.codex.length && !removed.claude.length) return new Set();
  const readArray = (key: string) => { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };
  const projects = readArray(LS_PROJECTS);
  const remoteProjects = new Set(projects.filter((p: {sshHostId?: string}) => p.sshHostId).map((p: {id: string}) => p.id));
  const agents: StoredAgent[] = readArray(LS_AGENTS);
  const ids = new Set<string>();
  const next = agents.map(agent => {
    const remote = remoteProjects.has(agent.projectId || "");
    const reset = resetRemovedAccount(agent, removed, remote);
    if (!remote && accountBindingChanged(agent, reset)) ids.add(agent.id);
    return reset;
  });
  if (next.some((agent, i) => agent !== agents[i])) localStorage.setItem(LS_AGENTS, JSON.stringify(next));
  let defaults: Record<string, Record<string, unknown>> = {};
  try { const value = JSON.parse(localStorage.getItem(defaultsKey) || "{}"); if (value && typeof value === "object" && !Array.isArray(value)) defaults = value; } catch { /* preserve unrelated malformed optional preferences */ }
  let changed = false;
  for (const provider of ["codex", "claude"] as const) {
    const field = `${provider}AccountId`;
    if (typeof defaults[provider]?.[field] === "string" && removed[provider].includes(defaults[provider][field] as string)) {
      defaults[provider] = { ...defaults[provider], [field]: "default" }; changed = true;
    }
  }
  if (changed) localStorage.setItem(defaultsKey, JSON.stringify(defaults));
  for (const key of Object.keys(localStorage)) {
    if (key !== LS_GROUPS && !/^multiagent\.workspace\..+\.groups\.v1$/.test(key)) continue;
    const groups: Group[] = readArray(key);
    const nextGroups = clearAccountPins(groups, ids);
    if (nextGroups.some((group, i) => group !== groups[i])) localStorage.setItem(key, JSON.stringify(nextGroups));
  }
  return ids;
}
