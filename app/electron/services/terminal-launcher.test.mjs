import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalLauncher } from "./terminal-launcher.mjs";
import { TerminalSessionService } from "./terminal-session-service.mjs";

const fixtures = [];
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture() {
  const sessions = new TerminalSessionService();
  const ports = new Set();
  const processes = [];
  const hookService = {
    port: 12345, token: "fixture-token",
    setupProject: vi.fn(async () => {}),
    setupCodexHome: vi.fn(async () => {}),
  };
  const providers = Object.fromEntries(["codex", "claude"].map(provider => [provider, {
    environment: vi.fn(id => ({
      Path: "fixture-path", NO_COLOR: "1",
      [provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR"]: path.join(os.tmpdir(), "acedia-launch-test", provider, id),
    })),
  }]));
  const dependencies = {
    terminalSessions: sessions, hookService,
    ensureBrowserIntegrationReady: vi.fn(async () => {}),
    waitForHooks: vi.fn(async () => {}),
    accountsForTool: vi.fn(tool => providers[tool] ?? null),
    accountBindings: new Map(), accountSwitches: new Set(),
    defaultShell: () => "/bin/bash",
    allocateRemotePort: vi.fn(() => { ports.add(49152); return 49152; }),
    releaseRemotePort: vi.fn(port => ports.delete(port)),
    sshPasswords: new Map([["host-a", "fixture-password"]]),
    resolveSshExecutable: () => "ssh",
    browserMcpScriptPath: "/fixture/browser-mcp.mjs",
    development: true, platform: "linux", baseEnv: { Path: "base-path" },
    spawnProcess: vi.fn(() => {
      let onData;
      const process = {
        write: vi.fn(), kill: vi.fn(), resize: vi.fn(),
        onData: callback => { onData = callback; }, onExit: vi.fn(),
        emitData: value => onData(value),
      };
      processes.push(process);
      return process;
    }),
  };
  const args = { id: "session-a", aiToolId: "codex", codexAccountId: "account-a", cwd: os.tmpdir() };
  const test = { dependencies, sessions, ports, processes, providers, args };
  fixtures.push(test);
  return { ...test, launch: createTerminalLauncher(dependencies) };
}

afterEach(() => {
  for (const { sessions } of fixtures.splice(0)) sessions.closeAll();
  vi.useRealTimers();
});

describe("terminal launch lifecycle", () => {
  it("applies Acedia account pool only to a new local Codex launch, preserving home and resume", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const accountPoolLaunch = vi.fn(() => ({ env: { ACEDIA_ACCOUNT_POOL_KEY: "lb-secret" }, args: ["-c", 'model_provider="acedia_pool"'] }));
    const launch = createTerminalLauncher({ ...f.dependencies, accountPoolLaunch });
    await launch({ ...f.args, initCommand: "codex resume saved-id", initialPrompt: "continue work" });
    const env = f.dependencies.spawnProcess.mock.calls[0][2].env;
    expect(env.CODEX_HOME).toContain("account-a");
    expect(env.ACEDIA_ACCOUNT_POOL_KEY).toBe("lb-secret");
    await vi.advanceTimersByTimeAsync(600);
    expect(f.processes[0].write.mock.calls[0][0]).toBe("'codex' resume saved-id '-c' 'model_provider=\"acedia_pool\"' 'continue work'\r");
    expect(f.processes[0].write.mock.calls[0][0]).not.toContain("lb-secret");
    await launch({ ...f.args });
    expect(accountPoolLaunch).toHaveBeenCalledOnce();
  });
  it("does not apply acedia_pool to SSH or another provider", async () => {
    const f = fixture(); const accountPoolLaunch = vi.fn(() => { throw new Error("must not run"); });
    const launch = createTerminalLauncher({ ...f.dependencies, accountPoolLaunch });
    await launch({ ...f.args, aiToolId: "claude" });
    await launch({ ...f.args, id: "remote", ssh: { host: "example.test", user: "test" } });
    expect(accountPoolLaunch).not.toHaveBeenCalled();
  });
  it("does not fall back to direct Codex when connection preparation fails", async () => {
    const f = fixture();
    const launch = createTerminalLauncher({ ...f.dependencies, accountPoolLaunch: () => { throw new Error("key unavailable"); } });
    await expect(launch({ ...f.args, initCommand: "codex" })).rejects.toThrow("key unavailable");
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
  });
  it.each([false, true])("installs the Antigravity quota bridge only for local sessions (SSH=%s)", async remote => {
    const f = fixture(); const setupAntigravityUsage = vi.fn();
    const launch = createTerminalLauncher({ ...f.dependencies, setupAntigravityUsage });
    await launch({ ...f.args, aiToolId: "agy", ...(remote ? { ssh: { host: "example.test", user: "test" } } : {}) });
    expect(setupAntigravityUsage).toHaveBeenCalledTimes(remote ? 0 : 1);
  });
  it.each(["codex", "claude", "shell"])("removes inherited NO_COLOR for release %s sessions", async aiToolId => {
    const f = fixture();
    const inherited = { Path: "fixture-path", NO_COLOR: "1", No_Color: "1", CODEX_HOME: os.tmpdir() };
    if (f.providers[aiToolId]) f.providers[aiToolId].environment.mockReturnValue(inherited);
    const launch = createTerminalLauncher({ ...f.dependencies, development: false, baseEnv: inherited });
    await launch({ ...f.args, aiToolId });
    const env = f.dependencies.spawnProcess.mock.calls[0][2].env;
    expect(Object.keys(env).some(key => key.toUpperCase() === "NO_COLOR")).toBe(false);
    expect(env).toMatchObject({ Path: "fixture-path", TERM: "xterm-256color", COLORTERM: "truecolor" });
    expect(inherited.NO_COLOR).toBe("1");
    expect(inherited.No_Color).toBe("1");
  });

  it("waits for the broker and account configuration before spawning with isolated credentials", async () => {
    const f = fixture();
    const ready = deferred();
    f.dependencies.ensureBrowserIntegrationReady.mockReturnValue(ready.promise);
    const configured = deferred();
    f.dependencies.hookService.setupCodexHome.mockReturnValue(configured.promise);
    const launching = f.launch(f.args);
    expect(f.dependencies.hookService.setupProject).not.toHaveBeenCalled();
    ready.resolve();
    await vi.waitFor(() => expect(f.dependencies.hookService.setupCodexHome).toHaveBeenCalled());
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
    configured.resolve();
    await expect(launching).resolves.toEqual({ reattached: false });
    const accountEnv = f.providers.codex.environment.mock.results[0].value;
    expect(f.dependencies.hookService.setupCodexHome).toHaveBeenCalledWith(accountEnv.CODEX_HOME);
    expect(f.dependencies.spawnProcess.mock.calls[0][2]).toMatchObject({
      cwd: os.tmpdir(), cols: 120, rows: 30,
      env: { CODEX_HOME: accountEnv.CODEX_HOME, TERM: "xterm-256color", COLORTERM: "truecolor",
        MULTIAGENT_AGENT_ID: "session-a", MULTIAGENT_TOKEN: "fixture-token", MULTIAGENT_MCP_SCRIPT: "/fixture/browser-mcp.mjs" },
    });
    expect(f.dependencies.spawnProcess.mock.calls[0][2].env.NO_COLOR).toBeUndefined();
    expect(accountEnv.NO_COLOR).toBe("1");
  });

  it("keeps simultaneous account environments separate", async () => {
    const f = fixture();
    await Promise.all([
      f.launch(f.args),
      f.launch({ ...f.args, id: "session-b", codexAccountId: "account-b" }),
    ]);
    const environments = f.dependencies.spawnProcess.mock.calls.map(call => call[2].env);
    expect(environments.map(env => path.basename(env.CODEX_HOME))).toEqual(["account-a", "account-b"]);
    expect(f.sessions.get("session-b").codexAccountId).toBe("account-b");
  });

  it.each(["login", "binding"])("rejects a pending %s before creating a process", async reason => {
    const f = fixture();
    if (reason === "login") f.providers.codex.login = { id: "account-a" };
    else f.dependencies.accountBindings.set("session-a", { toolId: "codex", accountId: "account-b" });
    await expect(f.launch(f.args)).rejects.toThrow();
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
  });

  it.each(["close", "closeAll"])("cancels a pending launch after %s", async action => {
    const f = fixture();
    const ready = deferred();
    f.dependencies.ensureBrowserIntegrationReady.mockReturnValue(ready.promise);
    const pending = f.launch(f.args);
    if (action === "closeAll") f.sessions.closeAll("app-quit");
    else f.sessions.close("session-a");
    ready.resolve();
    await expect(pending).resolves.toMatchObject({ cancelled: true });
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
    expect(f.sessions.has("session-a")).toBe(false);
  });

  it("keeps only the latest concurrent launch and reattaches an existing process", async () => {
    const f = fixture();
    const ready = deferred();
    f.dependencies.ensureBrowserIntegrationReady.mockReturnValue(ready.promise);
    const first = f.launch(f.args);
    const second = f.launch(f.args);
    ready.resolve();
    await expect(first).resolves.toMatchObject({ cancelled: true });
    await expect(second).resolves.toEqual({ reattached: false });
    await expect(f.launch(f.args)).resolves.toEqual({ reattached: true });
    expect(f.dependencies.spawnProcess).toHaveBeenCalledTimes(1);
  });

  it.each(["account switch", "app quit"])("cancels after %s during account-home setup", async action => {
    const f = fixture();
    const configured = deferred();
    f.dependencies.hookService.setupCodexHome.mockReturnValue(configured.promise);
    const pending = f.launch(f.args);
    await vi.waitFor(() => expect(f.dependencies.hookService.setupCodexHome).toHaveBeenCalled());
    if (action === "app quit") f.sessions.closeAll("app-quit");
    else {
      f.sessions.beginSpawn("session-a");
      f.dependencies.accountBindings.set("session-a", { toolId: "codex", accountId: "account-b" });
    }
    configured.resolve();
    await expect(pending).resolves.toMatchObject({ cancelled: true });
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
  });

  it("never starts a process when account configuration fails", async () => {
    const f = fixture();
    f.dependencies.hookService.setupCodexHome.mockRejectedValue(new Error("config unavailable"));
    await expect(f.launch(f.args)).rejects.toThrow("config unavailable");
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
  });

  it("cancels the delayed initial command when the session closes", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.launch({ ...f.args, initCommand: "codex --no-alt-screen" });
    f.sessions.close("session-a");
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.processes[0].write).not.toHaveBeenCalled();
    expect(f.processes[0].kill).toHaveBeenCalledTimes(1);
  });

  it("delivers the generated command and handoff prompt as one launch", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.launch({ ...f.args, initCommand: "codex --no-alt-screen", initialPrompt: "continue 'here'" });
    await vi.advanceTimersByTimeAsync(600);
    expect(f.processes[0].write).toHaveBeenCalledTimes(1);
    expect(f.processes[0].write.mock.calls[0][0]).toBe("'codex' --no-alt-screen 'continue '\"'\"'here'\"'\"''\r");
  });

  it.each(["codex", "claude", "terminal"])("settles the Windows %s shell lifecycle", async aiToolId => {
    vi.useFakeTimers();
    const f = fixture();
    const exit = vi.fn();
    f.sessions.broadcastExit = exit;
    const launch = createTerminalLauncher({ ...f.dependencies,
      platform: "win32", defaultShell: () => "powershell.exe" });
    await launch({ ...f.args, aiToolId, initCommand: aiToolId === "terminal" ? "echo test" : aiToolId });
    await vi.advanceTimersByTimeAsync(600);
    expect(f.processes[0].write).toHaveBeenCalledWith(aiToolId === "terminal"
      ? "echo test\r" : `${aiToolId}; exit $LASTEXITCODE\r`);
    f.processes[0].onExit.mock.calls[0][0]({ exitCode: 0 });
    expect(f.sessions.has(f.args.id)).toBe(false);
    expect(exit).toHaveBeenCalledWith({ id: f.args.id, exitCode: 0, reason: "natural" });
  });

  const ssh = { host: "example.test", user: "fixture", hostId: "host-a", authMethod: "password", remoteOs: "posix" };
  it("releases the reserved SSH port if option parsing fails", async () => {
    const f = fixture();
    await expect(f.launch({ ...f.args, ssh: { ...ssh, extraOptions: '"unterminated' } })).rejects.toThrow("SSH");
    expect(f.ports.size).toBe(0);
    expect(f.dependencies.spawnProcess).not.toHaveBeenCalled();
  });

  it("releases the SSH port when native process creation fails", async () => {
    const f = fixture();
    f.dependencies.spawnProcess.mockImplementation(() => { throw new Error("spawn failed"); });
    await expect(f.launch({ ...f.args, ssh })).rejects.toThrow("spawn failed");
    expect(f.ports.size).toBe(0);
    expect(f.dependencies.releaseRemotePort).toHaveBeenCalledTimes(1);
  });

  it("uses remote bootstrap without local account changes and supplies the password once", async () => {
    const f = fixture();
    await f.launch({ ...f.args, ssh, initCommand: "codex" });
    expect(f.dependencies.hookService.setupProject).not.toHaveBeenCalled();
    expect(f.dependencies.hookService.setupCodexHome).not.toHaveBeenCalled();
    expect(f.providers.codex.environment).not.toHaveBeenCalled();
    expect(f.dependencies.spawnProcess.mock.calls[0][1]).toContain("49152:127.0.0.1:12345");
    f.processes[0].emitData("password:");
    f.processes[0].emitData("password:");
    expect(f.processes[0].write).toHaveBeenCalledExactlyOnceWith("fixture-password\r");
    f.sessions.close("session-a");
    expect(f.ports.size).toBe(0);
    expect(f.dependencies.releaseRemotePort).toHaveBeenCalledTimes(1);
  });

  it("leaves an ordinary shell independent of agent integration", async () => {
    const f = fixture();
    await f.launch({ ...f.args, aiToolId: "terminal", cwd: path.join(os.tmpdir(), "app.asar", "virtual") });
    expect(f.dependencies.ensureBrowserIntegrationReady).not.toHaveBeenCalled();
    expect(f.dependencies.waitForHooks).toHaveBeenCalledOnce();
    expect(f.dependencies.hookService.setupProject).not.toHaveBeenCalled();
    expect(f.dependencies.spawnProcess.mock.calls[0][2].cwd).toBe(os.homedir());
    expect(f.sessions.get("session-a").quitCommand).toBe("exit\r");
  });
  it("starts Antigravity with the CLI lifecycle and no unsupported hook configuration", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const launch = createTerminalLauncher({ ...f.dependencies, platform: "win32", defaultShell: () => "pwsh.exe" });
    await launch({ ...f.args, aiToolId: "agy", initCommand: "agy" });
    expect(f.dependencies.hookService.setupProject).not.toHaveBeenCalled();
    expect(f.dependencies.hookService.setupCodexHome).not.toHaveBeenCalled();
    expect(f.sessions.get("session-a").quitCommand).toBe("/quit\r");
    expect(f.sessions.get("session-a").terminate).toBeTypeOf("function");
    await vi.advanceTimersByTimeAsync(600);
    expect(f.processes[0].write).toHaveBeenCalledWith("agy; exit $LASTEXITCODE\r");
  });
});
