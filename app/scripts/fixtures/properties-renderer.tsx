import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SessionPropertiesModal } from "../../src/components/SessionPropertiesModal";
import { ProjectPropertiesModal } from "../../src/components/ProjectPropertiesModal";
import { UsageStatusBar } from "../../src/components/UsageStatusBar";
import "../../src/App.css";

const project = { id: "project-fixture", name: "Acedia 작업 공간", folder: "K:/fixtures/" + "long-project-path/".repeat(8), createdAt: 1 };
const initial = { id: "fixture", projectId: project.id, name: "세션 검증", folder: project.folder, aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1, lastSessionId: "11111111-1111-4111-8111-111111111111" };
const extraId = "22222222-2222-4222-8222-222222222222";
let entries = [initial.lastSessionId, "33333333-3333-4333-8333-333333333333"].map((sessionId, i) => ({ aiToolId: "codex", sessionId, bytes: 2048 * (i + 1), fileCount: 1, updatedAt: Date.now(), primaryPath: project.folder + sessionId + ".jsonl" }));
let config = { revision: 0, commands: [], startups: {} };
let quota = ["default", extraId].map((id, index) => ({ limitId: id === "default" ? "codex" : `codex:${id}`, limitName: index ? "Codex · 보관 프로필" : "Codex", planType: "plus", primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 1789228000 }, secondary: { usedPercent: 45, windowMinutes: 10080, resetsAt: 1789328000 }, credits: {}, updatedAt: Date.now(), profile: { key: `codex:${id}`, provider: "codex", id, label: index ? "보관 프로필" : "Codex", registered: true, current: !index, hidden: false, visible: !index } }));
window.fixtureCalls = [];
let quotaProfiles;
window.fixtureSetQuotaData = data => { quota = data.limits; quotaProfiles = data.profiles; window.dispatchEvent(new Event("multiagent:accounts-changed")); };
window.multiAgentElectron = {
  invoke: async (command, args = {}) => {
    window.fixtureCalls.push({ command, args });
    if (command === "session_storage_list") return { sessions: entries.filter(entry => args.includeAllProjectSessions || args.sessions.some(query => query.sessionId === entry.sessionId)) };
    if (command === "session_storage_delete") { entries = entries.filter(entry => entry.sessionId !== args.sessionId); return null; }
    if (command.endsWith("_accounts_list")) return [{ id: "default", label: "기존 로그인", state: "default" }, { id: extraId, label: "보조 계정", state: "saved" }];
    if (command === "check_tools") return { codex: { available: true, path: "C:/fixture/codex.exe" } };
    if (command === "saved_commands_get") return config;
    if (command === "saved_commands_set") { config = { ...config, ...args.patch, revision: config.revision + 1 }; return config; }
    if (command === "usage_profile_visibility_set") {
      quota = quota.map(limit => limit.profile.key === args.profileKey ? { ...limit, profile: { ...limit.profile, hidden: args.hidden, visible: !args.hidden } } : limit);
      quotaProfiles = quotaProfiles?.map(profile => profile.key === args.profileKey ? { ...profile, hidden: args.hidden, visible: !args.hidden } : profile);
    }
    if (["usage_rate_limits_get", "usage_profile_visibility_set"].includes(command)) return { updatedAt: Date.now(), limits: quota, profiles: quotaProfiles };
    return null;
  }, onEvent: () => () => {},
};
localStorage.setItem("multiagent.statusBar.v1", JSON.stringify({ ...JSON.parse(localStorage.getItem("multiagent.statusBar.v1") || "{}"), resources: false, ports: false }));
function Harness() {
  const [screen, setScreen] = useState("session");
  const [agent, setAgent] = useState(initial);
  window.fixtureShow = setScreen; window.fixtureAgent = agent; window.fixturePatch = patch => setAgent(current => ({ ...current, ...patch }));
  const common = { onClose: () => setScreen("closed") };
  return <div className={`app app-theme-soft${screen === "usage" ? " app-desktop app-with-usage-status" : ""}`}>
    <button id="fixture-opener" onClick={() => setScreen("session")}>세션 열기</button>
    {screen === "session" && <SessionPropertiesModal agent={agent} project={project} {...common}
      onUpdateAgent={(_, patch) => { window.fixtureUpdates = (window.fixtureUpdates || 0) + 1; setAgent(current => ({ ...current, ...patch })); }}
      onAccountChange={async (id, includeHandoff) => { window.fixtureIncludeHandoff = includeHandoff; if (window.fixtureAccountFailure) throw Error("계정 변경 실패"); setAgent(current => ({ ...current, codexAccountId: id })); }}/>}
    {screen === "project" && <ProjectPropertiesModal project={project} agents={[agent]} {...common} onOpenSession={() => setScreen("session")}/>}
    {screen === "usage" && <UsageStatusBar agents={[agent]} projects={[project]} onSelectProject={() => {}}/>}
  </div>;
}
createRoot(document.getElementById("root")).render(<Harness/>);
