import type { SessionWorkerConfig, SessionWorkerPreset, SessionWorkerSelection, SessionWorkerSettings } from "../types";

export type SessionWorkerOption = { id: SessionWorkerPreset; label: string; requiredToolId: "codex" | "claude" };
export const SESSION_WORKER_OPTIONS: readonly SessionWorkerOption[] = [
  { id: "codex-luna-max", label: "Codex", requiredToolId: "codex" },
  { id: "claude-opus", label: "Claude", requiredToolId: "claude" },
];
type Effort = SessionWorkerConfig["effort"];
const STANDARD: Effort[] = ["low", "medium", "high", "xhigh", "max"];
// Model IDs and effort sets verified against the CLI catalog on 2026-09-23.
// Suggestions are not an account entitlement list; custom IDs remain available.
export const WORKER_MODELS = {
  codex: ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5"],
  claude: ["opus", "sonnet", "haiku"],
};
export function workerEfforts(provider: SessionWorkerConfig["provider"], model: string): Effort[] {
  if (provider === "claude") return [...STANDARD];
  if (["gpt-6-astra", "gpt-6-sol", "gpt-5.6-sol", "gpt-5.6-terra"].includes(model)) return [...STANDARD, "ultra"];
  if (["gpt-5.5", "gpt-5.4"].includes(model)) return ["low", "medium", "high", "xhigh"];
  if (["gpt-6-luna", "gpt-5.6-luna"].includes(model)) return [...STANDARD];
  return [...STANDARD, "ultra"];
}
export function resolveSessionWorker(value: unknown): SessionWorkerConfig | undefined {
  if (value === "codex-luna-max") return { provider: "codex", model: "gpt-6-luna", effort: "max" };
  if (value === "claude-opus") return { provider: "claude", model: "opus", effort: "max" };
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.provider !== "codex" && raw.provider !== "claude") return undefined;
  if (typeof raw.model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(raw.model)) return undefined;
  if (!workerEfforts(raw.provider, raw.model).includes(raw.effort as Effort)) return undefined;
  return { provider: raw.provider, model: raw.model, effort: raw.effort as Effort };
}
export function defaultSessionWorkerSettings(aiToolId: string): SessionWorkerSettings | undefined {
  return aiToolId === "codex" ? { documents: "codex-luna-max", html: "codex-luna-max" } : undefined;
}
export function availableSessionWorkerOptions(disabledTools: readonly string[]): readonly SessionWorkerOption[] {
  return SESSION_WORKER_OPTIONS.filter(option => !disabledTools.includes(option.requiredToolId));
}
export function normalizeSessionWorkerSettings(value: unknown): SessionWorkerSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const result: SessionWorkerSettings = {};
  for (const kind of ["documents", "html"] as const) {
    const config = resolveSessionWorker(raw[kind]);
    if (config) result[kind] = typeof raw[kind] === "string" ? raw[kind] as SessionWorkerPreset : config;
  }
  return result.documents || result.html ? result : undefined;
}
export function updateSessionWorkerSetting(current: SessionWorkerSettings | undefined, kind: keyof SessionWorkerSettings, selection: SessionWorkerSelection | undefined): SessionWorkerSettings | undefined {
  const next = { ...current, [kind]: selection };
  return next.documents || next.html ? next : undefined;
}
export function workerRoles(settings: SessionWorkerSettings | undefined) {
  const roles: Partial<Record<keyof SessionWorkerSettings, SessionWorkerConfig>> = {};
  for (const kind of ["documents", "html"] as const) {
    const config = resolveSessionWorker(settings?.[kind]);
    if (config?.provider === "codex") roles[kind] = config;
  }
  return roles;
}
function tomlString(value: string): string { return JSON.stringify(value).replace(/'/g, "\\u0027"); }
const ROLE_NAMES = { documents: "multiagent_docs_writer", html: "multiagent_html_builder" };
export function sessionWorkerDeveloperInstructions(settings: SessionWorkerSettings): string {
  const lines = [
    "Acedia configured parallel content workers for this session.",
    "Delegate only bounded work that can run independently. Never let workers edit the same file concurrently. The primary agent owns integration and final verification.",
  ];
  for (const kind of ["documents", "html"] as const) {
    const config = resolveSessionWorker(settings[kind]);
    if (!config) continue;
    const label = kind === "documents" ? "documentation and Markdown work" : "HTML and related presentation work";
    if (config.provider === "codex") {
      lines.push(`For ${label}, spawn the ${ROLE_NAMES[kind]} role with model=${config.model}, reasoning_effort=${config.effort}, and fork_turns=none. Pass these explicit model and effort overrides when the spawn tool supports them; otherwise use the role configuration. Give it exact target files, constraints, and all necessary context. Do not silently substitute a different model or effort if unavailable; report the error.`);
    } else {
      lines.push(`For ${label}, spawn the ${ROLE_NAMES[kind]} role and have it invoke the installed Claude Code CLI using claude -p --model ${config.model} --effort ${config.effort} --no-session-persistence --safe-mode --tools Read,Write,Edit,Glob,Grep --permission-mode acceptEdits. Use claude.cmd on Windows only when the normal launcher is blocked. Pass the bounded prompt through stdin rather than a command-line argument. Include exact target files, constraints, and necessary project guidance, wait for its result, then verify all changes. Never add a dangerous permission flag. If Claude is unavailable or not authenticated, report that and continue safely with the primary agent.`);
    }
  }
  lines.push("Do not delegate trivial edits where coordination costs more than the work.");
  return lines.join("\n");
}
export function addSessionWorkerArgs(aiToolId: string, command: string, value: SessionWorkerSettings | undefined, roleFiles: Partial<Record<keyof SessionWorkerSettings, string>> = {}): string {
  if (aiToolId !== "codex") return command;
  const settings = normalizeSessionWorkerSettings(value);
  if (!settings) return command;
  const overrides = ["features.multi_agent=true", "agents.enabled=true", "agents.max_concurrent_threads_per_session=2"];
  const configs = Object.values(workerRoles(settings));
  if (configs.length && configs.every(config => config.model === configs[0].model && config.effort === configs[0].effort)) {
    overrides.push(`agents.default_subagent_model=${tomlString(configs[0].model)}`, `agents.default_subagent_reasoning_effort=${tomlString(configs[0].effort)}`);
  }
  for (const kind of ["documents", "html"] as const) {
    const config = resolveSessionWorker(settings[kind]);
    if (!config) continue;
    const description = `${kind === "documents" ? "Documentation and Markdown" : "HTML and presentation"} specialist using ${config.provider} ${config.model} / ${config.effort}.`;
    overrides.push(`agents.${ROLE_NAMES[kind]}.description=${tomlString(description)}`);
    if (config.provider === "codex" && roleFiles[kind]) overrides.push(`agents.${ROLE_NAMES[kind]}.config_file=${tomlString(roleFiles[kind]!)}`);
  }
  overrides.push(`developer_instructions=${tomlString(sessionWorkerDeveloperInstructions(settings))}`);
  return `${command} ${overrides.map(item => `-c '${item}'`).join(" ")}`;
}
