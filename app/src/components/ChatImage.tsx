import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../platform/runtime";
import { normalizeChatPath } from "../lib/chatPaths";
import { useAppLanguage } from "../lib/appLanguage";
import type { TerminalPathResolution } from "../platform/ipcContract";
import { ImageViewer } from "./ImageViewer";

export const ChatImageLinkContext = createContext(false);

export function ChatImage({ path, dataUrl, url, alt, folder, onOpenPath }: {
  path?: string; dataUrl?: string; url?: string; alt?: string; folder?: string;
  onOpenPath?: (path: string) => void;
}) {
  const { text } = useAppLanguage();
  const linked = useContext(ChatImageLinkContext);
  const root = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState(dataUrl || url || "");
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const name = alt || path?.split(/[\\/]/).pop() || text("첨부 이미지", "Attached image");
  useEffect(() => {
    let cancelled = false, started = false;
    setSrc(dataUrl || url || ""); setFailed(false); setOpen(false);
    // Supplied attachments are ready to paint; only disk reads need the
    // viewport observer. Never replace a ready data URL with a loading label.
    if (dataUrl || url) return;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        let result = dataUrl || url;
        if (!result && path) {
          const resolved = await invoke<TerminalPathResolution>("resolve_terminal_path", { path: normalizeChatPath(path), folder: folder || "" });
          if (resolved.kind !== "image") throw Error("Not an image");
          result = await invoke<string>("read_image_data_url", { path: resolved.path });
        }
        if (!result) throw Error("Image source unavailable");
        if (!cancelled) setSrc(result);
      } catch { if (!cancelled) setFailed(true); }
    };
    // Older messages do not read full image files until they enter the view.
    const observer: IntersectionObserver | null = typeof IntersectionObserver !== "undefined" && root.current
      ? new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer!.disconnect(); void load(); } }, { rootMargin: "240px" }) : null;
    if (observer && root.current) observer.observe(root.current);
    else void load();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [path, dataUrl, url, folder]);
  const show = () => {
    if (path && onOpenPath) onOpenPath(normalizeChatPath(path));
    else if (src) setOpen(true);
  };
  const picture = src && !failed
    ? <img src={src} alt={name} decoding="async" loading="lazy" onError={() => setFailed(true)} />
    : <span className="chat-image-placeholder">{failed ? text("이미지 미리보기를 불러오지 못했습니다", "Could not load image preview") : text("이미지 불러오는 중…", "Loading image…")}</span>;
  return <span className="chat-image-preview" ref={root} title={path || name}>
    {linked ? picture : <button type="button" className="chat-image-open" onClick={show} disabled={!src && !path} aria-label={text(`${name} 이미지 열기`, `Open image ${name}`)}>{picture}</button>}
    {failed && <span className="chat-image-name">{name}</span>}
    {open && src && createPortal(<ImageViewer path={name} folder={null} dataUrl={src} onClose={() => setOpen(false)} />, root.current?.closest(".app") || document.body)}
  </span>;
}
