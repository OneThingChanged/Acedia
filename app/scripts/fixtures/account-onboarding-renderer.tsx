import React from "react";
import { createRoot } from "react-dom/client";
import { AgentsSettings } from "../../src/components/AgentsSettings";
import { loadAgentDefaults } from "../../src/lib/agentDefaults";
import "../../src/App.css";

window.multiAgentElectron = {
  invoke: (command, args) => window.require("electron").ipcRenderer.invoke(command, args),
  onEvent: () => () => {},
};
window.fixtureDefaults = loadAgentDefaults;
window.fixtureInvoke = (command, args) => window.require("electron").ipcRenderer.invoke(command, args);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><AgentsSettings disabledTools={[]} onToggleTool={() => {}} showUsageBar onShowUsageBarChange={() => {}} /></React.StrictMode>
);
