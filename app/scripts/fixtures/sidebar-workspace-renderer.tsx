import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { AppLanguageProvider } from "../../src/lib/appLanguage";
import "../../src/App.css";

const store = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
if (!localStorage.getItem("sidebar-fixture-seeded")) {
  localStorage.setItem("sidebar-fixture-seeded", "1");
  localStorage.setItem("multiagent.appLanguage.v1", "ko");
  localStorage.setItem("multiagent.appTheme.v1", "soft");
  localStorage.setItem("multiagent.filesOpen.v1", "false");
  const now = Date.now();
  store("multiagent.projects.v1", [{ id: "acedia", name: "Acedia", folder: "C:/fixture/acedia", createdAt: now }, { id: "toon", name: "ToonShader", folder: "C:/fixture/toon", createdAt: now }, { id: "assets", name: "Unreal Asset Finder", folder: "C:/fixture/assets", createdAt: now }]);
  store("multiagent.agents.v1", [
    { id: "ux", name: "사이드바 UX 개선", projectId: "acedia", folder: "C:/fixture/acedia", aiToolId: "codex", resumeEligible: true, sidebarPinned: true, lastOpenedAt: now, createdAt: now },
    { id: "image", name: "리모트 이미지 뷰어 확대", projectId: "acedia", folder: "C:/fixture/acedia", aiToolId: "claude", resumeEligible: true, createdAt: now - 1000 },
    { id: "routing", name: "분산 요청 상태 표시", projectId: "acedia", folder: "C:/fixture/acedia", aiToolId: "codex", resumeEligible: false, createdAt: now - 2000 },
    { id: "shader", name: "셰이더 파이프라인 점검", projectId: "toon", folder: "C:/fixture/toon", aiToolId: "claude", resumeEligible: true, createdAt: now - 3000 },
    { id: "files", name: "에셋 경로와 파일 열기", projectId: "assets", folder: "C:/fixture/assets", aiToolId: "codex", resumeEligible: false, createdAt: now - 86400000 },
    { id: "archived", name: "이전 작업 기록", projectId: "acedia", folder: "C:/fixture/acedia", aiToolId: "codex", sidebarArchived: true, createdAt: now - 172800000 },
  ]);
  store("multiagent.groups.v1", [{ id: "screen", projectId: "acedia", layout: { type: "split", id: "split", direction: "h", sizes: [.5, .5], children: [{ type: "leaf", id: "leaf-ux", tabs: ["ux"], activeIndex: 0 }, { type: "leaf", id: "leaf-image", tabs: ["image"], activeIndex: 0 }] } }, ...["routing", "shader", "files", "archived"].map(id => ({ id: `group-${id}`, layout: { type: "leaf", id: `leaf-${id}`, tabs: [id], activeIndex: 0 } }))]);
  store("multiagent.view.v1", { activeProjectId: "acedia", activeGroupId: "screen", activePath: [0] });
}
window.layoutCalls = [];
const listeners = new Map<string, Set<(payload: unknown) => void>>();
window.multiAgentElectron = {
  invoke: async (command, args) => {
    window.layoutCalls.push({ command, args });
    if (command === "runtime_flags") return { build_variant: "standard", update_provider: "github", advanced_launch_options: true };
    if (command === "get_agent_window_usage") return { in_use_agent_ids: [], owned_agent_ids: [] };
    if (command === "get_detached_agents") return {};
    if (command === "document_browser_list") return { browsers: [] };
    if (command === "account_pool_choices") return { enabled: false, accounts: [] };
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
    if (command === "session_web_servers" || command === "session_deliveries_get") return [];
    if (command === "get_system_resources") return null;
    if (command === "start_monitor_server") return { url: "http://127.0.0.1:4421" };
    if (command.endsWith("_status")) return { running: false };
    return null;
  },
  onEvent: (name, callback) => { const callbacks = listeners.get(name) || new Set(); callbacks.add(callback); listeners.set(name, callbacks); return () => callbacks.delete(callback); },
  emit: async () => {},
  window: { setAlwaysOnTop: async () => {}, isFocused: async () => false, requestUserAttention: async () => {} },
};
createRoot(document.getElementById("root")!).render(<AppLanguageProvider><App /></AppLanguageProvider>);
