import { invoke } from "../platform/runtime";
import { toolForId } from "../types";
import type { Agent, Project, SessionResumeContext, SshHost } from "../types";
import { resolveSessionSettings } from "./sessionHierarchy";
import { resolveProjectSettings } from "./projectHierarchy";
import { findSshHost } from "./sshHosts";
import { addSessionWorkerArgs, workerRoles } from "./sessionWorkers";
import { normalizeLaunchOptions, type LaunchOptions } from "./launchOptions";
import { handoffPromptForAccount } from "./accountHandoff";

export type SpawnArgs = {
  sessionReferenceFolders?: { path: string; access: "read" | "write" }[];
  resumeContext?: SessionResumeContext;
  sessionInstructions?: string;
  modelSettings?: Agent["modelSettings"];
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
  initialPrompt?: string;
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
  inputAgent: Agent,
  sessionPins: Record<string, string> | null,
  setAgentSessionId: (id: string, sessionId: string | null) => void,
  options: { resumeSessionId?: string; agents?: readonly Agent[]; projects?: readonly Project[] } = {}
): Promise<SpawnArgs> {
  const settings = resolveSessionSettings(inputAgent, options.agents ?? [inputAgent], options.projects);
  const project = options.projects?.find(item => item.id === inputAgent.projectId);
  const references = project ? resolveProjectSettings(project, options.projects!).references : [];
  if (settings.instructions.length > 20000 || settings.instructions.includes("\0")) throw new Error("상속을 포함한 추가 지침은 20,000자 이내여야 합니다. Inherited instructions must be within 20,000 characters.");
  const agent = { ...inputAgent, folder: settings.folder, remoteFolder: settings.remoteFolder, modelSettings: settings.modelSettings };
  const exactResumeId = options.resumeSessionId || agent.idleResumeSessionId;
  if (agent.aiToolId === "gemini") throw new Error("Gemini CLI는 제거되었습니다. 새 Antigravity CLI 세션을 만드세요. Gemini CLI was removed; create a new Antigravity CLI session.");
  if (exactResumeId && (agent.sshHostId || !agent.folder || !["codex","claude"].includes(agent.aiToolId) || (sessionPins?.[agent.id] && sessionPins[agent.id] !== exactResumeId))) throw new Error("세션의 복원 대상이 변경되었습니다. 확인 후 다시 여세요.");
  const tool = toolForId(agent.aiToolId);
  const sshHost = agent.sshHostId ? findSshHost(agent.sshHostId) : null;
  if (agent.sshHostId && !sshHost) throw new Error("SSH host is unavailable. Update the project host before starting this session.");
  const launchOptions = !agent.sshHostId && tool.command ? normalizeLaunchOptions(agent.launchOptions) : undefined;
  if (launchOptions) {
    const flags = await invoke<{ advanced_launch_options?: boolean }>("runtime_flags");
    if (!flags?.advanced_launch_options) {
      throw new Error("고급 실행 설정을 적용하려면 앱을 다시 시작하세요. Restart the app to use advanced launch settings.");
    }
  }
  let initCommand: string | null = agent.aiToolId === "none" ? agent.shellCommand || null : null;
  let initialPrompt: string | undefined;
  let resumeContext: SessionResumeContext | undefined;

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
      const remembered = inputAgent.sessionHierarchy?.resumeContext;
      const resumeFolder = remembered?.sessionId === (exactResumeId || candidateSessionId)
        ? remembered.folder : inputAgent.folder || agent.folder;
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
            // Verify the child's own transcript before applying a different inherited cwd.
            folder: resumeFolder,
            agentId: agent.id,
            codexAccountId: agent.codexAccountId,
            claudeAccountId: agent.claudeAccountId,
            agentName: agent.name,
            preferredSessionId: exactResumeId || candidateSessionId,
            ...(exactResumeId ? {strictExact:true} : {}),
          });
          if (exactResumeId && resolved !== exactResumeId) throw new Error("기존 대화를 찾지 못했습니다. 계정과 대화 파일을 확인하세요. The suspended conversation is unavailable.");
          // A pinned group must never silently start a different conversation.
          if (managedAccount && pinnedSessionId && resolved !== pinnedSessionId) {
            throw new Error("선택한 계정에서 고정된 대화를 찾을 수 없습니다. 세션 고정을 해제하거나 계정을 확인하세요.");
          }
          sessionId = resolved ?? pinnedSessionId ?? null;
          if (!pinnedSessionId && agent.lastSessionId !== sessionId) {
            setAgentSessionId(agent.id, sessionId);
          }
        } catch (error) {
          if (managedAccount || exactResumeId) throw error;
          // Transcript lookup is a safety check, not permission to discard a
          // known-good resume target on a temporary filesystem/IPC failure.
          sessionId = candidateSessionId;
        }
      }
      if (sessionId) {
        if (agent.aiToolId === "codex") {
          resumeContext = { sessionId, folder: resumeFolder };
          cmd = `${cmd} resume ${sessionId}`;
          if (resumeFolder !== agent.folder) cmd += ' -c \'tui.resume_cwd="current"\'';
        } else if (agent.aiToolId === "claude") {
          resumeContext = { sessionId, folder: resumeFolder };
          cmd = `${cmd} --resume ${sessionId}`;
        }
      } else if (agent.aiToolId === "codex" || agent.aiToolId === "claude") {
        initialPrompt = handoffPromptForAccount(
          agent.pendingAccountHandoff,
          accountId || "default",
        );
      }
    }
    // Cline keeps its own session store; resume the latest CLI session for this
    // project folder via `cline --id <id>` (queried from `cline history`, no
    // hooks required). Local only — the history query runs on this machine.
    if (agent.aiToolId === "agy" && !sshHost) {
      const sessionId = await invoke<string | null>("resolve_cli_session", {
        aiToolId: "agy", agentId: agent.id, folder: agent.folder,
        preferredSessionId: sessionPins?.[agent.id] ?? agent.lastSessionId ?? null,
      });
      if (sessionId) {
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sessionId)) throw new Error("Invalid Antigravity conversation ID.");
        if (launchOptions?.args?.some(arg => /^(--conversation|--continue|-c)(=|$)/.test(arg))) {
          throw new Error("자동 복원과 고급 실행의 conversation/continue 옵션이 충돌합니다. 고급 실행의 복원 옵션을 제거하세요.");
        }
        cmd += ` --conversation ${sessionId}`;
        if (agent.lastSessionId !== sessionId) setAgentSessionId(agent.id, sessionId);
      }
    }
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
    const roles = agent.aiToolId === "codex" ? workerRoles(agent.workerSettings) : {};
    // Local role files must not be sent to an SSH host. Remote workers use the
    // explicit model/effort spawn overrides in the generated instructions.
    const roleFiles = !sshHost && Object.keys(roles).length
      ? await invoke<Partial<Record<"documents" | "html", string>>>("prepare_worker_roles", { roles })
      : {};
    if (!sshHost && Object.keys(roles).some(kind => !roleFiles?.[kind as keyof typeof roleFiles])) {
      throw new Error("작업자 모델 설정 파일을 준비하지 못했습니다. Worker role configuration is unavailable.");
    }
    cmd = addSessionWorkerArgs(
      agent.aiToolId,
      cmd,
      agent.workerSettings,
      roleFiles,
      settings.instructions
    );
    if (agent.aiToolId === "claude" && settings.instructions) {
      if (sshHost) throw new Error("SSH Claude 세션의 추가 지침은 아직 지원하지 않습니다. Additional instructions for SSH Claude sessions are not supported.");
    }
    if (agent.dangerous && tool.dangerousFlag) {
      cmd = `${cmd} ${tool.dangerousFlag}`;
    }
    if (agent.aiToolId === "codex" && !sshHost) {
      // The managed MCP entry is dormant in project config so ordinary Codex
      // launches do not fail without Acedia's per-session environment. Enable
      // it only for the local PTY that receives MULTIAGENT_* in main.mjs.
      cmd += " -c mcp_servers.multiagent_browser.enabled=true";
      if (agent.codexAccountId && agent.codexAccountId !== "default") {
        cmd += " -c cli_auth_credentials_store=file";
      }
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
    ...(!sshHost && references.length && ["codex", "claude"].includes(agent.aiToolId) ? { sessionReferenceFolders: references.filter(ref => ref.scopes.some(scope => scope !== "instructions")).map(ref => ({ path: ref.path, access: ref.access })) } : {}),
    launchOptions, initialPrompt, modelSettings: settings.modelSettings, resumeContext,
    ...(agent.aiToolId === "claude" && settings.instructions ? { sessionInstructions: settings.instructions } : {}) };
}
