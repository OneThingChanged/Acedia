import { useRef, useState } from "react";
import type { Agent, Project } from "../types";
import { toolForId } from "../types";
import { findSshHost, sshHostSummary } from "../lib/sshHosts";
import { AccountLabel, AccountSelect } from "./ProviderAccounts";
import { SessionWorkerFields } from "./SessionWorkerFields";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import { loadAgentDefaults } from "../lib/agentDefaults";
import { SessionStorageList } from "./SessionStorageList";
import { useAppLanguage } from "../lib/appLanguage";
import { PropertiesDialog, PropertyFacts, PropertyPath, nextPropertiesTabIndex } from "./PropertiesDialog";

export const nextSessionPropertiesTabIndex = nextPropertiesTabIndex;
type Options = Pick<Agent, "dangerous" | "useAltScreen" | "workerSettings" | "launchOptions">;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const accountId = (agent: Agent) => (agent.aiToolId === "claude" ? agent.claudeAccountId : agent.codexAccountId) || "default";
const accountEditable = (agent: Agent) => agent.deferredStart || agent.status === "idle" || agent.status === "exited";

export function SessionPropertiesModal({ agent, project, onUpdateAgent, onAccountChange, onSessionDeleted, disabledTools = [], onClose }: {
  agent: Agent; project: Project | null;
  onUpdateAgent: (id: string, patch: Partial<Options>) => void;
  onAccountChange?: (accountId: string) => Promise<void>;
  onSessionDeleted?: (aiToolId: string, sessionId: string) => void;
  disabledTools?: string[]; onClose: () => void;
}) {
  const { language, text } = useAppLanguage();
  const [activeTab, setActiveTab] = useState("overview");
  const [patch, setPatch] = useState<Partial<Options>>({});
  const bases = useRef<Partial<Options>>({});
  const [selectedAccount, setSelectedAccount] = useState<{ value: string; base: string } | null>(null);
  const [valid, setValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const latestAgent = useRef(agent);
  latestAgent.current = agent;
  const draft = { ...agent, ...patch };
  const dirty = Object.keys(patch).length > 0 || !!selectedAccount || !valid;
  const tool = toolForId(agent.aiToolId);
  const sshHostId = agent.sshHostId ?? project?.sshHostId;
  const sshHost = sshHostId ? findSshHost(sshHostId) : null;
  const folder = sshHostId ? agent.remoteFolder ?? project?.remoteFolder ?? "" : agent.folder || project?.folder || "";
  const formatDate = (ms?: number) => ms ? new Date(ms).toLocaleString(language) : "—";
  const statuses: Record<string, string> = { idle: "대기", starting: "시작 중", recovering: "복구 중", running: "실행 중", working: "작업 중", waiting: "응답 대기", blocked: "확인 필요", exited: "종료됨", unreachable: "연결 끊김" };
  const status = (value: string) => text(statuses[value] ?? value, value);
  function edit<K extends keyof Options>(key: K, value: Options[K]) {
    setSaved(false); setError("");
    setPatch(current => {
      const next = { ...current };
      if (equal(value, agent[key])) { delete next[key]; delete bases.current[key]; }
      else { if (!(key in current)) bases.current[key] = agent[key]; next[key] = value; }
      return next;
    });
  }
  function resetDraft() {
    setPatch({}); bases.current = {}; setSelectedAccount(null); setError(""); setSaved(false); setValid(true); setEditorVersion(value => value + 1);
  }
  async function save() {
    if (!valid || saving || !dirty) return;
    const conflicts = () => (Object.keys(patch) as (keyof Options)[]).some(key => !equal(latestAgent.current[key], bases.current[key]) && !equal(latestAgent.current[key], patch[key]));
    setSaving(true); setError("");
    try {
      if (conflicts()) throw new Error(text("다른 창에서 실행 옵션이 변경되었습니다. 현재 값을 다시 불러오세요.", "Launch options changed in another window. Reload the current values."));
      if (selectedAccount && selectedAccount.value !== accountId(latestAgent.current)) {
        if (accountId(latestAgent.current) !== selectedAccount.base) throw new Error(text("다른 창에서 계정이 변경되었습니다. 현재 값을 다시 불러오세요.", "The account changed in another window. Reload the current values."));
        if (!accountEditable(latestAgent.current) || !onAccountChange) throw new Error(text("계정을 변경하려면 세션을 먼저 비활성화하세요.", "Deactivate the session before changing its account."));
        await onAccountChange(selectedAccount.value);
        setSelectedAccount(null);
      }
      if (conflicts()) throw new Error(text("저장 중 실행 옵션이 변경되었습니다. 현재 값을 다시 불러오세요.", "Launch options changed during save. Reload the current values."));
      if (Object.keys(patch).length) onUpdateAgent(agent.id, patch);
      setPatch({}); bases.current = {}; setSelectedAccount(null); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setSaving(false); }
  }
  const overview = <><h3>{text("기본 정보", "Overview")}</h3><div className="property-card"><PropertyFacts rows={[
    { label: text("프로젝트", "Project"), value: project?.name ?? "—" },
    { label: text("도구", "Tool"), value: tool.label },
    ...(!sshHostId && ["codex", "claude"].includes(agent.aiToolId) ? [{ label: text("현재 계정", "Current account"), value: <AccountLabel provider={agent.aiToolId === "claude" ? "claude" : "codex"} value={accountId(agent)}/> }] : []),
    { label: text("현재 상태", "Current status"), value: status(agent.status) },
    { label: text("실행 위치", "Runtime"), value: sshHost ? sshHostSummary(sshHost) : sshHostId ? text("원격 호스트 확인 필요", "Remote host unavailable") : text("이 PC · 로컬", "This PC · Local") },
    { label: text("생성 시각", "Created"), value: formatDate(agent.createdAt) },
  ]}/></div><PropertyPath label={sshHostId ? text("원격 작업 폴더", "Remote working folder") : text("작업 폴더", "Working folder")} path={folder} local={!sshHostId}/>
    <details className="property-card"><summary>{text("식별자 및 진단 정보", "Identifiers and diagnostics")}</summary><PropertyFacts rows={[
      { label: text("세션 ID", "Session ID"), value: agent.lastSessionId || text("아직 없음", "Not available yet") },
      { label: "Agent ID", value: agent.id },
      { label: text("계정 ID", "Account ID"), value: sshHostId || !["codex", "claude"].includes(agent.aiToolId) ? "—" : accountId(agent) },
      { label: text("최근 Hook", "Latest hook"), value: agent.activity?.hookEventName || "—" },
      { label: text("작업 상태", "Work status"), value: agent.activity ? status(agent.activity.workStatus) : "—" },
    ]}/></details><button className="btn-secondary" onClick={() => setActiveTab("storage")}>{text("대화 기록 확인", "View conversation history")}</button></>;
  const options = <><h3>{text("실행 옵션", "Launch options")}</h3><p className="property-note">{text("변경 저장 후 세션을 비활성화하고 다시 열면 적용됩니다. 실행 중인 프로세스는 그대로 유지됩니다.", "Saved changes apply after deactivating and reopening the session. The running process stays as it is.")}</p>
    <fieldset disabled={saving}><div className="property-columns"><div className="property-card"><h4>{text("계정 및 실행", "Account and launch")}</h4>
      {["codex", "claude"].includes(agent.aiToolId) && !sshHostId && onAccountChange && <><AccountSelect provider={agent.aiToolId === "claude" ? "claude" : "codex"} value={selectedAccount?.value ?? accountId(agent)} disabled={!accountEditable(agent)} onChange={value => { setSelectedAccount(value === accountId(agent) ? null : { value, base: selectedAccount?.base ?? accountId(agent) }); setSaved(false); }}/><p className="property-note">{text("비활성화한 세션에서만 계정을 변경할 수 있습니다. 처음 선택한 계정은 새 대화를 시작하고, 원래 계정으로 돌아오면 해당 대화를 복원합니다.", "Account changes require an inactive session. A newly selected account starts a new conversation; returning to an account restores its conversation.")}</p></>}
      {tool.dangerousFlag && <label className="session-props-toggle"><input type="checkbox" checked={draft.dangerous} onChange={e => edit("dangerous", e.target.checked)}/><span className="session-props-toggle-body"><span className="session-props-toggle-title">{text("권한 확인 생략", "Skip permission prompts")}</span><span className="session-props-toggle-desc">{tool.dangerousFlag}</span></span></label>}
      {agent.aiToolId === "codex" && <label className="session-props-toggle"><input type="checkbox" checked={draft.useAltScreen === true} onChange={e => edit("useAltScreen", e.target.checked || undefined)}/><span className="session-props-toggle-body"><span className="session-props-toggle-title">{text("Alt-screen 모드", "Alt-screen mode")}</span><span className="session-props-toggle-desc">{text("터미널 스크롤백 검색·드래그 복사를 사용하려면 끈 상태로 두세요.", "Keep disabled for terminal scrollback search and drag-to-copy.")}</span></span></label>}
    </div>{agent.aiToolId === "codex" && <div className="property-card"><h4>{text("보조 작업자", "Workers")}</h4><SessionWorkerFields settings={draft.workerSettings} disabledTools={disabledTools} onChange={value => edit("workerSettings", value)} className="session-worker-fields session-worker-fields-props"/></div>}</div>
    {tool.command && !sshHostId && <AdvancedLaunchOptions key={`${agent.id}-${editorVersion}`} toolId={agent.aiToolId} value={draft.launchOptions} onChange={value => edit("launchOptions", value)} onValidityChange={setValid} commitOnEdit expanded onLoadDefaults={() => loadAgentDefaults(agent.aiToolId).launchOptions}/>}
    {tool.command && sshHostId && <p className="property-note">{text("CLI 경로·추가 인수·환경변수 편집은 로컬 세션에서 지원합니다.", "CLI path, arguments and environment editing are available for local sessions.")}</p>}</fieldset></>;
  return <PropertiesDialog title={agent.name} subtitle={`${text("세션 속성", "Session properties")} · ${tool.label}`} activeTab={activeTab} onTabChange={setActiveTab} onClose={onClose} dirty={dirty} busy={saving} tabs={[
    { id: "overview", label: text("기본 정보", "Overview"), content: overview },
    ...(tool.command ? [{ id: "options", label: text("실행 옵션", "Launch options"), content: options }] : []),
    { id: "storage", label: text("대화 기록", "Conversation history"), content: <><h3>{text("대화 기록", "Conversation history")}</h3><SessionStorageList folder={agent.folder || project?.folder || ""} agents={[sshHostId ? { ...agent, sshHostId } : agent]} onSessionDeleted={onSessionDeleted}/></> },
  ]} footer={<><span role="status" className={error ? "property-error" : undefined}>{error || (saving ? text("저장 중…", "Saving…") : !valid ? text("실행 옵션의 입력 오류를 수정하세요.", "Correct the launch option errors.") : dirty ? text("저장하지 않은 변경이 있습니다.", "You have unsaved changes.") : saved ? text("저장했습니다. 다음 실행부터 적용됩니다.", "Saved. Applies on the next launch.") : text("변경 사항은 저장 후 다음 실행부터 적용됩니다.", "Save changes to apply them on the next launch."))}</span>{dirty && <button className="btn-secondary" disabled={saving} onClick={() => { if (window.confirm(text("입력한 변경을 버리고 현재 값을 다시 불러올까요?", "Discard your edits and reload the current values?"))) resetDraft(); }}>{text("현재 값 다시 불러오기", "Reload current values")}</button>}<button className="btn-primary" disabled={!dirty || !valid || saving} onClick={() => void save()}>{text("변경 저장", "Save changes")}</button></>}/>;
}
