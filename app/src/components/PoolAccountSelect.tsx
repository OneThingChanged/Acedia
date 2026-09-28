import { useEffect, useState } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { invoke } from "../platform/runtime";
import { isElectronRuntime } from "../platform/electronBridge";

type PoolChoices = {
  enabled: boolean;
  accounts: { id: string; label: string; available: boolean }[];
};

export function PoolAccountSelect({ value, onChange, disabled = false }: {
  value?: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
}) {
  const { text } = useAppLanguage();
  const [choices, setChoices] = useState<PoolChoices | null>(null);
  const electron = typeof window !== "undefined" && isElectronRuntime();
  useEffect(() => {
    if (!electron) return;
    let cancelled = false;
    void invoke<PoolChoices>("account_pool_choices", {}).then(result => {
      if (!cancelled) setChoices(result);
    }).catch(() => { if (!cancelled) setChoices(null); });
    return () => { cancelled = true; };
  }, [electron]);
  if (!electron || (!choices?.accounts.length && !value)) return null;
  const accounts = choices?.accounts ?? [];
  return <label className="field">
    <span className="field-label">{text("분산 계정", "Routed account")}</span>
    <select value={value || ""} disabled={disabled || !choices} onChange={event => onChange(event.target.value)}>
      <option value="">{text("자동 배정", "Automatic")}</option>
      {accounts.map(account => <option key={account.id} value={account.id} disabled={!account.available && account.id !== value}>
        {account.label}{account.available ? "" : text(" · 사용 불가", " · unavailable")}
      </option>)}
      {value && !accounts.some(account => account.id === value) && <option value={value} disabled>{text("등록되지 않은 계정", "Account no longer registered")}</option>}
    </select>
    <span className="check-hint">{choices?.enabled
      ? text("자동은 세션 시작 시 배정합니다. 특정 계정은 다음 시작부터 고정하며, 사용 불가 시 시작하지 않습니다.", "Automatic assigns at session start. A specific account stays pinned from the next launch; unavailable accounts prevent launch.")
      : text("계정 분산이 꺼져 있습니다. 분산을 켠 뒤 시작하면 선택이 적용됩니다.", "Account routing is off. This choice applies after routing is enabled and the session starts.")}</span>
  </label>;
}
