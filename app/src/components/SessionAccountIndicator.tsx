import { useEffect, useState } from "react";
import type { Agent } from "../types";
import { invoke } from "../platform/runtime";
import { useAppLanguage } from "../lib/appLanguage";

type SessionAccountStatus = {
  mode: "pool" | "pool_next" | "direct" | "inactive";
  label: string | null;
  assigned?: boolean;
  preferred?: boolean;
};

export function SessionAccountIndicator({ agent }: { agent: Agent }) {
  const { text } = useAppLanguage();
  const [status, setStatus] = useState<SessionAccountStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const accountId = agent.aiToolId === "claude" ? agent.claudeAccountId : agent.codexAccountId;

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setFailed(false);
    const refresh = async () => {
      try {
        const next = await invoke<SessionAccountStatus>("account_session_status", {
          id: agent.id,
          aiToolId: agent.aiToolId,
          accountId: accountId || "default",
          codexPoolAccountId: agent.codexPoolAccountId,
        });
        if (!cancelled) { setStatus(next); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [agent.id, agent.aiToolId, accountId, agent.codexPoolAccountId]);

  const provider = agent.aiToolId === "claude" ? "Claude" : "Codex";
  const label = failed ? text("계정 확인 실패", "Account unavailable")
    : !status ? text("계정 확인 중", "Checking account")
    : status.mode === "pool" && !status.assigned ? text("분산 · 배정 대기", "Routing · awaiting assignment")
    : status.mode === "pool" ? text(`분산 · ${status.label || "계정 확인 필요"}`, `Routing · ${status.label || "Account unavailable"}`)
    : status.mode === "pool_next" && status.preferred ? text(`다음 시작 · ${status.label || "계정 확인 필요"}`, `Next launch · ${status.label || "Account unavailable"}`)
    : status.mode === "pool_next" ? text("다음 시작 · 자동 배정", "Next launch · Automatic")
    : status.mode === "inactive" ? text(`선택 · ${status.label || "계정 확인 필요"}`, `Selected · ${status.label || "Account unavailable"}`)
    : status.label || text("계정 확인 필요", "Account unavailable");

  return <span className="pane-session-account" role="status" aria-label={text(`${provider} 사용 계정: ${label}`, `${provider} session account: ${label}`)}>
    {provider} · {label}
  </span>;
}
