import { toolForId, type SessionWorkerSettings } from "../types";
import { availableAccountId } from "./removedAccounts";
import { defaultSessionWorkerSettings, normalizeSessionWorkerSettings } from "./sessionWorkers";
import { normalizeLaunchOptions, launchOptionsProblem, type LaunchOptions } from "./launchOptions";

export const AGENT_DEFAULTS_KEY = "multiagent.agentDefaults.v1";
export type AgentDefaults = {
  launchOptions?: LaunchOptions;
  dangerous: boolean;
  useAltScreen: boolean;
  codexAccountId: string;
  claudeAccountId: string;
  workerSettings?: SessionWorkerSettings;
};
export function normalizeAgentDefaults(toolId: string, raw: unknown): AgentDefaults {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const codex = toolId === "codex";
  return {
    launchOptions: toolForId(toolId).command ? normalizeLaunchOptions(value.launchOptions) : undefined,
    dangerous: !!toolForId(toolId).dangerousFlag && value.dangerous === true,
    useAltScreen: codex && value.useAltScreen === true,
    codexAccountId: codex && typeof value.codexAccountId === "string" && /^(default|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value.codexAccountId)
      ? availableAccountId("codex", value.codexAccountId) : "default",
    claudeAccountId: toolId === "claude" && typeof value.claudeAccountId === "string" && /^(default|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value.claudeAccountId)
      ? availableAccountId("claude", value.claudeAccountId) : "default",
    workerSettings: codex ? Object.prototype.hasOwnProperty.call(value, "workerSettings")
      ? normalizeSessionWorkerSettings(value.workerSettings) : defaultSessionWorkerSettings(toolId) : undefined,
  };
}
export function loadAgentDefaults(toolId: string): AgentDefaults {
  try { return normalizeAgentDefaults(toolId, JSON.parse(localStorage.getItem(AGENT_DEFAULTS_KEY) || "{}")[toolId]); }
  catch { return normalizeAgentDefaults(toolId, null); }
}
export function saveAgentDefaults(toolId: string, value: AgentDefaults): AgentDefaults {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_DEFAULTS_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
  } catch { /* replace malformed optional preferences */ }
  const normalized = normalizeAgentDefaults(toolId, value);
  const problem = launchOptionsProblem(normalized.launchOptions);
  if (problem) throw new Error(problem);
  stored[toolId] = { ...normalized, workerSettings: normalized.workerSettings ?? null };
  localStorage.setItem(AGENT_DEFAULTS_KEY, JSON.stringify(stored));
  return normalized;
}
