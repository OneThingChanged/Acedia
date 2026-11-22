import { useAppLanguage } from "../lib/appLanguage";
import { useId, useRef, useState } from "react";
import { AccountSelect } from "./ProviderAccounts";
import { PoolAccountSelect } from "./PoolAccountSelect";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useCreationDialog } from "../hooks/useCreationDialog";
import { AI_TOOLS, toolForId } from "../types";
import type { Agent, NewAgentPayload, Project } from "../types";
import { folderTail } from "../lib/path";
import { openDialog } from "../platform/plugins";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { newSessionDangerous, newSessionToolId, rememberNewSession } from "../lib/newSessionPreferences";
import { newSessionPoolAccountId } from "../lib/sessionLaunchAccount";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import "./NewAgentModal.css";

export function NewAgentModal({
  project,
  defaultName,
  onCancel,
  onCreate,
  disabledTools = [],
  parentAgent,
  projectWorkingFolder,
  parentWorkingFolder,
}: {
  project: Project | null;
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewAgentPayload) => void | boolean | Promise<void | boolean>;
  disabledTools?: string[];
  parentAgent?: Agent;
  projectWorkingFolder?: string;
  parentWorkingFolder?: string;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const id = useId();
  const { dialogRef, nameRef } = useCreationDialog(onCancel);
  const submitting = useRef(false);
  const pickingFolder = useRef(false);

  // Only tools enabled in Settings → Agents ("none" always available).
  const visibleTools = AI_TOOLS.filter(
    (t) => t.id === "none" || !disabledTools.includes(t.id)
  );
  const [name, setName] = useState(defaultName);
  const [aiToolId, setAiToolId] = useState<string>(() =>
    newSessionToolId(disabledTools, parentAgent?.aiToolId)
  );
  const [inheritFolder, setInheritFolder] = useState(true);
  const [folderOverride, setFolderOverride] = useState<string>();
  const [editingRemoteFolder, setEditingRemoteFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const instructionSupported = aiToolId === "codex" || (aiToolId === "claude" && !project?.sshHostId);
  const modelSupported = !project?.sshHostId && (aiToolId === "codex" || aiToolId === "claude") && parentAgent?.aiToolId === aiToolId;
  const [inheritInstructions, setInheritInstructions] = useState(true);
  const [inheritModel, setInheritModel] = useState(true);
  const [claudeAccountId, setClaudeAccountId] = useState(() => loadAgentDefaults("claude").claudeAccountId);
  const [codexAccountId, setCodexAccountId] = useState(() => loadAgentDefaults("codex").codexAccountId);
  const [codexPoolAccountId, setCodexPoolAccountId] = useState(() => newSessionPoolAccountId(undefined, loadAgentDefaults("codex")) || "");
  const [dangerous, setDangerous] = useState(() => newSessionDangerous(aiToolId));
  const [useAltScreen, setUseAltScreen] = useState(() => loadAgentDefaults("codex").useAltScreen);
  const selectedTool = toolForId(aiToolId);
  const [launchOptions, setLaunchOptions] = useState(() => loadAgentDefaults(aiToolId).launchOptions);
  const [launchValid, setLaunchValid] = useState(true);
  const supportsDangerous = !!selectedTool.dangerousFlag;

  const remote = !!project?.sshHostId;
  const defaultFolder = projectWorkingFolder ?? (remote ? project?.remoteFolder : project?.folder) ?? "";
  const inheritsFolder = !!parentAgent && inheritFolder;
  const customFolder = inheritsFolder ? undefined : folderOverride?.trim();
  const workingFolder = inheritsFolder
    ? parentWorkingFolder ?? (remote ? parentAgent?.remoteFolder : parentAgent?.folder) ?? defaultFolder
    : customFolder || defaultFolder;
  const validFolder = customFolder === undefined || (!!customFolder && customFolder.length <= 4096 && !/[\x00-\x1f]/.test(customFolder));
  const canSubmit = !!project && name.trim().length > 0 && validFolder && (remote || !selectedTool.command || launchValid);

  const editWorkingFolder = async () => {
    if (submitting.current || pickingFolder.current) return;
    if (remote) {
      setEditingRemoteFolder(open => !open);
      return;
    }
    setFolderError("");
    pickingFolder.current = true;
    try {
      const selected = await openDialog({ directory: true, multiple: false, defaultPath: workingFolder || undefined });
      if (typeof selected === "string" && selected.trim()) {
        setFolderOverride(selected);
        setInheritFolder(false);
      }
    } catch {
      setFolderError(text("폴더 선택 창을 열 수 없습니다.", "Could not open the folder picker."));
    } finally {
      pickingFolder.current = false;
    }
  };

  const submit = async () => {
    if (!canSubmit || submitting.current || pickingFolder.current) return;
    submitting.current = true;
    try {
      const created = await onCreate({
        name: name.trim(),
        sessionHierarchy: parentAgent || customFolder ? {
          ...(parentAgent ? {
            parentId: parentAgent.id,
            inheritFolder,
            inheritInstructions: instructionSupported && inheritInstructions,
            inheritModel: modelSupported && inheritModel,
          } : {}),
          ...(customFolder ? { inheritFolder: false, folderOverride: customFolder } : {}),
        } : undefined,
        aiToolId,
        launchOptions: !project?.sshHostId && selectedTool.command ? launchOptions : undefined,
        codexAccountId: !project?.sshHostId && aiToolId === "codex" ? codexAccountId : undefined,
        codexPoolAccountId: !project?.sshHostId && aiToolId === "codex" ? codexPoolAccountId : undefined,
        claudeAccountId: !project?.sshHostId && aiToolId === "claude" ? claudeAccountId : undefined,
        dangerous: dangerous && supportsDangerous,
        useAltScreen: aiToolId === "codex" ? useAltScreen : undefined,
      });
      if (created !== false) {
        try { rememberNewSession(aiToolId, dangerous && supportsDangerous); }
        catch (error) { console.warn("Could not remember new-session preferences", error); }
      }
    } finally { submitting.current = false; }
  };

  const folderSummary = <>
    <svg className="new-session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5h6l2 2h10v13H3z" /></svg>
    <span className="session-project-label">{text("프로젝트", "Project")}</span>
    <span className="session-project-name">{project?.name ?? text("선택한 프로젝트 없음", "No project selected")}</span>
    {project && <span className="session-project-folder">{workingFolder ? folderTail(workingFolder) || workingFolder : text("기본 작업 폴더", "Default working folder")}</span>}
  </>;

  return (
    <div className="modal-backdrop new-session-backdrop">
      <div ref={dialogRef} className="modal new-session-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="new-session-header">
          <h2 className="modal-title" id={`${id}-title`}>{parentAgent ? text("자식 세션 만들기", "Create child session") : text("새 세션", "New Session")}</h2>
          {project ? <div className="new-session-location">
            <button type="button" className="session-project-summary new-session-project"
              title={workingFolder} aria-label={text("작업 폴더 변경", "Change working folder")}
              aria-expanded={remote ? editingRemoteFolder : undefined} aria-controls={remote && editingRemoteFolder ? `${id}-remote-folder` : undefined}
              onClick={() => void editWorkingFolder()}>
              {folderSummary}
              <span className="new-session-folder-action" aria-hidden="true">{text("변경", "Change")}</span>
            </button>
            {customFolder !== undefined && <button type="button" className="new-session-folder-reset" onClick={() => {
              setFolderOverride(undefined);
              setInheritFolder(true);
            }}>{text("기본 폴더 사용", "Use default folder")}</button>}
          </div> : <div className="session-project-summary new-session-project">{folderSummary}</div>}
          {remote && editingRemoteFolder && <label className="field new-session-remote-folder" id={`${id}-remote-folder`}>
            <span className="field-label">{text("원격 작업 폴더", "Remote working folder")}</span>
            <input autoFocus value={inheritsFolder ? workingFolder : folderOverride ?? workingFolder} maxLength={4096} aria-invalid={!validFolder}
              onChange={event => { setFolderOverride(event.target.value); setInheritFolder(false); }} />
          </label>}
          {folderError && <p className="new-session-folder-error" role="alert">{folderError}</p>}
        </header>
        <div className="new-session-body">
          {parentAgent && <section className="new-session-parent"><strong>{text("부모 세션", "Parent session")} · {parentAgent.name}</strong><p>{text("대화는 독립적으로 시작하며 선택한 설정만 이어받습니다.", "The conversation starts independently with the selected inherited settings.")}</p><div>
            <label><input type="checkbox" checked={inheritFolder} onChange={(event) => setInheritFolder(event.target.checked)}/>{text("작업 폴더 상속", "Inherit working folder")}</label>
            <label><input type="checkbox" checked={instructionSupported && inheritInstructions} disabled={!instructionSupported} onChange={(event) => setInheritInstructions(event.target.checked)}/>{text("공통 지침 상속", "Inherit instructions")}</label>
            <label><input type="checkbox" checked={modelSupported && inheritModel} disabled={!modelSupported} onChange={(event) => setInheritModel(event.target.checked)}/>{text("모델·effort 상속", "Inherit model and effort")}</label>
          </div></section>}
            <section className="new-session-basics" aria-label={text("세션 설정", "Session settings")}>
              <div className="new-session-identity">
                <label className="field">
                  <span className="field-label">{text("세션 별칭", "Session alias")}</span>
                  <input ref={nameRef} value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="e.g. Combat camera pass" />
                </label>
                <label className="field">
                  <span className="field-label">{text("AI 도구", "AI tool")}</span>
                  <select value={aiToolId} onChange={e => {
                    const toolId = e.target.value;
                    const defaults = loadAgentDefaults(toolId);
                    setAiToolId(toolId);
                    setDangerous(newSessionDangerous(toolId));
                    setLaunchOptions(defaults.launchOptions);
                    setLaunchValid(true);
                    if (toolId === "codex") {
                      setCodexAccountId(defaults.codexAccountId);
                      setUseAltScreen(defaults.useAltScreen);
                    }
                    if (toolId === "claude") setClaudeAccountId(defaults.claudeAccountId);
                  }}>
                    {visibleTools.map(tool => <option key={tool.id} value={tool.id}>{tool.label}</option>)}
                  </select>
                </label>
              </div>
              {!project?.sshHostId && (aiToolId === "codex" || aiToolId === "claude") && <div className="new-session-accounts">
                {aiToolId === "codex" && <>
                  <AccountSelect value={codexAccountId} onChange={setCodexAccountId} />
                  <PoolAccountSelect value={codexPoolAccountId} onChange={setCodexPoolAccountId} />
                </>}
                {aiToolId === "claude" && <AccountSelect provider="claude" value={claudeAccountId} onChange={setClaudeAccountId} />}
              </div>}
              <div className="new-session-execution">
                {supportsDangerous && (
                  <label className="field-check">
                    <input type="checkbox" checked={dangerous} onChange={e => setDangerous(e.target.checked)} />
                    <span>
                      <span className="check-label">{text("Dangerous 모드", "Dangerous mode")}</span>
                      <span className="check-hint">{text("권한 확인을 생략하고 명령을 실행합니다.", "Skip permission prompts — runs commands without confirmation")}</span>
                    </span>
                  </label>
                )}
                {aiToolId === "codex" && <label className="field-check field-check-neutral"><input type="checkbox" checked={useAltScreen} onChange={e => setUseAltScreen(e.target.checked)} /><span>{text("Alt-screen 모드", "Alt-screen mode")}</span></label>}
              </div>
            </section>
          {!!selectedTool.command && !project?.sshHostId && <AdvancedLaunchOptions key={aiToolId} toolId={aiToolId}
            value={launchOptions} onChange={setLaunchOptions} onValidityChange={setLaunchValid} />}
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
