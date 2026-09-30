import type { AgentDefaults } from "./agentDefaults";

export type LaunchPoolAccount = { id: string; label: string; available: boolean };
export type LaunchPoolChoices = { enabled: boolean; accounts: LaunchPoolAccount[] };
type LaunchDefaults = Pick<AgentDefaults, "codexSessionAccountMode" | "codexPoolAccountId">;

export function newSessionPoolAccountId(preferred: string | undefined, defaults: LaunchDefaults): string | undefined {
  if (preferred !== undefined) return preferred || undefined;
  return defaults.codexSessionAccountMode === "automatic" ? defaults.codexPoolAccountId || undefined : undefined;
}

export function sessionLaunchAccountDecision(choices: LaunchPoolChoices, defaults: LaunchDefaults, sessionAccountId?: string) {
  if (!choices.enabled) return { action: "start" as const, accountId: sessionAccountId || "" };
  if (defaults.codexSessionAccountMode === "manual") return { action: "ask" as const, accountId: sessionAccountId || "" };
  const accountId = sessionAccountId || defaults.codexPoolAccountId;
  const available = accountId
    ? choices.accounts.some(account => account.id === accountId && account.available)
    : choices.accounts.some(account => account.available);
  return { action: available ? "start" as const : "blocked" as const, accountId };
}
