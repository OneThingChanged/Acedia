import { useCallback, useState } from "react";
import { SavedCommandsPanel, type RunSavedCommand } from "./SavedCommandsPanel";
import type { Agent, Project } from "../types";
import { toolForId } from "../types";
import { findSshHost, sshHostSummary } from "../lib/sshHosts";
import { isAgentRuntimeActive } from "../lib/agentActivity";
import { SessionStorageList, formatStorageBytes } from "./SessionStorageList";
import { useAppLanguage } from "../lib/appLanguage";
import { PropertiesDialog, PropertyFacts, PropertyPath } from "./PropertiesDialog";

export function ProjectPropertiesModal({ project, onRunSavedCommand, agents, onSessionDeleted, onOpenSession, onClose }: {
  project: Project; agents: Agent[]; onRunSavedCommand?: RunSavedCommand;
  onSessionDeleted?: (aiToolId: string, sessionId: string) => void;
  onOpenSession?: (id: string) => void; onClose: () => void;
}) {
  const { language, text } = useAppLanguage();
  const [tab, setTab] = useState("overview");
  const [commandState, setCommandState] = useState({ dirty: false, busy: false });
  const draftState = useCallback((dirty: boolean, busy: boolean) => setCommandState({ dirty, busy }), []);
  const [commands, setCommands] = useState<{ count: number; startup: string | null; automatic: boolean } | null>(null);
  const [storage, setStorage] = useState({ bytes: 0, count: 0, loading: true, error: false });
  const projectAgents = agents.filter(agent => agent.projectId === project.id);
  const activeCount = projectAgents.filter(agent => !agent.deferredStart && isAgentRuntimeActive(agent)).length;
  const host = project.sshHostId ? findSshHost(project.sshHostId) : null;
  const date = (ms?: number) => ms ? new Date(ms).toLocaleString(language) : "—";
  const openSession = (id: string) => {
    if (commandState.busy) return;
    if (commandState.dirty && !window.confirm(text("저장하지 않은 명령 편집을 버리고 세션 속성을 열까요?", "Discard unsaved command edits and open session properties?"))) return;
    onOpenSession?.(id);
  };
  const sessionRows = (items: Agent[]) => items.length ? <div>{items.map(agent => <div className="property-session-row" key={agent.id}>
    <div><strong>{agent.name}</strong><small>{agent.lastSessionId ? agent.lastSessionId.slice(0, 8) : text("연결된 대화 없음", "No linked conversation")}</small></div>
    <span>{toolForId(agent.aiToolId).label}</span><span>{!agent.deferredStart && isAgentRuntimeActive(agent) ? text("실행 중", "Active") : text("비활성", "Inactive")}</span>
    <button className="btn-secondary" disabled={!onOpenSession || commandState.busy} onClick={() => openSession(agent.id)}>{text("정보 보기", "View details")}</button>
  </div>)}</div> : <p className="property-note">{text("등록된 세션이 없습니다.", "No registered sessions.")}</p>;
  const overview = <><h3>{text("프로젝트 개요", "Project overview")}</h3><div className="property-metrics">
    <div><span>{text("등록된 세션", "Registered sessions")}</span><strong>{projectAgents.length}</strong></div>
    <div><span>{text("현재 실행 중", "Currently active")}</span><strong>{activeCount}</strong></div>
    <div><span>{text("대화 파일 용량", "Conversation files")}</span><strong>{project.sshHostId ? "—" : storage.error ? text("확인 실패", "Unavailable") : storage.loading ? "…" : formatStorageBytes(storage.bytes)}</strong></div>
  </div><PropertyPath label={project.sshHostId ? text("원격 작업 폴더", "Remote working folder") : text("프로젝트 폴더", "Project folder")} path={project.sshHostId ? project.remoteFolder || "" : project.folder} local={!project.sshHostId}/>
    <div className="property-card"><div className="property-card-heading"><strong>{text("현재 세션", "Current sessions")}</strong><button className="btn-secondary" onClick={() => setTab("sessions")}>{text("전체 보기", "View all")}</button></div>{sessionRows(projectAgents.slice(0, 4))}</div>
    <div className="property-columns"><div className="property-card"><h4>{text("명령 및 시작", "Commands and startup")}</h4><p>{commands ? text(`저장 명령 ${commands.count}개`, `${commands.count} saved commands`) : text("명령 확인 중…", "Loading commands…")}</p><p className="property-note">{commands?.startup ? `${commands.startup} · ${commands.automatic ? text("자동 시작", "Automatic") : text("수동 실행", "Manual")}` : text("시작 명령 없음", "No startup command")}</p><button className="btn-secondary" onClick={() => setTab("commands")}>{text("명령 관리", "Manage commands")}</button></div>
    <div className="property-card"><h4>{text("기록 관리", "History management")}</h4><p>{project.sshHostId ? text("원격 저장소 미지원", "Remote storage unavailable") : storage.loading ? text("기록 확인 중…", "Loading history…") : storage.error ? text("기록을 불러오지 못했습니다.", "Could not load history.") : text(`원본 대화 기록 ${storage.count}개`, `${storage.count} original conversations`)}</p><p className="property-note">{text("현재 세션에 연결된 기록과 지난 대화를 나누어 확인합니다.", "Browse linked session history and past conversations separately.")}</p><button className="btn-secondary" onClick={() => setTab("storage")}>{text("기록 확인", "View history")}</button></div></div>
    <details className="property-card" style={{ marginTop: 18 }}><summary>{text("프로젝트 상세 정보", "Project details")}</summary><PropertyFacts rows={[
      { label: text("실행 위치", "Runtime"), value: host ? sshHostSummary(host) : project.sshHostId ? text("원격 호스트 확인 필요", "Remote host unavailable") : text("이 PC", "This PC") },
      { label: text("생성 시각", "Created"), value: date(project.createdAt) },
      { label: text("마지막 열람", "Last opened"), value: date(project.lastOpenedAt) },
      { label: "Project ID", value: project.id },
    ]}/></details></>;
  return <PropertiesDialog title={project.name} subtitle={text("프로젝트 속성", "Project properties")} activeTab={tab} onTabChange={setTab} onClose={onClose} dirty={commandState.dirty} busy={commandState.busy} tabs={[
    { id: "overview", label: text("개요", "Overview"), content: overview },
    { id: "sessions", label: text("현재 세션", "Current sessions"), content: <><h3>{text("현재 세션", "Current sessions")} · {projectAgents.length}</h3><div className="property-card">{sessionRows(projectAgents)}</div></> },
    { id: "commands", label: text("명령 및 시작", "Commands and startup"), content: <><h3>{text("명령 및 시작", "Commands and startup")}</h3><SavedCommandsPanel projects={[project]} initialProjectId={project.id} onRun={onRunSavedCommand} onDraftStateChange={draftState} onSummaryChange={setCommands}/></> },
    { id: "storage", label: text("기록 관리", "History management"), content: <><h3>{text("기록 관리", "History management")}</h3>{project.sshHostId ? <p>{text("원격 세션 저장소 조회는 아직 지원하지 않습니다.", "Remote session storage lookup is not supported yet.")}</p> : <SessionStorageList folder={project.folder} agents={projectAgents} scope="project" onSessionDeleted={onSessionDeleted} onSummaryChange={setStorage}/>}</> },
  ]} footer={<span role="status">{commandState.dirty ? text("저장하지 않은 명령이 있습니다. 명령 및 시작에서 저장하세요.", "Unsaved command edits. Save them in Commands and startup.") : text("기록 삭제와 명령 저장은 각 항목에서 진행합니다.", "Manage history and save commands within their sections.")}</span>}/>;
}
