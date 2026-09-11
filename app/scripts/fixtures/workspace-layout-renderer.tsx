import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { AppLanguageProvider } from "../../src/lib/appLanguage";
import "../../src/App.css";

// Exercise the real App and settings handlers without user profiles or CLIs.
const store = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
if (!localStorage.getItem("layout-fixture-seeded")) {
  localStorage.setItem("layout-fixture-seeded", "1");
  localStorage.setItem("multiagent.appLanguage.v1", "en");
  localStorage.setItem("multiagent.filesOpen.v1", "true");
  store("multiagent.projects.v1", [{ id: "project", name: "Layout verification", folder: "C:/fixture", createdAt: 1 }]);
  store("multiagent.agents.v1", ["one", "two"].map(id => ({ id, projectId: "project", name: id, folder: "C:/fixture", aiToolId: "none", createdAt: 1, resumeEligible: false })));
  store("multiagent.groups.v1", [{ id: "screen", projectId: "project", layout: { type: "split", direction: "h", sizes: [0.5, 0.5], children: [ { type: "leaf", id: "leaf-one", tabs: ["one"], activeIndex: 0 }, { type: "leaf", id: "leaf-two", tabs: ["two"], activeIndex: 0 } ] } }]);
  store("multiagent.view.v1", { activeProjectId: "project", activeGroupId: "screen", activePath: [0] });
}
window.layoutCalls = [];
const fixtureListeners = new Map<string, Set<(payload: unknown) => void>>();
window.fixtureAccountEvent = payload => { for (const callback of fixtureListeners.get("accounts:changed") || []) callback(payload); };
window.multiAgentElectron = {
  invoke: async (command, args) => {
    window.layoutCalls.push({ command, args });
    if (command === "runtime_flags") return { build_variant: "standard", update_provider: "github", advanced_launch_options: true };
    if (command === "get_agent_window_usage") return { in_use_agent_ids: [], owned_agent_ids: [] };
    if (command === "get_detached_agents") return {};
    if (command === "document_browser_list") return { browsers: [] };
    if (command === "usage_rate_limits_get") return { updatedAt: Date.now(), limits: [] };
    if (command === "idle_preferences_get") return { revision: 0, enabled: false, minutes: 30 };
    if (command === "browser_preferences_get") return { revision: 0, home: "", search: "google", zoom: 100, links: "external", profiles: [{ id: "multiagent-browser", label: "Default" }], defaultProfile: "multiagent-browser", restoreTabs: false };
    if (command === "notification_preferences_get") return { revision: 0, completion: true, bell: false, suppressFocused: false, powerMode: "off" };
    if (command === "saved_commands_get") return { revision: 0, commands: [], startups: {} };
    if (command === "check_tools") return {};
    if (command.endsWith("_accounts_list")) return [{ id: "default", label: "Existing login", state: "default" }];
    if (command === "qwen_region_get") return { available: false, region: "international", regions: [] };
    if (command === "conversation_storage_get") return { path: "C:/fixture/archive", custom: false, available: true, conversations: 0, blocks: 0, artifacts: 0, bytes: 0 };
    if (command === "remote_config_get") return {};
    if (command === "monitor_config_get") return { enabled: false, serverPort: 4421 };
    if (command === "remote_access_list") return { pending: [], approved: [] };
    if (command === "list_project_files" || command === "list_directory" || command === "list_markdown_files") return [];
    if (command === "get_system_resources") return null;
    if (command.endsWith("_status")) return { running: false };
    return null;
  },
  onEvent: (name, callback) => { const callbacks=fixtureListeners.get(name) || new Set(); callbacks.add(callback); fixtureListeners.set(name,callbacks); return () => callbacks.delete(callback); },
  emit: async () => {},
  window: { setAlwaysOnTop: async () => {}, isFocused: async () => false, requestUserAttention: async () => {} },
};
createRoot(document.getElementById("root")!).render(<AppLanguageProvider><App /></AppLanguageProvider>);
