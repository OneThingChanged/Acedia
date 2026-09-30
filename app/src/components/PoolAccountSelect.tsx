import { useEffect, useState, type ReactNode } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { invoke } from "../platform/runtime";
import { isElectronRuntime } from "../platform/electronBridge";

type PoolChoices = {
  enabled: boolean;
  accounts: { id: string; label: string; available: boolean }[];
};

export function PoolAccountSelect({ value, onChange, disabled = false, alwaysShow = false, label, hint }: {
  value?: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
  alwaysShow?: boolean;
  label?: ReactNode;
  hint?: string;
}) {
  const { text } = useAppLanguage();
  const [choices, setChoices] = useState<PoolChoices | null>(null);
  const [loadError, setLoadError] = useState(false);
  const electron = typeof window !== "undefined" && isElectronRuntime();
  useEffect(() => {
    if (!electron) return;
    let cancelled = false;
    void invoke<PoolChoices>("account_pool_choices", {}).then(result => {
      if (!cancelled) setChoices(result);
    }).catch(() => { if (!cancelled) { setChoices(null); setLoadError(true); } });
    return () => { cancelled = true; };
  }, [electron]);
  if (!electron || (!alwaysShow && !choices?.accounts.length && !value)) return null;
  const accounts = choices?.accounts ?? [];
  return <label className="field">
    <span className="field-label">{label ?? text("분산 계정", "Routed account")}</span>
    <select value={value || ""} disabled={disabled || !choices} onChange={event => onChange(event.target.value)}>
      <option value="">{text("자동 배정", "Automatic")}</option>
      {accounts.map(account => <option key={account.id} value={account.id} disabled={!account.available && account.id !== value}>
        {account.label}{account.available ? "" : text(" · 사용 불가", " · unavailable")}
      </option>)}
      {value && !accounts.some(account => account.id === value) && <option value={value} disabled>{text("등록되지 않은 계정", "Account no longer registered")}</option>}
    </select>
    <span className="check-hint">{hint ?? (choices?.enabled
      ? text("자동은 세션 시작 시 배정합니다. 특정 계정은 다음 시작부터 고정하며, 사용 불가 시 시작하지 않습니다.", "Automatic assigns at session start. A specific account stays pinned from the next launch; unavailable accounts prevent launch.")
      : text("계정 분산이 꺼져 있습니다. 분산을 켠 뒤 시작하면 선택이 적용됩니다.", "Account routing is off. This choice applies after routing is enabled and the session starts."))}</span>
    {alwaysShow && !choices && <span className="check-hint" role={loadError ? "alert" : "status"}>{loadError
      ? text("분산 계정을 불러오지 못했습니다. 설정을 다시 열어 주세요.", "Could not load routed accounts. Reopen settings to retry.")
      : text("불러오는 중…", "Loading…")}</span>}
    {alwaysShow && choices && !choices.enabled && <span className="check-hint">{text("계정 분산이 꺼져 있습니다. Usage에서 분산을 켜면 적용됩니다.", "Account routing is off. Enable routing in Usage to apply this setting.")}</span>}
  </label>;
}
