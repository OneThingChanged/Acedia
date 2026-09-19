import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";
import { useAppLanguage } from "../lib/appLanguage";
import { SettingScope, settingTarget } from "./SettingsSearch";
import "./CodexLbSettings.css";

type Settings = { enabled: boolean; baseUrl: string; supportsWebsockets: boolean };
type State = { settings: Settings; hasApiKey: boolean; keyStorageAvailable: boolean; revision: number; error: string | null };
type TestResult = { ok: boolean; reason?: string; status?: number; modelCount?: number };

export function CodexLbSettings() {
  const { text } = useAppLanguage();
  const [stored, setStored] = useState<State | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [removeApiKey, setRemoveApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const accept = (state: State) => {
    setStored(state); setDraft(state.settings); setApiKey(""); setRemoveApiKey(false); setError(state.error || "");
  };
  const reload = async () => {
    setBusy(true); setError(""); setMessage("");
    try { accept(await invoke<State>("codex_lb_get")); }
    catch { setError(text("연결 설정을 불러오지 못했습니다.", "Could not load connection settings.")); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void invoke<State>("codex_lb_get").then(state => { if (active) accept(state); })
      .catch(() => { if (active) setError(text("연결 설정을 불러오지 못했습니다.", "Could not load connection settings.")); });
    return () => { active = false; };
  }, []);
  const change = (patch: Partial<Settings>) => { setDraft(current => current && ({ ...current, ...patch })); setMessage(""); setError(""); };
  const execute = async (test: boolean) => {
    if (!stored || !draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const args = { settings: draft, revision: stored.revision, ...(apiKey ? { apiKey } : {}), removeApiKey };
      if (!test) {
        accept(await invoke<State>("codex_lb_save", args));
        setMessage(text("저장했습니다. 다음 로컬 Codex 실행부터 적용됩니다.", "Saved. Applies the next time a local Codex CLI starts."));
      } else {
        const result = await invoke<TestResult>("codex_lb_test", args);
        if (result.ok) setMessage(text(`연결됨 · 모델 ${result.modelCount}개. 실제 생성 요청은 보내지 않았습니다.`, `Connected · ${result.modelCount} models. No generation request was sent.`));
        else {
          const errors: Record<string, string> = {
            authentication: text("API 키를 확인하세요. 서버가 인증을 거부했습니다.", "Check the API key. The server rejected authentication."),
            timeout: text("연결 시간이 초과되었습니다. 서버 실행 상태를 확인하세요.", "Connection timed out. Check that the server is running."),
            catalog: text("Codex 모델 목록을 받지 못했습니다. 서버 주소를 확인하세요.", "No Codex model catalog was returned. Check the server URL."),
            http: text(`서버 응답 오류 (${result.status}).`, `Server response error (${result.status}).`),
            connection: text("연결하지 못했습니다. 서버 주소·인증서·실행 상태를 확인하세요.", "Could not connect. Check the server URL, certificate and running status."),
          };
          setError(errors[result.reason || "connection"] || errors.connection);
        }
      }
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const openDashboard = () => {
    if (!draft) return;
    try {
      const url = new URL(draft.baseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
      url.pathname = url.pathname.replace(/\/backend-api\/codex\/?$/, "/"); url.search = ""; url.hash = "";
      void invoke("open_external_url", { url: url.href }).catch(() => setError(text("대시보드를 열지 못했습니다.", "Could not open the dashboard.")));
    } catch { setError(text("올바른 서버 주소를 입력하세요.", "Enter a valid server URL.")); }
  };
  return <section className="codex-lb-settings" {...settingTarget("agents.codex.loadBalancer")} aria-label="codex-lb">
    <div className="agent-settings-sectionhead"><h4>codex-lb <span>{text("계정 자동 분배", "Account routing")}</span></h4><SettingScope id="agents.codex.loadBalancer" /></div>
    <p className="agent-hint">{text("별도로 실행 중인 codex-lb 서버에 연결합니다. 계정 등록과 분배 전략은 서버 대시보드에서 관리합니다.", "Connect to a separately running codex-lb server. Manage accounts and routing strategies in its dashboard.")}</p>
    {draft && stored ? <fieldset disabled={busy || Boolean(stored.error)} className="agent-settings-card codex-lb-fields">
      <label className="agent-settings-row"><span className="agent-row-title">{text("codex-lb 연결 사용", "Use codex-lb connection")}</span><input type="checkbox" role="switch" checked={draft.enabled} onChange={event => change({ enabled: event.target.checked })} /></label>
      <label className="codex-lb-field"><span>{text("서버 주소", "Server URL")}</span><input type="url" value={draft.baseUrl} spellCheck={false} onChange={event => change({ baseUrl: event.target.value })} /><small>{text("서버 기본 주소 또는 /backend-api/codex 주소. 원격 서버는 HTTPS를 사용하세요.", "Server origin or /backend-api/codex URL. Remote servers require HTTPS.")}</small></label>
      <label className="codex-lb-field"><span>{text("서버 API 키", "Server API key")}</span><input type="password" autoComplete="new-password" value={apiKey} disabled={!stored.keyStorageAvailable || removeApiKey} onChange={event => { setApiKey(event.target.value); setMessage(""); setError(""); }} placeholder={stored.hasApiKey ? text("저장됨 · 비워 두면 유지", "Saved · leave blank to keep") : text("로컬 인증 미사용 서버는 생략 가능", "Optional for a local server without authentication")} /><small>{text("codex-lb 대시보드에서 발급한 키입니다. Windows 암호화 저장소로 보호합니다.", "A key issued by the codex-lb dashboard. Protected with Windows credential encryption.")}</small></label>
      {!stored.keyStorageAvailable && <p className="agent-hint">{text("이 환경에서는 API 키 암호화 저장을 사용할 수 없습니다.", "Encrypted API key storage is unavailable in this environment.")}</p>}
      {stored.hasApiKey && <label className="agent-settings-row"><span>{text("저장된 API 키 삭제", "Remove saved API key")}</span><input type="checkbox" checked={removeApiKey} onChange={event => { setRemoveApiKey(event.target.checked); setApiKey(""); setMessage(""); }} /></label>}
      <label className="agent-settings-row"><span>{text("WebSocket 사용", "Enable WebSockets")}</span><input type="checkbox" checked={draft.supportsWebsockets} onChange={event => change({ supportsWebsockets: event.target.checked })} /></label>
      <div className="codex-lb-actions"><button type="button" className="agent-refresh" onClick={() => void execute(true)}>{text("연결 확인", "Test connection")}</button><button type="button" className="agent-refresh" onClick={openDashboard}>{text("서버 대시보드", "Server dashboard")}</button><button type="button" className="agent-refresh" onClick={() => void execute(false)}>{text("연결 설정 저장", "Save connection")}</button></div>
    </fieldset> : !error && <p role="status">{text("불러오는 중…", "Loading…")}</p>}
    {busy && <p role="status">{text("처리 중…", "Working…")}</p>}
    {message && <p className="agent-hint" role="status">{message}</p>}
    {error && <p className="codex-lb-error" role="alert">{error}</p>}
    <button type="button" className="agent-refresh" disabled={busy} onClick={() => void reload()}>{text("저장된 설정 다시 불러오기", "Reload saved settings")}</button>
    <p className="agent-hint">{text("저장 후 다음 로컬 Codex 실행부터 적용됩니다. 실행 중 세션과 SSH는 바뀌지 않습니다. 연결 실패 시 직접 로그인으로 우회하지 않습니다.", "Saved settings apply at the next local Codex launch. Running sessions and SSH are unchanged. Connection failures do not fall back to direct login.")}</p>
    <p className="agent-hint">{text("기존 대화는 소유 계정에 묶일 수 있습니다. 연결 방식을 바꿀 때는 새 대화를 권장하며, 대화 기록은 자동 변환하지 않습니다. 아래 계정 선택·한도는 로컬 로그인 기준으로 서버의 실제 배분 계정과 다를 수 있습니다.", "Existing conversations may be bound to their owner account. Prefer a new conversation when switching routes; history is not automatically retagged. Local account selections and quotas may differ from the account used by the server.")}</p>
  </section>;
}
