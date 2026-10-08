import { useEffect, useRef, useState } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { writeClipboardText } from "../platform/plugins";
import { ChatIcon } from "./ChatIcon";

export function ChatCopyButton({ value, label }: { value: string; label: string }) {
  const { text } = useAppLanguage();
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const hint = state === "copied" ? text("복사했습니다", "Copied")
    : state === "error" ? text("복사하지 못했습니다. 다시 시도하세요.", "Could not copy. Try again.") : label;
  return <button type="button" className={`chat-copy-button${state === "copied" ? " copied" : ""}${state === "error" ? " error" : ""}`}
    title={hint} aria-label={hint} disabled={state === "copying" || !value} onClick={async () => {
      window.clearTimeout(timer.current);
      setState("copying");
      try { await writeClipboardText(value); setState("copied"); }
      catch { setState("error"); }
      timer.current = window.setTimeout(() => setState("idle"), 1800);
    }}>
    <ChatIcon name={state === "copied" ? "check" : "copy"} />
    <span className="chat-copy-feedback" role="status">{state === "copied" || state === "error" ? hint : ""}</span>
  </button>;
}
