import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderAccounts } from "./provider-accounts.mjs";
import { storedAccountIdentity } from "./account-identity.mjs";

const roots = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-onboarding-test-"));
  roots.push(root); return root;
}
function writeIdentity(provider, home, email) {
  if (provider === "codex") {
    const token = "header." + Buffer.from(JSON.stringify({ email, privateClaim: "private-fixture" })).toString("base64url") + ".signature";
    fs.writeFileSync(path.join(home, "auth.json"), JSON.stringify({ tokens: { id_token: token, access_token: "private-token" } }));
  } else {
    fs.writeFileSync(path.join(home, ".credentials.json"), '{"claudeAiOauth":{"accessToken":"private-token"}}');
    fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: "private-id" }, other: "private-fixture" }));
  }
}
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-onboarding-test-")) throw new Error("Unexpected fixture path");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe.each(["codex", "claude"])("%s account onboarding", provider => {
  it("returns only stored email from the selected home and never calls it verified", () => {
    const accounts = new ProviderAccounts(fixture(), provider, { baseEnv: {} });
    const first = accounts.create("Work"), second = accounts.create("Personal");
    writeIdentity(provider, accounts.home(first), "work@example.invalid");
    writeIdentity(provider, accounts.home(second), "personal@example.invalid");
    const list = accounts.list();
    expect(list[1]).toMatchObject({ label: "Work", state: "saved", identity: { email: "work@example.invalid", source: "local" } });
    expect(list[2].identity.email).toBe("personal@example.invalid");
    expect(list[0].identity).toBeUndefined();
    expect(Object.keys(list[1].identity).sort()).toEqual(["email", "source"]);
    expect(JSON.stringify(list)).not.toMatch(/private-|id_token|access_token|accessToken|verified/);
    expect(fs.readFileSync(accounts.registry, "utf8")).not.toContain("@");
  });

  it("leaves malformed or missing identity unknown without blocking a saved profile", () => {
    const accounts = new ProviderAccounts(fixture(), provider, { baseEnv: {} });
    const id = accounts.create("Work");
    writeIdentity(provider, accounts.home(id), "bad\nemail@example.invalid");
    expect(accounts.list()[1]).toMatchObject({ state: "saved", identity: null });
    const metadata = path.join(accounts.home(id), provider === "codex" ? "auth.json" : ".claude.json");
    for (const value of ["{", "[]", "x".repeat(256 * 1024 + 1)]) {
      fs.writeFileSync(metadata, value);
      expect(storedAccountIdentity(provider, accounts.home(id))).toBeNull();
    }
    fs.unlinkSync(metadata);
    expect(storedAccountIdentity(provider, accounts.home(id))).toBeNull();
  });

  it("distinguishes timeout, cancellation and retry while ignoring older completions", () => {
    vi.useFakeTimers();
    const jobs = [];
    const accounts = new ProviderAccounts(fixture(), provider, { baseEnv: {}, startLogin: () => {
      const job = { onData() {}, onExit(fn) { this.finish = fn; }, kill: vi.fn() }; jobs.push(job); return job;
    } });
    const first = accounts.create("Work"), second = accounts.create("Personal");
    accounts.beginLogin(first); vi.advanceTimersByTime(5 * 60_000);
    expect(accounts.list()[1].state).toBe("timed_out");
    expect(jobs[0].kill).toHaveBeenCalledOnce();
    accounts.beginLogin(first);
    jobs[0].finish({ exitCode: 0 });
    expect(accounts.list()[1].state).toBe("pending");
    accounts.cancelLogin({ accountId: first });
    expect(accounts.list()[1].state).toBe("cancelled");
    accounts.beginLogin(second);
    expect(() => accounts.cancelLogin({ accountId: first })).toThrow();
    expect(accounts.list()[2].state).toBe("pending");
    expect(jobs[2].kill).not.toHaveBeenCalled();
    jobs[1].finish({ exitCode: 0 });
    expect(accounts.list()[2].state).toBe("pending");
    accounts.cancelLogin({ accountId: second });
    expect(jobs[2].kill).toHaveBeenCalledOnce();
  });

  it("hides stale identity during a failed retry and does not retain saved state after credentials disappear", () => {
    let finish;
    const accounts = new ProviderAccounts(fixture(), provider, { baseEnv: {}, startLogin: () => ({ onData() {}, onExit(fn) { finish = fn; }, kill() {} }) });
    const id = accounts.create("Work");
    writeIdentity(provider, accounts.home(id), "work@example.invalid");
    accounts.beginLogin(id);
    expect(accounts.list()[1].identity).toBeUndefined();
    finish({ exitCode: 1 });
    expect(accounts.list()[1]).toMatchObject({ state: "failed", failureReason: "login_failed" });
    expect(accounts.list()[1].identity).toBeUndefined();
    accounts.beginLogin(id); finish({ exitCode: 0 });
    expect(accounts.list()[1].state).toBe("saved");
    fs.unlinkSync(path.join(accounts.home(id), accounts.credentialFile));
    expect(accounts.list()[1].state).toBe("empty");
    expect(accounts.list()[1].identity).toBeUndefined();
  });

  it("reports a fixed startup failure code instead of exposing process output", () => {
    const accounts = new ProviderAccounts(fixture(), provider, { baseEnv: {}, startLogin: () => { throw new Error("private-fixture"); } });
    const id = accounts.create("Work");
    expect(() => accounts.beginLogin(id)).toThrow();
    expect(accounts.list()[1]).toMatchObject({ state: "failed", failureReason: "login_start_failed" });
    expect(JSON.stringify(accounts.list())).not.toContain("private-fixture");
    expect(accounts.login).toBeNull();
  });
});

it("does not treat arbitrary Codex credential fields as a confirmed email", () => {
  const home = fixture();
  for (const tokens of [{ email: "fake@example.invalid" }, { id_token: "not-a-jwt" }, { id_token: "a.e30=.c" }]) {
    fs.writeFileSync(path.join(home, "auth.json"), JSON.stringify({ email: "fake@example.invalid", tokens }));
    expect(storedAccountIdentity("codex", home)).toBeNull();
  }
});
