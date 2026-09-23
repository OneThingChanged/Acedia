import { useEffect, useId, useState } from "react";
import { SettingScope, settingTarget } from "./SettingsSearch";
import type { SessionWorkerConfig, SessionWorkerPreset, SessionWorkerSelection, SessionWorkerSettings } from "../types";
import { availableSessionWorkerOptions, resolveSessionWorker, updateSessionWorkerSetting, workerEfforts, WORKER_MODELS } from "../lib/sessionWorkers";
import { useAppLanguage } from "../lib/appLanguage";

function WorkerModelInput({ config, onChange }: { config: SessionWorkerConfig; onChange: (value: SessionWorkerConfig) => void }) {
  const { text } = useAppLanguage();
  const id = useId();
  const models = WORKER_MODELS[config.provider];
  const [custom, setCustom] = useState(!models.includes(config.model));
  const [draft, setDraft] = useState(config.model);
  useEffect(() => setDraft(config.model), [config.model]);
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(draft);
  const selectModel = (model: string) => {
    const efforts = workerEfforts(config.provider, model);
    onChange({ ...config, model, effort: efforts.includes(config.effort) ? config.effort : efforts[efforts.length - 1] });
  };
  return <div className="field">
    <label className="field-label" htmlFor={`${id}-select`}>{text("모델", "Model")}</label>
    <select id={`${id}-select`} data-worker-model value={custom || !models.includes(config.model) ? "custom" : config.model}
      onChange={event => {
        const model = event.target.value;
        setCustom(model === "custom");
        if (model !== "custom") selectModel(model);
      }}>
      {models.map(model => <option key={model} value={model}>{model}</option>)}
      <option value="custom">{text("직접 입력…", "Custom model…")}</option>
    </select>
    {(custom || !models.includes(config.model)) && <>
      <label className="field-label" htmlFor={`${id}-custom`}>{text("모델 ID", "Model ID")}</label>
      <input id={`${id}-custom`} value={draft} aria-invalid={!valid} aria-describedby={!valid ? `${id}-error` : undefined}
        onChange={event => {
          const model = event.target.value;
          setDraft(model);
          if (/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(model)) selectModel(model);
        }}
        onBlur={() => { if (!valid) setDraft(config.model); }} />
      {!valid && <span id={`${id}-error`} role="alert" className="session-worker-hint">{text("유효한 모델 ID를 입력하세요. 비워 두면 이전 값이 유지됩니다.", "Enter a valid model ID. An empty field keeps the previous value.")}</span>}
    </>}
  </div>;
}

export function SessionWorkerFields({ settings, settingsPrefix, disabledTools, onChange, className = "session-worker-fields" }: {
  settings: SessionWorkerSettings | undefined;
  settingsPrefix?: string;
  disabledTools: readonly string[];
  onChange: (settings: SessionWorkerSettings | undefined) => void;
  className?: string;
}) {
  const { text } = useAppLanguage();
  const options = availableSessionWorkerOptions(disabledTools);
  if (!options.length) return null;
  const renderWorker = (label: string, kind: keyof SessionWorkerSettings) => {
    const config = resolveSessionWorker(settings?.[kind]);
    const enabled = config && options.some(option => option.requiredToolId === config.provider);
    const value = enabled ? config.provider === "codex" ? "codex-luna-max" : "claude-opus" : "";
    const update = (selection: SessionWorkerSelection | undefined) => onChange(updateSessionWorkerSetting(settings, kind, selection));
    return <fieldset className="session-worker-field" key={kind} {...settingTarget(settingsPrefix && `${settingsPrefix}.${kind}`)}>
      <legend className="field-label">{label}<SettingScope id={settingsPrefix && `${settingsPrefix}.${kind}`} /></legend>
      <label className="field">
        <span className="field-label">{text("실행 도구", "Provider")}</span>
        <select value={value} onChange={event => update((event.target.value || undefined) as SessionWorkerPreset | undefined)}>
          <option value="">{text("사용 안 함", "Disabled")}</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {enabled && <div className="session-worker-model-fields">
        <WorkerModelInput key={config.provider} config={config} onChange={update} />
        <label className="field">
          <span className="field-label">{text("추론 강도", "Reasoning effort")}</span>
          <select data-worker-effort value={config.effort} onChange={event => update({ ...config, effort: event.target.value as SessionWorkerConfig["effort"] })}>
            {workerEfforts(config.provider, config.model).map(effort => <option key={effort} value={effort}>{effort}</option>)}
          </select>
        </label>
        <span className="session-worker-hint">{config.model} · {config.effort}</span>
      </div>}
    </fieldset>;
  };
  return <div className={className} data-testid="session-worker-settings">
    <div className="session-worker-heading">{text("문서·HTML 병렬 작업자", "Document and HTML parallel workers")}</div>
    <div className="session-worker-description">{text("문서와 HTML에 사용할 모델·추론 강도를 각각 설정합니다. 변경은 세션을 다시 실행하면 적용됩니다.", "Choose a model and effort for each worker. Changes apply when the session restarts.")}</div>
    {renderWorker(text("문서·Markdown", "Documents and Markdown"), "documents")}
    {renderWorker("HTML", "html")}
    <div className="session-worker-hint">{text("모델 목록은 추천 목록입니다. 직접 입력한 모델의 지원 여부는 사용하는 CLI와 계정에 따라 다릅니다.", "Models are suggestions. Custom model support depends on your CLI and account.")}</div>
  </div>;
}
