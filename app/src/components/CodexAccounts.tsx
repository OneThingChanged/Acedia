import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";
import { useAppLanguage } from "../lib/appLanguage";

type Account = { id: string; label: string; state: string; failureReason?: string };
const stateLabels: Record<string, [string, string]> = {
  default: ["현재 Codex 환경 사용", "Use current Codex environment"], empty: ["로그인 필요", "Login required"], pending: ["브라우저에서 로그인 중…", "Signing in through browser…"],
  saved: ["로그인 저장됨", "Login saved"], failed: ["로그인 실패 · 다시 시도하세요", "Login failed · please retry"], cancelled: ["로그인 취소됨", "Login cancelled"],
};
const failureLabels: Record<string, [string, string]> = {
  home_unavailable: ["Codex가 계정 저장 폴더에 접근하지 못했습니다. 앱을 업데이트한 후 다시 로그인하세요.", "Codex could not access the account folder. Update the app and retry login."],
  credentials_not_saved: ["로그인은 종료됐지만 인증 정보가 저장되지 않았습니다. 다시 로그인하세요.", "Login ended without saving credentials. Please sign in again."],
};

export function CodexAccountSelect({ value, onChange, disabled = false, label, hint }: {
  value?: string; onChange: (id: string) => void; disabled?: boolean; label?: string; hint?: string;
}) {
  const { text } = useAppLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    invoke<Account[]>("codex_accounts_list").then((list) => { if (live) setAccounts(list); })
      .catch((e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, []);
  return <label className="field">
    <span className="field-label">{label ?? text("Codex 계정", "Codex account")}</span>
    <select value={value || "default"} disabled={disabled || !!error} onChange={(e) => onChange(e.target.value)}>
      <option value="default">{text("기존 로그인", "Existing login")}</option>
      {value && value !== "default" && !accounts.some((a) => a.id === value) && <option value={value}>{text("선택된 계정 (확인 필요)", "Selected account (check required)")}</option>}
      {accounts.filter((a) => a.id !== "default").map((a) =>
        <option key={a.id} value={a.id} disabled={a.state !== "saved"}>{a.label} · {stateLabels[a.state] ? text(...stateLabels[a.state]) : a.state}</option>)}
    </select>
    <span className="check-hint">{hint ?? text("계정 추가·로그인: 설정 → 에이전트 → Codex", "Add accounts and sign in: Settings → Agents → Codex")}</span>
    {error && <span role="alert">{error}</span>}
  </label>;
}

export function CodexAccountsPanel({ defaultAccountId = "default" }: { defaultAccountId?: string }) {
  const { text } = useAppLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const refresh = async () => setAccounts(await invoke<Account[]>("codex_accounts_list"));
  useEffect(() => {
    let live = true;
    const poll = () => invoke<Account[]>("codex_accounts_list")
      .then((list) => { if (live) setAccounts(list); })
      .catch((e) => { if (live) setError(String(e)); });
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const pending = accounts.some((a) => a.state === "pending");
  return <section className="codex-account-management">
    <div className="agent-settings-sectionhead"><h4>{text("로그인 계정", "Login accounts")} <span className="agent-account-count">{accounts.length}</span></h4><button type="button" className="agent-refresh" onClick={() => setAdding(true)}>＋ {text("계정 추가", "Add account")}</button></div>
    <p className="check-hint">{text("계정별로 한 번 로그인한 후 세션의 실행 옵션에서 선택하세요. 브라우저에서 원하는 계정으로 로그인했는지 확인하세요. 계정별 Codex 설정·기록은 별도로 저장됩니다. 로컬 세션에서 지원합니다.", "Sign in once per account, then select it in session launch options. Check the account in your browser. Codex settings and history are stored separately for each account. Available for local sessions.")}</p>
    <div className="agent-settings-card">
    {accounts.map((a) => <div className="agent-settings-row" key={a.id}>
      <div className="agent-account-identity"><span className="agent-account-avatar">{a.id === "default" ? "↗" : a.label.slice(0, 1).toUpperCase()}</span><div><div className="agent-row-title">{a.id === "default" ? text("기존 로그인", "Existing login") : a.label}{a.id === defaultAccountId && <span className="agent-account-badge">{text("기본 계정", "Default account")}</span>}</div><div className="agent-row-sub">{a.state === "failed" && a.failureReason && failureLabels[a.failureReason] ? text(...failureLabels[a.failureReason]) : stateLabels[a.state] ? text(...stateLabels[a.state]) : a.state}</div></div></div>
      {a.id !== "default" && (a.state === "pending"
        ? <button className="btn-secondary" disabled={busy} onClick={() => void run(() => invoke("codex_accounts_cancel_login"))}>{text("취소", "Cancel")}</button>
        : <button className="btn-secondary" disabled={busy || pending} onClick={() => void run(() => invoke("codex_accounts_login", { accountId: a.id }))}>{text("브라우저 로그인", "Browser login")}</button>)}
    </div>)}
    {adding && <div className="agent-settings-row agent-account-add">
      <input autoFocus aria-label={text("Codex 계정 이름", "Codex account name")} placeholder={text("계정 이름 (예: 개인, 업무)", "Account name (e.g. personal, work)")} maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
      <button className="btn-secondary" disabled={busy || !label.trim()} onClick={() => void run(async () => {
        await invoke("codex_accounts_create", { label: label.trim() }); setLabel(""); setAdding(false);
      })}>{text("계정 추가", "Add account")}</button>
      <button className="btn-secondary" disabled={busy} onClick={() => setAdding(false)}>{text("취소", "Cancel")}</button>
    </div>}
    </div>
    <p className="agent-hint">{text("기존 세션의 계정은 세션 속성 → 실행 옵션에서 변경합니다.", "Change an existing session's account in Session properties → Launch options.")}</p>
    {pending && <p role="status">{text("브라우저에서 로그인을 완료하세요. 로그인 대기는 최대 5분입니다.", "Complete sign-in in your browser within 5 minutes.")}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
