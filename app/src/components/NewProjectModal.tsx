import { useEffect, useState } from "react";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { SessionWorkerFields } from "./SessionWorkerFields";
import { AccountSelect } from "./ProviderAccounts";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { openDialog } from "../platform/plugins";
import {
  AI_TOOLS,
  toolForId,
  type NewProjectPayload,
  type ProjectFolder,
} from "../types";
import { loadSshHosts } from "../lib/sshHosts";
import { useAppLanguage } from "../lib/appLanguage";

export function NewProjectModal({
  defaultName,
  onCancel,
  onCreate,
  disabledTools = [],
  projectFolders = [],
}: {
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewProjectPayload) => void;
  disabledTools?: string[];
  projectFolders?: ProjectFolder[];
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();

  const visibleTools = AI_TOOLS.filter(
    (tool) => tool.id === "none" || !disabledTools.includes(tool.id)
  );
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState("");
  const [aiToolId, setAiToolId] = useState("");
  const [claudeAccountId, setClaudeAccountId] = useState(() => loadAgentDefaults("claude").claudeAccountId);
  const [codexAccountId, setCodexAccountId] = useState(() => loadAgentDefaults("codex").codexAccountId);
  const [useAltScreen, setUseAltScreen] = useState(() => loadAgentDefaults("codex").useAltScreen);
  const [workerSettings, setWorkerSettings] = useState(() => loadAgentDefaults("codex").workerSettings);
  const [dangerous, setDangerous] = useState(false);
  const [remote, setRemote] = useState(false);
  const [sshHosts] = useState(() => loadSshHosts());
  const [sshHostId, setSshHostId] = useState<string>("");
  const [remoteFolder, setRemoteFolder] = useState("");
  const selectedTool = toolForId(aiToolId);
  const supportsDangerous = !!aiToolId && !!selectedTool.dangerousFlag;
  const machineKey = remote && sshHostId ? `ssh:${sshHostId}` : "local";
  const availableProjectFolders = projectFolders.filter(
    (item) => item.machineKey === machineKey
  );
  const [projectFolderId, setProjectFolderId] = useState("");
  useEffect(() => {
    if (
      projectFolderId &&
      !availableProjectFolders.some((item) => item.id === projectFolderId)
    ) {
      setProjectFolderId("");
    }
  }, [availableProjectFolders, projectFolderId]);

  const browse = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === "string") setFolder(selected);
    } catch {}
  };

  const canSubmit =
    name.trim().length > 0 &&
    visibleTools.some((tool) => tool.id === aiToolId) &&
    (remote ? sshHostId.length > 0 : folder.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    if (remote) {
      onCreate({
        name: name.trim(),
        folder: "",
        aiToolId,
        dangerous: dangerous && supportsDangerous,
        useAltScreen: aiToolId === "codex" ? useAltScreen : undefined,
        workerSettings: aiToolId === "codex" ? workerSettings : undefined,
        sshHostId,
        remoteFolder: remoteFolder.trim(),
        projectFolderId: projectFolderId || undefined,
      });
    } else {
      onCreate({
        name: name.trim(),
        folder: folder.trim(),
        aiToolId,
        codexAccountId: aiToolId === "codex" ? codexAccountId : undefined,
        claudeAccountId: aiToolId === "claude" ? claudeAccountId : undefined,
        dangerous: dangerous && supportsDangerous,
        useAltScreen: aiToolId === "codex" ? useAltScreen : undefined,
        workerSettings: aiToolId === "codex" ? workerSettings : undefined,
        projectFolderId: projectFolderId || undefined,
      });
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">{text("새 프로젝트", "New Project")}</h2>

        <label className="field">
          <span className="field-label">{text("프로젝트 이름", "Project name")}</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder="e.g. ProjectA"
          />
        </label>

        <label className="field">
          <span className="field-label">{text("첫 세션 도구", "First session tool")}</span>
          <select
            value={aiToolId}
            onChange={(event) => {
              const nextToolId = event.target.value;
              setAiToolId(nextToolId);
              const defaults = loadAgentDefaults(nextToolId);
              setDangerous(defaults.dangerous);
              if (nextToolId === "codex") { setCodexAccountId(defaults.codexAccountId); setUseAltScreen(defaults.useAltScreen); setWorkerSettings(defaults.workerSettings); }
              if (nextToolId === "claude") setClaudeAccountId(defaults.claudeAccountId);
              if (!toolForId(nextToolId).dangerousFlag) {
                setDangerous(false);
              }
            }}
          >
            <option value="" disabled>
              {text("도구 선택…", "Select a tool…")}
            </option>
            {visibleTools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.label}
              </option>
            ))}
          </select>
          <span className="check-hint">
            {text("프로젝트를 만들면 선택한 도구로 Session 1이 바로 시작됩니다.", "Creating the project starts Session 1 with the selected tool.")}
          </span>
        </label>

        {aiToolId === "codex" && !remote && <AccountSelect value={codexAccountId} onChange={setCodexAccountId} />}
        {aiToolId === "claude" && !remote && <AccountSelect provider="claude" value={claudeAccountId} onChange={setClaudeAccountId} />}

        {aiToolId === "codex" && <>
          <label className="field-check"><input type="checkbox" checked={useAltScreen} onChange={e => setUseAltScreen(e.target.checked)} /><span>{text("Alt-screen 모드", "Alt-screen mode")}</span></label>
          <SessionWorkerFields settings={workerSettings} disabledTools={disabledTools} onChange={setWorkerSettings} />
        </>}
        {supportsDangerous && (
          <label className="field-check">
            <input
              type="checkbox"
              checked={dangerous}
              onChange={(event) => setDangerous(event.target.checked)}
            />
            <span>
              <span className="check-label">{text("Dangerous 모드", "Dangerous mode")}</span>
              <span className="check-hint">
                {text(`${selectedTool.dangerousFlag} — 권한 확인을 생략합니다.`, `${selectedTool.dangerousFlag} — skips permission prompts.`)}
              </span>
            </span>
          </label>
        )}

        <label className="field-check">
          <input
            type="checkbox"
            checked={remote}
            onChange={(event) => setRemote(event.target.checked)}
          />
          <span>
            <span className="check-label">{text("원격 호스트에서 실행 (SSH)", "Run on remote host (SSH)")}</span>
            <span className="check-hint">
              {text("이 프로젝트의 세션을 SSH로 다른 컴퓨터에서 실행합니다.", "Sessions of this project run on another machine over SSH")}
            </span>
          </span>
        </label>

        {!remote && (
          <label className="field">
            <span className="field-label">{text("프로젝트 폴더", "Project folder")}</span>
            <div className="folder-row">
              <input
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                placeholder="C:\\path\\to\\project"
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") onCancel();
                }}
              />
              <button type="button" className="browse-btn" onClick={browse}>
                {text("찾아보기…", "Browse…")}
              </button>
            </div>
          </label>
        )}

        {remote && (
          <>
            <label className="field">
              <span className="field-label">{text("SSH 호스트", "SSH host")}</span>
              {sshHosts.length > 0 ? (
                <select
                  value={sshHostId}
                  onChange={(event) => setSshHostId(event.target.value)}
                >
                  <option value="">{text("호스트 선택…", "Select a host…")}</option>
                  {sshHosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label} ({h.user}@{h.host})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="check-hint">
                  {text("Settings → SSH Hosts에서 먼저 호스트를 등록하세요.", "Register a host in Settings → SSH Hosts first.")}
                </span>
              )}
            </label>
            <label className="field">
              <span className="field-label">{text("원격 폴더", "Remote folder")}</span>
              <input
                value={remoteFolder}
                onChange={(event) => setRemoteFolder(event.target.value)}
                placeholder="/home/user/project"
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") onCancel();
                }}
              />
            </label>
          </>
        )}

        {availableProjectFolders.length > 0 && (
          <label className="field">
            <span className="field-label">{text("사이드바 폴더", "Sidebar folder")}</span>
            <select
              value={projectFolderId}
              onChange={(event) => setProjectFolderId(event.target.value)}
            >
              <option value="">{text("미분류", "Uncategorized")}</option>
              {availableProjectFolders.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            {text("취소", "Cancel")}
          </button>
          <button
            className="btn-primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            {text("만들기", "Create")}
          </button>
        </div>
      </div>
    </div>
  );
}
