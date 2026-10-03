import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";
import { writeClipboardText } from "../platform/plugins";
import { useAppLanguage } from "../lib/appLanguage";
import { SettingScope, settingTarget } from "./SettingsSearch";

export type DashboardStatus = {
  running: boolean;
  url: string | null;
  port: number | null;
  lan?: {
    available: boolean;
    enabled: boolean;
    running: boolean;
    addresses: { name: string; url: string }[];
    code: string | null;
  };
};

export function DashboardLanPanel({ status, onChange }: { status: DashboardStatus; onChange: (value: DashboardStatus) => void }) {
  const { text } = useAppLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const lan = status.lan;
  useEffect(() => {
    if (!lan?.enabled || busy) return;
    let disposed = false;
    const timer = setInterval(() => {
      void invoke<DashboardStatus>("monitor_server_status").then(value => { if (!disposed) onChange(value); }).catch(() => {});
    }, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, [lan?.enabled, busy, onChange]);

  const change = async (reset = false) => {
    setBusy(true); setError(""); setCopied("");
    try {
      onChange(await (reset
        ? invoke<DashboardStatus>("monitor_lan_reset_code")
        : invoke<DashboardStatus>("monitor_lan_set", { enabled: !lan?.enabled })));
    } catch (cause) {
      setError(String(cause instanceof Error ? cause.message : cause));
      try { onChange(await invoke<DashboardStatus>("monitor_server_status")); } catch {}
    } finally { setBusy(false); }
  };
  const copy = async (value: string) => {
    try { await writeClipboardText(value); setCopied(value); }
    catch { setError(text("복사하지 못했습니다.", "Could not copy.")); }
  };

  return <div className="app-settings-section dashboard-lan-panel" {...settingTarget("dashboard.lan")}>
    <div className="field-label">{text("같은 네트워크에서 접속", "Local network access")}<SettingScope id="dashboard.lan" /></div>
    <div className="app-about-card">
      <label className="app-checkbox-row">
        <input type="checkbox" aria-label={text("LAN 접속 허용", "Allow LAN access")} checked={lan?.enabled ?? false}
          disabled={busy || !lan?.available} onChange={() => { void change(); }} />
        <span>{text("LAN 접속 허용", "Allow LAN access")}</span>
      </label>
      <p className="app-update-message">{text("같은 공유기에 연결된 PC에서 아래 주소를 열고 연결 코드를 입력하세요. 세션·Chat·터미널을 함께 사용할 수 있습니다.", "Open the address below on a PC connected to the same router and enter the connection code to use your sessions, Chat and terminals.")}</p>
      {busy && <p role="status" className="app-update-message">{text("적용 중…", "Applying…")}</p>}
      {lan?.running && <>
        {lan.addresses.map(entry => <div key={entry.url} className="dashboard-lan-address">
          <span className="app-update-message">{entry.name}</span>
          <div className="app-remote-url-row">
            <code className="app-remote-url">{entry.url}</code>
            <button type="button" className="btn-secondary app-update-btn" onClick={() => { void copy(entry.url); }}>
              {copied === entry.url ? text("복사됨", "Copied") : text("주소 복사", "Copy address")}
            </button>
          </div>
        </div>)}
        {!lan.addresses.length && <p className="app-update-message" role="status">{text("연결된 로컬 네트워크를 찾지 못했습니다. Wi-Fi 또는 유선 연결을 확인하세요.", "No local network found. Check your Wi-Fi or Ethernet connection.")}</p>}
        <div className="dashboard-lan-code">
          <span>{text("연결 코드", "Connection code")}</span>
          <strong aria-label={text("연결 코드", "Connection code")}>{lan.code?.replace(/(\d{4})(\d{4})/, "$1 $2")}</strong>
          <button type="button" className="btn-secondary app-update-btn" disabled={busy} onClick={() => { void change(true); }}>
            {text("코드 갱신 및 연결 해제", "Reset code and disconnect")}
          </button>
        </div>
        <p className="app-update-message">{text("코드 갱신이나 Acedia 재실행 후에는 다시 연결해야 합니다. LAN 접속을 끄면 연결된 PC의 접근이 해제됩니다.", "Reconnect after resetting the code or restarting Acedia. Turning LAN access off disconnects connected PCs.")}</p>
        <p className="app-update-message">{text("연결되지 않으면 Windows 방화벽에서 Acedia의 개인 네트워크 접근을 허용하세요.", "If the connection fails, allow Acedia on private networks in Windows Firewall.")}</p>
      </>}
      {lan?.enabled && !status.running && <p className="app-update-message">{text("위의 Start를 눌러 대시보드를 시작하세요.", "Use Start above to start the dashboard.")}</p>}
      {error && <p role="alert" className="app-update-message app-update-error">{error}</p>}
    </div>
  </div>;
}
