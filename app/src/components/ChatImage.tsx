import { createContext, useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke } from "../platform/runtime";
import { normalizeChatPath } from "../lib/chatPaths";
import { useAppLanguage } from "../lib/appLanguage";
import type { TerminalPathResolution } from "../platform/ipcContract";
import { ImageViewer } from "./ImageViewer";
import { ImageContextMenu } from "./ImageContextMenu";
import { copyImagePath, copyImageToClipboard, revealImagePath, type ImagePathOpener } from "../lib/imageActions";

export const ChatImageLinkContext = createContext(false);

export function ChatImage({ path, dataUrl, url, alt, folder, onOpenPath }: {
  path?: string; dataUrl?: string; url?: string; alt?: string; folder?: string;
  onOpenPath?: ImagePathOpener;
}) {
  const { text } = useAppLanguage();
  const linked = useContext(ChatImageLinkContext);
  const root = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState(dataUrl || url || "");
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [actionError, setActionError] = useState("");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const name = alt || path?.split(/[\\/]/).pop() || text("첨부 이미지", "Attached image");
  useEffect(() => {
    let cancelled = false, started = false;
    setSrc(dataUrl || url || ""); setFailed(false); setOpen(false);
    setSize(null); setMenu(null); setActionError("");
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
  const show = (reveal = false) => {
    if (path && onOpenPath) onOpenPath(normalizeChatPath(path), reveal);
    else if (path && reveal) void revealImagePath(path, folder).catch(() => setActionError(text("파일 위치를 열지 못했습니다.", "Could not show the file location.")));
    else if (src) setOpen(true);
  };
  const picture = src && !failed
    ? <img src={src} alt={name} decoding="async" loading="lazy" onLoad={event => {
      const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
      if (width && height) setSize(previous => previous?.width === width && previous.height === height ? previous : { width, height });
    }} onError={() => setFailed(true)} />
    : <span className="chat-image-placeholder">{failed ? text("이미지 미리보기를 불러오지 못했습니다", "Could not load image preview") : text("이미지 불러오는 중…", "Loading image…")}</span>;
  return <span className="chat-image-preview" ref={root} title={path ? `${path}\n${text("클릭: 이미지 열기 · Ctrl+클릭: 탐색기에서 표시", "Click: Open image · Ctrl+click: Show in Explorer")}` : name}
    onContextMenu={event => { if (!src && !path) return; event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY }); }}
    onClick={linked && path ? event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); event.stopPropagation(); show(true); } } : undefined} style={size ? {
    "--chat-image-natural-width": `${size.width}px`, "--chat-image-ratio": size.width / size.height,
  } as CSSProperties : undefined}>
    {linked ? picture : <button type="button" className="chat-image-open" onClick={event => show(event.ctrlKey || event.metaKey)} disabled={!src && !path} aria-label={text(`${name} 이미지 열기`, `Open image ${name}`)}>{picture}</button>}
    {failed && <span className="chat-image-name">{name}</span>}
    {actionError && <span className="chat-image-name" role="alert">{actionError}</span>}
    {open && src && createPortal(<ImageViewer path={path || name} sourcePath={path} folder={folder || null} dataUrl={src} onClose={() => setOpen(false)} />, root.current?.closest(".app") || document.body)}
    {menu && <ImageContextMenu {...menu} onClose={() => setMenu(null)} onCopy={() => src ? copyImageToClipboard(src) : copyImagePath(path!, folder)} onOpen={() => show()} onReveal={path ? () => show(true) : undefined} />}
  </span>;
}
