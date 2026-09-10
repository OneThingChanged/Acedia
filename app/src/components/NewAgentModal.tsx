import { useAppLanguage } from "../lib/appLanguage";
import { useState } from "react";
import { AccountSelect } from "./ProviderAccounts";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { AI_TOOLS, toolForId } from "../types";
import type { NewAgentPayload, Project } from "../types";
import { folderTail } from "../lib/path";
import { defaultAiToolId } from "../lib/projectCreation";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { SessionWorkerFields } from "./SessionWorkerFields";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import type { SessionWorkerSettings } from "../types";

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
      claudeAccountId: !project?.sshHostId && aiToolId === "claude" ? claudeAccountId : undefined,
      dangerous: dangerous && supportsDangerous,
      useAltScreen: aiToolId === "codex" ? useAltScreen : undefined,
      workerSettings: aiToolId === "codex" ? workerSettings : undefined,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal-title">{text("새 세션", "New Session")}</h2>

        <div className="session-project-summary">
          <span className="session-project-label">{text("프로젝트", "Project")}</span>
          <span className="session-project-name">
            {project ? project.name : text("선택한 프로젝트 없음", "No project selected")}
          </span>
          {project && (
            <span className="session-project-folder" title={project.folder}>
              {folderTail(project.folder)}
            </span>
          )}
        </div>

        <label className="field">
          <span className="field-label">{text("세션 별칭", "Session alias")}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            placeholder="e.g. Combat camera pass"
          />
        </label>

        <label className="field">
          <span className="field-label">{text("AI 도구", "AI tool")}</span>
          <select
            value={aiToolId}
            onChange={(e) => {
              const id = e.target.value; const defaults = loadAgentDefaults(id);
              setAiToolId(id); setDangerous(defaults.dangerous);
              setLaunchOptions(defaults.launchOptions); setLaunchValid(true);
              if (id === "codex") { setCodexAccountId(defaults.codexAccountId); setUseAltScreen(defaults.useAltScreen); setWorkerSettings(defaults.workerSettings); }
              if (id === "claude") setClaudeAccountId(defaults.claudeAccountId);
            }}
          >
            {visibleTools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {aiToolId === "codex" && !project?.sshHostId && <AccountSelect value={codexAccountId} onChange={setCodexAccountId} />}
        {aiToolId === "claude" && !project?.sshHostId && <AccountSelect provider="claude" value={claudeAccountId} onChange={setClaudeAccountId} />}

        {supportsDangerous && (
          <label className="field-check">
            <input
              type="checkbox"
              checked={dangerous}
              onChange={(e) => setDangerous(e.target.checked)}
            />
            <span>
              <span className="check-label">{text("Dangerous 모드", "Dangerous mode")}</span>
              <span className="check-hint">
                {text("권한 확인을 생략하고 명령을 실행합니다.", "Skip permission prompts — runs commands without confirmation")}
              </span>
            </span>
          </label>
        )}

        {aiToolId === "codex" && <label className="field-check"><input type="checkbox" checked={useAltScreen} onChange={e => setUseAltScreen(e.target.checked)} /><span>{text("Alt-screen 모드", "Alt-screen mode")}</span></label>}
        {aiToolId === "codex" && (
          <SessionWorkerFields
            settings={workerSettings}
            disabledTools={disabledTools}
            onChange={setWorkerSettings}
          />
        )}

        {!!selectedTool.command && !project?.sshHostId && <AdvancedLaunchOptions key={aiToolId} toolId={aiToolId}
          value={launchOptions} onChange={setLaunchOptions} onValidityChange={setLaunchValid} />}
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
