import { toolForId, type SessionWorkerSettings } from "../types";
import { defaultSessionWorkerSettings, normalizeSessionWorkerSettings } from "./sessionWorkers";

export const AGENT_DEFAULTS_KEY = "multiagent.agentDefaults.v1";
export type AgentDefaults = {
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
    dangerous: !!toolForId(toolId).dangerousFlag && value.dangerous === true,
    useAltScreen: codex && value.useAltScreen === true,
    codexAccountId: codex && typeof value.codexAccountId === "string" && /^(default|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value.codexAccountId)
      ? value.codexAccountId : "default",
    claudeAccountId: toolId === "claude" && typeof value.claudeAccountId === "string" && /^(default|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(value.claudeAccountId)
      ? value.claudeAccountId : "default",
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
  stored[toolId] = { ...normalized, workerSettings: normalized.workerSettings ?? null };
  localStorage.setItem(AGENT_DEFAULTS_KEY, JSON.stringify(stored));
  return normalized;
}
