import { translateText, type AppLocale } from "./locales/translate";
export type UsageRateLimitWindow = {
  usedPercent: number;
  windowMinutes: number | null;
  resetsAt: number | null;
};

export type UsageAccountProfile = {
  key: string; provider: string; id: string; label: string;
  registered: boolean; current: boolean; hidden: boolean; visible: boolean; archived?: boolean;
  refresh?: { status: "success" | "login_required" | "timeout" | "failed" | "unavailable"; checkedAt: number };
};

export type UsageRateLimit = {
  profile?: UsageAccountProfile | null;
  limitId: string;
  limitName: string | null;
  planType: string | null;
  primary: UsageRateLimitWindow | null;
  secondary: UsageRateLimitWindow | null;
  credits: {
    hasCredits: boolean;
    unlimited: boolean;
    balance: string | null;
  };
  updatedAt: number;
};

export type UsageRateLimitSummary = {
  updatedAt: number;
  limits: UsageRateLimit[];
  profiles?: UsageAccountProfile[];
};

export function clampUsagePercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function usageTone(value: number) {
  const percent = clampUsagePercent(value);
  if (percent >= 90) return "danger";
  if (percent >= 70) return "warning";
  return "normal";
}

export function formatUsagePercent(value: number) {
  const percent = clampUsagePercent(value);
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
}

export function formatUsageWindow(minutes: number | null, language: AppLocale = "ko") {
  if (!minutes || minutes <= 0) return translateText(language, "사용 한도", "Usage limit");
  if (minutes === 10_080) return translateText(language, "주간 한도", "Weekly limit");
  if (language !== "ko" && language !== "en") {
    const [value, unit] = minutes % 1440 === 0 ? [minutes / 1440, "day"] : minutes % 60 === 0 ? [minutes / 60, "hour"] : [minutes, "minute"];
    const duration = new Intl.NumberFormat(language, { style: "unit", unit: unit as string, unitDisplay: "long" }).format(value as number);
    return `${duration} · ${translateText(language, "사용 한도", "Usage limit")}`;
  }
  if (minutes % 1_440 === 0) return language === "ko" ? `${minutes / 1_440}일 한도` : `${minutes / 1_440}-day limit`;
  if (minutes % 60 === 0) return language === "ko" ? `${minutes / 60}시간 한도` : `${minutes / 60}-hour limit`;
  return language === "ko" ? `${minutes}분 한도` : `${minutes}-minute limit`;
}

function pad2(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

// resetsAt is a Unix timestamp in seconds. new Date() renders in the renderer's
// system timezone (the user's Windows clock), so this shows the local wall-clock
// reset time rather than a relative countdown — easier to read at a glance.
// The second parameter is kept for call-site compatibility but unused now that
// the value is absolute (nothing to recompute as the clock ticks).
export function formatResetRemaining(
  resetsAt: number | null,
  _nowMs = Date.now(),
  language: AppLocale = "ko",
) {
  if (!resetsAt) return translateText(language, "초기화 시간 미확인", "Reset time unavailable");
  const d = new Date(resetsAt * 1000);
  return language === "ko"
    ? `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad2(d.getHours())}:${pad2(d.getMinutes())} 초기화`
    : `${({ en: "Resets", "zh-CN": "重置时间", "zh-TW": "重設時間", ja: "リセット", es: "Se restablece" })[language]} ${d.toLocaleString(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

export function formatUpdatedAgo(updatedAt: number, nowMs = Date.now(), language: AppLocale = "ko") {
  if (!updatedAt) return translateText(language, "아직 갱신되지 않음", "Not updated yet");
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - updatedAt) / 1000));
  if (elapsedSeconds < 60) return translateText(language, "방금 갱신", "Updated just now");
  const minutes = Math.floor(elapsedSeconds / 60);
  if (language !== "ko" && language !== "en") {
    const elapsed = minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440);
    const unit = minutes < 60 ? "minute" : minutes < 1440 ? "hour" : "day";
    return new Intl.RelativeTimeFormat(language).format(-elapsed, unit);
  }
  if (minutes < 60) return language === "ko" ? `${minutes}분 전 갱신` : `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === "ko" ? `${hours}시간 전 갱신` : `Updated ${hours}h ago`;
  return language === "ko" ? `${Math.floor(hours / 24)}일 전 갱신` : `Updated ${Math.floor(hours / 24)}d ago`;
}

export function usageLimitLabel(limit: UsageRateLimit) {
  if (limit.limitId === "codex") return "Codex";
  return limit.limitName?.trim() || limit.limitId;
}

export function primaryUsageWindow(limit: UsageRateLimit) {
  return limit.primary ?? limit.secondary;
}

// Compact absolute reset time for the status bar segments ("7/21 18:53"), in
// the user's local timezone.
export function formatResetShort(resetsAt: number | null, _nowMs = Date.now()) {
  if (!resetsAt) return "";
  const d = new Date(resetsAt * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

// ---- Provider grouping (Codex / Claude / Gemini / …) ----

export type UsageProviderMeta = {
  key: string;
  label: string;
  icon: string;
  iconColor: string;
};

export type UsageProviderGroup = UsageProviderMeta & {
  limits: UsageRateLimit[];
  profile?: UsageAccountProfile;
};

const PROVIDER_META: Record<string, Omit<UsageProviderMeta, "key">> = {
  codex: { label: "Codex", icon: "⬢", iconColor: "#10a37f" },
  claude: { label: "Claude", icon: "✻", iconColor: "#cc785c" },
  gemini: { label: "Gemini", icon: "✦", iconColor: "#4796e3" },
};

export function usageProviderKey(limit: UsageRateLimit) {
  if (limit.profile) return limit.profile.id === "default" ? limit.profile.provider : limit.profile.key;
  const id = limit.limitId.toLowerCase();
  if (id.startsWith("codex:")) return id;
  if (id === "codex" || id.startsWith("codex")) return "codex";
  if (id === "claude" || id.startsWith("claude")) return "claude";
  if (id === "gemini" || id.startsWith("gemini")) return "gemini";
  return id;
}

// Group limits by provider, preserving the backend's sort order.
export function groupUsageProviders(
  limits: UsageRateLimit[]
): UsageProviderGroup[] {
  const groups: UsageProviderGroup[] = [];
  const byKey = new Map<string, UsageProviderGroup>();
  for (const limit of limits) {
    const key = usageProviderKey(limit);
    let group = byKey.get(key);
    if (!group) {
      const meta = PROVIDER_META[limit.profile?.provider ?? (key.startsWith("codex:") ? "codex" : key)];
      group = {
        key,
        label: limit.profile && limit.profile.id !== "default" ? `${meta?.label ?? limit.profile.provider} · ${limit.profile.label}` : key.startsWith("codex:") ? usageLimitLabel(limit) : meta?.label ?? usageLimitLabel(limit),
        icon: meta?.icon ?? "•",
        iconColor: meta?.iconColor ?? "#8b949e",
        limits: [],
        profile: limit.profile ?? undefined,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.limits.push(limit);
  }
  for (const group of groups) group.limits.sort((a, b) => {
    const base = (limit: UsageRateLimit) => limit.profile ? limit.limitId === (limit.profile.id === "default" ? limit.profile.provider : limit.profile.key) : false;
    return Number(base(b)) - Number(base(a));
  });
  return groups;
}

export function groupUsageProfiles(summary: UsageRateLimitSummary | null): UsageProviderGroup[] {
  const groups = groupUsageProviders(summary?.limits ?? []);
  const byKey = new Map(groups.map(group => [group.key, group]));
  for (const profile of summary?.profiles ?? []) {
    const key = profile.id === "default" ? profile.provider : profile.key;
    const meta = PROVIDER_META[profile.provider];
    const label = profile.id === "default" ? meta?.label ?? profile.label : `${meta?.label ?? profile.provider} · ${profile.label}`;
    const existing = byKey.get(key);
    if (existing) { existing.profile = profile; existing.label = label; }
    else {
      const group = { key, label, icon: meta?.icon ?? "•", iconColor: meta?.iconColor ?? "#8b949e", limits: [], profile };
      groups.push(group); byKey.set(key, group);
    }
  }
  const order = (group: UsageProviderGroup) => ({ codex: 0, claude: 1, gemini: 2 })[group.key.split(":")[0]] ?? 3;
  return groups.sort((a, b) => order(a) - order(b) || Number(b.profile?.id === "default") - Number(a.profile?.id === "default"));
}

// Short display name for a limit inside its provider popover/segment:
// "Claude Fable" under the Claude provider → "Fable"; base limits → "".
export function usageLimitShortName(
  limit: UsageRateLimit,
  providerLabel: string
) {
  if (limit.profile && limit.limitId === (limit.profile.id === "default" ? limit.profile.provider : limit.profile.key)) return "";
  const label = usageLimitLabel(limit);
  if (label.toLowerCase() === providerLabel.toLowerCase()) return "";
  if (label.toLowerCase().startsWith(`${providerLabel.toLowerCase()} `)) {
    return label.slice(providerLabel.length + 1);
  }
  return label;
}
