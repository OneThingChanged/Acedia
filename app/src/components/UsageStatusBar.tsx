import { createContext, useContext } from 'react';
import { loadStatusBar, subscribeStatusBar, toggleStatusAccount, canSelectStatusAccount, selectStatusAccounts, displayUsagePercent, type StatusBarSettings } from '../lib/statusBarSettings';
const DisplayContext = createContext<StatusBarSettings['display']>('used');
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke, listen } from "../platform/runtime";
import type { Agent, Project } from "../types";
import { useAppLanguage } from "../lib/appLanguage";
import { PortsMonitor } from "./PortsMonitor";
import { ResourceMonitor } from "./ResourceMonitor";
import { PropertiesDialog } from "./PropertiesDialog";
import {
  formatResetRemaining,
  formatResetShort,
  formatUpdatedAgo,
  formatUsagePercent,
  formatUsageWindow,
  groupUsageProfiles,
  primaryUsageWindow,
  usageLimitShortName,
  usageTone,
  type UsageProviderGroup,
  type UsageRateLimit,
  type UsageRateLimitSummary,
  type UsageRateLimitWindow,
} from "../lib/usageRateLimits";

const REFRESH_INTERVAL_MS = 60_000;
const CLOCK_INTERVAL_MS = 30_000;

function UsageProgress({
  window,
  large,
}: {
  window: UsageRateLimitWindow;
  large?: boolean;
}) {
  const mode = useContext(DisplayContext);
  const percent = displayUsagePercent(window.usedPercent, mode);
  return (
    <span
      className={`usage-progress ${large ? "usage-progress-large" : ""}`}
      aria-hidden="true"
    >
      <span
        className={`usage-progress-fill usage-tone-${usageTone(window.usedPercent)}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function DetailWindow({
  heading,
  window,
  now,
}: {
  heading: string;
  window: UsageRateLimitWindow;
  now: number;
}) {
  const mode = useContext(DisplayContext);
  const { language, text } = useAppLanguage();
  return (
    <div className="usage-detail-window">
      <div className="usage-detail-window-heading">
        <strong>{heading}</strong>
      </div>
      <UsageProgress window={window} large />
      <div className="usage-detail-window-meta">
        <span className={`usage-tone-${usageTone(window.usedPercent)}`}>
          {formatUsagePercent(displayUsagePercent(window.usedPercent, mode))} {mode === "used" ? text("사용", "used") : text("남음", "remaining")}
        </span>
        <span>{formatResetRemaining(window.resetsAt, now, language)}</span>
      </div>
    </div>
  );
}

function ProviderLimitDetails({
  limit,
  providerLabel,
  now,
}: {
  limit: UsageRateLimit;
  providerLabel: string;
  now: number;
}) {
  const { language, text } = useAppLanguage();
  const shortName = usageLimitShortName(limit, providerLabel);
  const windows = [limit.primary, limit.secondary].filter(
    (window): window is UsageRateLimitWindow => Boolean(window)
  );
  return (
    <section className="usage-detail-limit">
      <small className="property-note">{formatUpdatedAgo(limit.updatedAt, now, language)}</small>
      {windows.map((window, index) => (
        <DetailWindow
          key={`${window.windowMinutes ?? "unknown"}-${index}`}
          heading={
            shortName ||
            formatUsageWindow(window.windowMinutes, language) ||
            text("사용 한도", "Usage limit")
          }
          window={window}
          now={now}
        />
      ))}
      {(limit.credits.unlimited || limit.credits.hasCredits) && (
        <div className="usage-detail-credit">
          {limit.credits.unlimited
            ? text("추가 사용량 무제한", "Unlimited extra usage")
            : text(`추가 사용량 ${limit.credits.balance ?? "확인 가능"}`, `Extra usage ${limit.credits.balance ?? "available"}`)}
        </div>
      )}
    </section>
  );
}

function UsageProfilesDialog({ summary, settings, selectedKeys, onSelect, onChange, onClose, refreshing, refreshError, onRefresh }: {
  summary: UsageRateLimitSummary | null; settings: StatusBarSettings; selectedKeys: string[];
  onSelect: (key: string) => void; onChange: (key: string, hidden: boolean) => Promise<void>; onClose: () => void;
  refreshing: boolean; refreshError: boolean; onRefresh: () => void;
}) {
  const { language, text } = useAppLanguage();
  const [tab, setTab] = useState("current");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const groups = groupUsageProfiles(summary);
  const current = (group: UsageProviderGroup) => group.profile?.visible !== false;
  const render = (items: UsageProviderGroup[]) => <>{items.length === 0 && <p>{text("표시할 계정 한도가 없습니다.", "No account quota to display.")}</p>}{items.map(group => {
    const profile = group.profile;
    const label = profile?.id === "default" ? `${group.label} · ${text("기본", "Default")}` : group.label;
    const selectable = canSelectStatusAccount(group, settings);
    const planType = group.limits.find(limit => limit.planType)?.planType;
    return <article className={`property-card usage-account-card${selectedKeys.includes(group.key) ? " usage-account-card-selected" : ""}`} key={group.key} data-profile-key={group.key}><div className="property-card-heading"><strong><span className="usage-provider-icon" style={{color:group.iconColor}}>{group.icon}</span> {label}{planType && <em className="usage-provider-plan">{planType}</em>}</strong>{profile && <button className="btn-secondary" disabled={busy || refreshing} onClick={async () => {
      setBusy(true); setError("");
      try { await onChange(profile.key, profile.visible); } catch { setError(text("표시 설정을 저장하지 못했습니다. 다시 시도하세요.", "Could not save visibility. Please try again.")); } finally { setBusy(false); }
    }}>{profile.visible ? text("기본 표시에서 숨기기", "Hide from default view") : text("기본 화면에 표시", "Show in default view")}</button>}</div>
    {current(group) && <label className={`usage-account-choice${selectable ? "" : " usage-account-choice-disabled"}`}>
      <input type="checkbox" value={group.key} checked={selectedKeys.includes(group.key)} disabled={busy || !selectable}
        aria-label={text(`${label} 하단바에 표시`, `Show ${label} in status bar`)}
        onChange={() => { try { onSelect(group.key); setError(""); } catch { setError(text("하단바 표시 계정을 저장하지 못했습니다. 다시 시도하세요.", "Could not save the status bar account. Please retry.")); } }}/>
      {selectedKeys.includes(group.key) ? text("하단바에 표시 중", "Shown in status bar") : text("하단바에 표시", "Show in status bar")}
      {!selectable && profile?.registered !== false && <small>{text("상태 표시줄 설정에서 이 도구를 켜면 선택할 수 있습니다.", "Enable this tool in Status bar settings to select it.")}</small>}
    </label>}
    {profile && !profile.registered && <p className="property-note">{text("등록된 계정이 없는 저장된 한도입니다.", "Stored quota for an account no longer registered.")}</p>}
    {profile?.registered && (refreshing || profile.refresh) && <p className="usage-account-refresh-state" data-state={refreshing ? "refreshing" : profile.refresh?.status}>
      {profile.provider === "agy" ? (profile.refresh?.status === "success" ? text("Antigravity CLI에서 받은 한도입니다.", "Quota received from Antigravity CLI.") : text("마지막으로 수신한 한도입니다. Antigravity 세션에서 /usage를 실행해 갱신하세요.", "Last received quota. Run /usage in an Antigravity session to update it."))
        : refreshing ? text("최신 한도 조회 중…", "Checking latest quota…")
        : profile.refresh?.status === "success" ? text("최신 한도 조회 완료", "Latest quota retrieved")
        : profile.refresh?.status === "login_required" ? text("로그인이 필요합니다. 설정 → 에이전트에서 다시 로그인하세요.", "Sign in again in Settings → Agents.")
        : profile.refresh?.status === "timeout" ? text("조회 시간이 초과되었습니다. 다시 새로고침하세요.", "The request timed out. Refresh to retry.")
        : profile.refresh?.status === "unavailable" ? text("이 계정의 사용 한도를 제공받지 못했습니다.", "Usage quota is unavailable for this account.")
        : text("한도를 조회하지 못했습니다. 다시 새로고침하세요.", "Could not retrieve quota. Refresh to retry.")}
      {!refreshing && profile.refresh?.status !== "success" && group.limits.length > 0 && <small>{text("아래 수치는 마지막으로 확인한 사용량입니다.", "The figures below are the last known usage.")}</small>}
    </p>}
    {group.limits[0] ? <ProviderLimitDetails limit={group.limits[0]} providerLabel={group.label} now={Date.now()}/> : <p className="usage-quota-pending">{text("한도 확인 전입니다. 등록된 계정의 한도가 수집되면 표시됩니다.", "Quota not available yet. It will appear when data is collected for this registered account.")}</p>}
    {group.limits.length > 1 && <details><summary>{text("추가 한도", "Additional limits")} · {group.limits.length - 1}</summary>{group.limits.slice(1).map(limit => <div key={limit.limitId}><small>{formatUpdatedAgo(limit.updatedAt, Date.now(), language)}</small><ProviderLimitDetails limit={limit} providerLabel={group.label} now={Date.now()}/></div>)}</details>}
    {profile && <details><summary>{text("프로필 식별자", "Profile identifier")}</summary><code>{profile.key}</code></details>}
    </article>;
  })}</>;
  return <PropertiesDialog title={text("에이전트 사용량", "Agent usage")} subtitle={text("계정별 한도 · 하단바 표시 계정", "Account quotas · Status bar account")} activeTab={tab} onTabChange={setTab} onClose={onClose} busy={busy} tabs={[
    { id: "current", label: text("현재 계정", "Current accounts"), content: <><h3>{text("현재 계정", "Current accounts")}</h3><p className="property-note">{text("모든 계정의 사용량을 여기서 확인하고, 하단바에 표시할 계정을 여러 개 선택할 수 있습니다. 이 선택은 세션의 로그인 계정을 바꾸지 않습니다.", "Review all account quotas here and choose multiple accounts for the status bar. This does not change session logins.")}</p><p className="property-note">{text("계정 사용 한도 · 로컬 토큰 집계와 별도", "Account quota · separate from local token totals")}</p>{render(groups.filter(current))}</> },
    { id: "other", label: text("이전·기타 프로필", "Other profiles"), content: <><h3>{text("이전·기타 프로필", "Other profiles")}</h3><p className="property-note">{text("이전용 이름으로 보관된 프로필, 등록이 해제된 계정과 직접 숨긴 프로필입니다. 같은 이름이나 수치만으로 계정을 합치지 않습니다. 숨겨도 로그인·대화·사용량 기록은 유지됩니다.", "Archived profiles, accounts no longer registered and profiles hidden by you. Names and percentages do not merge accounts. Hiding preserves logins, conversations and usage history.")}</p>{render(groups.filter(group => !current(group)))}</> },
  ]} footer={<><span role="status">{error || (refreshError ? text("사용량을 갱신하지 못했습니다. 다시 시도하세요.", "Could not refresh usage. Please retry.") : text("새로고침하면 등록된 모든 계정의 사용 한도를 조회합니다.", "Refresh checks usage quotas for all registered accounts."))}</span><button className="btn-secondary usage-refresh-all" disabled={busy || refreshing} onClick={onRefresh}>{refreshing ? text("갱신 중…", "Refreshing…") : text("모든 계정 새로고침", "Refresh all accounts")}</button></>}/>;
}

export function UsageStatusBar({
  agents,
  projects,
  onSelectProject,
}: {
  agents: Agent[];
  projects: Project[];
  onSelectProject: (projectId: string) => void;
}) {
  const { text, language } = useAppLanguage();
  const [settings, setSettings] = useState(loadStatusBar);
  useEffect(() => subscribeStatusBar(setSettings), []);
  const [summary, setSummary] = useState<UsageRateLimitSummary | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const visibilitySaving = useRef(false);
  const requestSerial = useRef(0);
  const liveRefreshPending = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (refresh: boolean) => {
    if (visibilitySaving.current || liveRefreshPending.current) return;
    const request = ++requestSerial.current;
    if (refresh) { liveRefreshPending.current = true; setRefreshing(true); }
    try {
      const next = await invoke<UsageRateLimitSummary>("usage_rate_limits_get", {
        refresh,
      });
      if (request !== requestSerial.current) return;
      setSummary(next);
      setError(null);
      setNow(Date.now());
    } catch (reason) {
      if (request !== requestSerial.current) return;
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (refresh) liveRefreshPending.current = false;
      if (request === requestSerial.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    void load(true);
    const refreshTimer = window.setInterval(() => void load(false), REFRESH_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  useEffect(() => {
    let timer: number;
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(false), 150); };
    window.addEventListener("multiagent:accounts-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("multiagent:accounts-changed", refresh); window.removeEventListener("focus", refresh); };
  }, [load]);

  // Refresh the moment a turn completes instead of waiting up to a full poll
  // interval. On a "done" hook the main process has already re-ingested that
  // agent's transcript (Codex rate limits) and kicked off the Claude OAuth
  // refresh before dispatching the event, so re-reading the DB (load(false))
  // surfaces the new numbers immediately. Debounced so a burst settles once.
  useEffect(() => {
    let cancelled = false;
    let unlisten = () => {};
    let timer: number | undefined;
    void listen<{ event?: string }>("agent:hook-event", (e) => {
      if (e.payload?.event !== "done") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(false), 400);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten();
      window.clearTimeout(timer);
    };
  }, [load]);

  const providers = useMemo(() => groupUsageProfiles(summary), [summary]);
  const selectedProviders = selectStatusAccounts(providers, settings);
  const statusText = loading
    ? text("사용량 불러오는 중", "Loading usage")
    : error
      ? text("사용량 확인 실패", "Could not load usage")
      : !selectedProviders.length
        ? text("표시할 계정 한도 없음", "No visible account quotas")
        : null;

  return (
    <DisplayContext.Provider value={settings.display}><footer className="usage-status-bar">
      <div className="usage-status-accounts">
        {(selectedProviders.length ? selectedProviders : [null]).map(provider => (
            <button
              type="button"
              key={provider?.key ?? "empty"}
              className={`usage-status-provider${profilesOpen ? " usage-status-provider-open" : ""}`}
              onClick={() => { setProfilesOpen(true); void load(false); }}
              aria-label={text("에이전트 사용량", "Agent usage")}
              aria-haspopup="dialog" aria-expanded={profilesOpen}
              data-profile-key={provider?.key}
              title={statusText || text(`${provider?.label} · 모든 계정 사용량 보기`, `${provider?.label} · View all account quotas`)}
            >
              {provider ? <>
              <span
                className="usage-provider-icon"
                style={{ color: provider.iconColor }}
              >
                {provider.icon}
              </span>
              <strong>{provider.profile?.id === "default" ? `${provider.label} · ${text("기본", "Default")}` : provider.label}</strong>
              {!provider.limits.length && <span className="usage-status-pending">{text("한도 확인 전", "Quota pending")}</span>}
              {provider.limits.slice(0, 1).map((limit) => {
                const window = primaryUsageWindow(limit);
                if (!window) return null;
                const shortName = usageLimitShortName(limit, provider.label);
                return (
                  <span className="usage-status-limit" key={limit.limitId}>
                    <UsageProgress window={window} />
                    <b className={`usage-tone-${usageTone(window.usedPercent)}`}>
                      {formatUsagePercent(displayUsagePercent(window.usedPercent, settings.display))} {settings.display === "used" ? text("사용", "used") : text("남음", "left")}
                    </b>
                    <span className="usage-status-limit-meta">
                      {provider.key === "agy" ? `${shortName} · ${formatUsageWindow(window.windowMinutes, language)}` : shortName || formatResetShort(window.resetsAt, now)}
                    </span>
                    {provider.key === "agy" && limit.primary && limit.secondary && <>
                      <b className={`usage-tone-${usageTone(limit.secondary.usedPercent)}`}>
                        {formatUsagePercent(displayUsagePercent(limit.secondary.usedPercent, settings.display))} {settings.display === "used" ? text("사용", "used") : text("남음", "left")}
                      </b>
                      <span className="usage-status-limit-meta">{formatUsageWindow(limit.secondary.windowMinutes, language)}</span>
                    </>}
                  </span>
                );
              })}{provider.key === "agy" && provider.profile?.refresh?.status !== "success" && <span className="usage-status-pending">{text("마지막 수신", "Last received")}</span>}</> : <strong>{text("에이전트 사용량", "Agent usage")}</strong>}
              {statusText && <span className="usage-status-pending">{statusText}</span>}
              <span className="usage-status-chevron" aria-hidden="true">⌃</span>
            </button>
        ))}
      </div>
      {settings.resources && <ResourceMonitor
        agents={agents}
        projects={projects}
        onRefreshUsage={() => load(true)}
      />}
      {settings.ports && <PortsMonitor
        agents={agents}
        projects={projects}
        onSelectProject={onSelectProject}
        onRefreshUsage={() => load(true)}
      />}
      <button
        type="button"
        className="usage-status-refresh"
        disabled={refreshing}
        onClick={() => void load(true)}
      >
        {refreshing ? text("갱신 중", "Refreshing") : text("새로고침", "Refresh")}
      </button>
      {profilesOpen && <UsageProfilesDialog summary={summary} settings={settings} selectedKeys={selectedProviders.map(provider => provider.key)}
        refreshing={refreshing} refreshError={Boolean(error)} onRefresh={() => void load(true)}
        onSelect={key => setSettings(toggleStatusAccount(providers, key))}
        onClose={() => setProfilesOpen(false)} onChange={async (profileKey, hidden) => {
        visibilitySaving.current = true; ++requestSerial.current;
        try { setSummary(await invoke<UsageRateLimitSummary>("usage_profile_visibility_set", { profileKey, hidden })); }
        finally { visibilitySaving.current = false; }
      }}/>}
    </footer></DisplayContext.Provider>
  );
}
