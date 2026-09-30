import { describe, expect, it } from "vitest";
import { newSessionPoolAccountId, sessionLaunchAccountDecision } from "./sessionLaunchAccount";

const choices = { enabled: true, accounts: [
  { id: "work", label: "Work", available: true },
  { id: "personal", label: "Personal", available: true },
  { id: "exhausted", label: "Exhausted", available: false },
] };
const defaults = { codexSessionAccountMode: "automatic" as const, codexPoolAccountId: "work" };

describe("session launch account policy", () => {
  it("keeps the manual prompt and its session selection even with no available accounts", () => {
    expect(sessionLaunchAccountDecision({ ...choices, accounts: [] }, { ...defaults, codexSessionAccountMode: "manual" }, "personal"))
      .toEqual({ action: "ask", accountId: "personal" });
  });
  it("starts automatically using the saved session account before the global default", () => {
    expect(sessionLaunchAccountDecision(choices, defaults, "personal")).toEqual({ action: "start", accountId: "personal" });
    expect(sessionLaunchAccountDecision(choices, defaults)).toEqual({ action: "start", accountId: "work" });
  });
  it("supports automatic distribution without pinning an account", () => {
    expect(sessionLaunchAccountDecision(choices, { ...defaults, codexPoolAccountId: "" })).toEqual({ action: "start", accountId: "" });
    expect(sessionLaunchAccountDecision({ ...choices, accounts: [] }, { ...defaults, codexPoolAccountId: "" }).action).toBe("blocked");
  });
  it("blocks deleted, disabled, or exhausted defaults and session pins instead of switching accounts", () => {
    for (const accountId of ["exhausted", "removed"]) {
      expect(sessionLaunchAccountDecision(choices, { ...defaults, codexPoolAccountId: accountId }).action).toBe("blocked");
      expect(sessionLaunchAccountDecision(choices, defaults, accountId).action).toBe("blocked");
    }
  });
  it("leaves direct connections unchanged when routing is disabled", () => {
    expect(sessionLaunchAccountDecision({ enabled: false, accounts: [] }, defaults, "removed"))
      .toEqual({ action: "start", accountId: "removed" });
  });
  it("uses the automatic default for new sessions while preserving explicit choices", () => {
    expect(newSessionPoolAccountId(undefined, defaults)).toBe("work");
    expect(newSessionPoolAccountId("personal", defaults)).toBe("personal");
    expect(newSessionPoolAccountId("", defaults)).toBeUndefined();
    expect(newSessionPoolAccountId(undefined, { ...defaults, codexSessionAccountMode: "manual" })).toBeUndefined();
  });
});
