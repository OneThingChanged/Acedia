import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prepareLaunchCommand, mergeLaunchEnvironment } from "./agent-launch.mjs";
import { selectedAccountId } from "./provider-accounts.mjs";
import { guiTerminalEnvironment } from "./dev-terminal-environment.mjs";
import { buildInteractiveSshArgs, findWindowsExecutable } from "./ssh-service.mjs";
import { CodexScrollbackFilter, PassThroughTerminalFilter } from "./terminal-stream.mjs";
import { terminateWindowsProcessTree } from "./process-tree.mjs";

const HOOK_TOOLS = new Set(["codex", "claude", "qwen"]);
const CLI_TOOLS = new Set([...HOOK_TOOLS, "cline", "agy"]);

const asString = (value) => typeof value === "string" ? value : "";
const asObject = (value) => value && typeof value === "object" ? value : {};
const asPositiveInt = (value, fallback) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

/** Prepares a local or SSH launch and hands the live process to TerminalSessionService. */
export function createTerminalLauncher({
  terminalSessions,
  hookService,
  ensureBrowserIntegrationReady,
  waitForHooks,
  setupAntigravityUsage = () => {},
  accountPoolLaunch = () => null,
  accountsForTool,
  accountBindings,
  accountSwitches,
  defaultShell,
  allocateRemotePort,
  releaseRemotePort,
  sshPasswords,
  browserMcpScriptPath,
  spawnProcess,
  baseEnv = process.env,
  platform = process.platform,
  resolveSshExecutable = () => findWindowsExecutable(platform === "win32" ? "ssh.exe" : "ssh"),
}) {
  async function prepareLaunch(args, id, aiToolId) {
    const ssh = args.ssh ? asObject(args.ssh) : null;
    if (ssh && args.launchOptions) throw new Error("Advanced launch settings are available for local sessions only.");
    let executable;
    let shellArgs;
    let reversePort = null;
    const release = () => {
      if (reversePort === null) return;
      releaseRemotePort(reversePort);
      reversePort = null;
    };
    try {
      if (ssh) {
        executable = resolveSshExecutable();
        if (!executable) throw new Error("OpenSSH 클라이언트를 찾을 수 없습니다.");
        reversePort = allocateRemotePort(id);
        shellArgs = buildInteractiveSshArgs(
          ssh,
          asString(args.initCommand),
          {
            agentId: id,
            port: hookService.port,
            reversePort,
            token: hookService.token,
            aiToolId,
          }
        );
      } else {
        executable = defaultShell(asString(args.shell).trim() || null);
        const lower = path.basename(executable).toLowerCase();
        shellArgs = lower.includes("powershell") || lower === "pwsh.exe" ? ["-NoLogo"] : [];
      }
      const requestedCwd = asString(args.cwd).trim();
      const asarSegment = `${path.sep}app.asar${path.sep}`;
      const isPackagedVirtualPath =
        requestedCwd.endsWith(`${path.sep}app.asar`) || requestedCwd.includes(asarSegment);
      const cwd =
        requestedCwd && !isPackagedVirtualPath && fs.existsSync(requestedCwd)
          ? requestedCwd
          : os.homedir();
      if (!ssh && HOOK_TOOLS.has(aiToolId) && cwd) {
        await hookService.setupProject(cwd, aiToolId);
      }
      if (!ssh && aiToolId === "agy") await setupAntigravityUsage();
      const accounts = !ssh ? accountsForTool(aiToolId) : null;
      const accountId = selectedAccountId(args);
      const accountEnv = accounts ? accounts.environment(accountId) : baseEnv;
      if (accounts?.login?.id === accountId) {
        throw new Error("로그인 완료 후 세션을 열어 주세요.");
      }
      const binding = accountBindings.get(id);
      if (accounts && binding && (binding.toolId !== aiToolId || binding.accountId !== accountId)) {
        throw new Error("계정 선택이 변경되었습니다. 세션을 다시 열어 주세요.");
      }
      if (!ssh && aiToolId === "codex") {
        await hookService.setupCodexHome(
          accountEnv.CODEX_HOME || path.join(os.homedir(), ".codex")
        );
      }
      const ptyCols = asPositiveInt(args.cols, 120);
      const launchEnvironment = mergeLaunchEnvironment(accountEnv, args.launchOptions, platform);
      const poolLaunch = !ssh && aiToolId === "codex" ? await accountPoolLaunch(id) : null;
      if (poolLaunch) {
        for (const key of Object.keys(launchEnvironment)) {
          if (["ACEDIA_ACCOUNT_POOL_KEY"].includes(key.toUpperCase())) delete launchEnvironment[key];
        }
        Object.assign(launchEnvironment, poolLaunch.env);
      }
      const initialPrompt = asString(args.initialPrompt);
      const launchCommand = ssh ? "" : prepareLaunchCommand(asString(args.initCommand).trim(), args.launchOptions, {
        shell: executable, toolId: aiToolId, env: launchEnvironment, platform,
        extraArgs: [...(poolLaunch?.args ?? []), ...(initialPrompt ? [initialPrompt] : [])],
      });
      const ptyRows = asPositiveInt(args.rows, 30);
      return {
        ssh, executable, shellArgs, reversePort, cwd, accountId,
        ptyCols, ptyRows, launchEnvironment, launchCommand, release,
      };
    } catch (error) {
      release();
      throw error;
    }
  }

  return async function spawnPty(args) {
    const id = asString(args.id).trim();
    if (!id) throw new Error("PTY id가 비어 있습니다.");
    if (accountSwitches.has(id)) throw new Error("계정 변경 중입니다. 잠시 후 다시 열어 주세요.");
    if (terminalSessions.has(id)) return { reattached: true };
    const spawnGeneration = terminalSessions.beginSpawn(id);

    const aiToolId = asString(args.aiToolId).trim();
    if (HOOK_TOOLS.has(aiToolId)) {
      // A CLI reads MCP configuration only during its own startup. Do not spawn
      // it until the hidden browser profile and authenticated loopback broker
      // are both ready, otherwise the failed MCP stays failed for that session.
      await ensureBrowserIntegrationReady();
    } else {
      await waitForHooks();
    }

    const cancelled = () => !terminalSessions.isSpawnCurrent(id, spawnGeneration) || accountSwitches.has(id);
    if (cancelled()) return { reattached: false, cancelled: true };
    const {
      ssh, executable, shellArgs, reversePort, cwd, accountId,
      ptyCols, ptyRows, launchEnvironment, launchCommand, release,
    } = await prepareLaunch(args, id, aiToolId);
    if (cancelled()) {
      release();
      return { reattached: false, cancelled: true };
    }
    const outputFilter =
      aiToolId === "codex"
        ? new CodexScrollbackFilter(ptyRows, ptyCols)
        : new PassThroughTerminalFilter();
    let processHandle;
    const agyLaunchId = !ssh && aiToolId === "agy" ? randomUUID() : "";
    try {
      processHandle = spawnProcess(executable, shellArgs, {
        name: "xterm-256color",
        cols: ptyCols,
        rows: ptyRows,
        cwd,
        env: {
          ...guiTerminalEnvironment(launchEnvironment),
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          MULTIAGENT_AGENT_ID: id,
          MULTIAGENT_AGY_LAUNCH_ID: agyLaunchId,
          MULTIAGENT_PORT: String(hookService.port || ""),
          MULTIAGENT_TOKEN: hookService.token || "",
          MULTIAGENT_MCP_SCRIPT: browserMcpScriptPath,
        },
        useConpty: true,
      });
    } catch (error) {
      outputFilter.dispose();
      release();
      throw error;
    }
    const entry = {
      id,
      agyLaunchId,
      name: asString(args.name).trim() || id,
      process: processHandle,
      codexAccountId: !ssh && aiToolId === "codex" ? accountId : null,
      claudeAccountId: !ssh && aiToolId === "claude" ? accountId : null,
      initTimer: null,
      aiToolId,
      cwd,
      ssh: ssh ? { ...ssh, reversePort, passwordInjected: false } : null,
      filter: outputFilter,
      quitCommand: CLI_TOOLS.has(aiToolId) ? "/quit\r" : "exit\r",
      terminate:
        platform === "win32" &&
        !ssh &&
        CLI_TOOLS.has(aiToolId)
          ? () => terminateWindowsProcessTree(processHandle.pid)
          : null,
      release,
      onRawData(data) {
        if (
          entry.ssh?.authMethod === "password" &&
          !entry.ssh.passwordInjected &&
          /(?:password|암호)\s*:/i.test(data)
        ) {
          const password = sshPasswords.get(asString(entry.ssh.hostId));
          if (password) {
            entry.ssh.passwordInjected = true;
            processHandle.write(`${password}\r`);
          }
        }
      },
    };
    if (!terminalSessions.register(entry, spawnGeneration)) {
      return { reattached: false, cancelled: true };
    }

    if (launchCommand) {
      entry.initTimer = setTimeout(() => {
        entry.initTimer = null;
        if (terminalSessions.get(id)?.process !== processHandle) return;
        // Agent sessions own this shell. Leaving an interactive PowerShell
        // alive after the CLI exits hides the exit from the PTY lifecycle.
        const ownsPowerShell = platform === "win32" && !ssh && CLI_TOOLS.has(aiToolId)
          && /^(?:powershell|pwsh)(?:\.exe)?$/i.test(path.basename(executable));
        processHandle.write(`${launchCommand}${ownsPowerShell ? "; exit $LASTEXITCODE" : ""}\r`);
      }, 600);
    }
    return { reattached: false };
  };
}
