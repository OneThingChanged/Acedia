import { useAppLanguage } from "../lib/appLanguage";
import { useId, useState } from "react";
import { AccountSelect } from "./ProviderAccounts";
import { PoolAccountSelect } from "./PoolAccountSelect";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useCreationDialog } from "../hooks/useCreationDialog";
import { AI_TOOLS, toolForId } from "../types";
import type { Agent, NewAgentPayload, Project } from "../types";
import { folderTail } from "../lib/path";
import { defaultAiToolId } from "../lib/projectCreation";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { newSessionPoolAccountId } from "../lib/sessionLaunchAccount";
import { SessionWorkerDisclosure } from "./SessionWorkerDisclosure";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import type { SessionWorkerSettings } from "../types";
import "./NewAgentModal.css";

export function NewAgentModal({
  project,
  defaultName,
  onCancel,
  onCreate,
  disabledTools = [],
  parentAgent,
}: {
  project: Project | null;
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewAgentPayload) => void;
  disabledTools?: string[];
  parentAgent?: Agent;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const id = useId();
  const { dialogRef, nameRef } = useCreationDialog(onCancel);

  // Only tools enabled in Settings → Agents ("none" always available).
  const visibleTools = AI_TOOLS.filter(
    (t) => t.id === "none" || !disabledTools.includes(t.id)
  );
  const [name, setName] = useState(defaultName);
  const [aiToolId, setAiToolId] = useState<string>(() =>
    parentAgent && !disabledTools.includes(parentAgent.aiToolId) ? parentAgent.aiToolId : defaultAiToolId(disabledTools)
  );
  const [inheritFolder, setInheritFolder] = useState(true);
  const instructionSupported = aiToolId === "codex" || (aiToolId === "claude" && !project?.sshHostId);
  const modelSupported = !project?.sshHostId && (aiToolId === "codex" || aiToolId === "claude") && parentAgent?.aiToolId === aiToolId;
  const [inheritInstructions, setInheritInstructions] = useState(true);
  const [inheritModel, setInheritModel] = useState(true);
  const [claudeAccountId, setClaudeAccountId] = useState(() => loadAgentDefaults("claude").claudeAccountId);
  const [codexAccountId, setCodexAccountId] = useState(() => loadAgentDefaults("codex").codexAccountId);
  const [codexPoolAccountId, setCodexPoolAccountId] = useState(() => newSessionPoolAccountId(undefined, loadAgentDefaults("codex")) || "");
  const [dangerous, setDangerous] = useState(() => loadAgentDefaults(aiToolId).dangerous);
  const [useAltScreen, setUseAltScreen] = useState(() => loadAgentDefaults("codex").useAltScreen);
  const [workerSettings, setWorkerSettings] = useState<
    SessionWorkerSettings | undefined
  >(() => loadAgentDefaults("codex").workerSettings);
  const selectedTool = toolForId(aiToolId);
  const [launchOptions, setLaunchOptions] = useState(() => loadAgentDefaults(aiToolId).launchOptions);
  const [launchValid, setLaunchValid] = useState(true);
  const supportsDangerous = !!selectedTool.dangerousFlag;

  const canSubmit = !!project && name.trim().length > 0 && (!!project.sshHostId || !selectedTool.command || launchValid);

  const submit = () => {
    if (!canSubmit) return;
    onCreate({
      name: name.trim(),
      sessionHierarchy: parentAgent ? {
        parentId: parentAgent.id,
        inheritFolder,
        inheritInstructions: instructionSupported && inheritInstructions,
        inheritModel: modelSupported && inheritModel,
      } : undefined,
      aiToolId,
      launchOptions: !project?.sshHostId && selectedTool.command ? launchOptions : undefined,
      codexAccountId: !project?.sshHostId && aiToolId === "codex" ? codexAccountId : undefined,
      codexPoolAccountId: !project?.sshHostId && aiToolId === "codex" ? codexPoolAccountId : undefined,
      claudeAccountId: !project?.sshHostId && aiToolId === "claude" ? claudeAccountId : undefined,
      dangerous: dangerous && supportsDangerous,
      useAltScreen: aiToolId === "codex" ? useAltScreen : undefined,
      workerSettings: aiToolId === "codex" ? workerSettings : undefined,
    });
  };

  return (
    <div className="modal-backdrop new-session-backdrop">
      <div ref={dialogRef} className="modal new-session-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="new-session-header">
          <h2 className="modal-title" id={`${id}-title`}>{parentAgent ? text("자식 세션 만들기", "Create child session") : text("새 세션", "New Session")}</h2>
          <div className="session-project-summary new-session-project">
            <svg className="new-session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5h6l2 2h10v13H3z" /></svg>
            <span className="session-project-label">{text("프로젝트", "Project")}</span>
            <span className="session-project-name">
              {project ? project.name : text("선택한 프로젝트 없음", "No project selected")}
            </span>
            {project && <span className="session-project-folder" title={project.folder}>{folderTail(project.folder)}</span>}
          </div>
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
                    setDangerous(defaults.dangerous);
                    setLaunchOptions(defaults.launchOptions);
                    setLaunchValid(true);
                    if (toolId === "codex") {
                      setCodexAccountId(defaults.codexAccountId);
                      setUseAltScreen(defaults.useAltScreen);
                      setWorkerSettings(defaults.workerSettings);
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
          {aiToolId === "codex" && <SessionWorkerDisclosure settings={workerSettings}
            disabledTools={disabledTools} onChange={setWorkerSettings} />}
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
