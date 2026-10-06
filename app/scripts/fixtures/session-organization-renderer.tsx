import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { AppLanguageProvider } from "../../src/lib/appLanguage";

const store = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
if (!localStorage.getItem("organization-fixture-seeded")) {
  localStorage.setItem("organization-fixture-seeded", "1");
  localStorage.setItem("multiagent.appLanguage.v1", "en");
  localStorage.setItem("multiagent.filesOpen.v1", "true");
  store("multiagent.projects.v1", [{ id: "project", name: "Organization verification", folder: "C:/fixture", createdAt: 1 }, { id: "other-project", name: "Other project", folder: "C:/other", createdAt: 1 }]);
  const base = { projectId: "project", folder: "C:/fixture", aiToolId: "codex", createdAt: 1, resumeEligible: false };
  store("multiagent.agents.v1", [
    { ...base, id: "root", name: "Root", modelSettings: { model: "gpt-5.5", effort: "high" }, sessionHierarchy: { folderOverride: "C:/fixture/scope", instructions: "Root rules" } },
    { ...base, id: "ui", name: "UI", lastSessionId: "own-ui-chat", sessionHierarchy: { parentId: "root", createdById: "root", inheritModel: true, instructions: "UI rules" } },
    { ...base, id: "docs", name: "Docs", lastSessionId: "own-docs-chat", sessionHierarchy: { parentId: "root", createdById: "root", inheritModel: true, instructions: "Docs rules" } },
    { ...base, id: "other", projectId: "other-project", name: "Other" },
  ]);
  store("multiagent.agentDefaults.v1", { codex: { dangerous: false, workerSettings: null } });
  store("multiagent.groups.v1", [{ id: "screen", projectId: "project", layout: { type: "leaf", id: "leaf-root", tabs: ["root"], activeIndex: 0 } }]);
  store("multiagent.view.v1", { activeProjectId: "project", activeGroupId: "screen", activePath: [] });
}
window.organizationCalls = [];
const listeners = new Map<string, Set<(payload: unknown) => void>>();
window.organizationEvent = (name, payload) => { for (const callback of listeners.get(name) || []) callback(payload); };
window.multiAgentElectron = {
  invoke: async (command, args) => {
    window.organizationCalls.push({ command, args });
    if (command === "runtime_flags") return { build_variant: "standard", update_provider: "github", advanced_launch_options: true, coordinator: true, live_agent_ids: [] };
    if (command === "get_agent_window_usage") return { in_use_agent_ids: [], owned_agent_ids: [] };
    if (command === "get_detached_agents") return {};
    if (command === "claim_agent_for_window") return { claimed: true };
    if (command === "spawn_pty") return { reattached: false };
    if (command === "resolve_cli_session") return args?.preferredSessionId || null;
    if (command === "prepare_worker_roles") return { documents: "C:/fixture/docs.toml", html: "C:/fixture/html.toml" };
    if (command === "document_browser_list") return { browsers: [] };
    if (["session_web_servers", "subagent_list", "list_ports", "list_git_submodules", "session_deliveries_get"].includes(command)) return [];
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
    if (command.endsWith("_status")) return { running: false };
    return null;
  },
  onEvent: (name, callback) => { const handlers = listeners.get(name) || new Set(); handlers.add(callback); listeners.set(name, handlers); return () => handlers.delete(callback); },
  emit: async () => {},
  window: { setAlwaysOnTop: async () => {}, isFocused: async () => false, requestUserAttention: async () => {} },
};
createRoot(document.getElementById("root")!).render(<AppLanguageProvider><App/></AppLanguageProvider>);
