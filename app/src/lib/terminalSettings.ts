import type { ITerminalOptions } from "@xterm/xterm";

export const LS_TERMINAL_SETTINGS = "multiagent.terminalSettings.v1";
export const LS_LEGACY_TERMINAL_FONT_SIZE = "multiagent.terminalFontSize.v1";
const SETTINGS_CHANGED = "multiagent:terminal-settings-changed";

export const TERMINAL_FONTS = [
  { label: "Cascadia Mono", value: '"Cascadia Mono", Consolas, "Courier New", monospace' },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", Consolas, monospace' },
  { label: "Fira Code", value: '"Fira Code", Consolas, monospace' },
  { label: "Courier New", value: '"Courier New", monospace' },
] as const;

export type TerminalSettings = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  rightClickToPaste: boolean;
};

export const DEFAULT_TERMINAL_SETTINGS: Readonly<TerminalSettings> = Object.freeze({
  fontFamily: TERMINAL_FONTS[0].value,
  fontSize: 13,
  lineHeight: 1,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: false,
  rightClickToPaste: false,
});

function bounded(value: unknown, fallback: number, min: number, max: number, step = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number((Math.round(Math.min(max, Math.max(min, value)) / step) * step).toFixed(2))
    : fallback;
}

export function clampTerminalFontSize(value: number) {
  return bounded(value, DEFAULT_TERMINAL_SETTINGS.fontSize, 9, 24);
}

export function normalizeTerminalSettings(value: unknown): TerminalSettings {
  const v = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<TerminalSettings> : {};
  const d = DEFAULT_TERMINAL_SETTINGS;
  return {
    fontFamily: TERMINAL_FONTS.some(font => font.value === v.fontFamily) ? v.fontFamily! : d.fontFamily,
    fontSize: bounded(v.fontSize, d.fontSize, 9, 24),
    lineHeight: bounded(v.lineHeight, d.lineHeight, 1, 2, 0.05),
    cursorStyle: v.cursorStyle === "underline" || v.cursorStyle === "bar" ? v.cursorStyle : "block",
    cursorBlink: typeof v.cursorBlink === "boolean" ? v.cursorBlink : d.cursorBlink,
    scrollback: bounded(v.scrollback, d.scrollback, 1000, 50000),
    copyOnSelect: typeof v.copyOnSelect === "boolean" ? v.copyOnSelect : d.copyOnSelect,
    rightClickToPaste: typeof v.rightClickToPaste === "boolean" ? v.rightClickToPaste : d.rightClickToPaste,
  };
}

export function loadTerminalSettings(): TerminalSettings {
  let fontSize = DEFAULT_TERMINAL_SETTINGS.fontSize;
  try {
    const legacy = localStorage.getItem(LS_LEGACY_TERMINAL_FONT_SIZE);
    if (legacy?.trim()) fontSize = clampTerminalFontSize(Number(legacy));
    const raw: unknown = JSON.parse(localStorage.getItem(LS_TERMINAL_SETTINGS) || "null");
    return normalizeTerminalSettings({ fontSize, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) });
  } catch {
    return { ...DEFAULT_TERMINAL_SETTINGS, fontSize };
  }
}

// Read at commit time so a stale settings form cannot undo a Ctrl+wheel change.
export function updateTerminalSettings(patch: Partial<TerminalSettings>): TerminalSettings {
  const next = normalizeTerminalSettings({ ...loadTerminalSettings(), ...patch });
  localStorage.setItem(LS_TERMINAL_SETTINGS, JSON.stringify(next));
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
  return next;
}

export function subscribeTerminalSettings(listener: (settings: TerminalSettings) => void) {
  const changed = () => listener(loadTerminalSettings());
  const storageChanged = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key === null || event.key === LS_TERMINAL_SETTINGS || event.key === LS_LEGACY_TERMINAL_FONT_SIZE) changed();
  };
  window.addEventListener(SETTINGS_CHANGED, changed);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(SETTINGS_CHANGED, changed);
    window.removeEventListener("storage", storageChanged);
  };
}

export function terminalSettingsOptions(settings: TerminalSettings): ITerminalOptions {
  const { fontFamily, fontSize, lineHeight, cursorStyle, cursorBlink, scrollback } = settings;
  return { fontFamily, fontSize, lineHeight, cursorStyle, cursorBlink, scrollback };
}
