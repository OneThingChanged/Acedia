import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DashboardLanPanel, type DashboardStatus } from "../../src/components/DashboardLanPanel";
import { AppLanguageProvider } from "../../src/lib/appLanguage";
import { invoke } from "../../src/platform/runtime";
import "../../src/App.css";

localStorage.setItem("multiagent.appLanguage.v1", "ko");
function Fixture() {
  const [status, setStatus] = useState<DashboardStatus>({ running: false, url: null, port: null });
  useEffect(() => { void invoke<DashboardStatus>("monitor_server_status").then(setStatus); }, []);
  return <AppLanguageProvider><div className="app app-theme-soft" style={{ padding: 24 }}>
    <div className="app-settings-body"><DashboardLanPanel status={status} onChange={setStatus} /></div>
  </div></AppLanguageProvider>;
}
createRoot(document.querySelector("#root")!).render(<Fixture />);
