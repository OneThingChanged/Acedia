import { useEffect, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import { APP_VERSION, formatProductVersion } from "../lib/appInfo";
import { checkStartupUpdate, dismissStartupUpdate, relaunch, type Update } from "../platform/plugins";
import { listen } from "../platform/runtime";
import "./StartupUpdatePrompt.css";

export function StartupUpdatePrompt({ enabled }: { enabled: boolean }) {
  const { text } = useAppLanguage();
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<"ready" | "downloading" | "installing" | "error">("ready");
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState("");
  const installing = useRef(false);
  const modal = useRef<HTMLDivElement>(null);
  const busy = status === "downloading" || status === "installing";
  useNativeViewOcclusion(Boolean(update));
  useEffect(() => { if (busy) modal.current?.focus(); }, [busy]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    void checkStartupUpdate().then(value => { if (!stopped) setUpdate(value); }).catch(() => {});
    return () => { stopped = true; };
  }, [enabled]);

  useEffect(() => {
    if (!update) return;
    let stopped = false;
    const subscription = listen<{ message: string }>("app:close-cancelled", ({ payload }) => {
      if (stopped || !installing.current) return;
      installing.current = false;
      setStatus("error");
      setError(payload.message);
    });
    void subscription.catch(() => {});
    return () => { stopped = true; void subscription.then(unlisten => unlisten()).catch(() => {}); };
  }, [update]);

  const later = () => {
    if (installing.current) return;
    void dismissStartupUpdate().catch(() => {});
    setUpdate(null);
  };
  const install = async () => {
    if (!update || installing.current) return;
    installing.current = true;
    setStatus("downloading");
    setProgress(undefined);
    setError("");
    try {
      let downloaded = 0;
      let total: number | undefined;
      await update.downloadAndInstall(event => {
        if (event.event === "Started") total = event.data.contentLength;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total) setProgress(Math.min(100, Math.floor(downloaded * 100 / total)));
        }
      });
      setStatus("installing");
      await relaunch();
    } catch (failure) {
      installing.current = false;
      setStatus("error");
      setError(String(failure instanceof Error ? failure.message : failure));
    }
  };

  if (!update) return null;
  return <div className="modal-backdrop startup-update-backdrop" onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); if (!busy) later(); }
    if (event.key === "Tab") {
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (!buttons.length) { event.preventDefault(); return; }
      const end = event.shiftKey ? buttons[0] : buttons[buttons.length - 1];
      if (document.activeElement === end) { event.preventDefault(); (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus(); }
    }
  }}>
    <div ref={modal} tabIndex={-1} className="modal startup-update-modal" role="dialog" aria-modal="true" aria-labelledby="startup-update-title" aria-describedby="startup-update-description">
      <h2 className="modal-title" id="startup-update-title">{text("새 업데이트가 있어요", "An update is available")}</h2>
      <p className="startup-update-versions">v{formatProductVersion(APP_VERSION)} <span aria-hidden="true">→</span> <strong>v{formatProductVersion(update.version)}</strong></p>
      <p id="startup-update-description">{text("지금 업데이트할까요? 열려 있는 세션을 저장한 뒤 앱을 다시 시작합니다.", "Update now? Your open sessions will be saved before the app restarts.")}</p>
      {status === "downloading" && <div className="startup-update-progress" role="status">
        <p>{text("업데이트 다운로드 중", "Downloading update")}{progress !== undefined ? ` · ${progress}%` : "…"}</p>
        <progress aria-label={text("다운로드 진행률", "Download progress")} max={100} value={progress} />
      </div>}
      {status === "installing" && <p role="status">{text("세션을 저장하고 업데이트를 설치합니다…", "Saving sessions and installing the update…")}</p>}
      {status === "error" && <p className="startup-update-error" role="alert">{text("업데이트하지 못했습니다. 다시 시도하거나 나중에 설치하세요.", "The update failed. Try again or install it later.")}<br />{error}</p>}
      <div className="modal-actions">
        <button className="btn-secondary" autoFocus disabled={busy} onClick={later}>{text("나중에", "Later")}</button>
        <button className="btn-primary" disabled={busy} onClick={() => void install()}>{status === "error" ? text("다시 시도", "Try again") : text("지금 업데이트", "Update now")}</button>
      </div>
    </div>
  </div>;
}
