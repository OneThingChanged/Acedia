import type { AccountHandoff, Agent } from "../types";

export function switchProviderAccount(agent: Agent, accountId: string, pendingAccountHandoff?: AccountHandoff): Agent {
  const accountKey = agent.aiToolId === "claude" ? "claudeAccountId" : "codexAccountId";
  const sessionsKey = agent.aiToolId === "claude" ? "claudeAccountSessions" : "codexAccountSessions";
  const previous = agent[accountKey] || "default";
  if (previous === accountId) return agent;
  const sessions = { ...agent[sessionsKey] };
  if (agent.lastSessionId) sessions[previous] = agent.lastSessionId;
  else delete sessions[previous];
  return { ...agent, [accountKey]: accountId, [sessionsKey]: sessions,
    lastSessionId: sessions[accountId], idleResumeSessionId: undefined, deferredStart: true,
    resumeEligible: false, status: "idle", runtimeStatus: "idle", activity: undefined,
    pendingAccountHandoff: sessions[accountId] ? undefined : pendingAccountHandoff };
}

export const switchCodexAccount = switchProviderAccount;
