import { useEffect, useRef, useState } from "react";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { useAppLanguage } from "../lib/appLanguage";
import type { LaunchPoolAccount } from "../lib/sessionLaunchAccount";


export function SessionLaunchAccountModal({ sessionName, accounts, initialAccountId, onStart, onCancel }: {
  sessionName: string;
  accounts: LaunchPoolAccount[];
  initialAccountId?: string;
  onStart: (accountId: string) => void;
  onCancel: () => void;
}) {
  useNativeViewOcclusion();
  const { text } = useAppLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const [accountId, setAccountId] = useState(initialAccountId || "");
  const available = accountId
    ? accounts.some(account => account.id === accountId && account.available)
    : accounts.some(account => account.available);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector("select")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("select:not(:disabled), button:not(:disabled)") ?? [])];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className="modal-backdrop">
    <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="session-launch-title" aria-describedby="session-launch-description">
      <h2 className="modal-title" id="session-launch-title">{text("세션 시작 계정", "Choose account for session")}</h2>
      <p className="modal-text" id="session-launch-description">
        {text(`${sessionName} 세션에 사용할 분산 계정을 선택하세요.`, `Choose the routed account for ${sessionName}.`)}
      </p>
      <label className="field">
        <span className="field-label">{text("분산 계정", "Routed account")}</span>
        <select value={accountId} onChange={event => setAccountId(event.target.value)}>
          <option value="">{text("자동 배정", "Automatic")}</option>
          {accounts.map(account => <option key={account.id} value={account.id} disabled={!account.available}>
            {account.label}{account.available ? "" : text(" · 사용 불가", " · unavailable")}
          </option>)}
        </select>
      </label>
      <span className="check-hint">{text(
        "선택한 계정은 이 세션에 저장됩니다. 자동은 기존 배정을 유지하고 한도 소진 시 재시작에서 재배정합니다. CLI /usage는 분산 계정 사용량을 표시하지 않습니다.",
        "This choice is saved for the session. Automatic keeps its assignment and rebalances at restart when exhausted. CLI /usage does not show routed account usage."
      )}</span>
      {!available && <p className="property-error" role="alert">{text("사용 가능한 분산 계정이 없습니다. Usage에서 계정 상태를 확인하세요.", "No routed account is available. Check account status in Usage.")}</p>}
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onCancel}>{text("취소", "Cancel")}</button>
        <button className="btn-primary" disabled={!available} onClick={() => onStart(accountId)}>{text("세션 시작", "Start session")}</button>
      </div>
    </div>
  </div>;
}
