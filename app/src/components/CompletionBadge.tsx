import { useAppLanguage } from "../lib/appLanguage";
import "./CompletionBadge.css";

export function CompletionBadge() {
  const { text } = useAppLanguage();
  return <span className="agent-completion-badge" role="img" aria-label={text("읽지 않은 작업 완료", "Unread completion")} title={text("작업 완료 · 클릭해서 확인", "Work completed · click to review")}>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>
    <span>{text("완료", "Done")}</span>
  </span>;
}
