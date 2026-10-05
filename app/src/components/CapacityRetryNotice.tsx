import { useEffect, useState } from "react";
import { invoke, listen } from "../platform/runtime";
import { capacityRetryMessage, type CapacityRetryState } from "../lib/capacityRetry";
import { useAppLanguage } from "../lib/appLanguage";
import "./CapacityRetryNotice.css";

export function CapacityRetryNotice({ agentId }: { agentId: string }) {
  const [state, setState] = useState<CapacityRetryState | null>(null);
  const [now, setNow] = useState(Date.now);
  const { text } = useAppLanguage();
  useEffect(() => {
    let cancelled = false, events = 0;
    let unsubscribe: (() => void) | undefined;
    void listen<CapacityRetryState>("agent:capacity-retry", event => {
      if (cancelled || event.payload.id !== agentId) return;
      events++; setState(event.payload);
    }).then(async stop => {
      if (cancelled) { stop(); return; }
      unsubscribe = stop;
      const version = events;
      const current = await invoke<CapacityRetryState | null>("capacity_retry_get", { id: agentId });
      if (!cancelled && version === events) setState(current);
    }).catch(() => {});
    return () => { cancelled = true; unsubscribe?.(); };
  }, [agentId]);
  useEffect(() => {
    if (state?.status !== "scheduled") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state]);
  if (!state || ["cancelled", "resolved"].includes(state.status)) return null;
  return <div className={`capacity-retry-notice ${state.status}`} role={state.status === "failed" ? "alert" : "status"}>
    <span>{text(capacityRetryMessage(state, false, now), capacityRetryMessage(state, true, now))}</span>
    {state.status === "scheduled" && <button type="button" onClick={() => {
      void invoke("capacity_retry_cancel", { id: agentId }).catch(() => {});
    }}>{text("재시도 취소", "Cancel retry")}</button>}
  </div>;
}
