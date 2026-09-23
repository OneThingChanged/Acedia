import { beforeEach, describe, expect, it, vi } from "vitest";
import { LS_SSH_HOSTS, type Agent } from "../types";
import {
  addTerminalCompatibilityArgs,
  buildSpawnArgs,
  resolveLocalToolCommand,
  resolveRemoteToolCommand,
} from "./spawn";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("../platform/runtime", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Antigravity terminal sessions", () => {
  it("resumes only the resolved conversation and propagates missing-session errors", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const agent = { id: "agy-a", aiToolId: "agy", folder: "C:/workspace", dangerous: true } as Agent;
    invokeMock.mockResolvedValue(id);
    const save = vi.fn();
    expect((await buildSpawnArgs(agent, null, save)).initCommand).toBe(`agy --conversation ${id} --dangerously-skip-permissions`);
    expect(save).toHaveBeenCalledWith(agent.id, id);
    invokeMock.mockRejectedValue(new Error("Saved Antigravity conversation is unavailable"));
    await expect(buildSpawnArgs(agent, null, save)).rejects.toThrow("unavailable");
  });
  it("prefers a pinned conversation and rejects unsafe resolved IDs", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const agent = { id: "agy-a", aiToolId: "agy", lastSessionId: "old", folder: "C:/workspace" } as Agent;
    invokeMock.mockResolvedValue(id);
    await buildSpawnArgs(agent, { "agy-a": id }, vi.fn());
    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", expect.objectContaining({ preferredSessionId: id }));
    invokeMock.mockResolvedValue("x; echo unsafe");
    await expect(buildSpawnArgs(agent, null, vi.fn())).rejects.toThrow("Invalid Antigravity");
  });
  it("rejects a saved Gemini session instead of silently launching a shell", async () => {
    await expect(buildSpawnArgs({ id: "legacy", aiToolId: "gemini" } as Agent, null, vi.fn())).rejects.toThrow("Gemini CLI was removed");
  });
  it("launches Antigravity with its own approval flag and native Windows SSH command", async () => {
    const agent = { id: "agy-a", aiToolId: "agy", folder: "C:/workspace", dangerous: true } as Agent;
    expect((await buildSpawnArgs(agent, null, vi.fn())).initCommand).toBe("agy --dangerously-skip-permissions");
    expect(resolveRemoteToolCommand("agy", "agy", { remoteOs: "windows" })).toBe("agy");
  });
  it.each([false, true])("starts new conversations with dangerous=%s when no owned ID exists", async dangerous => {
    const agent = { id: "agy-a", aiToolId: "agy", folder: "C:/workspace", dangerous } as Agent;
    const result = await buildSpawnArgs(agent, null, vi.fn());
    expect(result).toMatchObject({ initCommand: dangerous ? "agy --dangerously-skip-permissions" : "agy", cwd: "C:/workspace", ssh: null });
    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", expect.objectContaining({ aiToolId: "agy", agentId: "agy-a", preferredSessionId: null }));
  });
  it("uses the Windows SSH shim and leaves POSIX commands portable", () => {
    expect(resolveRemoteToolCommand("agy", "agy", { remoteOs: "windows" })).toBe("agy");
    expect(resolveRemoteToolCommand("agy", "agy", { remoteOs: "posix" })).toBe("agy");
    expect(resolveRemoteToolCommand("agy", "agy", { remoteOs: "windows", preferCmdShim: false })).toBe("agy");
  });
});

it("preserves saved shell commands and refuses a missing SSH target", async () => {
  const agent = { id: "shell", aiToolId: "none", folder: "C:/workspace", shellCommand: "echo fixture" } as Agent;
  expect(await buildSpawnArgs(agent, null, vi.fn())).toMatchObject({ initCommand: "echo fixture", cwd: "C:/workspace", ssh: null });
  vi.stubGlobal("localStorage", { getItem: () => null });
  await expect(buildSpawnArgs({ ...agent, sshHostId: "remote" }, null, vi.fn())).rejects.toThrow();
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === LS_SSH_HOSTS ? JSON.stringify([{ id: "remote", host: "example.test", user: "fixture", remoteOs: "posix" }]) : null });
  expect(await buildSpawnArgs({ ...agent, sshHostId: "remote", remoteFolder: "/srv/project" }, null, vi.fn())).toMatchObject({ initCommand: "echo fixture", cwd: null, ssh: { hostId: "remote", remoteFolder: "/srv/project" } });
  expect(invokeMock).not.toHaveBeenCalled();
});

describe("resolveLocalToolCommand", () => {
  it("keeps built-in agent commands portable on local Windows", () => {
    expect(resolveLocalToolCommand("codex", "codex")).toBe("codex");
    expect(resolveLocalToolCommand("claude", "claude")).toBe("claude");
    expect(resolveLocalToolCommand("qwen", "qwen")).toBe("qwen");
    expect(resolveLocalToolCommand("cline", "cline")).toBe("cline");
  });

  it("keeps custom commands unchanged", () => {
    expect(
      resolveLocalToolCommand("codex", "C:\\Tools\\codex.exe")
    ).toBe("C:\\Tools\\codex.exe");
  });
});

describe("resolveRemoteToolCommand", () => {
  it("uses .cmd shims for Codex on Windows SSH by default", () => {
    expect(
      resolveRemoteToolCommand("codex", "codex", { remoteOs: "windows" })
    ).toBe("codex.cmd");
  });

  it("uses .cmd shims for Claude on Windows SSH by default", () => {
    expect(
      resolveRemoteToolCommand("claude", "claude", { remoteOs: "windows" })
    ).toBe("claude.cmd");
  });

  it("keeps POSIX remote commands unchanged", () => {
    expect(
      resolveRemoteToolCommand("codex", "codex", { remoteOs: "posix" })
    ).toBe("codex");
  });

  it("allows Windows hosts to opt out", () => {
    expect(
      resolveRemoteToolCommand("codex", "codex", {
        remoteOs: "windows",
        preferCmdShim: false,
      })
    ).toBe("codex");
  });
});

describe("addTerminalCompatibilityArgs", () => {
  it("runs new Codex sessions in the normal terminal buffer", () => {
    expect(addTerminalCompatibilityArgs("codex", "codex.cmd")).toBe(
      "codex.cmd --no-alt-screen"
    );
  });

  it("runs resumed Codex sessions in the normal terminal buffer", () => {
    expect(
      addTerminalCompatibilityArgs("codex", "codex resume session-123")
    ).toBe("codex resume session-123 --no-alt-screen");
  });

  it("does not duplicate the flag or modify other tools", () => {
    expect(
      addTerminalCompatibilityArgs("codex", "codex --no-alt-screen")
    ).toBe("codex --no-alt-screen");
    expect(addTerminalCompatibilityArgs("claude", "claude")).toBe("claude");
  });

  it("skips the flag when the session opts into alt-screen", () => {
    expect(addTerminalCompatibilityArgs("codex", "codex.cmd", true)).toBe(
      "codex.cmd"
    );
    expect(
      addTerminalCompatibilityArgs("codex", "codex resume session-123", true)
    ).toBe("codex resume session-123");
  });
});

describe("buildSpawnArgs resume recovery", () => {
  const agent = {
    id: "agent-a",
    projectId: "project-a",
    name: "A",
    folder: "C:\\workspace",
    aiToolId: "codex",
    aiLabel: "Codex",
    dangerous: false,
    status: "idle",
    createdAt: 1,
  } as Agent;
  it("requires the exact suspended conversation even for the existing login", async () => {
    const suspended = {...agent,idleResumeSessionId:"saved",lastSessionId:"saved"};
    invokeMock.mockResolvedValue("saved");
    expect((await buildSpawnArgs(suspended,null,vi.fn())).initCommand).toContain("resume saved");
    expect(invokeMock).toHaveBeenLastCalledWith("resolve_cli_session",expect.objectContaining({strictExact:true,preferredSessionId:"saved"}));
    invokeMock.mockResolvedValue("different");
    await expect(buildSpawnArgs(suspended,null,vi.fn())).rejects.toThrow("suspended conversation");
    invokeMock.mockRejectedValue(Error("unavailable"));
    await expect(buildSpawnArgs(suspended,null,vi.fn())).rejects.toThrow("unavailable");
  });
  it("transports advanced settings without merging them into generated shell text", async () => {
    const launchOptions = { executable: "", args: ["--profile", "work space"], env: [{ name: "LANG", value: "ko" }] };
    invokeMock.mockImplementation(async command => command === "runtime_flags" ? { advanced_launch_options: true } : "saved-session");
    const result = await buildSpawnArgs({ ...agent, launchOptions }, null, vi.fn());
    expect(result.initCommand).toBe("codex resume saved-session --no-alt-screen -c mcp_servers.multiagent_browser.enabled=true");
    expect(result.launchOptions).toEqual(launchOptions);
    expect(result.launchOptions).not.toBe(launchOptions);
  });
  it("requires a capable backend rather than silently ignoring new options in a stale dev process", async () => {
    invokeMock.mockResolvedValue({});
    await expect(buildSpawnArgs({ ...agent, launchOptions: { executable: "", args: ["--profile", "work"], env: [] } }, null, vi.fn())).rejects.toThrow("Restart the app");
  });
  it("does not send local advanced settings to SSH", async () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === LS_SSH_HOSTS ? JSON.stringify([{ id: "remote", host: "example.test", user: "user", remoteOs: "windows" }]) : null });
    const result = await buildSpawnArgs({ ...agent, sshHostId: "remote", launchOptions: { executable: "C:/local/cli.exe", args: ["local"], env: [] } }, null, vi.fn());
    expect(result.launchOptions).toBeUndefined();
    expect(result.initCommand).toBe("codex.cmd --no-alt-screen");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("recovers a missing localStorage id from the per-agent backend index", async () => {
    invokeMock.mockResolvedValueOnce("session-from-hook-index");
    const setAgentSessionId = vi.fn();

    const result = await buildSpawnArgs(agent, null, setAgentSessionId);

    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", {
      aiToolId: "codex",
      folder: "C:\\workspace",
      agentId: "agent-a",
      agentName: "A",
      preferredSessionId: null,
    });
    expect(result.initCommand).toBe(
      "codex resume session-from-hook-index --no-alt-screen -c mcp_servers.multiagent_browser.enabled=true"
    );
    expect(setAgentSessionId).toHaveBeenCalledWith(
      "agent-a",
      "session-from-hook-index"
    );
  });

  it("keeps a stored resume id when validation is temporarily unavailable", async () => {
    invokeMock.mockRejectedValueOnce(new Error("temporary scan failure"));
    const setAgentSessionId = vi.fn();

    const result = await buildSpawnArgs(
      { ...agent, lastSessionId: "stored-session" },
      null,
      setAgentSessionId
    );

    expect(result.initCommand).toBe(
      "codex resume stored-session --no-alt-screen -c mcp_servers.multiagent_browser.enabled=true"
    );
    expect(setAgentSessionId).not.toHaveBeenCalled();
  });

  it("does not silently discard an invalid pinned resume target", async () => {
    invokeMock.mockResolvedValueOnce(null);

    const result = await buildSpawnArgs(
      { ...agent, lastSessionId: "newer-session" },
      { "agent-a": "pinned-session" },
      vi.fn()
    );

    expect(result.initCommand).toBe(
      "codex resume pinned-session --no-alt-screen -c mcp_servers.multiagent_browser.enabled=true"
    );
  });

  it("scopes managed account resume lookup and forces file credentials", async () => {
    invokeMock.mockResolvedValueOnce("work-session");
    const result = await buildSpawnArgs({ ...agent, codexAccountId: "work" }, null, vi.fn());
    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", expect.objectContaining({ codexAccountId: "work" }));
    expect(result.initCommand).toContain("codex resume work-session");
    expect(result.initCommand).toContain("-c cli_auth_credentials_store=file");
  });

  it("passes the selected Claude account when resuming", async () => {
    invokeMock.mockResolvedValueOnce("claude-work-session");
    const result = await buildSpawnArgs({ ...agent, aiToolId: "claude", claudeAccountId: "work" }, null, vi.fn());
    expect(invokeMock).toHaveBeenCalledWith("resolve_cli_session", expect.objectContaining({ aiToolId: "claude", claudeAccountId: "work" }));
    expect(result.initCommand).toBe("claude --resume claude-work-session");
  });

  it.each(["codex", "claude"])("refuses unverified managed %s resume targets", async (provider) => {
    const managed = { ...agent, aiToolId: provider, codexAccountId: "work", claudeAccountId: "work", lastSessionId: "old-session" };
    invokeMock.mockRejectedValueOnce(new Error("lookup unavailable"));
    await expect(buildSpawnArgs(managed, null, vi.fn())).rejects.toThrow("lookup unavailable");
    invokeMock.mockResolvedValueOnce(null);
    await expect(buildSpawnArgs(managed, { "agent-a": "other-account-session" }, vi.fn())).rejects.toThrow();
  });

  it("applies worker settings when an existing Codex session is resumed", async () => {
    invokeMock.mockResolvedValueOnce("existing-session");
    invokeMock.mockResolvedValueOnce({ documents: "C:/fixture/worker.toml" });

    const result = await buildSpawnArgs(
      {
        ...agent,
        lastSessionId: "existing-session",
        workerSettings: {
          documents: "codex-luna-max",
          html: "claude-opus",
        },
      },
      null,
      vi.fn()
    );

    expect(result.initCommand).toContain(
      "codex resume existing-session --no-alt-screen"
    );
    expect(result.initCommand).toContain(
      "agents.default_subagent_model=\"gpt-6-luna\""
    );
    expect(result.initCommand).toContain("claude -p --model opus");
    expect(result.initCommand).toContain('agents.multiagent_docs_writer.config_file="C:/fixture/worker.toml"');
  });

  it("passes a pending handoff only to a fresh target-account conversation", async () => {
    invokeMock.mockResolvedValueOnce(null);
    const handoff = { id: "h", fromAccountId: "default", toAccountId: "work", createdAt: 1, prompt: "[Account switch handoff] Continue here" };
    const fresh = await buildSpawnArgs({ ...agent, codexAccountId: "work", pendingAccountHandoff: handoff }, null, vi.fn());
    expect(fresh.initialPrompt).toBe(handoff.prompt);

    invokeMock.mockResolvedValueOnce("existing-work-session");
    const resumed = await buildSpawnArgs({ ...agent, codexAccountId: "work", pendingAccountHandoff: handoff }, null, vi.fn());
    expect(resumed.initialPrompt).toBeUndefined();
    expect(resumed.initCommand).toContain("resume existing-work-session");
  });
});
