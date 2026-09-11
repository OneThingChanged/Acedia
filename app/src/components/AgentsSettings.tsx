import { SettingScope, settingTarget } from "./SettingsSearch";
import type { SettingsNavigation } from "../lib/settingsCatalog";
import { useEffect, useId, useState } from "react";
import { invoke } from "../platform/runtime";
import { toolForId } from "../types";
import { useAppLanguage } from "../lib/appLanguage";
import { AGENT_DEFAULTS_KEY, loadAgentDefaults, saveAgentDefaults, type AgentDefaults } from "../lib/agentDefaults";
import { AdvancedLaunchOptions } from "./AdvancedLaunchOptions";
import { AccountsPanel, AccountSelect } from "./ProviderAccounts";
import { SessionWorkerFields } from "./SessionWorkerFields";

type QwenRegionInfo = {
  available: boolean;
  region: string | null;
  regions: { id: string; label: string }[];
};

type ToolAvailability = Record<string, { available: boolean; path: string | null }>;

// Tools that can be availability-checked + offered in the new-session picker.
const CHECKABLE_TOOL_IDS = ["claude", "codex", "qwen", "cline"];

export function AgentsSettings({
  navigation,
  disabledTools,
  onToggleTool,
  showUsageBar,
  onShowUsageBarChange,
}: {
  navigation?: SettingsNavigation;
  disabledTools: string[];
  onToggleTool: (toolId: string, enabled: boolean) => void;
  showUsageBar: boolean;
  onShowUsageBarChange: (show: boolean) => void;
}) {
  const { text } = useAppLanguage();
  const [avail, setAvail] = useState<ToolAvailability | null>(null);
  const [checking, setChecking] = useState(false);
  const refreshAvail = () => {
    setChecking(true);
    void invoke<ToolAvailability>("check_tools")
      .then(setAvail)
      .catch(() => setAvail(null))
      .finally(() => setChecking(false));
  };
  useEffect(refreshAvail, []);

  const [qwen, setQwen] = useState<QwenRegionInfo | null>(null);
  const [qwenBusy, setQwenBusy] = useState(false);
  const [qwenMsg, setQwenMsg] = useState("");
  const [qwenError, setQwenError] = useState(false);
  useEffect(() => {
    void invoke<QwenRegionInfo>("qwen_region_get")
      .then(setQwen)
      .catch(() => { setQwen(null); setQwenError(true); });
  }, []);
  const chooseRegion = (region: string) => {
    setQwenBusy(true);
    setQwenMsg("");
    void invoke<{ ok: boolean; changed: boolean }>("qwen_region_set", { region })
      .then((r) => {
        setQwen((q) => (q ? { ...q, region } : q));
        setQwenMsg(
          r.changed
            ? text("변경됨 · 실행 중 Qwen 세션은 재시작해야 적용됩니다", "Changed · restart active Qwen sessions to apply")
            : text("이미 해당 리전입니다", "This region is already selected"),
        );
      })
      .catch((e) => setQwenMsg(text(`실패: ${String(e)}`, `Failed: ${String(e)}`)))
      .finally(() => setQwenBusy(false));
  };

  const [tab, setTab] = useState(navigation?.agentTab ?? "codex");
  const tabPrefix = useId();
  const [defaults, setDefaults] = useState(() => loadAgentDefaults(navigation?.agentTab ?? "codex"));
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === AGENT_DEFAULTS_KEY || event.key === null) setDefaults(loadAgentDefaults(tab));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [tab]);
  const tabs = ["common", "codex", "claude", "qwen", "cline"];
  const selectTab = (id: string) => { setTab(id); setDefaults(loadAgentDefaults(id)); setSaveError(""); };
  useEffect(() => { if (navigation?.agentTab) selectTab(navigation.agentTab); }, [navigation]);
  const prefix = "agents." + tab;
  const updateDefaults = (patch: Partial<AgentDefaults>) => {
    try { setDefaults(saveAgentDefaults(tab, { ...loadAgentDefaults(tab), ...patch })); setSaveError(""); return true; }
    catch { setSaveError(text("기본값을 저장하지 못했습니다. 다시 시도하세요.", "Could not save defaults. Please try again.")); return false; }
  };
  const tool = toolForId(tab);
  const availability = (id: string) => <span className="agent-tool-avail" title={avail?.[id]?.path || ""}>
    {checking ? text("확인 중…", "Checking…") : avail === null ? text("확인 실패", "Unavailable") : avail[id]?.available ? text("● 설치됨", "● Installed") : text("미설치", "Not installed")}
  </span>;
  return <div className="agent-settings-tabs">
    <div className="agent-settings-tablist" role="tablist" aria-label={text("에이전트 종류", "Agent type")}>
      {tabs.map((id, index) => <button key={id} type="button" role="tab" id={`${tabPrefix}-${id}`} aria-controls={`${tabPrefix}-panel`}
        aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => selectTab(id)}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return; event.preventDefault(); selectTab(tabs[next]); document.getElementById(`${tabPrefix}-${tabs[next]}`)?.focus();
        }}>
        {id !== "common" && <span className="agent-tab-dot" style={{ background: toolForId(id).iconColor }} />}
        {id === "common" ? text("공통", "General") : id === "claude" ? "Claude" : toolForId(id).label}
      </button>)}
    </div>
    <div role="tabpanel" id={`${tabPrefix}-panel`} aria-labelledby={`${tabPrefix}-${tab}`} className="agent-settings-panel" key={tab}>
    {tab === "common" ? <>
      <div className="agent-settings-toolhead"><div><h3>{text("공통 설정", "General settings")}</h3><p>{text("모든 에이전트에 적용되는 표시 설정", "Display settings shared by all agents")}</p></div></div>
      <div className="agent-settings-card"><label className="agent-settings-row" {...settingTarget("agents.common.usage")}><div><div className="agent-row-title">{text("작업표시줄 사용량 표시", "Show usage status bar")}<SettingScope id="agents.common.usage" /></div><div className="agent-row-sub">{text("앱 하단에 지원 도구의 사용량과 한도를 표시합니다.", "Show supported providers' usage limits in the bottom bar.")}</div></div><input type="checkbox" role="switch" checked={showUsageBar} onChange={e => onShowUsageBarChange(e.target.checked)} /></label></div>
      <div className="agent-settings-sectionhead" {...settingTarget("agents.common.installation")}><h4>{text("설치 상태", "Installation status")}<SettingScope id="agents.common.installation" /></h4><button type="button" className="agent-refresh" disabled={checking} onClick={refreshAvail}>{text("새로고침", "Refresh")}</button></div>
      <div className="agent-settings-card">{CHECKABLE_TOOL_IDS.map(id => <div key={id} className="agent-settings-row"><span><span className="agent-conn-icon" style={{ color: toolForId(id).iconColor }}>{toolForId(id).icon}</span> {toolForId(id).label}</span>{availability(id)}</div>)}</div>
      <p className="agent-hint">{text("각 도구의 사용 여부와 계정은 해당 탭에서 설정합니다.", "Configure tool availability and accounts in each tool's tab.")}</p>
    </> : <>
      <div className="agent-settings-toolhead"><span className="agent-settings-toolicon" style={{ color: tool.iconColor }}>{tool.icon}</span><div><h3>{tool.label}</h3><p>{text("로그인 환경과 새 세션의 실행 설정", "Login environment and defaults for new sessions")}</p></div>{availability(tab)}</div>
      <div className="agent-settings-card"><label className="agent-settings-row" {...settingTarget(prefix + ".enabled")}><div><div className="agent-row-title">{tool.label} {text("사용", "enabled")}<SettingScope id={prefix + ".enabled"} /></div><div className="agent-row-sub">{text("새 세션을 만들 때 도구 목록에 표시합니다.", "Show this tool in the new session picker.")}</div></div><input type="checkbox" role="switch" checked={!disabledTools.includes(tab)} onChange={e => onToggleTool(tab, e.target.checked)} /></label></div>
      {(tab === "codex" || tab === "claude") && <AccountsPanel key={tab} provider={tab} settingId={prefix + ".accounts"}
        defaultAccountId={tab === "codex" ? defaults.codexAccountId : defaults.claudeAccountId}
        onMakeDefault={accountId => updateDefaults(tab === "codex" ? { codexAccountId: accountId } : { claudeAccountId: accountId })} />}
      {tab === "qwen" && <>
      <div className="agent-block" {...settingTarget("agents.qwen.region")}>
        <div className="agent-row-title">{text("Qwen 리전 (나라)", "Qwen region")}<SettingScope id="agents.qwen.region" /></div>
        <div className="agent-row-sub">
          {text(
            "Qwen Code(~/.qwen/settings.json)의 ModelStudio 엔드포인트 리전. 계정 지역과 맞춰야 합니다.",
            "ModelStudio endpoint region in Qwen Code (~/.qwen/settings.json). It must match your account region.",
          )}
        </div>
        {qwen == null ? (
          <div className="agent-hint" role={qwenError ? "alert" : "status"}>{qwenError ? text("리전 정보를 불러오지 못했습니다. 설정을 다시 열어 주세요.", "Could not load the region. Reopen settings to retry.") : text("불러오는 중…", "Loading…")}</div>
        ) : !qwen.available ? (
          <div className="agent-hint">{text("~/.qwen/settings.json 이 없습니다 (Qwen 미설정).", "~/.qwen/settings.json was not found (Qwen is not configured).")}</div>
        ) : (
          <div className="agent-region-row">
            {qwen.regions.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={qwenBusy}
                className={`agent-region-btn ${qwen.region === r.id ? "on" : ""}`}
                onClick={() => chooseRegion(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        {qwenMsg && <div className="agent-hint">{qwenMsg}</div>}
      </div>
      </>}
      {tab === "cline" && <><div className="agent-settings-sectionhead"><h4>{text("연결 설정", "Connection settings")}</h4></div><div className="agent-settings-card"><div className="agent-settings-row"><div><div className="agent-row-title">{text("기존 CLI 설정 사용", "Use existing CLI settings")}</div><div className="agent-row-sub">{text("로그인과 모델 연결은 Cline CLI에서 관리합니다.", "Manage login and model connections in the Cline CLI.")}</div></div></div></div></>}
      {tool.dangerousFlag && <>
        <div className="agent-settings-sectionhead"><h4>{text("새 세션 기본값", "New session defaults")}</h4></div>
        <div className="agent-settings-card agent-defaults">
          {tab === "codex" && <div className="agent-settings-row" {...settingTarget(prefix + ".defaultAccount")}><SettingScope id={prefix + ".defaultAccount"} /><AccountSelect value={defaults.codexAccountId} onChange={codexAccountId => updateDefaults({ codexAccountId })} label={text("기본 계정", "Default account")} hint={text("새 로컬 Codex 세션에 처음 선택되는 계정입니다.", "Initially selected for new local Codex sessions.")} /></div>}
          {tab === "claude" && <div className="agent-settings-row" {...settingTarget(prefix + ".defaultAccount")}><SettingScope id={prefix + ".defaultAccount"} /><AccountSelect provider="claude" value={defaults.claudeAccountId} onChange={claudeAccountId => updateDefaults({ claudeAccountId })} label={text("기본 계정", "Default account")} hint={text("새 로컬 Claude 세션에 처음 선택되는 계정입니다.", "Initially selected for new local Claude sessions.")} /></div>}
          <details open={tab !== "codex"}><summary>{text("실행 옵션", "Launch options")}</summary>
            <label className="agent-settings-row" {...settingTarget(prefix + ".dangerous")}><div><div className="agent-row-title">{text("권한 확인 생략", "Skip approval prompts")}<SettingScope id={prefix + ".dangerous"} /></div><div className="agent-row-sub">{text("새 세션의 Dangerous 모드 기본값", "Default Dangerous mode for new sessions")}</div></div><input type="checkbox" role="switch" checked={defaults.dangerous} onChange={e => updateDefaults({ dangerous: e.target.checked })} /></label>
            {tab === "codex" && <><label className="agent-settings-row" {...settingTarget("agents.codex.altScreen")}><div className="agent-row-title">{text("Alt-screen 모드", "Alt-screen mode")}<SettingScope id="agents.codex.altScreen" /></div><input type="checkbox" role="switch" checked={defaults.useAltScreen} onChange={e => updateDefaults({ useAltScreen: e.target.checked })} /></label><div className="agent-settings-row"><SessionWorkerFields settingsPrefix="agents.codex.workers" settings={defaults.workerSettings} disabledTools={disabledTools} onChange={workerSettings => updateDefaults({ workerSettings })} /></div></>}
          </details>
        </div><p className="agent-hint">{text("자동 저장됩니다. 기존 세션의 계정과 실행 옵션은 변경되지 않습니다.", "Saved automatically. Existing session accounts and options remain unchanged.")}</p>
      </>}
      {tool.command && <>
        <AdvancedLaunchOptions key={tab} toolId={tab} settingsPrefix={prefix} value={defaults.launchOptions}
          detectedPath={avail?.[tab]?.path} onChange={launchOptions => updateDefaults({ launchOptions })} />
        <p className="agent-hint">{text("고급 설정은 자동 저장되며 새 로컬 세션부터 적용됩니다. 기존 세션은 세션 속성에서 변경하세요.", "Advanced settings are saved automatically for new local sessions. Edit existing sessions in Session properties.")}</p>
      </>}
      {saveError && <p role="alert">{saveError}</p>}
    </>}
    </div>
  </div>;
}
