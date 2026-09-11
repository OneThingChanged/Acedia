import { SettingScope, settingTarget } from "./SettingsSearch";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { launchOptionsProblem, normalizeLaunchOptions, type LaunchOptions } from "../lib/launchOptions";
import { openDialog } from "../platform/plugins";
import { invoke } from "../platform/runtime";
import "./AdvancedLaunchOptions.css";

const emptyOptions = (): LaunchOptions => ({ executable: "", args: [], env: [] });

export function AdvancedLaunchOptions({
  toolId, value, onChange, onValidityChange, detectedPath, onLoadDefaults, settingsPrefix, commitOnEdit = false, expanded = false,
}: {
  toolId: string;
  commitOnEdit?: boolean;
  expanded?: boolean;
  settingsPrefix?: string;
  value?: LaunchOptions;
  onChange: (value: LaunchOptions | undefined) => void;
  onValidityChange?: (valid: boolean) => void;
  detectedPath?: string | null;
  onLoadDefaults?: () => LaunchOptions | undefined;
}) {
  const { text } = useAppLanguage();
  const id = useId();
  const [draft, setDraft] = useState(() => normalizeLaunchOptions(value) ?? emptyOptions());
  const [custom, setCustom] = useState(!!value?.executable);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [path, setPath] = useState(detectedPath);
  const [checking, setChecking] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const latestValue = useRef(JSON.stringify(normalizeLaunchOptions(value)));
  useEffect(() => {
    const serialized = JSON.stringify(normalizeLaunchOptions(value));
    if (serialized !== latestValue.current) {
      latestValue.current = serialized;
      setDraft(normalizeLaunchOptions(value) ?? emptyOptions());
      setCustom(!!value?.executable);
      setRevealed(new Set());
    }
  }, [value]);
  useEffect(() => { if (detectedPath !== undefined) setPath(detectedPath); }, [detectedPath]);
  const problem = custom && !draft.executable.trim() ? "path" : launchOptionsProblem(draft);
  useEffect(() => { onValidityChange?.(!problem); }, [problem, onValidityChange]);
  const messages = {
    path: text("실행 파일의 전체 경로를 따옴표 없이 입력하세요.", "Enter the full executable path without surrounding quotes."),
    limits: text("인수·변수는 각각 64개, 입력 합계는 각각 24,000자까지 지원합니다.", "Up to 64 arguments and variables, and 24,000 characters per list are supported."),
    args: text("인수에는 줄바꿈이나 제어 문자를 넣을 수 없습니다.", "Arguments cannot contain line breaks or control characters."),
    managedArgs: text("대화 복원·권한·Alt-screen·인증 저장소는 기존 실행 옵션에서 관리합니다.", "Use the existing controls for resume, permissions, Alt-screen, and credential storage."),
    envName: text("변수 이름에는 영문자·숫자·_를 사용하고 숫자로 시작하지 마세요.", "Use letters, numbers, and underscores; names cannot start with a number."),
    envReserved: text("계정 인증·터미널·앱 연결에 사용하는 환경변수는 변경할 수 없습니다.", "Account, terminal, and app integration environment variables are managed by the app."),
    envValue: text("환경변수 값에는 NUL 문자를 넣을 수 없습니다.", "Environment values cannot contain NUL characters."),
    envDuplicate: text("같은 이름의 환경변수가 있습니다. 중복 행을 삭제하거나 이름을 바꾸세요.", "Duplicate environment variable name. Rename it or remove the duplicate row."),
  };
  const change = (next: LaunchOptions, useCustom = custom) => {
    setDraft(next);
    setDialogError("");
    if ((useCustom && !next.executable.trim()) || launchOptionsProblem(next)) return;
    const normalized = normalizeLaunchOptions(next);
    latestValue.current = JSON.stringify(normalized);
    onChange(normalized);
  };
  const edit = (next: LaunchOptions) => { if (commitOnEdit) change(next); else { setDraft(next); setDialogError(""); } };
  const finish = { onBlur: () => change(draft), onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
  } };
  const reset = (next?: LaunchOptions) => {
    setCustom(!!next?.executable);
    setRevealed(new Set());
    change(next ?? emptyOptions(), !!next?.executable);
  };
  const check = async () => {
    setChecking(true);
    try {
      const result = await invoke<Record<string, { path: string | null }>>("check_tools");
      setPath(result?.[toolId]?.path ?? null);
    } catch { setPath(null); }
    finally { setChecking(false); }
  };
  const browse = async () => {
    try {
      const selected = await openDialog({ multiple: false });
      if (typeof selected === "string") change({ ...draft, executable: selected }, true);
    } catch {
      setDialogError(text("파일 선택 창을 열지 못했습니다. 경로를 직접 입력하세요.", "Could not open the file picker. Enter the path manually."));
    }
  };
  const normalized = normalizeLaunchOptions(draft);
  return <div className="advanced-launch-options">
    <details open={expanded || undefined} onToggle={event => {
      if (event.currentTarget.open && path === undefined && !checking) void check();
    }}>
      <summary>{text("고급 실행 설정", "Advanced launch settings")}
        <span className="advanced-launch-summary">
          {custom ? text("직접 지정", "Custom path") : text("자동 감지", "Auto-detect")}
          {" · "}{text("인수 " + (normalized?.args.length ?? 0) + "개", (normalized?.args.length ?? 0) + " args")}
          {" · "}{text("환경변수 " + (normalized?.env.length ?? 0) + "개", (normalized?.env.length ?? 0) + " variables")}
        </span>
      </summary>
      <section className="advanced-launch-section" {...settingTarget(settingsPrefix && settingsPrefix + ".executable")}>
        <div className="advanced-launch-heading">
          <label htmlFor={id + "-path"}>{text("CLI 실행 경로", "CLI executable path")}<SettingScope id={settingsPrefix && settingsPrefix + ".executable"} /></label>
          <div className="advanced-launch-mode" role="group" aria-label={text("실행 파일 선택 방식", "Executable selection")}>
            <button type="button" aria-pressed={!custom} onClick={() => { setCustom(false); change({ ...draft, executable: "" }, false); }}>{text("자동 감지", "Auto-detect")}</button>
            <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>{text("직접 지정", "Custom")}</button>
          </div>
        </div>
        {custom ? <div className="advanced-launch-path">
          <input id={id + "-path"} aria-label={text("CLI 실행 파일 경로", "CLI executable path")} value={draft.executable}
            spellCheck={false} {...finish} onChange={e => edit({ ...draft, executable: e.target.value })}
            placeholder={text("실행 파일 전체 경로", "Full path to executable")} />
          <button type="button" className="btn-secondary" onClick={() => void browse()}>{text("찾아보기", "Browse")}</button>
        </div> : <div className="advanced-launch-path">
          <code id={id + "-path"}>{checking ? text("확인 중…", "Checking…") : path || text(toolId + " · 실행 시 PATH에서 찾습니다", toolId + " · resolved from PATH at launch")}</code>
          <button type="button" className="btn-secondary" disabled={checking} onClick={() => void check()}>{text("새로고침", "Refresh")}</button>
        </div>}
        {expanded && (custom ? draft.executable : path) && <div className="advanced-launch-path-preview"><code>{custom ? draft.executable : path}</code><button type="button" className="btn-secondary" onClick={() => { void invoke("clipboard_write_text", { text: custom ? draft.executable : path }).catch(() => setDialogError(text("경로를 복사하지 못했습니다.", "Could not copy the path."))); }}>{text("경로 복사", "Copy path")}</button></div>}
        {dialogError && <p role="alert" className="advanced-launch-error">{dialogError}</p>}
      </section>
      <section className="advanced-launch-section" {...settingTarget(settingsPrefix && settingsPrefix + ".args")}>
        <div className="advanced-launch-heading"><span>{text("추가 실행 인수", "Additional arguments")}<SettingScope id={settingsPrefix && settingsPrefix + ".args"} /></span>
          <button type="button" className="advanced-launch-add" disabled={draft.args.length >= 64}
            onClick={() => change({ ...draft, args: [...draft.args, ""] })}>{text("+ 인수 추가", "+ Add argument")}</button>
        </div>
        <div className="advanced-launch-list">
          {draft.args.map((arg, index) => <div className="advanced-launch-arg" key={index}>
            <span aria-hidden="true">{index + 1}</span>
            <input aria-label={text("추가 인수 " + (index + 1), "Argument " + (index + 1))} value={arg} spellCheck={false}
              {...finish} onChange={e => edit({ ...draft, args: draft.args.map((x, i) => i === index ? e.target.value : x) })} />
            <button type="button" className="advanced-launch-remove" aria-label={text("인수 " + (index + 1) + " 삭제", "Remove argument " + (index + 1))}
              onClick={() => change({ ...draft, args: draft.args.filter((_, i) => i !== index) })}>×</button>
          </div>)}
          {!draft.args.length && <p className="advanced-launch-hint">{text("추가 인수가 없습니다.", "No additional arguments.")}</p>}
        </div>
        <p className="advanced-launch-hint">{text("한 행에 인수 하나. 공백이 있어도 따옴표로 감쌀 필요가 없습니다.", "One argument per row. Do not add wrapping quotes, even for spaces.")}</p>
      </section>
      <section className="advanced-launch-section" {...settingTarget(settingsPrefix && settingsPrefix + ".env")}>
        <div className="advanced-launch-heading"><span>{text("환경변수", "Environment variables")}<SettingScope id={settingsPrefix && settingsPrefix + ".env"} /></span>
          <button type="button" className="advanced-launch-add" disabled={draft.env.length >= 64}
            onClick={() => change({ ...draft, env: [...draft.env, { name: "", value: "" }] })}>{text("+ 변수 추가", "+ Add variable")}</button>
        </div>
        <div className="advanced-launch-list">
          {draft.env.map((item, index) => <div className="advanced-launch-env" key={index}>
            <input aria-label={text("환경변수 " + (index + 1) + " 이름", "Variable " + (index + 1) + " name")} value={item.name} spellCheck={false}
              placeholder={text("이름", "Name")} {...finish} onChange={e => edit({ ...draft, env: draft.env.map((x, i) => i === index ? { ...x, name: e.target.value } : x) })} />
            <div className="advanced-launch-value">
              <input aria-label={text("환경변수 " + (index + 1) + " 값", "Variable " + (index + 1) + " value")} value={item.value}
                placeholder={text("값", "Value")} type={revealed.has(index) ? "text" : "password"} autoComplete="off" spellCheck={false}
                {...finish} onChange={e => edit({ ...draft, env: draft.env.map((x, i) => i === index ? { ...x, value: e.target.value } : x) })} />
              <button type="button" aria-label={text("환경변수 " + (index + 1) + " 값 표시", "Reveal variable " + (index + 1))} aria-pressed={revealed.has(index)}
                onClick={() => setRevealed(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>
                {revealed.has(index) ? text("숨김", "Hide") : text("표시", "Show")}</button>
            </div>
            <button type="button" className="advanced-launch-remove" aria-label={text("환경변수 " + (index + 1) + " 삭제", "Remove variable " + (index + 1))}
              onClick={() => { setRevealed(new Set()); change({ ...draft, env: draft.env.filter((_, i) => i !== index) }); }}>×</button>
          </div>)}
          {!draft.env.length && <p className="advanced-launch-hint">{text("추가 환경변수가 없습니다.", "No additional environment variables.")}</p>}
        </div>
        <p className="advanced-launch-hint">{text("이 세션의 환경에 추가합니다. 계정·터미널 관련 변수는 앱에서 관리합니다.", "Added to the session environment. Account and terminal variables are managed by the app.")}</p>
      </section>
      <div className="advanced-launch-actions">
        {onLoadDefaults && <button type="button" className="btn-secondary" onClick={() => reset(onLoadDefaults())}>{text("현재 기본값 불러오기", "Load current defaults")}</button>}
        <button type="button" className="btn-secondary" onClick={() => reset()}>{text("고급 설정 초기화", "Reset advanced settings")}</button>
      </div>
    </details>
    {problem && <p role="alert" className="advanced-launch-error">{messages[problem]} {text("입력을 수정하면 저장됩니다.", "Correct the input to save it.")}</p>}
  </div>;
}
