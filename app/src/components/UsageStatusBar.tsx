import { createContext, useContext } from 'react';
import { loadStatusBar, subscribeStatusBar, showUsageProvider, displayUsagePercent, type StatusBarSettings } from '../lib/statusBarSettings';
const DisplayContext = createContext<StatusBarSettings['display']>('used');
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
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
const POPOVER_WIDTH = 300;

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

function ProviderPopover({
  provider,
  now,
  left,
  onClose,
}: {
  provider: UsageProviderGroup;
  now: number;
  left: number;
  onClose: () => void;
}) {
  const { language, text } = useAppLanguage();
  useNativeViewOcclusion();

  const planType = provider.limits.find((limit) => limit.planType)?.planType;
  return (
    <div
      className="usage-provider-popover"
      style={{ left }}
      role="dialog"
      aria-label={text(`${provider.label} 사용량`, `${provider.label} usage`)}
    >
      <div className="usage-popover-heading">
        <div>
          <strong>
            <span
              className="usage-provider-icon"
              style={{ color: provider.iconColor }}
            >
              {provider.icon}
            </span>
            {provider.label}
            {planType && <em className="usage-provider-plan">{planType}</em>}
          </strong>
          <span>{formatUpdatedAgo(Math.max(0, ...provider.limits.map(limit => limit.updatedAt)), now, language)}</span>
        </div>
        <button type="button" onClick={onClose}>
          {text("닫기", "Close")}
        </button>
      </div>
      <p className="check-hint">{text("계정 사용 한도 · 로컬 토큰 집계와 별도", "Account quota · separate from local token totals")}</p>
      <div className="usage-popover-body">
        {!provider.limits.length && <p className="usage-quota-pending">{text("한도 확인 전입니다. 이 계정의 한도가 수집되면 표시됩니다.", "Quota not available yet. It will appear when data is collected for this account.")}</p>}
        {provider.limits.map((limit) => (
          <ProviderLimitDetails
            key={limit.limitId}
            limit={limit}
            providerLabel={provider.label}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}

function UsageProfilesDialog({ summary, onChange, onClose }: { summary: UsageRateLimitSummary | null; onChange: (key: string, hidden: boolean) => Promise<void>; onClose: () => void }) {
  const { language, text } = useAppLanguage();
  const [tab, setTab] = useState("current");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const groups = groupUsageProfiles(summary);
  const current = (group: UsageProviderGroup) => group.profile?.visible !== false;
  const render = (items: UsageProviderGroup[]) => <>{items.length === 0 && <p>{text("표시할 계정 한도가 없습니다.", "No account quota to display.")}</p>}{items.map(group => {
    const profile = group.profile;
    return <article className="property-card" key={group.key}><div className="property-card-heading"><strong>{group.label}</strong>{profile && <button className="btn-secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await onChange(profile.key, profile.visible); } catch { setError(text("표시 설정을 저장하지 못했습니다. 다시 시도하세요.", "Could not save visibility. Please try again.")); } finally { setBusy(false); }
    }}>{profile.visible ? text("기본 표시에서 숨기기", "Hide from default view") : text("기본 화면에 표시", "Show in default view")}</button>}</div>
    {profile && !profile.registered && <p className="property-note">{text("등록된 계정이 없는 저장된 한도입니다.", "Stored quota for an account no longer registered.")}</p>}
    {group.limits[0] ? <ProviderLimitDetails limit={group.limits[0]} providerLabel={group.label} now={Date.now()}/> : <p className="usage-quota-pending">{text("한도 확인 전입니다. 등록된 계정의 한도가 수집되면 표시됩니다.", "Quota not available yet. It will appear when data is collected for this registered account.")}</p>}
    {group.limits.length > 1 && <details><summary>{text("추가 한도", "Additional limits")} · {group.limits.length - 1}</summary>{group.limits.slice(1).map(limit => <div key={limit.limitId}><small>{formatUpdatedAgo(limit.updatedAt, Date.now(), language)}</small><ProviderLimitDetails limit={limit} providerLabel={group.label} now={Date.now()}/></div>)}</details>}
    {profile && <details><summary>{text("프로필 식별자", "Profile identifier")}</summary><code>{profile.key}</code></details>}
    </article>;
  })}</>;
  return <PropertiesDialog title={text("계정 한도", "Account quotas")} subtitle={text("사용량 · 프로필별 표시 관리", "Usage · Profile visibility")} activeTab={tab} onTabChange={setTab} onClose={onClose} busy={busy} tabs={[
    { id: "current", label: text("현재 계정", "Current accounts"), content: <><h3>{text("현재 계정", "Current accounts")}</h3><p className="property-note">{text("등록된 Codex·Claude 계정을 각각 표시합니다. 세션을 시작하지 않은 계정도 확인할 수 있으며, 수집 전 한도는 추정하지 않습니다.", "Registered Codex and Claude accounts appear separately, including accounts with no started session. Quotas are not estimated before collection.")}</p>{render(groups.filter(current))}</> },
    { id: "other", label: text("이전·기타 프로필", "Other profiles"), content: <><h3>{text("이전·기타 프로필", "Other profiles")}</h3><p className="property-note">{text("이전용 이름으로 보관된 프로필, 등록이 해제된 계정과 직접 숨긴 프로필입니다. 같은 이름이나 수치만으로 계정을 합치지 않습니다. 숨겨도 로그인·대화·사용량 기록은 유지됩니다.", "Archived profiles, accounts no longer registered and profiles hidden by you. Names and percentages do not merge accounts. Hiding preserves logins, conversations and usage history.")}</p>{render(groups.filter(group => !current(group)))}</> },
  ]} footer={<span role="status">{error || text("표시 설정은 이 PC의 앱과 원격 화면에 함께 적용됩니다.", "Visibility is shared by this PC’s app and remote views.")}</span>}/>;
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
  const { text } = useAppLanguage();
  const [settings, setSettings] = useState(loadStatusBar);
  useEffect(() => subscribeStatusBar(setSettings), []);
  const [summary, setSummary] = useState<UsageRateLimitSummary | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const visibilitySaving = useRef(false);
  const requestSerial = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<{
    provider: string;
    left: number;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const rootRef = useRef<HTMLElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });

  const load = useCallback(async (refresh: boolean) => {
    if (visibilitySaving.current) return;
    const request = ++requestSerial.current;
    if (refresh) setRefreshing(true);
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
      setLoading(false);
      setRefreshing(false);
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

  useEffect(() => {
    if (!openPopover) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPopover(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPopover]);

  const providers = useMemo(() => groupUsageProfiles(summary).filter(provider => provider.profile?.visible !== false && showUsageProvider(provider.key, settings)), [summary, settings]);
  useEffect(() => {
    const strip = stripRef.current, wrapper = accountsRef.current;
    if (!strip || !wrapper) return;
    const measure = () => setScroll({ overflow: strip.scrollWidth > wrapper.clientWidth + 1, left: strip.scrollLeft > 1, right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 });
    const observer = new ResizeObserver(measure); observer.observe(wrapper); observer.observe(strip);
    strip.addEventListener("scroll", measure); measure();
    return () => { observer.disconnect(); strip.removeEventListener("scroll", measure); };
  }, [providers, loading]);
  const scrollAccounts = (direction: number) => { const strip = stripRef.current; if (strip) strip.scrollBy({ left: direction * Math.max(160, strip.clientWidth * .8), behavior: "smooth" }); };
  const statusText = loading
    ? text("사용량 불러오는 중", "Loading usage")
    : error
      ? text("사용량 확인 실패", "Could not load usage")
      : providers.length === 0
        ? text("표시할 계정 한도 없음", "No visible account quotas")
        : null;

  const toggleProvider = (
    event: ReactMouseEvent<HTMLButtonElement>,
    key: string
  ) => {
    if (openPopover?.provider === key) {
      setOpenPopover(null);
      return;
    }
    const rootRect = rootRef.current?.getBoundingClientRect();
    const segmentRect = event.currentTarget.getBoundingClientRect();
    const rawLeft = rootRect ? segmentRect.left - rootRect.left : 8;
    const maxLeft = Math.max(8, (rootRect?.width ?? POPOVER_WIDTH) - POPOVER_WIDTH - 8);
    setOpenPopover({ provider: key, left: Math.min(Math.max(8, rawLeft), maxLeft) });
  };

  const openProvider = openPopover
    ? providers.find((provider) => provider.key === openPopover.provider) ?? null
    : null;

  return (
    <DisplayContext.Provider value={settings.display}><footer className="usage-status-bar" ref={rootRef}>
      <div className="usage-status-accounts" ref={accountsRef}>
      {scroll.overflow && <button className="usage-account-scroll" disabled={!scroll.left} aria-label={text("앞쪽 계정 보기", "Scroll to previous accounts")} onClick={() => scrollAccounts(-1)}>‹</button>}
      <div className="usage-status-summary" ref={stripRef}>
        {statusText ? (
          <span className="usage-status-empty">{statusText}</span>
        ) : (
          providers.map((provider) => (
            <button
              type="button"
              key={provider.key}
              className={`usage-status-provider ${
                openPopover?.provider === provider.key
                  ? "usage-status-provider-open"
                  : ""
              }`}
              onClick={(event) => toggleProvider(event, provider.key)}
              title={text(`${provider.label} 계정 한도`, `${provider.label} account quota`)}
            >
              <span
                className="usage-provider-icon"
                style={{ color: provider.iconColor }}
              >
                {provider.icon}
              </span>
              <strong>{provider.profile?.id === "default" && providers.filter(group => group.key.split(":")[0] === provider.key.split(":")[0]).length > 1 ? `${provider.label} · ${text("기본", "Default")}` : provider.label}</strong>
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
                      {shortName || formatResetShort(window.resetsAt, now)}
                    </span>
                  </span>
                );
              })}
            </button>
          ))
        )}
      </div>
      {scroll.overflow && <button className="usage-account-scroll" disabled={!scroll.right} aria-label={text("뒤쪽 계정 보기", "Scroll to next accounts")} onClick={() => scrollAccounts(1)}>›</button>}
      </div>
      <button type="button" className="usage-status-refresh" onClick={() => { setOpenPopover(null); setProfilesOpen(true); void load(false); }}>{text("계정 한도", "Account quotas")}</button>
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
      {openProvider && openPopover && (
        <ProviderPopover
          provider={openProvider}
          now={now}
          left={openPopover.left}
          onClose={() => setOpenPopover(null)}
        />
      )}
      {profilesOpen && <UsageProfilesDialog summary={summary} onClose={() => setProfilesOpen(false)} onChange={async (profileKey, hidden) => {
        visibilitySaving.current = true; ++requestSerial.current;
        try { setSummary(await invoke<UsageRateLimitSummary>("usage_profile_visibility_set", { profileKey, hidden })); }
        finally { visibilitySaving.current = false; }
      }}/>}
    </footer></DisplayContext.Provider>
  );
}
