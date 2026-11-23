import { useEffect, useState } from "react";
import { isElectronRuntime } from "../platform/electronBridge";
import { invoke } from "../platform/runtime";

const EMPTY_USAGE: Record<string, number> = {};
const REFRESH_MS = 5_000;

export function useCodexContextUsage(enabled: boolean) {
  const [counts, setCounts] = useState(EMPTY_USAGE);
  useEffect(() => {
    if (!enabled || !isElectronRuntime()) {
      setCounts(EMPTY_USAGE);
      return;
    }
    let stopped = false;
    let pending = false;

    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await invoke("get_active_codex_context_usage", {});
        if (!stopped) {
          setCounts(current => Object.keys(current).length === Object.keys(next).length
            && Object.entries(next).every(([id, count]) => current[id] === count) ? current : next);
        }
      } catch {
        if (!stopped) setCounts(EMPTY_USAGE);
      } finally {
        pending = false;
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled]);
  return enabled ? counts : EMPTY_USAGE;
}
