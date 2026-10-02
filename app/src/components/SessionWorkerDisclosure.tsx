import { useAppLanguage } from "../lib/appLanguage";
import { availableSessionWorkerOptions, resolveSessionWorker } from "../lib/sessionWorkers";
import type { SessionWorkerSettings } from "../types";
import { SessionWorkerFields } from "./SessionWorkerFields";

export function SessionWorkerDisclosure({ settings, disabledTools, onChange }: {
  settings: SessionWorkerSettings | undefined;
  disabledTools: readonly string[];
  onChange: (settings: SessionWorkerSettings | undefined) => void;
}) {
  const { text } = useAppLanguage();
  const options = availableSessionWorkerOptions(disabledTools);
  if (!options.length) return null;
  const summary = (kind: keyof SessionWorkerSettings) => {
    const config = resolveSessionWorker(settings?.[kind]);
    return config && options.some(option => option.requiredToolId === config.provider)
      ? `${config.model} · ${config.effort}`
      : text("사용 안 함", "Disabled");
  };

  return <details className="session-worker-disclosure">
    <summary>
      <span className="session-worker-disclosure-label">{text("문서·HTML 병렬 작업자", "Document and HTML parallel workers")}</span>
      <span className="session-worker-overview">
        <span><span>{text("문서", "Documents")}</span><span>{summary("documents")}</span></span>
        <span><span>HTML</span><span>{summary("html")}</span></span>
      </span>
    </summary>
    <div className="new-session-workers">
      <SessionWorkerFields settings={settings} disabledTools={disabledTools} onChange={onChange} compact />
    </div>
  </details>;
}
