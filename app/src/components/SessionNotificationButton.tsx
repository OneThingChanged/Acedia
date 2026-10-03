import { useEffect, useState } from "react";
import { invoke, listen } from "../platform/runtime";
import { useAppLanguage } from "../lib/appLanguage";
import { SessionToolbarIcon } from "./SessionToolbarIcon";

type Preference = { enabled: boolean; revision: number };
export function SessionNotificationButton({ agentId }: { agentId: string }) {
  const { text } = useAppLanguage();
  const [value, setValue] = useState<Preference | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    setValue(null); setError(false);
    void invoke<Preference>("session_notifications_get", { id: agentId }).then(v => { if (!disposed) setValue(v); }).catch(() => { if (!disposed) setError(true); });
    const off = listen<Preference & { id: string }>("session:notifications", e => { if (!disposed && e.payload.id === agentId) setValue(e.payload); });
    return () => { disposed = true; void off.then(fn => fn()); };
  }, [agentId]);
  const label = error ? text("알림 설정을 저장하지 못했습니다. 다시 시도해 주세요.", "Could not save notification settings. Please retry.")
    : value?.enabled === false ? text("세션 알림 꺼짐 · 클릭하여 켜기", "Session alerts off · click to enable") : text("세션 알림 켜짐 · 클릭하여 끄기", "Session alerts on · click to mute");
  return <button type="button" className={`pane-chat-toggle session-icon-button ${value?.enabled === false ? "muted" : ""}`} data-tooltip={label} aria-label={label} aria-pressed={value?.enabled ?? true} disabled={busy || !value}
    onClick={async () => {
      if (!value) return;
      setBusy(true); setError(false);
      try { setValue(await invoke<Preference>("session_notifications_set", { id: agentId, enabled: !value.enabled, revision: value.revision })); }
      catch { setError(true); try { setValue(await invoke<Preference>("session_notifications_get", { id: agentId })); } catch {} }
      finally { setBusy(false); }
    }}><SessionToolbarIcon name={value?.enabled === false ? "bell-off" : "bell"}/></button>;
}
