import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StartupUpdatePrompt } from "../../src/components/StartupUpdatePrompt";
import { AppLanguageProvider, LS_APP_LANGUAGE } from "../../src/lib/appLanguage";
import { StartupUpdateService } from "../../electron/services/startup-update.mjs";
import "../../src/App.css";

let mode = "available";
let checks = 0, downloads = 0, restarts = 0, dismissals = 0, sequence = 0;
let complete: ((value: unknown) => void) | null = null;
let fail: ((error: Error) => void) | null = null;
const listeners = new Map<string, Set<(payload: unknown) => void>>();
const root = createRoot(document.getElementById("root")!);
const makeService = () => new StartupUpdateService({ enabled: true, check: async () => {
  checks++;
  if (mode === "offline") throw new Error("offline");
  return mode === "current" ? null : { version: "1.8.1.81" };
} });
let service = makeService();
window.multiAgentElectron = {
  invoke: async command => {
    if (command === "startup_update_check") return service.claim(1);
    if (command === "startup_update_dismiss") { dismissals++; service.dismiss(1); return null; }
    if (command === "download_and_install_update") {
      downloads++;
      return new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    }
    if (command === "relaunch") { restarts++; return null; }
    return null;
  },
  onEvent: (name, listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(listener);
    return () => listeners.get(name)!.delete(listener);
  },
} as typeof window.multiAgentElectron;

window.updateFixture = {
  reset(nextMode = "available", enabled = true, language = "ko") {
    mode = nextMode;
    checks = downloads = restarts = dismissals = 0;
    complete = fail = null;
    service = makeService();
    localStorage.setItem(LS_APP_LANGUAGE, language);
    this.remount(enabled);
  },
  remount(enabled = true) {
    root.render(<StrictMode><AppLanguageProvider key={++sequence}><StartupUpdatePrompt enabled={enabled} /></AppLanguageProvider></StrictMode>);
  },
  stats() { return { checks, downloads, restarts, dismissals }; },
  emit(name: string, payload: unknown) { listeners.get(name)?.forEach(listener => listener(payload)); },
  fail() { fail?.(new Error("download interrupted")); },
  finish() { complete?.(null); },
};
window.updateFixture.reset();
