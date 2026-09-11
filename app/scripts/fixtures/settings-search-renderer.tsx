import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SettingsModal } from "../../src/components/SettingsModal";
import { availableSettings, searchSettings } from "../../src/lib/settingsCatalog";
import { AppLanguageProvider } from "../../src/lib/appLanguage";
import { defaultCommandShortcuts } from "../../src/lib/commandRegistry";
import "../../src/App.css";

window.fixtureCalls = [];
if (!localStorage.getItem("multiagent.appLanguage.v1")) localStorage.setItem("multiagent.appLanguage.v1", "ko");
window.multiAgentElectron = {
  invoke: async (command, args) => {
    window.fixtureCalls.push({ command, args });
    if (command === "browser_preferences_get") return { revision: 0, home: "https://example.com/", search: "google", zoom: 100, links: "external", profiles: [{ id: "multiagent-browser", label: "Default" }], defaultProfile: "multiagent-browser", restoreTabs: false };
    if (command === "check_tools") return Object.fromEntries(["codex", "claude", "qwen", "cline"].map(id => [id, { available: true, path: "C:/fixture/" + id + ".exe" }]));
    if (command.endsWith("_accounts_list")) return [
      { id: "default", label: "Existing login", state: "default" },
      ...(window.fixtureAccountState ? [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", label: "Fixture", state: window.fixtureAccountState }] : []),
    ];
    if (command === "qwen_region_get") return { available: true, region: "international", regions: [{ id: "international", label: "International" }] };
    if (command === "conversation_storage_get") return { path: "C:/fixture/storage", custom: false, available: true, conversations: 0, blocks: 0, artifacts: 0, bytes: 0 };
    if (command === "get_developer_update_settings") return { directory: null, source: "none" };
    if (command === "remote_config_get") return { client_id: "private-fixture", owner: "", client_secret: "", tunnel_token: "", public_hostname: "", server_port: 0 };
    if (command === "monitor_config_get") return { enabled: false, serverPort: 4421 };
    if (command === "remote_access_list") return { pending: [], approved: [] };
    if (command.endsWith("_status")) return { running: false };
    return null;
  },
  onEvent: () => () => {},
};
function Harness() {
  const [open, setOpen] = useState(true);
  const [variant, setVariant] = useState<"standard" | "company" | "store">("standard");
  const [disabled, setDisabled] = useState<string[]>([]);
  window.fixtureContext = (next, tools = []) => { setVariant(next); setDisabled(tools); setOpen(true); };
  window.fixtureCatalog = () => availableSettings({ buildVariant: variant, disabledTools: disabled });
  window.fixtureSearch = query => searchSettings(query, { buildVariant: variant, disabledTools: disabled });
  return <AppLanguageProvider>
    <div className="app-topbar">Acedia <button onClick={() => setOpen(true)}>Settings</button></div>
    <div className="terminal-area"><input id="preserved-workspace" defaultValue="RUNNING_SESSION" /></div>
    {open && <SettingsModal theme="soft" onThemeChange={() => { window.fixtureMutation = true; }}
      desktopPetEnabled={false} desktopPetAvailable={true} onDesktopPetEnabledChange={() => {}} onResetDesktopPetPosition={() => {}}
      commandShortcuts={defaultCommandShortcuts()} onCommandShortcutsChange={() => { window.fixtureMutation = true; }}
      disabledTools={disabled} onToggleTool={() => { window.fixtureMutation = true; }}
      showUsageBar onShowUsageBarChange={() => {}} buildVariant={variant} updateProvider="local-developer" onClose={() => setOpen(false)} />}
  </AppLanguageProvider>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Harness /></React.StrictMode>);
