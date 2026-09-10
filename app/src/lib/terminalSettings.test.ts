import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TERMINAL_SETTINGS, LS_LEGACY_TERMINAL_FONT_SIZE, LS_TERMINAL_SETTINGS,
  loadTerminalSettings, normalizeTerminalSettings, subscribeTerminalSettings, updateTerminalSettings,
} from "./terminalSettings";

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe("terminal preferences", () => {
  it("keeps the existing Ctrl+wheel font size without writing during load", () => {
    values.set(LS_LEGACY_TERMINAL_FONT_SIZE, "19");
    expect(loadTerminalSettings()).toEqual({ ...DEFAULT_TERMINAL_SETTINGS, fontSize: 19 });
    expect(values.size).toBe(1);
    updateTerminalSettings({ lineHeight: 1.4 });
    expect(loadTerminalSettings()).toMatchObject({ fontSize: 19, lineHeight: 1.4 });
  });

  it("prefers the saved profile to the old key and preserves unrelated settings on each update", () => {
    values.set(LS_LEGACY_TERMINAL_FONT_SIZE, "18");
    updateTerminalSettings({ fontSize: 14, cursorStyle: "bar", rightClickToPaste: true });
    updateTerminalSettings({ fontSize: 20 });
    updateTerminalSettings({ copyOnSelect: true });
    expect(loadTerminalSettings()).toMatchObject({ fontSize: 20, cursorStyle: "bar", copyOnSelect: true, rightClickToPaste: true });
  });

  it("bounds memory and geometry settings and rejects malformed enums and booleans", () => {
    expect(normalizeTerminalSettings({ fontSize: 99, lineHeight: -1, scrollback: 1e9, cursorStyle: "invalid", cursorBlink: "false", copyOnSelect: 1, fontFamily: "unknown" }))
      .toEqual({ ...DEFAULT_TERMINAL_SETTINGS, fontSize: 24, scrollback: 50000 });
    expect(normalizeTerminalSettings({ fontSize: NaN, lineHeight: Infinity, scrollback: -20 }))
      .toEqual({ ...DEFAULT_TERMINAL_SETTINGS, scrollback: 1000 });
    expect(normalizeTerminalSettings({ lineHeight: 1.43, fontSize: 13.6 })).toMatchObject({ lineHeight: 1.45, fontSize: 14 });
  });

  it.each(["{bad", "null", "[]", '"string"'])("recovers the legacy preference from malformed profile %s", raw => {
    values.set(LS_LEGACY_TERMINAL_FONT_SIZE, "16");
    values.set(LS_TERMINAL_SETTINGS, raw);
    expect(loadTerminalSettings()).toEqual({ ...DEFAULT_TERMINAL_SETTINGS, fontSize: 16 });
  });

  it("only announces a change after persistence succeeds", () => {
    const changed = vi.fn();
    const stop = subscribeTerminalSettings(changed);
    updateTerminalSettings({ cursorBlink: false });
    expect(changed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cursorBlink: false }));
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("disk full"); } });
    expect(() => updateTerminalSettings({ fontSize: 24 })).toThrow("disk full");
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
  });

  it("handles other-window updates and clearing while ignoring unrelated storage, then unsubscribes", () => {
    const changed = vi.fn();
    const stop = subscribeTerminalSettings(changed);
    const storageEvent = (key: string | null) => window.dispatchEvent(Object.assign(new Event("storage"), { key, storageArea: localStorage }));
    storageEvent("other");
    expect(changed).not.toHaveBeenCalled();
    values.set(LS_TERMINAL_SETTINGS, JSON.stringify({ fontSize: 21 }));
    storageEvent(LS_TERMINAL_SETTINGS);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 21 }));
    values.clear(); storageEvent(null);
    expect(changed).toHaveBeenLastCalledWith(DEFAULT_TERMINAL_SETTINGS);
    stop(); updateTerminalSettings({ fontSize: 10 });
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
