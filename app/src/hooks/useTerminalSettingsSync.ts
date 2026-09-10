import { useEffect, type MutableRefObject } from "react";
import type { TerminalEntry } from "../types";
import { subscribeTerminalSettings, terminalSettingsOptions } from "../lib/terminalSettings";

export function useTerminalSettingsSync(termsRef: MutableRefObject<Map<string, TerminalEntry>>) {
  useEffect(() => subscribeTerminalSettings(settings => {
    // Parked terminals also receive the defaults; their pane refits on reattach.
    for (const entry of termsRef.current.values()) {
      entry.term.options = terminalSettingsOptions(settings);
    }
  }), [termsRef]);
}
