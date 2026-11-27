import { useEffect, useState } from "react";
import { sameSessionModel, type SessionModel } from "../../electron/shared/session-model.mjs";
import { isElectronRuntime } from "../platform/electronBridge";
import { invoke } from "../platform/runtime";

const EMPTY_MODELS: Record<string, SessionModel> = {};

export function useSidebarSessionModels(enabled: boolean) {
  const [models, setModels] = useState(EMPTY_MODELS);
  useEffect(() => {
    if (!enabled || !isElectronRuntime()) return;
    let stopped = false;
    let pending = false;

    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await invoke("get_sidebar_session_models", {});
        if (!stopped) setModels(previous => Object.keys(previous).length === Object.keys(next).length
          && Object.entries(next).every(([id, model]) => sameSessionModel(previous[id], model)) ? previous : next);
      } catch {
        if (!stopped) setModels(EMPTY_MODELS);
      } finally {
        pending = false;
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled]);
  return enabled ? models : EMPTY_MODELS;
}
