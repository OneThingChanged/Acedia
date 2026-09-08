import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";
import type { BrowserActivitySnapshot, RuntimeCommandContract } from "../platform/ipcContract";
import { useAppLanguage } from "../lib/appLanguage";
import "./BrowserActivityPanel.css";

type Props = { mode: "history" | "downloads"; onClose: () => void; onNavigate: (url: string) => Promise<void> };
const bytes = (value: number) => value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`;

export function BrowserActivityPanel({ mode, onClose, onNavigate }: Props) {
  const { text } = useAppLanguage();
  const [data, setData] = useState<BrowserActivitySnapshot>({ history: [], downloads: [], error: null });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const result = await invoke("document_browser_activity_list", {});
        if (!disposed) { setData(result); setLoaded(true); }
      } catch (reason) { if (!disposed) setError(String(reason)); }
      if (!disposed) timer = setTimeout(refresh, 1000);
    };
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [revision]);
  const action = async (action: RuntimeCommandContract["document_browser_activity_action"]["args"]["action"], id?: string) => {
    setError("");
    try { await invoke("document_browser_activity_action", { action, id }); setRevision(value => value + 1); }
    catch (reason) { setError(String(reason)); }
  };
  const search = query.trim().toLocaleLowerCase();
  const history = data.history.filter(row => `${row.title} ${row.url}`.toLocaleLowerCase().includes(search));
  const downloads = data.downloads.filter(row => `${row.filename} ${row.url}`.toLocaleLowerCase().includes(search));
  const states: Record<string, string> = {
    progressing: text("다운로드 중", "Downloading"), completed: text("완료", "Completed"),
    cancelled: text("취소됨", "Cancelled"), interrupted: text("중단됨", "Interrupted"),
  };
  return <section className="browser-activity" aria-label={mode === "history" ? text("방문 기록", "History") : text("다운로드", "Downloads")}>
    <header>
      <strong>{mode === "history" ? text("방문 기록", "History") : text("다운로드", "Downloads")}</strong>
      <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={text("기록 검색", "Search records")} aria-label={text("기록 검색", "Search records")} />
      <button onClick={() => {
        if (!confirmClear) { setConfirmClear(true); return; }
        void action(mode === "history" ? "clear-history" : "clear-downloads"); setConfirmClear(false);
      }}>{confirmClear ? text("기록 삭제 확인", "Confirm clear") : text("기록 비우기", "Clear records")}</button>
      <button onClick={onClose}>{text("닫기", "Close")}</button>
    </header>
    {mode === "downloads" && <p>{text("기록을 지워도 다운로드한 파일은 삭제되지 않습니다.", "Clearing records does not delete downloaded files.")}</p>}
    {(error || data.error) && <p role="alert">{error || data.error}</p>}
    <div className="browser-activity-list">
      {!loaded && <p>{text("불러오는 중…", "Loading…")}</p>}
      {loaded && (mode === "history" ? history : downloads).length === 0 && <p>{text("표시할 기록이 없습니다.", "No records to display.")}</p>}
      {mode === "history" ? history.map(row => <article key={row.id}>
        <button className="browser-activity-link" onClick={() => { void onNavigate(row.url).then(onClose).catch(reason => setError(String(reason))); }}>
          <strong>{row.title}</strong><small>{row.url}</small>
        </button>
        <time>{new Date(row.visitedAt).toLocaleString()}</time>
        <button onClick={() => void action("remove-history", row.id)}>{text("삭제", "Remove")}</button>
      </article>) : downloads.map(row => <article key={row.id}>
        <div className="browser-activity-download">
          <strong>{row.filename}</strong><small>{row.path || row.url}</small>
          <span>{states[row.state] || row.state} · {bytes(row.receivedBytes)}{row.totalBytes > 0 ? ` / ${bytes(row.totalBytes)}` : ""}</span>
          {row.active && <progress value={row.totalBytes > 0 ? row.receivedBytes : undefined} max={row.totalBytes || 1} />}
        </div>
        <time>{new Date(row.startedAt).toLocaleString()}</time>
        {row.active && <button onClick={() => void action("cancel", row.id)}>{text("취소", "Cancel")}</button>}
        {row.state === "completed" && <button onClick={() => void action("show-folder", row.id)}>{text("폴더에서 보기", "Show in folder")}</button>}
      </article>)}
    </div>
  </section>;
}
