import { useEffect, useState, type ReactNode } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import {
  DEFAULT_TERMINAL_SETTINGS, TERMINAL_FONTS, loadTerminalSettings,
  subscribeTerminalSettings, updateTerminalSettings, type TerminalSettings,
} from "../lib/terminalSettings";

export function TerminalSettingsPanel() {
  const { text } = useAppLanguage();
  const [settings, setSettings] = useState(loadTerminalSettings);
  const [error, setError] = useState("");
  useEffect(() => subscribeTerminalSettings(setSettings), []);
  const update = (patch: Partial<TerminalSettings>) => {
    try { const next = updateTerminalSettings(patch); setSettings(next); setError(""); return next; }
    catch { setError(text("설정을 저장하지 못했습니다. 다시 시도하세요.", "Could not save settings. Please try again.")); }
  };
  const row = (label: string, control: ReactNode, hint?: string) => (
    <label className="agent-settings-row terminal-settings-row">
      <span><span className="agent-row-title">{label}</span>{hint && <span className="agent-row-sub terminal-settings-hint">{hint}</span>}</span>
      {control}
    </label>
  );
  const number = (key: "fontSize" | "lineHeight" | "scrollback", min: number, max: number, step: number, label: string) => (
    <TerminalNumber key={`${key}:${settings[key]}`} value={settings[key]} min={min} max={max} step={step} label={label}
      onCommit={value => update({ [key]: value })?.[key] ?? settings[key]} />
  );
  const toggle = (key: "cursorBlink" | "copyOnSelect" | "rightClickToPaste", label: string) => (
    <input aria-label={label} type="checkbox" role="switch" checked={settings[key]} onChange={e => update({ [key]: e.target.checked })} />
  );
  return <section className="terminal-settings-panel app-settings-section">
    <p className="check-hint">{text(
      "이 앱의 모든 로컬·SSH 터미널에 적용됩니다. 표시 변경은 즉시 반영되며 새 세션에도 유지됩니다.",
      "Applies to all local and SSH terminals in this app. Display changes apply immediately and are kept for new sessions.",
    )}</p>
    <div className="agent-settings-sectionhead"><h4>{text("글꼴과 표시", "Font and appearance")}</h4>
      <button className="btn-secondary" onClick={() => update({ ...DEFAULT_TERMINAL_SETTINGS })}>{text("기본값 복원", "Restore defaults")}</button>
    </div>
    <div className="agent-settings-card">
      {row(text("글꼴", "Font family"), <select aria-label={text("글꼴", "Font family")} value={settings.fontFamily} onChange={e => update({ fontFamily: e.target.value })}>
        {TERMINAL_FONTS.map(font => <option key={font.label} value={font.value}>{font.label}</option>)}
      </select>, text("설치되지 않은 글꼴은 대체 고정폭 글꼴로 표시됩니다.", "Unavailable fonts fall back to another monospace font."))}
      {row(text("글자 크기", "Font size"), number("fontSize", 9, 24, 1, text("글자 크기", "Font size")), text("9–24px · Ctrl+휠과 같은 설정입니다.", "9–24px · shared with Ctrl+wheel."))}
      {row(text("줄 간격", "Line height"), number("lineHeight", 1, 2, 0.05, text("줄 간격", "Line height")), text("1.0–2.0배", "1.0–2.0×"))}
      {row(text("커서 모양", "Cursor shape"), <select aria-label={text("커서 모양", "Cursor shape")} value={settings.cursorStyle} onChange={e => update({ cursorStyle: e.target.value as TerminalSettings["cursorStyle"] })}>
        <option value="block">{text("블록", "Block")}</option><option value="bar">{text("세로 막대", "Bar")}</option><option value="underline">{text("밑줄", "Underline")}</option>
      </select>)}
      {row(text("커서 깜빡임", "Blinking cursor"), toggle("cursorBlink", text("커서 깜빡임", "Blinking cursor")))}
    </div>
    <div className="terminal-settings-preview" aria-label={text("글꼴 미리보기", "Font preview")}
      style={{ fontFamily: settings.fontFamily, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
      <span>$ acedia</span><br />{text("한글·English 0123456789", "English·한글 0123456789")}<br />
      <span className={`terminal-preview-cursor terminal-preview-cursor-${settings.cursorStyle}${settings.cursorBlink ? " terminal-preview-blink" : ""}`} aria-hidden="true" />
    </div>
    <div className="agent-settings-sectionhead"><h4>{text("이력과 클립보드", "History and clipboard")}</h4></div>
    <div className="agent-settings-card">
      {row(text("스크롤 이력 행 수", "Scrollback rows"), number("scrollback", 1000, 50000, 1000, text("스크롤 이력 행 수", "Scrollback rows")),
        text("1,000–50,000행. 줄이면 오래된 화면 이력이 잘릴 수 있습니다. 저장된 대화 파일은 유지됩니다.", "1,000–50,000 rows. Lower values may trim older screen history. Saved conversation files are kept."))}
      {row(text("선택하면 복사", "Copy on select"), toggle("copyOnSelect", text("선택하면 복사", "Copy on select")), text("선택한 터미널 텍스트를 클립보드에 복사합니다.", "Copy selected terminal text to the clipboard."))}
      {row(text("우클릭으로 붙여넣기", "Right-click to paste"), toggle("rightClickToPaste", text("우클릭으로 붙여넣기", "Right-click to paste")),
        text("Ctrl+우클릭은 기존 우클릭 동작을 유지합니다.", "Ctrl+right-click keeps the normal right-click behavior."))}
    </div>
    <p className="check-hint">{text("자동 저장됩니다. CLI가 직접 지정한 커서 모양은 앱 기본값보다 우선할 수 있습니다.", "Saved automatically. A CLI can override the default cursor appearance.")}</p>
    {error && <p role="alert" className="terminal-settings-error">{error}</p>}
  </section>;
}

function TerminalNumber({ value, min, max, step, label, onCommit }: {
  value: number; min: number; max: number; step: number; label: string; onCommit: (value: number) => number;
}) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next)) { setDraft(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, next));
    setDraft(String(onCommit(clamped)));
  };
  return <input type="number" aria-label={label} min={min} max={max} step={step} value={draft}
    onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
