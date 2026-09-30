import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { NewAgentModal } from "../../src/components/NewAgentModal";
import { AppLanguageProvider } from "../../src/lib/appLanguage";
import { saveAgentDefaults } from "../../src/lib/agentDefaults";
import "../../src/App.css";

const accountA = "11111111-1111-4111-8111-111111111111";
const accountB = "22222222-2222-4222-8222-222222222222";
window.multiAgentElectron = {
  invoke: async command => {
    if (command === "account_pool_choices") return {
      enabled: !window.fixtureRoutingOff,
      accounts: [{ id: accountA, label: "업무 계정", available: true }, { id: accountB, label: "개인 계정", available: true }],
    };
    if (command.endsWith("_accounts_list")) return [
      { id: "default", label: "Existing login", state: "default" },
      { id: accountA, label: "업무 계정", state: "saved" },
      { id: accountB, label: "개인 계정", state: "saved" },
    ];
    if (command === "check_tools") return { codex: { available: true, path: "C:/fixture/codex.cmd" } };
    return null;
  },
  onEvent: () => () => {},
};
localStorage.setItem("multiagent.appLanguage.v1", "ko");
saveAgentDefaults("codex", { dangerous: true });

function Harness() {
  const [fixture, setFixture] = useState({ key: 0, theme: "soft", language: "ko", ssh: false, missing: false, poolOff: false });
  const [open, setOpen] = useState(false);
  window.fixtureShow = options => {
    const next = { theme: "soft", language: "ko", ssh: false, missing: false, poolOff: false, ...options };
    window.fixtureRoutingOff = next.poolOff;
    window.fixtureCreated = null;
    localStorage.setItem("multiagent.appLanguage.v1", next.language);
    setFixture(current => ({ ...next, key: current.key + 1 }));
    setOpen(true);
  };
  const project = fixture.missing ? null : {
    id: "fixture-project", name: "Webcanvas", folder: "C:/fixture/web/webcanvas", createdAt: 1,
    sshHostId: fixture.ssh ? "fixture-ssh" : undefined,
  };
  return <div className={`app app-theme-${fixture.theme}`} style={{ height: "100vh" }}>
    <button id="fixture-open" onClick={() => window.fixtureShow()} style={{ margin: 20 }}>새 세션 열기</button>
    <AppLanguageProvider key={fixture.key}>
      {open && <NewAgentModal project={project} defaultName="Plugin" onCancel={() => setOpen(false)}
        onCreate={payload => { window.fixtureCreated = payload; }} />}
    </AppLanguageProvider>
  </div>;
}
createRoot(document.getElementById("root")).render(<Harness />);
