import { useEffect, useId, useState } from "react";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { newSessionPoolAccountId } from "../lib/sessionLaunchAccount";
import { SessionWorkerDisclosure } from "./SessionWorkerDisclosure";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import type { LaunchOptions } from "../lib/launchOptions";
import { AccountSelect } from "./ProviderAccounts";
import { PoolAccountSelect } from "./PoolAccountSelect";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useCreationDialog } from "../hooks/useCreationDialog";
import { openDialog } from "../platform/plugins";
import {
  AI_TOOLS,
  toolForId,
  type NewProjectPayload,
  type ProjectFolder,
} from "../types";
import { loadSshHosts } from "../lib/sshHosts";
import { useAppLanguage } from "../lib/appLanguage";
import "./NewAgentModal.css";

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
  const id = useId();
  const { dialogRef, nameRef } = useCreationDialog(onCancel);

  const visibleTools = AI_TOOLS.filter(
    (tool) => tool.id === "none" || !disabledTools.includes(tool.id)
  );
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState("");
  const [aiToolId, setAiToolId] = useState("");
  const [claudeAccountId, setClaudeAccountId] = useState(() => loadAgentDefaults("claude").claudeAccountId);
  const [codexAccountId, setCodexAccountId] = useState(() => loadAgentDefaults("codex").codexAccountId);
  const [codexPoolAccountId, setCodexPoolAccountId] = useState(() => newSessionPoolAccountId(undefined, loadAgentDefaults("codex")) || "");
  const [useAltScreen, setUseAltScreen] = useState(() => loadAgentDefaults("codex").useAltScreen);
  const [workerSettings, setWorkerSettings] = useState(() => loadAgentDefaults("codex").workerSettings);
  const [dangerous, setDangerous] = useState(false);
  const [launchOptions, setLaunchOptions] = useState<LaunchOptions>();
  const [launchValid, setLaunchValid] = useState(true);
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
    (remote || !selectedTool.command || launchValid) &&
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
        launchOptions: selectedTool.command ? launchOptions : undefined,
        aiToolId,
        codexAccountId: aiToolId === "codex" ? codexAccountId : undefined,
        codexPoolAccountId: aiToolId === "codex" ? codexPoolAccountId : undefined,
        claudeAccountId: aiToolId === "claude" ? claudeAccountId : undefined,
        dangerous: dangerous && supportsDangerous,
        useAltScreen: aiToolId === "codex" ? useAltScreen : undefined,
        workerSettings: aiToolId === "codex" ? workerSettings : undefined,
        projectFolderId: projectFolderId || undefined,
      });
    }
  };

  return (
    <div className="modal-backdrop new-session-backdrop">
      <div ref={dialogRef} className="modal new-session-modal new-project-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="new-session-header">
          <h2 className="modal-title" id={`${id}-title`}>{text("새 프로젝트", "New Project")}</h2>
        </header>
        <div className="new-session-body">
          <div className="new-project-columns">
            <section className="new-project-details" aria-labelledby={`${id}-project`}>
              <h3 className="new-session-section-heading" id={`${id}-project`}>{text("프로젝트", "Project")}</h3>
              <label className="field">
                <span className="field-label">{text("프로젝트 이름", "Project name")}</span>
                <input ref={nameRef} value={name} onChange={event => setName(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter") submit(); }} placeholder="e.g. ProjectA" />
              </label>
              <label className="field">
                <span className="field-label">{text("실행 위치", "Run location")}</span>
                <select value={remote ? "ssh" : "local"} onChange={event => setRemote(event.target.value === "ssh")}>
                  <option value="local">{text("이 컴퓨터", "This computer")}</option>
                  <option value="ssh">{text("원격 호스트 (SSH)", "Remote host (SSH)")}</option>
                </select>
              </label>
              {!remote ? <label className="field">
                <span className="field-label">{text("프로젝트 폴더", "Project folder")}</span>
                <div className="folder-row">
                  <input value={folder} onChange={event => setFolder(event.target.value)}
                    placeholder="C:\\path\\to\\project" onKeyDown={event => { if (event.key === "Enter") submit(); }} />
                  <button type="button" className="browse-btn" onClick={browse}>{text("찾아보기…", "Browse…")}</button>
                </div>
              </label> : <>
                <label className="field">
                  <span className="field-label">{text("SSH 호스트", "SSH host")}</span>
                  {sshHosts.length > 0 ? <select value={sshHostId} onChange={event => setSshHostId(event.target.value)}>
                    <option value="">{text("호스트 선택…", "Select a host…")}</option>
                    {sshHosts.map(host => <option key={host.id} value={host.id}>{host.label} ({host.user}@{host.host})</option>)}
                  </select> : <span className="check-hint">{text("Settings → SSH Hosts에서 먼저 호스트를 등록하세요.", "Register a host in Settings → SSH Hosts first.")}</span>}
                </label>
                <label className="field">
                  <span className="field-label">{text("원격 폴더", "Remote folder")}</span>
                  <input value={remoteFolder} onChange={event => setRemoteFolder(event.target.value)}
                    placeholder="/home/user/project" onKeyDown={event => { if (event.key === "Enter") submit(); }} />
                </label>
              </>}
              {availableProjectFolders.length > 0 && <label className="field">
                <span className="field-label">{text("사이드바 폴더", "Sidebar folder")}</span>
                <select value={projectFolderId} onChange={event => setProjectFolderId(event.target.value)}>
                  <option value="">{text("미분류", "Uncategorized")}</option>
                  {availableProjectFolders.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>}
            </section>
            <section className="new-project-session" aria-labelledby={`${id}-session`}>
              <h3 className="new-session-section-heading" id={`${id}-session`}>{text("첫 세션", "First session")}</h3>
              <label className="field new-project-tool">
                <span className="field-label">{text("첫 세션 도구", "First session tool")}</span>
                <select value={aiToolId} onChange={event => {
                  const nextToolId = event.target.value;
                  const defaults = loadAgentDefaults(nextToolId);
                  setAiToolId(nextToolId);
                  setDangerous(defaults.dangerous && !!toolForId(nextToolId).dangerousFlag);
                  setLaunchOptions(defaults.launchOptions); setLaunchValid(true);
                  if (nextToolId === "codex") { setCodexAccountId(defaults.codexAccountId); setUseAltScreen(defaults.useAltScreen); setWorkerSettings(defaults.workerSettings); }
                  if (nextToolId === "claude") setClaudeAccountId(defaults.claudeAccountId);
                }}>
                  <option value="" disabled>{text("도구 선택…", "Select a tool…")}</option>
                  {visibleTools.map(tool => <option key={tool.id} value={tool.id}>{tool.label}</option>)}
                </select>
                <span className="check-hint">{text("선택한 도구로 Session 1이 바로 시작됩니다.", "Session 1 starts with the selected tool.")}</span>
              </label>
              {!remote && (aiToolId === "codex" || aiToolId === "claude") && <div className="new-session-accounts">
                {aiToolId === "codex" && <>
                  <AccountSelect value={codexAccountId} onChange={setCodexAccountId} />
                  <PoolAccountSelect value={codexPoolAccountId} onChange={setCodexPoolAccountId} />
                </>}
                {aiToolId === "claude" && <AccountSelect provider="claude" value={claudeAccountId} onChange={setClaudeAccountId} />}
              </div>}
              {(supportsDangerous || aiToolId === "codex") && <div className="new-session-execution">
                {supportsDangerous && <label className="field-check">
                  <input type="checkbox" checked={dangerous} onChange={event => setDangerous(event.target.checked)} />
                  <span>
                    <span className="check-label">{text("Dangerous 모드", "Dangerous mode")}</span>
                    <span className="check-hint">{text("권한 확인을 생략합니다.", "Skip permission prompts.")}</span>
                  </span>
                </label>}
                {aiToolId === "codex" && <label className="field-check field-check-neutral">
                  <input type="checkbox" checked={useAltScreen} onChange={event => setUseAltScreen(event.target.checked)} />
                  <span>{text("Alt-screen 모드", "Alt-screen mode")}</span>
                </label>}
              </div>}
            </section>
          </div>
          {(aiToolId === "codex" || (!!selectedTool.command && !remote)) && <div className="new-project-options">
            {aiToolId === "codex" && <SessionWorkerDisclosure settings={workerSettings}
              disabledTools={disabledTools} onChange={setWorkerSettings} />}
            {!!selectedTool.command && !remote && <AdvancedLaunchOptions key={aiToolId} toolId={aiToolId}
              value={launchOptions} onChange={setLaunchOptions} onValidityChange={setLaunchValid} />}
          </div>}
        </div>
        <footer className="new-session-footer">
          <span className="new-session-cancel-hint"><kbd>Esc</kbd>{text("취소", "Cancel")}</span>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onCancel}>{text("취소", "Cancel")}</button>
            <button className="btn-primary" disabled={!canSubmit} onClick={submit}>{text("만들기", "Create")}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
