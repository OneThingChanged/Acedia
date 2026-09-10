import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAccounts } from "./codex-accounts.mjs";
import { ClaudeAccounts } from "./claude-accounts.mjs";
import { SessionService } from "./session-service.mjs";
import { UsageService } from "./usage-service.mjs";

const temporary = [];
const run = promisify(execFile);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-provider-accounts-"));
  temporary.push(root);
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("multiagent-provider-accounts-")) throw new Error("Unexpected fixture path");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe.each([["codex", CodexAccounts], ["claude", ClaudeAccounts]])("%s parallel account sessions", (provider, Accounts) => {
  it("gives simultaneous child processes different homes without changing the original environment", async () => {
    const root = fixture();
    const homeKey = provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
    const baseEnv = { SystemRoot: process.env.SystemRoot, [homeKey]: path.join(root, "system"), ANTHROPIC_API_KEY: "system-fixture", OPENAI_API_KEY: "system-fixture" };
    const accounts = new Accounts(root, { baseEnv });
    const first = accounts.create("Personal");
    const second = accounts.create("Work");
    for (const [id, identity] of [[first, "personal"], [second, "work"]]) {
      fs.writeFileSync(path.join(accounts.home(id), accounts.credentialFile), JSON.stringify({ identity }));
    }
    const source = `const fs = require('node:fs'), path = require('node:path');
      const home = process.env[${JSON.stringify(homeKey)}];
      setTimeout(() => process.stdout.write(JSON.stringify({home, identity: JSON.parse(fs.readFileSync(path.join(home, ${JSON.stringify(accounts.credentialFile)}))).identity})), 50);`;
    const results = await Promise.all([first, second].map(id => run(process.execPath, ["-e", source], { env: accounts.environment(id), windowsHide: true, timeout: 5000 })));
    expect(results.map(result => JSON.parse(result.stdout).identity)).toEqual(["personal", "work"]);
    expect(JSON.parse(results[0].stdout).home).not.toBe(JSON.parse(results[1].stdout).home);
    expect(accounts.environment()).toEqual(baseEnv);
    expect(new Accounts(root, { baseEnv }).list().slice(1).map(a => a.state)).toEqual(["saved", "saved"]);
  });

  it("scopes automatic resume and manual relinking to the selected account", async () => {
    const root = fixture();
    const accounts = new Accounts(root, { baseEnv: { CODEX_HOME: path.join(root, "system-codex"), CLAUDE_CONFIG_DIR: path.join(root, "system-claude") } });
    const first = accounts.create("A"), second = accounts.create("B");
    const firstSession = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", secondSession = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    for (const [id, sid] of [[first, firstSession], [second, secondSession]]) {
      const directory = path.join(accounts.home(id), accounts.transcriptDirectory);
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, `${sid}.jsonl`), JSON.stringify(provider === "codex"
        ? { type: "session_meta", payload: { id: sid, cwd: root } }
        : { sessionId: sid, cwd: root, type: "user" }));
    }
    const service = new SessionService(root);
    service[`${provider}Roots`] = () => accounts.roots();
    service.notes.set("agent", { sessionId: firstSession, cwd: root, transcriptPath: path.join(accounts.home(first), accounts.transcriptDirectory, `${firstSession}.jsonl`) });
    const args = { aiToolId: provider, folder: root, agentId: "agent", transcriptRoot: path.join(accounts.home(second), accounts.transcriptDirectory), allowFolderFallback: false };
    expect(await service.resolve(args)).toBeNull();
    expect(await service.resolve({ ...args, preferredSessionId: firstSession })).toBeNull();
    expect(await service.resolve({ ...args, preferredSessionId: secondSession })).toBe(secondSession);
    expect(await service.resolve({ ...args, allowFolderFallback: true })).toBe(secondSession);
    expect(await service.scan(provider)).toHaveLength(2);
  });
});

describe("Claude account integration", () => {
  it("removes inherited authentication and provider overrides only for managed sessions", () => {
    const baseEnv = { CLAUDE_CONFIG_DIR: "system-home", ANTHROPIC_API_KEY: "fixture-key", ANTHROPIC_AUTH_TOKEN: "fixture-token", CLAUDE_CODE_OAUTH_TOKEN: "fixture-oauth", ANTHROPIC_CUSTOM_HEADERS: "Authorization: fixture", CLAUDE_CODE_USE_BEDROCK: "1", ANTHROPIC_BASE_URL: "https://fixture.invalid", PATH: "tools" };
    if (process.platform === "win32") baseEnv.anthropic_api_key = "lowercase-fixture";
    const accounts = new ClaudeAccounts(fixture(), { baseEnv });
    const id = accounts.create("Work");
    expect(accounts.environment(id)).toEqual({ CLAUDE_CONFIG_DIR: accounts.home(id), PATH: "tools" });
    expect(accounts.environment()).toEqual(baseEnv);
    expect(() => accounts.home("../../outside")).toThrow();
  });

  it("isolates login completion, cancellation and physical Store paths without returning OAuth output", () => {
    let finish;
    const kill = vi.fn();
    const accounts = new ClaudeAccounts(fixture(), { baseEnv: {}, startLogin: env => ({
      onData(fn) { fn("private OAuth fixture URL"); }, onExit(fn) { finish = fn; }, kill,
    }) });
    const id = accounts.create("Work"), second = accounts.create("Other");
    const logical = path.join(accounts.root, id, ".claude"), physical = fixture();
    const originalRealpath = fs.realpathSync.native;
    vi.spyOn(fs.realpathSync, "native").mockImplementation(file => file === logical ? physical : originalRealpath(file));
    expect(accounts.environment(id).CLAUDE_CONFIG_DIR).toBe(physical);
    accounts.beginLogin(id);
    expect(() => accounts.beginLogin(second)).toThrow();
    fs.writeFileSync(path.join(physical, ".credentials.json"), '{"fixture":"secret"}');
    finish({ exitCode: 0 });
    expect(accounts.list()[1].state).toBe("saved");
    expect(JSON.stringify(accounts.list())).not.toMatch(/secret|private|OAuth/);
    accounts.beginLogin(second);
    accounts.cancelLogin();
    finish({ exitCode: 0 });
    expect(kill).toHaveBeenCalledOnce();
    expect(accounts.list()[2].state).toBe("cancelled");
  });

  it("keeps per-account quota windows and the last snapshot when one account becomes unavailable", async () => {
    const index = new UsageService(path.join(fixture(), "usage.db"), { scan: async () => [] });
    const accounts = [{ id: "default", label: "Default" }, { id: "work", label: "Work" }];
    index.claudeAccounts = () => accounts;
    let unavailable = false;
    index.claudeUsageFetcher = async account => unavailable && account.id === "work" ? null : ({ usage: { five_hour: { utilization: account.id === "work" ? 75 : 10 }, limits: [{ scope: { model: { display_name: "Opus" } }, group: "weekly", percent: 20 }] }, subscriptionType: "max" });
    try {
      await index.refreshClaudeRateLimits(true);
      const limits = index.rateLimitSummary().limits;
      expect(limits.find(row => row.limitId === "claude").primary.usedPercent).toBe(10);
      expect(limits.find(row => row.limitId === "claude:work")).toMatchObject({ limitName: "Claude · Work", primary: { usedPercent: 75 } });
      expect(limits.find(row => row.limitId === "claude:work:weekly:opus")).toBeTruthy();
      unavailable = true;
      await index.refreshClaudeRateLimits(true);
      expect(index.rateLimitSummary().limits.find(row => row.limitId === "claude:work").primary.usedPercent).toBe(75);
    } finally { index.close(); }
  });
});
