import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppLanguage } from "../lib/appLanguage";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";

export function ImageContextMenu({ x, y, onCopy, onOpen, onReveal, onClose }: {
  x: number; y: number;
  onCopy: () => Promise<void>;
  onOpen?: () => void;
  onReveal?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { text } = useAppLanguage();
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useNativeViewOcclusion();
  useLayoutEffect(() => {
    const rect = root.current!.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, innerHeight - rect.height - 8)) });
  }, [x, y, error]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault(); event.stopImmediatePropagation(); onClose();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [onClose]);
  const run = async (action: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); onClose(); }
    catch { setError(text("작업을 완료하지 못했습니다. 이미지와 파일 경로를 확인해 주세요.", "Could not complete the action. Check the image and file path.")); }
    finally { setBusy(false); }
  };
  return createPortal(<>
    <div className="image-context-backdrop" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} />
    <div ref={root} className="ctx-menu image-context-menu" role="menu" aria-label={text("이미지 메뉴", "Image menu")} style={position}
      onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
      <button type="button" className="ctx-item" role="menuitem" disabled={busy} onClick={() => void run(onCopy)}>{text("이미지 복사", "Copy image")}</button>
      {onOpen && <button type="button" className="ctx-item" role="menuitem" disabled={busy} onClick={() => void run(onOpen)}>{text("이미지 뷰어로 열기", "Open in image viewer")}</button>}
      {onReveal && <button type="button" className="ctx-item" role="menuitem" disabled={busy} onClick={() => void run(onReveal)}>{text("탐색기에서 표시", "Show in Explorer")}<span className="ctx-shortcut">Ctrl+Click</span></button>}
      {error && <div className="image-context-error" role="alert">{error}</div>}
    </div>
  </>, document.querySelector(".app") || document.body);
}
