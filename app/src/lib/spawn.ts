import { invoke } from "../platform/runtime";
import { toolForId } from "../types";
import type { Agent, SshHost } from "../types";
import { findSshHost } from "./sshHosts";
import { addSessionWorkerArgs } from "./sessionWorkers";
import { normalizeLaunchOptions, type LaunchOptions } from "./launchOptions";

export type SpawnArgs = {
  launchOptions?: LaunchOptions;
  initCommand: string | null;
  ssh: {
    host: string;
    user: string;
    port?: number;
    identityFile?: string;
    extraOptions?: string;
    remoteFolder: string | null;
    remoteOs: string;
    authMethod: string;
    hostId: string;
  } | null;
  cwd: string | null;
};

export function addTerminalCompatibilityArgs(
  aiToolId: string,
  command: string,
  useAltScreen = false
): string {
  // Per-session opt-out (세션 속성 → Alt-screen): let Codex run on the
  // alternate screen instead of forcing the scrollback-preserving mode.
  if (useAltScreen) return command;
  if (
    aiToolId === "codex" &&
    !/(?:^|\s)--no-alt-screen(?:\s|$)/.test(command)
  ) {
    return `${command} --no-alt-screen`;
  }
  return command;
}

export function resolveRemoteToolCommand(
  aiToolId: string,
  command: string,
  sshHost: Pick<SshHost, "remoteOs" | "preferCmdShim"> | null
): string {
  if (
    !command ||
    sshHost?.remoteOs !== "windows" ||
    sshHost.preferCmdShim === false
  ) {
    return command;
  }

  if (aiToolId === "codex" && command === "codex") return "codex.cmd";
  if (aiToolId === "claude" && command === "claude") return "claude.cmd";
  if (aiToolId === "qwen" && command === "qwen") return "qwen.cmd";
  if (aiToolId === "cline" && command === "cline") return "cline.cmd";
  return command;
}

export function resolveLocalToolCommand(
  _aiToolId: string,
  command: string
): string {
  // Keep the configured command intact. Forcing npm's Windows .cmd shim here
  // leaks a platform-specific wrapper into resume/compatibility arguments and
  // breaks native or user-provided CLI resolution in otherwise valid shells.
  // Windows SSH hosts retain their explicit, per-host .cmd compatibility flag.
  return command;
}

// Builds the spawn_pty arguments for an agent: resolves the resume session id
// (codex resume / claude --resume), appends the dangerous flag, and assembles
// the ssh descriptor for remote hosts. Shared by the visible-pane spawn
// (PaneSlot) and the background reopen-all spawn (App), so both behave the same.
export async function buildSpawnArgs(
  agent: Agent,
  sessionPins: Record<string, string> | null,
  setAgentSessionId: (id: string, sessionId: string | null) => void
): Promise<SpawnArgs> {
  const tool = toolForId(agent.aiToolId);
  const sshHost = agent.sshHostId ? findSshHost(agent.sshHostId) : null;
  const launchOptions = !agent.sshHostId && tool.command ? normalizeLaunchOptions(agent.launchOptions) : undefined;
  if (launchOptions) {
    const flags = await invoke<{ advanced_launch_options?: boolean }>("runtime_flags");
    if (!flags?.advanced_launch_options) {
      throw new Error("고급 실행 설정을 적용하려면 앱을 다시 시작하세요. Restart the app to use advanced launch settings.");
    }
  }
  let initCommand: string | null = null;

  if (tool.command) {
    let cmd = sshHost
      ? resolveRemoteToolCommand(agent.aiToolId, tool.command, sshHost)
      : resolveLocalToolCommand(agent.aiToolId, tool.command);
    if (sshHost) {
      // Windows remote (Phase 2): remote hooks capture session_id into
      // lastSessionId, so resume directly (no local-disk resolve, which can't
      // see the remote transcript). POSIX remote stays unsupported.
      if (sshHost.remoteOs === "windows") {
        const sessionId = sessionPins?.[agent.id] ?? agent.lastSessionId ?? null;
        if (sessionId) {
          if (agent.aiToolId === "claude") {
            cmd = `${cmd} --resume ${sessionId}`;
          } else if (agent.aiToolId === "codex") {
            cmd = `${cmd} resume ${sessionId}`;
          }
        }
      }
    } else {
      const pinnedSessionId = sessionPins?.[agent.id] ?? null;
      const candidateSessionId = pinnedSessionId ?? agent.lastSessionId ?? null;
      const accountId = agent.aiToolId === "claude" ? agent.claudeAccountId : agent.codexAccountId;
      const managedAccount = accountId && accountId !== "default";
      let sessionId: string | null = null;
      if (
        agent.folder &&
        (agent.aiToolId === "codex" || agent.aiToolId === "claude")
      ) {
        try {
          const resolved = await invoke<string | null>("resolve_cli_session", {
            aiToolId: agent.aiToolId,
            folder: agent.folder,
            agentId: agent.id,
            codexAccountId: agent.codexAccountId,
            claudeAccountId: agent.claudeAccountId,
            agentName: agent.name,
            preferredSessionId: candidateSessionId,
          });
          // A pinned group must never silently start a different conversation.
          if (managedAccount && pinnedSessionId && resolved !== pinnedSessionId) {
            throw new Error("선택한 계정에서 고정된 대화를 찾을 수 없습니다. 세션 고정을 해제하거나 계정을 확인하세요.");
          }
          sessionId = resolved ?? pinnedSessionId ?? null;
          if (!pinnedSessionId && agent.lastSessionId !== sessionId) {
            setAgentSessionId(agent.id, sessionId);
          }
        } catch (error) {
          if (managedAccount) throw error;
          // Transcript lookup is a safety check, not permission to discard a
          // known-good resume target on a temporary filesystem/IPC failure.
          sessionId = candidateSessionId;
        }
      }
      if (sessionId) {
        if (agent.aiToolId === "codex") {
          cmd = `${cmd} resume ${sessionId}`;
        } else if (agent.aiToolId === "claude") {
          cmd = `${cmd} --resume ${sessionId}`;
        }
      }
    }
    // Cline keeps its own session store; resume the latest CLI session for this
    // project folder via `cline --id <id>` (queried from `cline history`, no
    // hooks required). Local only — the history query runs on this machine.
    if (agent.aiToolId === "cline" && !sshHost && agent.folder) {
      try {
        const clineSession = await invoke<string | null>(
          "resolve_cline_session",
          { folder: agent.folder }
        );
        if (clineSession) cmd = `${cmd} --id ${clineSession}`;
      } catch {
        /* history unavailable → start a fresh session */
      }
    }
    cmd = addTerminalCompatibilityArgs(
      agent.aiToolId,
      cmd,
      agent.useAltScreen === true
    );
    cmd = addSessionWorkerArgs(
      agent.aiToolId,
      cmd,
      agent.workerSettings
    );
    if (agent.dangerous && tool.dangerousFlag) {
      cmd = `${cmd} ${tool.dangerousFlag}`;
    }
    if (agent.aiToolId === "codex" && agent.codexAccountId && agent.codexAccountId !== "default" && !sshHost) {
      cmd += " -c cli_auth_credentials_store=file";
    }
    initCommand = cmd;
  }

  const ssh = sshHost
    ? {
        host: sshHost.host,
        user: sshHost.user,
        port: sshHost.port,
        identityFile: sshHost.identityFile,
        extraOptions: sshHost.extraOptions,
        remoteFolder: agent.remoteFolder ?? null,
        remoteOs: sshHost.remoteOs ?? "posix",
        authMethod: sshHost.authMethod ?? "key",
        hostId: sshHost.id,
      }
    : null;

  return { initCommand, ssh, cwd: sshHost ? null : agent.folder || null,
    launchOptions };
}
