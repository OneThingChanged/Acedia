import { describe, it, expect } from "vitest";
import { switchCodexAccount, switchProviderAccount } from "./codexAccounts";
import type { Agent } from "../types";

const agent: Agent = { id: "a", projectId: "p", name: "A", folder: "project", aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 0, lastSessionId: "default-conversation" };

describe("session account switching", () => {
  it("restores Claude conversations independently of Codex bindings and other sessions", () => {
    const claude: Agent = { ...agent, aiToolId: "claude", claudeAccountId: "personal", codexAccountSessions: { default: "codex-conversation" } };
    const work = switchProviderAccount(claude, "work");
    expect(work).toMatchObject({ claudeAccountId: "work", claudeAccountSessions: { personal: "default-conversation" }, runtimeStatus: "idle", deferredStart: true });
    expect(work.lastSessionId).toBeUndefined();
    const restored = switchProviderAccount({ ...work, lastSessionId: "claude-work" }, "personal");
    expect(restored.lastSessionId).toBe("default-conversation");
    expect(switchProviderAccount(restored, "work").lastSessionId).toBe("claude-work");
    expect(claude.claudeAccountSessions).toBeUndefined();
    expect(restored.codexAccountSessions).toEqual(claude.codexAccountSessions);
  });
  it("starts fresh once and restores each account's own conversation on return", () => {
    const work = switchCodexAccount(agent, "work");
    expect(work.lastSessionId).toBeUndefined();
    expect(work.deferredStart).toBe(true);
    expect(work.resumeEligible).toBe(false);
    const original = switchCodexAccount({ ...work, lastSessionId: "work-conversation" }, "default");
    expect(original.lastSessionId).toBe("default-conversation");
    expect(switchCodexAccount(original, "work").lastSessionId).toBe("work-conversation");
    expect(agent.codexAccountSessions).toBeUndefined();
  });
  it("does not change state when selecting the current account", () => {
    expect(switchCodexAccount(agent, "default")).toBe(agent);
  });
  it("queues a handoff only for an account without its own conversation", () => {
    const handoff = { id: "h", fromAccountId: "default", toAccountId: "work", createdAt: 1, prompt: "continue" };
    expect(switchProviderAccount(agent, "work", handoff).pendingAccountHandoff).toEqual(handoff);
    const withSavedTarget = { ...agent, codexAccountSessions: { work: "saved-work" } };
    expect(switchProviderAccount(withSavedTarget, "work", handoff).pendingAccountHandoff).toBeUndefined();
  });
});
