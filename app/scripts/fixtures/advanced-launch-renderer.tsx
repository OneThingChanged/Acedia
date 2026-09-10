import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentsSettings } from "../../src/components/AgentsSettings";
import { NewAgentModal } from "../../src/components/NewAgentModal";
import { SessionPropertiesModal } from "../../src/components/SessionPropertiesModal";
import { loadAgentDefaults } from "../../src/lib/agentDefaults";
import "../../src/App.css";

window.multiAgentElectron = {
  invoke: async command => command === "check_tools" ? {
    codex: { available: true, path: "C:/fixture/codex.exe" },
    claude: { available: true, path: "C:/fixture/claude.exe" },
  } : command.endsWith("_accounts_list") ? [{ id: "default", label: "Existing login", state: "default" }] : null,
  showOpenDialog: async () => window.fixtureDialogResult,
  onEvent: () => () => {},
};
function Harness() {
  const [screen, setScreen] = useState("settings");
  const [agent, setAgent] = useState({
    id: "fixture", projectId: "fixture-project", name: "Fixture", folder: "C:/fixture",
    aiToolId: "codex", aiLabel: "Codex", dangerous: false, status: "idle", createdAt: 1,
  });
  const project = { id: "fixture-project", name: "Fixture", folder: "C:/fixture", createdAt: 1 };
  window.fixtureShow = setScreen;
  window.fixtureAgent = agent;
  window.fixtureDefaults = loadAgentDefaults;
  if (screen === "new") return <NewAgentModal project={project} defaultName="New fixture" onCancel={() => setScreen("settings")} onCreate={payload => { window.fixtureCreated = payload; }} />;
  if (screen === "session") return <SessionPropertiesModal agent={agent} project={project}
    onUpdateAgent={(_, patch) => setAgent(current => ({ ...current, ...patch }))}
    onClose={() => setScreen("settings")} />;
  return <div style={{ width: "100%", padding: 24 }}><AgentsSettings disabledTools={[]} onToggleTool={() => {}}
    showUsageBar={true} onShowUsageBarChange={() => {}} /></div>;
}
if (!location.search.includes("writer")) createRoot(document.getElementById("root")).render(<Harness />);
