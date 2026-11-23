import { describe, expect, it } from "vitest";
import { launchAccountBlockedMessage, sessionLaunchAccountDecision } from "./sessionLaunchAccount";

const choices = { enabled: true, accounts: [
  { id: "work", label: "Work", available: true },
  { id: "personal", label: "Personal", available: true },
  { id: "exhausted", label: "Exhausted", available: false },
] };
const defaults = { codexSessionAccountMode: "automatic" as const, codexPoolAccountId: "work" };

describe("session launch account policy", () => {
  it("keeps the manual prompt and its session selection even with no available accounts", () => {
    expect(sessionLaunchAccountDecision({ ...choices, accounts: [] }, { codexSessionAccountMode: "manual" }, "personal"))
      .toEqual({ action: "ask", accountId: "personal" });
  });
  it("preserves an explicit session account and leaves automatic selection to the launcher", () => {
    expect(sessionLaunchAccountDecision(choices, defaults, "personal")).toEqual({ action: "start", accountId: "personal" });
    expect(sessionLaunchAccountDecision(choices, defaults)).toEqual({ action: "start", accountId: "" });
  });
  it("supports automatic distribution without pinning an account", () => {
    expect(sessionLaunchAccountDecision(choices, defaults)).toEqual({ action: "start", accountId: "" });
    expect(sessionLaunchAccountDecision({ ...choices, accounts: [] }, defaults).action).toBe("blocked");
  });
  it("blocks explicit session pins that are missing or exhausted", () => {
    for (const accountId of ["exhausted", "removed"]) {
      expect(sessionLaunchAccountDecision(choices, defaults, accountId).action).toBe("blocked");
    }
  });
  it("leaves direct connections unchanged when routing is disabled", () => {
    expect(sessionLaunchAccountDecision({ enabled: false, accounts: [] }, defaults, "removed"))
      .toEqual({ action: "start", accountId: "removed" });
  });
  it("explains a blocked pin and distinguishes a retry time from quota exhaustion", () => {
    const retryAt = Date.UTC(2026, 10, 24, 12);
    const accounts = [
      { ...choices.accounts[0], available: false, reason: "rate-limited", retryAt },
      { ...choices.accounts[2], reason: "quota-exhausted" },
    ];
    expect(launchAccountBlockedMessage(accounts, "work", true)).toMatch(/selected routing account.*Work.*Retry at/);
    expect(launchAccountBlockedMessage(accounts, "", false)).toMatch(/재시도 가능 시각.*한도 소진/);
    expect(launchAccountBlockedMessage(accounts, "removed", false)).toContain("등록된 계정을 찾을 수 없습니다.");
  });
});
