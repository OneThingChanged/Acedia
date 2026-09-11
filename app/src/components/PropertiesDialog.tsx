import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import { invoke } from "../platform/runtime";
import "./PropertiesDialog.css";

export function nextPropertiesTabIndex(index: number, key: string, count: number) {
  if (count <= 0 || key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + count) % count;
  return index;
}

export function PropertiesDialog({ title, subtitle, tabs, activeTab, onTabChange, onClose, dirty = false, busy = false, footer }: {
  title: string; subtitle: string;
  tabs: { id: string; label: string; content: ReactNode }[];
  activeTab: string; onTabChange: (id: string) => void; onClose: () => void;
  dirty?: boolean; busy?: boolean; footer?: ReactNode;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const latest = useRef({ dirty, busy, onClose, text });
  latest.current = { dirty, busy, onClose, text };
  function close() {
    const state = latest.current;
    if (state.busy) return;
    if (state.dirty && !window.confirm(state.text("저장하지 않은 변경을 버리고 닫을까요?", "Discard unsaved changes and close?"))) return;
    state.onClose();
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== "Tab") return;
      const elements = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? [])]
        .filter(el => el.getClientRects().length > 0 && !el.closest("[hidden], fieldset:disabled"));
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop properties-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={root} className={`properties-dialog${wide ? " properties-dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={id + "-title"} tabIndex={-1}>
      <header className="properties-header">
        <div><p>{subtitle}</p><h2 id={id + "-title"}>{title}</h2></div>
        <div className="properties-header-actions"><button className="btn-secondary" onClick={() => setWide(!wide)} aria-pressed={wide}>{wide ? text("기본 크기", "Standard size") : text("넓게", "Expand")}</button><button className="app-icon-btn" onClick={close} disabled={busy} aria-label={text("닫기", "Close")}>×</button></div>
      </header>
      <div className="properties-body">
        <nav className="properties-nav" role="tablist" aria-label={subtitle}>
          {tabs.map((tab, index) => <button key={tab.id} id={`${id}-${tab.id}-tab`} role="tab" type="button" aria-selected={activeTab === tab.id} aria-controls={`${id}-${tab.id}-panel`} tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onTabChange(tab.id)} onKeyDown={event => {
              if (!["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault(); const next = tabs[nextPropertiesTabIndex(index, event.key, tabs.length)]; onTabChange(next.id); document.getElementById(`${id}-${next.id}-tab`)?.focus();
            }}>{tab.label}</button>)}
        </nav>
        {tabs.map(tab => <section key={tab.id} className="properties-panel" id={`${id}-${tab.id}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-${tab.id}-tab`} hidden={activeTab !== tab.id}>{tab.content}</section>)}
      </div>
      <footer className="properties-footer">{footer ?? <span>{text("정보는 현재 상태를 기준으로 표시합니다.", "Information reflects the current state.")}</span>}<button type="button" className="btn-secondary" disabled={busy} onClick={close}>{text("닫기", "Close")}</button></footer>
    </div>
  </div>;
}

export function PropertyPath({ label, path, local = true }: { label: string; path: string; local?: boolean }) {
  const { text } = useAppLanguage();
  const [message, setMessage] = useState("");
  async function action(copy: boolean) {
    try {
      if (copy) await invoke("clipboard_write_text", { text: path });
      else await invoke("reveal_local_path", { path });
      setMessage(copy ? text("복사했습니다.", "Copied.") : "");
    } catch { setMessage(text("경로 작업을 완료하지 못했습니다.", "Could not complete the path action.")); }
  }
  return <div className="property-path"><div className="property-card-heading"><strong>{label}</strong><div><button className="btn-secondary" disabled={!path} onClick={() => void action(true)}>{text("복사", "Copy")}</button>{local && <button className="btn-secondary" disabled={!path} onClick={() => void action(false)}>{text("위치 열기", "Open location")}</button>}</div></div><code>{path || "—"}</code>{message && <small role="status">{message}</small>}</div>;
}

export function PropertyFacts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return <dl className="property-facts">{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}
