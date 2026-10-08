import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import { invoke } from "../platform/runtime";
import type { ConversationArtifact } from "../platform/ipcContract";
import { ChatIcon } from "./ChatIcon";
import { ChatDiff } from "./ChatDiff";
import { isChangedDocument } from "../lib/chatFiles";
import "./ChatFiles.css";

const INLINE_FILES = 3;
function displayPath(value: string, folder?: string) {
  const normalized = value.replace(/\\/g, "/"), root = folder?.replace(/\\/g, "/").replace(/\/$/, "");
  return root && normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`) ? normalized.slice(root.length + 1) : normalized;
}
function ChangeStats({ file }: { file: ConversationArtifact }) {
  const { text } = useAppLanguage();
  return file.change?.additions != null ? <span className="chat-change-stats"><span>+{file.change.additions}</span><span>−{file.change.deletions}</span></span>
    : <span className="chat-change-unknown">{file.change?.operation === "delete" ? text("삭제됨", "Deleted") : text("수정됨", "Modified")}</span>;
}
function ChangedFile({ file, folder, initiallyOpen, onOpen }: { file: ConversationArtifact; folder?: string; initiallyOpen: boolean; onOpen: (file: ConversationArtifact) => void }) {
  const { text } = useAppLanguage();
  const [expanded, setExpanded] = useState(initiallyOpen);
  return <details className="chat-changed-file" open={expanded} onToggle={event => { if (event.target === event.currentTarget) setExpanded(event.currentTarget.open); }}>
    <summary><span title={file.path}>{displayPath(file.path, folder)}</span><ChangeStats file={file} /></summary>
    {expanded && <div className="chat-change-preview">{file.change?.diff.length ? <ChatDiff diff={file.change.diff} /> : <p>{text("이 파일의 상세 수정 내역은 기록에 없습니다.", "Detailed changes are not available for this file.")}</p>}
      {file.change?.truncated && <p>{text("긴 변경 내역의 일부만 표시합니다.", "Showing part of a long change.")}</p>}
      {file.change?.operation !== "delete" && <button type="button" className="chat-files-more" onClick={() => onOpen(file)}>{text("파일 열기", "Open file")}<ChatIcon name="open" /></button>}
    </div>}
  </details>;
}
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

function FileDialog({ files, onOpen, onClose, error, changes, folder, selectedPath }: { files: ConversationArtifact[]; onOpen: (file: ConversationArtifact) => void; onClose: () => void; error: string; changes?: boolean; folder?: string; selectedPath?: string }) {
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
      const elements = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary, [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
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
      <header className="chat-files-header"><div><h2 id={`${id}-title`}>{changes ? text("이 답변의 변경 파일", "Changes from this response") : text("이 답변의 파일", "Files from this response")}</h2><p>{changes ? text("이 답변에서 수행한 수정 내역입니다. 같은 파일의 여러 수정은 합산합니다.", "Edits made in this response. Multiple edits to the same file are added together.") : text("생성·수정 파일과 참고한 파일을 모았습니다.", "Created or modified files and files referenced in this response.")}</p></div>
        <button type="button" className="chat-files-close" aria-label={text("닫기", "Close")} onClick={onClose}>×</button></header>
      <input ref={search} className="chat-files-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={text("파일명 또는 경로 검색", "Search filenames or paths")} aria-label={text("파일 검색", "Search files")} />
      <div className="chat-files-count" role="status">{query.trim() ? text(`검색 결과 ${filtered.length}개 · 전체 ${files.length}개`, `${filtered.length} matches · ${files.length} files total`) : text(`전체 ${files.length}개`, `${files.length} files total`)}</div>
      <div className="chat-files-body">{changes ? filtered.map(file => <ChangedFile key={file.path} file={file} folder={folder} initiallyOpen={file.path === selectedPath} onOpen={onOpen} />) : <FileGroups files={filtered} expanded onOpen={onOpen} />}{!filtered.length && <p className="chat-files-empty">{text("검색 결과가 없습니다.", "No matching files.")}</p>}</div>
      {error && <div className="chat-composer-error" role="alert">{error}</div>}
    </div>
  </div>;
}

export function ChatFiles({ files, folder, onOpenPath }: { files: ConversationArtifact[]; folder?: string; onOpenPath?: (path: string) => void }) {
  const { text } = useAppLanguage();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>();
  const root = useRef<HTMLElement>(null);
  const close = useCallback(() => { setOpen(false); setChangesOpen(false); }, []);
  const openFile = async (file: ConversationArtifact) => {
    setError("");
    try {
      if (onOpenPath) await onOpenPath(file.path);
      else await invoke("open_local_path", { path: file.path });
      close();
    } catch { setError(text("파일을 열지 못했습니다. 경로를 확인해 주세요.", "Could not open the file. Check its path.")); }
  };
  if (!files.length) return null;
  const changed = files.filter(isChangedDocument), previews = files.filter(file => !isChangedDocument(file));
  const counted = changed.length > 0 && changed.every(file => file.change?.additions != null);
  const showChanges = (path?: string) => { setSelectedPath(path); setError(""); setChangesOpen(true); };
  return <section ref={root} className="chat-artifacts" aria-label={text("이 답변의 파일", "Files from this response")}>
    {changed.length > 0 && <section className="chat-changes-card" aria-label={text("변경 파일", "Changed files")}>
      <header><ChatIcon name="file" /><div><strong>{text(`파일 ${changed.length}개 수정`, `Edited ${changed.length} files`)}</strong>{counted && <span className="chat-change-stats"><span>+{changed.reduce((sum, file) => sum + file.change!.additions!, 0)}</span><span>−{changed.reduce((sum, file) => sum + file.change!.deletions!, 0)}</span></span>}</div><button type="button" className="chat-changes-view" onClick={() => showChanges(changed[0]?.path)} aria-haspopup="dialog">{text("변경 보기", "View changes")}</button></header>
      {changed.slice(0, INLINE_FILES).map(file => <button type="button" className="chat-change-row" key={file.path} title={file.path} onClick={() => showChanges(file.path)}><span>{displayPath(file.path, folder)}</span><ChangeStats file={file} /></button>)}
      {changed.length > INLINE_FILES && <button type="button" className="chat-changes-more" aria-haspopup="dialog" onClick={() => showChanges()}>{text(`${changed.length - INLINE_FILES}개 파일 더 보기`, `Show ${changed.length - INLINE_FILES} more files`)}<ChatIcon name="chevron" /></button>}
    </section>}
    <FileGroups files={previews.slice(0, INLINE_FILES)} totalFiles={previews} onOpen={file => { void openFile(file); }} />
    {previews.length > INLINE_FILES && <button type="button" className="chat-files-more" aria-haspopup="dialog" onClick={() => { setError(""); setOpen(true); }}>{text(`파일 ${previews.length}개 전체 보기`, `View all ${previews.length} files`)}<span>+{previews.length - INLINE_FILES}</span></button>}
    {error && !open && <div className="chat-composer-error" role="alert">{error}</div>}
    {(open || changesOpen) && createPortal(<FileDialog files={changesOpen ? changed : previews} changes={changesOpen} folder={folder} selectedPath={selectedPath} error={error} onClose={close} onOpen={file => { void openFile(file); }} />, root.current?.closest(".app") || document.body)}
  </section>;
}
