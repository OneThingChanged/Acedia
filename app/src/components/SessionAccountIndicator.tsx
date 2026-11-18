import type { Agent } from "../types";
import { useAppLanguage } from "../lib/appLanguage";
import { useSessionAccountLabel } from "../hooks/useSessionAccountLabel";

export function SessionAccountIndicator({ agent }: { agent: Agent }) {
  const { text } = useAppLanguage();
  const label = useSessionAccountLabel(agent);
  const provider = agent.aiToolId === "claude" ? "Claude" : "Codex";

  return <span className="pane-session-account" role="status" aria-label={text(`${provider} 사용 계정: ${label}`, `${provider} session account: ${label}`)}>
    {provider} · {label}
  </span>;
}
