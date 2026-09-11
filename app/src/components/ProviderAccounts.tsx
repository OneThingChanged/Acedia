import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SettingScope, settingTarget } from "./SettingsSearch";
import { invoke, listen } from "../platform/runtime";
import { applyRemovedAccounts, type RemovedAccounts } from "../lib/removedAccounts";
import { useAppLanguage } from "../lib/appLanguage";
import "./ProviderAccounts.css";

type Account = {
  id: string; label: string; state: string; failureReason?: string;
  identity?: { email: string; source: "local" } | null;
};
type Provider = "codex" | "claude";
const commands = {
  codex: { list: "codex_accounts_list", create: "codex_accounts_create", login: "codex_accounts_login", cancel: "codex_accounts_cancel_login", rename: "codex_accounts_rename", remove: "codex_accounts_remove" },
  claude: { list: "claude_accounts_list", create: "claude_accounts_create", login: "claude_accounts_login", cancel: "claude_accounts_cancel_login", rename: "claude_accounts_rename", remove: "claude_accounts_remove" },
} as const;
const stateLabels: Record<string, [string, string]> = {
  default: ["현재 CLI 환경 사용", "Use current CLI environment"],
  empty: ["로그인 필요", "Login required"],
  pending: ["브라우저에서 로그인 중…", "Signing in through browser…"],
  saved: ["로그인 저장됨", "Login saved"],
  failed: ["로그인 실패", "Login failed"],
  cancelled: ["로그인 취소됨", "Login cancelled"],
  timed_out: ["로그인 시간 초과", "Login timed out"],
};
const failureLabels: Record<string, [string, string]> = {
  home_unavailable: ["CLI가 계정 저장 폴더에 접근하지 못했습니다. 앱을 업데이트한 후 다시 로그인하세요.", "The CLI could not access the account folder. Update the app and retry login."],
  credentials_not_saved: ["로그인은 종료됐지만 인증 정보가 저장되지 않았습니다. 다시 로그인하세요.", "Login ended without saving credentials. Please sign in again."],
  login_start_failed: ["로그인을 시작하지 못했습니다. CLI 설치 상태를 확인하고 다시 시도하세요.", "Could not start login. Check the CLI installation and try again."],
};

function useAccounts(provider: Provider) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const sequence = useRef(0);
  const live = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const list = await invoke<Account[]>(commands[provider].list);
      if (live.current && request === sequence.current) {
        setAccounts(list); setLoading(false); setLoadError(false);
      }
      return list;
    } catch {
      if (live.current && request === sequence.current) { setLoading(false); setLoadError(true); }
      return null;
    }
  }, [provider]);
  useEffect(() => {
    live.current = true;
    let stopped = false;
    let timer: number;
    setAccounts([]); setLoading(true); setLoadError(false);
    const poll = async () => {
      await refresh();
      if (!stopped) timer = window.setTimeout(poll, 2000);
    };
    void poll();
    const changed = () => { void refresh(); };
    window.addEventListener("multiagent:accounts-changed", changed);
    const subscription = listen("accounts:changed", changed);
    subscription.then(unlisten => { if (stopped) unlisten(); }).catch(() => {});
    return () => { stopped = true; live.current = false; ++sequence.current; window.clearTimeout(timer); window.removeEventListener("multiagent:accounts-changed", changed); void subscription.then(unlisten => unlisten()).catch(() => {}); };
  }, [refresh]);
  const remember = (account: Account) => {
    // Invalidate any list that started before this successful mutation.
    ++sequence.current;
    if (live.current) setAccounts(current => [...current.filter(a => a.id !== account.id), account]);
  };
  return { accounts, loading, loadError, refresh, remember, live };
}

export function AccountLabel({ provider, value }: { provider: Provider; value?: string }) {
  const { text } = useAppLanguage();
  const { accounts, loading, loadError } = useAccounts(provider);
  if (!value || value === "default") return <span>{text("기존 로그인", "Existing login")}</span>;
  return <span>{accounts.find(account => account.id === value)?.label ?? (loading ? text("확인 중…", "Loading…") : loadError ? text("계정 조회 실패", "Account lookup failed") : text("선택된 계정 (확인 필요)", "Selected account (check required)"))}</span>;
}

export function AccountSelect({ value, onChange, disabled = false, label, hint, provider = "codex" }: {
  provider?: Provider; value?: string; onChange: (id: string) => void; disabled?: boolean; label?: string; hint?: string;
}) {
  const { text } = useAppLanguage();
  const { accounts, loadError, loading } = useAccounts(provider);
  return <label className="field">
    <span className="field-label">{label ?? (provider === "codex" ? text("Codex 계정", "Codex account") : text("Claude 계정", "Claude account"))}</span>
    <select value={value || "default"} disabled={disabled || loadError || loading} onChange={e => onChange(e.target.value)}>
      <option value="default">{text("기존 로그인", "Existing login")}</option>
      {value && value !== "default" && !accounts.some(a => a.id === value) && <option value={value} disabled>{text("선택된 계정 (확인 필요)", "Selected account (check required)")}</option>}
      {accounts.filter(a => a.id !== "default").map(a =>
        <option key={a.id} value={a.id} disabled={a.state !== "saved"}>{a.label} · {stateLabels[a.state] ? text(...stateLabels[a.state]) : text("상태 확인 필요", "Check status")}</option>)}
    </select>
    <span className="check-hint">{hint ?? (provider === "codex" ? text("계정 추가·로그인: 설정 → 에이전트 → Codex", "Add accounts and sign in: Settings → Agents → Codex") : text("계정 추가·로그인: 설정 → 에이전트 → Claude", "Add accounts and sign in: Settings → Agents → Claude"))}</span>
    {loadError && <span role="alert">{text("계정 목록을 불러오지 못했습니다. 잠시 후 다시 확인합니다.", "Could not load accounts. Retrying shortly.")}</span>}
  </label>;
}

export function AccountsPanel({ defaultAccountId = "default", provider = "codex", onMakeDefault, settingId }: {
  defaultAccountId?: string; provider?: Provider; settingId?: string;
  onMakeDefault?: (accountId: string) => boolean | Promise<boolean>;
}) {
  const { text } = useAppLanguage();
  const { accounts, loading, loadError, refresh, remember, live } = useAccounts(provider);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [adding, setAdding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; mode: "rename" | "remove"; label: string } | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const flowTitle = useRef<HTMLHeadingElement>(null);
  const requestedFlowFocus = useRef(false);
  const flowId = useId();
  const pending = accounts.find(a => a.state === "pending");
  const active = accounts.find(a => a.id === activeId) ?? (!adding ? pending : undefined);
  const flowOpen = adding || !!active;
  const canAct = !busy && !loading && !loadError;
  const step = adding ? 0 : active?.state === "saved" ? 2 : 1;

  useEffect(() => {
    if (!loading && !loadError && editing && !accounts.some(account => account.id === editing.id)) setEditing(null);
  }, [accounts, loading, loadError, editing?.id]);

  useEffect(() => {
    if (!adding && !activeId && pending) setActiveId(pending.id);
  }, [adding, activeId, pending?.id]);

  useEffect(() => {
    if (active && (requestedFlowFocus.current || flowTitle.current?.closest(".account-flow")?.contains(document.activeElement))) {
      flowTitle.current?.focus();
      requestedFlowFocus.current = false;
    }
  }, [active?.id, active?.state]);

  const closeFlow = () => {
    setAdding(false); setActiveId(null); setLabel(""); setError("");
    addButton.current?.focus();
  };
  const run = async (action: () => Promise<void>, message: string) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    try { await action(); }
    catch { if (live.current) setError(message); }
    finally {
      await refresh();
      working.current = false;
      if (live.current) setBusy(false);
    }
  };
  const login = async (account: Account) => {
    await invoke(commands[provider].login, { accountId: account.id });
    remember({ ...account, state: "pending", identity: null, failureReason: undefined });
  };
  const loginError = text("로그인을 시작하지 못했습니다. CLI 설치 상태와 이 계정의 실행 중 세션을 확인한 뒤 다시 시도하세요.", "Could not start login. Check the CLI installation and active sessions using this account, then retry.");
  const createAndLogin = () => void run(async () => {
    const name = label.trim();
    requestedFlowFocus.current = true;
    const id = await invoke<string>(commands[provider].create, { label: name });
    window.dispatchEvent(new Event("multiagent:accounts-changed"));
    const account = { id, label: name, state: "empty" };
    remember(account);
    if (live.current) { setActiveId(id); setAdding(false); setLabel(""); }
    try { await login(account); }
    catch { if (live.current) setError(loginError); }
  }, text("계정을 추가하지 못했습니다. 저장 공간과 계정 목록을 확인한 뒤 다시 시도하세요.", "Could not add the account. Check storage and the account list, then retry."));
  const startLogin = (account: Account) => {
    requestedFlowFocus.current = true;
    setAdding(false); setActiveId(account.id);
    void run(() => login(account), loginError);
  };
  const cancelLogin = (account: Account) => void run(async () => {
    await invoke(commands[provider].cancel, { accountId: account.id });
  }, text("로그인을 취소하지 못했습니다. 목록을 새로고침한 뒤 상태를 확인하세요.", "Could not cancel login. Refresh the list to check its status."));
  const makeDefault = (account: Account) => void run(async () => {
    const latest = await refresh();
    if (!live.current) return;
    if (!latest?.some(a => a.id === account.id && a.state === "saved")) throw new Error("Account is not ready");
    if (!await onMakeDefault?.(account.id)) throw new Error("Default was not saved");
  }, text("기본 계정을 저장하지 못했습니다. 계정 상태를 확인하고 다시 시도하세요.", "Could not save the default account. Check its status and try again."));
  const renameAccount = () => {
    if (!editing || !editing.label.trim()) return;
    const edit = editing;
    void run(async () => {
      await invoke(commands[provider].rename, { accountId: edit.id, label: edit.label.trim() });
      if (live.current) setEditing(null);
      window.dispatchEvent(new Event("multiagent:accounts-changed"));
    }, text("이름을 저장하지 못했습니다. 다시 시도하세요.", "Could not save the name. Please retry."));
  };
  const removeAccount = () => {
    if (!editing) return;
    const edit = editing;
    void run(async () => {
      const result = await invoke<{ removed: RemovedAccounts }>(commands[provider].remove, { accountId: edit.id });
      applyRemovedAccounts(result.removed);
      window.dispatchEvent(new Event("multiagent:accounts-changed"));
      if (live.current) { setEditing(null); if (activeId === edit.id) setActiveId(null); }
      addButton.current?.focus();
    }, text("계정 삭제를 완료하지 못했습니다. 목록을 새로고침하고 다시 확인하세요.", "Could not complete account removal. Refresh the list and check again."));
  };
  const description = (account: Account) => {
    if (account.state === "pending") return text("열린 브라우저에서 원하는 계정으로 로그인하세요. 최대 5분 동안 기다립니다.", "Sign in with the intended account in your browser. Waiting for up to five minutes.");
    if (account.state === "cancelled") return text("로그인을 취소했습니다. 같은 계정으로 다시 시도할 수 있습니다.", "Login was cancelled. You can retry with this profile.");
    if (account.state === "timed_out") return text("5분 안에 완료되지 않아 로그인을 종료했습니다. 다시 시도하면 새 로그인 절차를 시작합니다.", "Login ended after five minutes. Retry to start a new sign-in attempt.");
    if (account.state === "failed") return account.failureReason && failureLabels[account.failureReason]
      ? text(...failureLabels[account.failureReason])
      : text("로그인을 완료하지 못했습니다. 브라우저와 네트워크 상태를 확인하고 다시 시도하세요.", "Login could not be completed. Check your browser and network, then retry.");
    if (account.state === "saved") return text("이 프로필에 인증 정보가 저장되어 있습니다. 새 세션에서 선택할 수 있습니다.", "Credentials are saved in this profile. You can select it for a new session.");
    return text("브라우저 로그인을 완료하면 이 계정을 사용할 수 있습니다.", "Complete browser login to use this account.");
  };
  const retryLabel = (account: Account) => ["failed", "cancelled", "timed_out"].includes(account.state)
    ? text("다시 로그인", "Retry login") : text("브라우저 로그인", "Browser login");

  return <section className="codex-account-management" data-account-provider={provider} {...settingTarget(settingId)} aria-busy={busy || loading}>
    <div className="agent-settings-sectionhead">
      <h4>{text("로그인 계정", "Login accounts")} <SettingScope id={settingId} /><span className="agent-account-count">{accounts.length}</span></h4>
      <button ref={addButton} type="button" className="agent-refresh" disabled={!canAct || !!pending || adding || !!editing} onClick={() => {
        setAdding(true); setActiveId(null); setError("");
      }}>＋ {text("계정 추가", "Add account")}</button>
    </div>
    <p className="check-hint">{text("계정별로 로그인하고 세션마다 선택하세요. 서로 다른 계정으로 동시에 작업할 수 있습니다. 로컬 세션에서 지원합니다.", "Sign in to each account and choose one per session. Work with different accounts at the same time. Available for local sessions.")}</p>
    {loading && <p role="status">{text("계정 목록 불러오는 중…", "Loading accounts…")}</p>}
    {loadError && <div className="account-flow-error" role="alert">
      <span>{text("계정 목록을 불러오지 못했습니다.", "Could not load accounts.")}</span>
      <button type="button" className="btn-secondary" onClick={() => void refresh()}>{text("목록 새로고침", "Refresh accounts")}</button>
    </div>}
    {flowOpen && <section className="account-flow" aria-labelledby={flowId}>
      <ol className="account-flow-steps" aria-label={text("계정 등록 단계", "Account setup steps")}>
        {[text("이름", "Name"), text("로그인", "Sign in"), text("완료", "Done")].map((name, index) =>
          <li key={index} aria-current={index === step ? "step" : undefined} data-complete={index < step}>
            <span>{index < step ? "✓" : index + 1}</span>{name}
          </li>)}
      </ol>
      <h4 id={flowId} ref={flowTitle} tabIndex={-1}>{adding ? text("계정 추가", "Add account") : active?.state === "saved"
        ? text("계정 등록 완료", "Account ready") : text("계정 로그인", "Account sign-in")}</h4>
      {adding ? <form className="account-flow-form" onSubmit={e => { e.preventDefault(); if (canAct && !pending && label.trim()) createAndLogin(); }}>
        <label className="field">
          <span className="field-label">{text("표시 이름", "Display name")}</span>
          <input autoFocus maxLength={80} aria-label={provider === "codex" ? text("Codex 계정 이름", "Codex account name") : text("Claude 계정 이름", "Claude account name")}
            placeholder={text("예: 개인, 업무", "e.g. Personal, Work")} value={label} disabled={busy} onChange={e => setLabel(e.target.value)} />
          <span className="check-hint">{text("계정을 구분하기 위한 이름입니다. 로그인할 이메일 주소와는 별개입니다.", "A name to help you distinguish accounts. It is separate from the email used to sign in.")}</span>
        </label>
        <div className="account-flow-actions">
          <button type="submit" className="btn-primary" disabled={!canAct || !!pending || !label.trim()}>{busy ? text("추가 중…", "Adding…") : text("추가하고 로그인", "Add and sign in")}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={closeFlow}>{text("취소", "Cancel")}</button>
        </div>
      </form> : active && <>
        <dl className="account-flow-info"><div><dt>{text("표시 이름", "Display name")}</dt><dd>{active.label}</dd></div>
          <div><dt>{text("로그인 상태", "Login status")}</dt><dd role="status">{stateLabels[active.state] ? text(...stateLabels[active.state]) : text("상태 확인 필요", "Check status")}</dd></div>
          {active.state === "saved" && <div><dt>{text("저장된 계정 이메일", "Stored account email")}</dt><dd>{active.identity?.email || text("확인 가능한 이메일 정보 없음", "No email information available")}</dd></div>}
        </dl>
        <p className="check-hint">{description(active)}</p>
        {active.state === "saved" && <p className="check-hint">{text("CLI에 저장된 정보입니다. 현재 로그인 유효성을 실시간으로 검사한 결과는 아닙니다.", "This is information saved by the CLI. It is not a live check of the current login validity.")}</p>}
        <div className="account-flow-actions">
          {active.state === "pending"
            ? <button type="button" className="btn-secondary" disabled={!canAct} onClick={() => cancelLogin(active)}>{text("로그인 취소", "Cancel login")}</button>
            : active.state === "saved" ? <>
              {active.id === defaultAccountId
                ? <span className="account-flow-success" role="status">✓ {text("새 세션의 기본 계정입니다", "Default account for new sessions")}</span>
                : onMakeDefault && <button type="button" className="btn-primary" disabled={!canAct} onClick={() => makeDefault(active)}>{text("새 세션의 기본 계정으로 사용", "Use as default for new sessions")}</button>}
              <button type="button" className="btn-secondary" disabled={busy} onClick={closeFlow}>{text("완료", "Done")}</button>
            </> : <>
              <button type="button" className="btn-primary" disabled={!canAct || !!pending} onClick={() => startLogin(active)}>{retryLabel(active)}</button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={closeFlow}>{text("나중에 하기", "Finish later")}</button>
            </>}
        </div>
        {active.state === "saved" && <p className="check-hint">{text("기본 계정은 새 로컬 세션부터 적용됩니다. 기존 세션의 계정은 유지됩니다.", "The default applies to new local sessions. Existing sessions keep their accounts.")}</p>}
      </>}
      {error && !editing && <p className="account-flow-error" role="alert">{error}</p>}
    </section>}
    {!flowOpen && error && !editing && <p className="account-flow-error" role="alert">{error}</p>}
    <div className="agent-settings-card account-list">
      {accounts.map(a => <div className="agent-settings-row account-list-row" key={a.id} data-account-id={a.id}>
        <div className="agent-account-identity"><span className="agent-account-avatar">{a.id === "default" ? "↗" : a.label.slice(0, 1).toUpperCase()}</span>
          <div><div className="agent-row-title">{a.id === "default" ? text("기존 로그인", "Existing login") : a.label}
            {a.id === defaultAccountId && <span className="agent-account-badge">{text("기본 계정", "Default account")}</span>}
          </div><div className="agent-row-sub">{stateLabels[a.state] ? text(...stateLabels[a.state]) : text("상태 확인 필요", "Check status")}</div></div>
        </div>
        {a.id !== "default" && <div className="account-list-actions">
          {a.state === "saved" || a.state === "pending"
            ? <button type="button" className="btn-secondary" disabled={!canAct || adding} onClick={() => { requestedFlowFocus.current = true; setActiveId(a.id); setError(""); }}>{a.state === "saved" ? text("계정 정보", "Account info") : text("진행 보기", "View progress")}</button>
            : <button type="button" className="btn-secondary" disabled={!canAct || !!pending || adding} onClick={() => startLogin(a)}>{retryLabel(a)}</button>}
          {a.state === "saved" && <button type="button" className="btn-secondary" disabled={!canAct || !!pending || adding} onClick={() => startLogin(a)}>{text("다시 로그인", "Sign in again")}</button>}
          <button type="button" className="btn-secondary" disabled={!canAct || adding} onClick={() => { setError(""); setEditing({ id: a.id, label: a.label, mode: "rename" }); }}>{text("이름 변경", "Rename")}</button>
          <button type="button" className="btn-secondary account-remove-button" disabled={!canAct || adding} onClick={() => { setError(""); setEditing({ id: a.id, label: a.label, mode: "remove" }); }}>{text("삭제", "Remove")}</button>
        </div>}
        {editing?.id === a.id && <form key={editing.mode} className="account-edit" aria-label={editing.mode === "rename" ? text("계정 이름 변경", "Rename account") : text("계정 삭제 확인", "Confirm account removal")}
          onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); setEditing(null); } }}
          onSubmit={event => { event.preventDefault(); if (canAct) editing.mode === "rename" ? renameAccount() : removeAccount(); }}>
          {editing.mode === "rename" ? <label className="field"><span className="field-label">{text("새 표시 이름", "New display name")}</span>
            <input autoFocus aria-label={text("새 표시 이름", "New display name")} maxLength={80} value={editing.label} disabled={busy} onChange={event => setEditing({ ...editing, label: event.target.value })} />
          </label> : <><strong>{text(`‘${a.label}’ 계정을 삭제할까요?`, `Remove account ‘${a.label}’?`)}</strong>
            <p>{text("이 계정을 사용하는 모든 세션과 새 세션 기본값이 기존 로그인(default)으로 변경됩니다. 실행 중인 해당 세션은 비활성화되며 자동으로 다시 실행하지 않습니다.", "All sessions using this account and any new-session default return to Existing login (default). Affected running sessions stop and do not restart automatically.")}</p>
            <p>{text("진행 중인 로그인은 취소됩니다. 계정 등록을 삭제하며 로컬 로그인·대화 파일은 보존합니다.", "A pending login is cancelled. This removes the account registration and preserves local login and conversation files.")}</p></>}
          {error && <p className="account-flow-error" role="alert">{error}</p>}
          <div className="account-flow-actions"><button type="submit" className={editing.mode === "rename" ? "btn-primary" : "btn-secondary account-remove-button"} disabled={!canAct || (editing.mode === "rename" && !editing.label.trim())}>{editing.mode === "rename" ? text("이름 저장", "Save name") : text("삭제하고 기본 계정으로 전환", "Remove and use default")}</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>{text("취소", "Cancel")}</button></div>
        </form>}
      </div>)}
    </div>
    <p className="agent-hint">{text("기존 세션의 계정은 세션 속성 → 실행 옵션에서 변경합니다.", "Change an existing session's account in Session properties → Launch options.")}</p>
  </section>;
}
