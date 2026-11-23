import type { AgentDefaults } from "./agentDefaults";

const accountBlockLabels = new Map<string, [string, string]>([
  ["rate-limited", ["일시 제한", "Temporarily rate-limited"]],
  ["quota-exhausted", ["Codex 사용 한도 소진", "Codex quota exhausted"]],
  ["authentication-required", ["다시 로그인 필요", "Sign-in required"]],
  ["login-pending", ["로그인 진행 중", "Sign-in in progress"]],
  ["account-disabled", ["분산에서 제외됨", "Excluded from routing"]],
  ["account-missing", ["등록된 계정을 찾을 수 없습니다.", "The account is no longer registered."]],
  ["account-pool-disabled", ["계정 분산이 꺼져 있습니다.", "Account routing is disabled."]],
  ["no-routing-accounts", ["등록된 분산 계정이 없습니다.", "No routing accounts are registered."]],
]);

export function isAccountBlockReason(reason?: string): boolean {
  return !!reason && accountBlockLabels.has(reason);
}

export function accountBlockMessage(reason: string | undefined, retryAt: number | undefined, english: boolean): string {
  const label = (reason && accountBlockLabels.get(reason)?.[english ? 1 : 0]) || (english ? "Unavailable" : "사용 불가");
  return retryAt
    ? `${label} · ${english ? "Retry at" : "재시도 가능 시각"} ${new Date(retryAt).toLocaleString(english ? "en" : "ko")}`
    : label;
}

export type LaunchPoolAccount = { id: string; label: string; available: boolean; reason?: string; retryAt?: number };
export type LaunchPoolChoices = { enabled: boolean; accounts: LaunchPoolAccount[] };
type LaunchDefaults = Pick<AgentDefaults, "codexSessionAccountMode">;

export function sessionLaunchAccountDecision(choices: LaunchPoolChoices, defaults: LaunchDefaults, sessionAccountId?: string) {
  if (!choices.enabled) return { action: "start" as const, accountId: sessionAccountId || "" };
  if (defaults.codexSessionAccountMode === "manual") return { action: "ask" as const, accountId: sessionAccountId || "" };
  const accountId = sessionAccountId || "";
  const available = accountId
    ? choices.accounts.some(account => account.id === accountId && account.available)
    : choices.accounts.some(account => account.available);
  return { action: available ? "start" as const : "blocked" as const, accountId };
}

export function launchAccountBlockedMessage(accounts: LaunchPoolAccount[], accountId: string, english: boolean): string {
  const details = (account: LaunchPoolAccount) => accountBlockMessage(account.reason, account.retryAt, english);
  if (accountId) {
    const account = accounts.find(item => item.id === accountId);
    const message = english ? "The selected routing account is unavailable." : "지정한 분산 계정을 사용할 수 없습니다.";
    return account ? `${message} ${account.label} · ${details(account)}`
      : `${message} ${accountBlockMessage("account-missing", undefined, english)}`;
  }
  if (!accounts.length) return accountBlockMessage("no-routing-accounts", undefined, english);
  const message = english ? "No routing accounts are available." : "사용 가능한 분산 계정이 없습니다.";
  return `${message} ${accounts.map(account => `${account.label} · ${details(account)}`).join(" / ")}`;
}
