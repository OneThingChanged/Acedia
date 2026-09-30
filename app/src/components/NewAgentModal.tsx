import { useAppLanguage } from "../lib/appLanguage";
import { useEffect, useId, useRef, useState } from "react";
import { AccountSelect } from "./ProviderAccounts";
import { PoolAccountSelect } from "./PoolAccountSelect";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { AI_TOOLS, toolForId } from "../types";
import type { NewAgentPayload, Project } from "../types";
import { folderTail } from "../lib/path";
import { defaultAiToolId } from "../lib/projectCreation";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { newSessionPoolAccountId } from "../lib/sessionLaunchAccount";
import { SessionWorkerFields } from "./SessionWorkerFields";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import type { SessionWorkerSettings } from "../types";
import "./NewAgentModal.css";

function SectionIcon({ workers = false }: { workers?: boolean }) {
  return <svg className="new-session-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={workers ? "m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" : "M4 6h16M4 12h16M4 18h16M9 3v6M16 9v6M8 15v6"} />
  </svg>;
}

export function NewAgentModal({
  project,
  defaultName,
  onCancel,
  onCreate,
  disabledTools = [],
}: {
  project: Project | null;
  defaultName: string;
  onCancel: () => void;
  onCreate: (payload: NewAgentPayload) => void;
  disabledTools?: string[];
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "input:not(:disabled), select:not(:disabled), button:not(:disabled), summary"
      ) ?? [])].filter(control => control.checkVisibility());
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      const outside = !dialogRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  // Only tools enabled in Settings → Agents ("none" always available).
  const visibleTools = AI_TOOLS.filter(
    (t) => t.id === "none" || !disabledTools.includes(t.id)
  );
  const [name, setName] = useState(defaultName);
  const [aiToolId, setAiToolId] = useState<string>(() =>
    defaultAiToolId(disabledTools)
  );
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
          <h2 className="modal-title" id={`${id}-title`}>{text("새 세션", "New Session")}</h2>
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
          <div className="new-session-columns">
            <section className="new-session-basics" aria-labelledby={`${id}-settings`}>
              <h3 className="new-session-section-heading" id={`${id}-settings`}><SectionIcon />{text("세션 설정", "Session settings")}</h3>
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
            <section className="new-session-workers" aria-label={text("문서·HTML 병렬 작업자", "Document and HTML parallel workers")}>
              {aiToolId === "codex" ? <SessionWorkerFields
                settings={workerSettings}
                disabledTools={disabledTools}
                onChange={setWorkerSettings}
                compact
              /> : <>
                <h3 className="new-session-section-heading"><SectionIcon workers />{text("문서·HTML 병렬 작업자", "Document and HTML parallel workers")}</h3>
                <div className="new-session-workers-empty">
                  <SectionIcon workers />
                  <p>{text("문서·HTML 병렬 작업자는 Codex 세션에서 설정합니다.", "Document and HTML workers are configured for Codex sessions.")}</p>
                </div>
              </>}
            </section>
          </div>
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
