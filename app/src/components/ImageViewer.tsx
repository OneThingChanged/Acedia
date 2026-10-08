import { useEffect, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import { invoke } from "../platform/runtime";

function fileName(path: string) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function ImageViewer({
  path,
  folder,
  dataUrl: suppliedDataUrl,
  onClose,
}: {
  path: string;
  folder: string | null;
  dataUrl?: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { text } = useAppLanguage();
  const [copyStatus, setCopyStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const fit = natural.width && viewport.width ? Math.min(1, viewport.width / natural.width, viewport.height / natural.height) : 1;
  const reset = () => setView({ zoom: 1, x: 0, y: 0 });
  const zoomBy = (factor: number, x = 0, y = 0) => setView(current => {
    const zoom = Math.max(0.1, Math.min(16 / fit, current.zoom * factor));
    const ratio = zoom / current.zoom;
    return { zoom, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio };
  });
  async function copyImage() {
    if (!dataUrl || copying) return;
    setCopying(true); setCopyStatus("");
    try {
      const image = bodyRef.current?.querySelector('img');
      if (!image?.naturalWidth) throw new Error('Image is not ready');
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create image canvas');
      context.drawImage(image, 0, 0);
      await invoke("clipboard_write_image", { dataUrl: canvas.toDataURL('image/png') });
      setCopyStatus(text("이미지를 복사했습니다.", "Image copied."));
    }
    catch { setCopyStatus(text("이미지를 복사하지 못했습니다.", "Could not copy the image.")); }
    finally { setCopying(false); }
  }

  useNativeViewOcclusion();

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    setCopyStatus(""); setNatural({ width: 0, height: 0 }); reset();
    if (suppliedDataUrl) { setDataUrl(suppliedDataUrl); return; }
    invoke<string>("read_image_data_url", { path, folder })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path, folder, suppliedDataUrl]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: Math.max(1, entry.contentRect.width - 24), height: Math.max(1, entry.contentRect.height - 24) }));
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (["+", "=", "-", "0"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "0") reset(); else zoomBy(e.key === "-" ? 1 / 1.25 : 1.25);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, fit]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = body.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    };
    body.addEventListener('wheel', onWheel, { passive: false });
    return () => body.removeEventListener('wheel', onWheel);
  }, [fit]);

  return (
    <div className="image-viewer-backdrop" onMouseDown={onClose}>
      <div
        className="image-viewer"
        role="dialog" aria-modal="true" aria-label={fileName(path)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="image-viewer-header">
          <span className="image-viewer-name" title={path}>
            {fileName(path)}
          </span>
          <div className="image-viewer-actions">
          <button className="app-icon-btn" disabled={!dataUrl} onClick={() => zoomBy(1 / 1.25)} title={text("축소", "Zoom out")} aria-label={text("축소", "Zoom out")}>−</button>
          <button className="image-viewer-fit" disabled={!dataUrl} onClick={reset} title={text("화면에 맞추기", "Fit to window")}>{Math.round(fit * view.zoom * 100)}%</button>
          <button className="app-icon-btn" disabled={!dataUrl} onClick={() => zoomBy(1.25)} title={text("확대", "Zoom in")} aria-label={text("확대", "Zoom in")}>+</button>
          <button className="app-icon-btn" disabled={!dataUrl || copying} onClick={() => void copyImage()} title={text("이미지 복사", "Copy image")} aria-label={text("이미지 복사", "Copy image")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
          </button>
          <button className="app-icon-btn" onClick={onClose} title={text("닫기", "Close")} aria-label={text("닫기", "Close")}>
            ×
          </button>
          </div>
        </div>
        {!suppliedDataUrl && <div className="image-viewer-path" title={path}>{path}</div>}
        {copyStatus && <div className="image-viewer-status" role="status">{copyStatus}</div>}
        <div className="image-viewer-body" ref={bodyRef}
          onDoubleClick={reset}
          onPointerDown={event => { if (!dataUrl || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }; }}
          onPointerMove={event => { const start = drag.current; if (start?.id === event.pointerId) setView(current => ({ ...current, x: start.originX + event.clientX - start.x, y: start.originY + event.clientY - start.y })); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          {error && <div className="image-viewer-error">{error}</div>}
          {!error && !dataUrl && (
            <div className="image-viewer-loading">{text("불러오는 중…", "Loading…")}</div>
          )}
          {dataUrl && <img src={dataUrl} alt={fileName(path)} draggable={false}
            onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            style={{ width: natural.width * fit || undefined, height: natural.height * fit || undefined, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }} />}
        </div>
      </div>
    </div>
  );
}
