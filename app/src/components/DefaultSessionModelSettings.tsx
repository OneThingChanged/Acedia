import { useEffect, useRef, useState } from "react";
import type { ProviderModelCatalog, SessionModel, SessionModelDefaultsSnapshot } from "../../electron/shared/session-model.mjs";
import { sameSessionModel } from "../../electron/shared/session-model.mjs";
import { invoke } from "../platform/runtime";
import { useAppLanguage } from "../lib/appLanguage";
import { settingsForChatModel, settingsForChatEffort } from "../lib/chatSessionModel";
import { SettingScope, settingTarget } from "./SettingsSearch";

export function DefaultSessionModelSettings({ provider, accountId, codexPoolAccountId }: {
  provider: "codex" | "claude"; accountId: string; codexPoolAccountId?: string | null;
}) {
  const { text } = useAppLanguage();
  const [snapshot, setSnapshot] = useState<SessionModelDefaultsSnapshot | null>(null);
  const [draft, setDraft] = useState<SessionModel | null>(null);
  const [catalog, setCatalog] = useState<ProviderModelCatalog | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const prefix = `agents.${provider}`;
  useEffect(() => {
    const current = ++generation.current;
    setSnapshot(null); setDraft(null); setCatalog(null); setError(""); setMessage(""); setBusy(false);
    void Promise.allSettled([
      invoke<SessionModelDefaultsSnapshot>("get_model_defaults", { provider }),
      invoke<ProviderModelCatalog>("get_default_model_catalog", { provider, accountId, codexPoolAccountId }),
    ]).then(([saved, models]) => {
      if (generation.current !== current) return;
      if (saved.status === "fulfilled") { setSnapshot(saved.value); setDraft(saved.value.settings); }
      if (models.status === "fulfilled") setCatalog(models.value);
      const failures = [saved, models].flatMap(result => result.status === "rejected" ? [String(result.reason)] : []);
      setError(failures.join("\n"));
    });
    return () => { generation.current++; };
  }, [provider, accountId, codexPoolAccountId, reload]);
  const selected = catalog?.models.find(model => model.model === draft?.model);
  const effortValid = !draft?.effort || selected?.efforts.some(item => item.effort === draft.effort);
  const editable = !!snapshot && !!catalog && !busy;
  const save = async () => {
    if (!draft || !snapshot || !selected || !effortValid || busy) return;
    const current = generation.current;
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await invoke<SessionModelDefaultsSnapshot>("set_model_defaults", {
        provider, accountId, codexPoolAccountId, settings: draft, revision: snapshot.revision,
      });
      if (generation.current !== current) return;
      setSnapshot(saved); setDraft(saved.settings); setMessage(text("기본 모델을 저장했습니다.", "Default model saved."));
    } catch (failure) {
      if (generation.current === current) setError(String(failure));
    } finally { if (generation.current === current) setBusy(false); }
  };
  return <>
    <div className="agent-settings-sectionhead"><h4>{text("기본 모델", "Default model")}</h4></div>
    <div className="agent-settings-card agent-defaults">
      <div className="agent-settings-row" {...settingTarget(prefix + ".defaultModel")}>
        <label className="field"><span className="field-label">{text("기본 모델", "Default model")}<SettingScope id={prefix + ".defaultModel"} /></span>
          <select aria-label={text("기본 모델", "Default model")} value={draft?.model || ""} disabled={!editable} onChange={event => {
            const model = catalog?.models.find(item => item.model === event.target.value);
            if (model) { setDraft(settingsForChatModel(model, draft)); setMessage(""); }
          }}>
            {!draft && <option value="">{text("불러오는 중…", "Loading…")}</option>}
            {draft && !selected && <option value={draft.model}>{draft.model}</option>}
            {catalog?.models.map(model => <option key={model.model} value={model.model}>{model.label}</option>)}
          </select>
          <span className="check-hint">{text("세션에 저장된 모델이 없을 때 사용합니다. 저장된 세션 선택이 우선입니다.", "Used when a session has no saved model. Saved session choices take priority.")}</span>
          {catalog && <span className="check-hint">{text("모델 목록", "Model list")}: {catalog.accountLabel}{catalog.capabilitiesSource === "cli-help" && text(" · 설치된 Claude CLI 기준", " · installed Claude CLI")}</span>}
          {draft && catalog && !selected && <span role="alert" className="check-hint">{text("이 계정의 목록에 없는 모델입니다. 사용할 모델을 선택하세요.", "This model is absent from this account's list. Choose an available model.")}</span>}
        </label>
      </div>
      <div className="agent-settings-row" {...settingTarget(prefix + ".defaultEffort")}>
        <label className="field"><span className="field-label">{text("기본 effort", "Default effort")}<SettingScope id={prefix + ".defaultEffort"} /></span>
          <select aria-label={text("기본 effort", "Default effort")} value={draft?.effort || ""} disabled={!editable || !selected} onChange={event => {
            if (draft) { setDraft(settingsForChatEffort(draft, event.target.value)); setMessage(""); }
          }}>
            <option value="">{text("모델 기본값", "Model default")}</option>
            {draft?.effort && !effortValid && <option value={draft.effort} disabled>{draft.effort}</option>}
            {selected?.efforts.map(item => <option key={item.effort} value={item.effort}>{item.effort}</option>)}
          </select>
        </label>
      </div>
      {provider === "codex" && <label className="agent-settings-row" {...settingTarget(prefix + ".defaultFast")}>
        <div><div className="agent-row-title">{text("기본 Fast 모드", "Default Fast mode")}<SettingScope id={prefix + ".defaultFast"} /></div></div>
        <input type="checkbox" role="switch" aria-label={text("기본 Fast 모드", "Default Fast mode")} checked={draft?.serviceTier === "fast"} disabled={!editable} onChange={event => {
          if (draft) { setDraft({ ...draft, serviceTier: event.target.checked ? "fast" : "default" }); setMessage(""); }
        }} />
      </label>}
      <div className="agent-settings-row">
        <button type="button" className="btn-primary" disabled={!editable || !selected || !effortValid || sameSessionModel(draft, snapshot?.settings)} onClick={() => void save()}>{busy ? text("저장 중…", "Saving…") : text("기본 모델 저장", "Save default model")}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => setReload(value => value + 1)}>{text("다시 불러오기", "Reload")}</button>
      </div>
    </div>
    {error && <p className="agent-hint" role="alert">{error}</p>}
    {message && <p className="agent-hint" role="status">{message}</p>}
  </>;
}
