import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import { invoke } from "../platform/runtime";
import type { ConversationArtifact } from "../platform/ipcContract";
import { ChatIcon } from "./ChatIcon";
import "./ChatFiles.css";

const INLINE_FILES = 3;
function artifactBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ file, expanded, onOpen }: { file: ConversationArtifact; expanded?: boolean; onOpen: (file: ConversationArtifact) => void }) {
  const name = file.path.split(/[\\/]/).pop() || file.path;
  return <button type="button" className="chat-artifact" title={file.path} onClick={() => onOpen(file)}>
    <span className="chat-artifact-icon" aria-hidden="true"><ChatIcon name="file" /></span>
    <span className="chat-artifact-copy"><span className="chat-artifact-name">{name}</span>
      {expanded && <span className="chat-file-path">{file.path}</span>}
      <span className="chat-artifact-caption">{file.kind.toUpperCase()} · {artifactBytes(file.size)}</span></span>
    <ChatIcon name="open" />
  </button>;
}

function FileGroups({ files, totalFiles = files, expanded, onOpen }: { files: ConversationArtifact[]; totalFiles?: ConversationArtifact[]; expanded?: boolean; onOpen: (file: ConversationArtifact) => void }) {
  const { text } = useAppLanguage();
  return <>{(["output", "reference"] as const).map(usage => {
    const group = files.filter(file => (file.usage ?? "reference") === usage);
    const count = totalFiles.filter(file => (file.usage ?? "reference") === usage).length;
    return group.length > 0 && <section key={usage} className={`chat-file-group chat-files-${usage}`} aria-label={usage === "output" ? text("생성·수정 파일", "Created or modified files") : text("관련 파일", "Related files")}>
      <div className="chat-artifacts-heading">{usage === "output" ? text("생성·수정 파일", "Created or modified files") : text("관련 파일", "Related files")} · {count}</div>
      <div className="chat-artifact-list">{group.map(file => <FileRow key={file.path} file={file} expanded={expanded} onOpen={onOpen} />)}</div>
    </section>;
  })}</>;
}

function FileDialog({ files, onOpen, onClose, error }: { files: ConversationArtifact[]; onOpen: (file: ConversationArtifact) => void; onClose: () => void; error: string }) {
  const { text } = useAppLanguage();
  useNativeViewOcclusion();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    search.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const elements = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keys, true);
    return () => { document.removeEventListener("keydown", keys, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  const filtered = files.filter(file => file.path.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="chat-files-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={root} className="chat-files-dialog chat-view-modern" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <header className="chat-files-header"><div><h2 id={`${id}-title`}>{text("이 답변의 파일", "Files from this response")}</h2><p>{text("생성·수정 파일과 참고한 파일을 모았습니다.", "Created or modified files and files referenced in this response.")}</p></div>
        <button type="button" className="chat-files-close" aria-label={text("닫기", "Close")} onClick={onClose}>×</button></header>
      <input ref={search} className="chat-files-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text("파일명 또는 경로 검색", "Search filenames or paths")} aria-label={text("파일 검색", "Search files")} />
      <div className="chat-files-count" role="status">{query.trim() ? text(`검색 결과 ${filtered.length}개 · 전체 ${files.length}개`, `${filtered.length} matches · ${files.length} files total`) : text(`전체 ${files.length}개`, `${files.length} files total`)}</div>
      <div className="chat-files-body"><FileGroups files={filtered} expanded onOpen={onOpen} />{!filtered.length && <p className="chat-files-empty">{text("검색 결과가 없습니다.", "No matching files.")}</p>}</div>
      {error && <div className="chat-composer-error" role="alert">{error}</div>}
    </div>
  </div>;
}

export function ChatFiles({ files, onOpenPath }: { files: ConversationArtifact[]; onOpenPath?: (path: string) => void }) {
  const { text } = useAppLanguage();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const openFile = async (file: ConversationArtifact) => {
    setError("");
    try {
      if (onOpenPath) await onOpenPath(file.path);
      else await invoke("open_local_path", { path: file.path });
      setOpen(false);
    } catch { setError(text("파일을 열지 못했습니다. 경로를 확인해 주세요.", "Could not open the file. Check its path.")); }
  };
  if (!files.length) return null;
  return <section ref={root} className="chat-artifacts" aria-label={text("이 답변의 파일", "Files from this response")}>
    <FileGroups files={files.slice(0, INLINE_FILES)} totalFiles={files} onOpen={file => { void openFile(file); }} />
    {files.length > INLINE_FILES && <button type="button" className="chat-files-more" aria-haspopup="dialog" onClick={() => { setError(""); setOpen(true); }}>{text(`파일 ${files.length}개 전체 보기`, `View all ${files.length} files`)}<span>+{files.length - INLINE_FILES}</span></button>}
    {error && !open && <div className="chat-composer-error" role="alert">{error}</div>}
    {open && createPortal(<FileDialog files={files} error={error} onClose={close} onOpen={file => { void openFile(file); }} />, root.current?.closest(".app") || document.body)}
  </section>;
}
