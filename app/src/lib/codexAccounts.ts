import type { Agent } from "../types";

export function switchProviderAccount(agent: Agent, accountId: string): Agent {
  const accountKey = agent.aiToolId === "claude" ? "claudeAccountId" : "codexAccountId";
  const sessionsKey = agent.aiToolId === "claude" ? "claudeAccountSessions" : "codexAccountSessions";
  const previous = agent[accountKey] || "default";
  if (previous === accountId) return agent;
  const sessions = { ...agent[sessionsKey] };
  if (agent.lastSessionId) sessions[previous] = agent.lastSessionId;
  else delete sessions[previous];
  return { ...agent, [accountKey]: accountId, [sessionsKey]: sessions,
    lastSessionId: sessions[accountId], idleResumeSessionId: undefined, deferredStart: true,
    resumeEligible: false, status: "idle", runtimeStatus: "idle", activity: undefined };
}

export const switchCodexAccount = switchProviderAccount;
