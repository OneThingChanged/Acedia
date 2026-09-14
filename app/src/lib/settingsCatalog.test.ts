import { describe, expect, it } from "vitest";
import { availableSettings, searchSettings, settingById, SETTINGS_CATALOG, SETTING_SCOPES } from "./settingsCatalog";
import { COMMAND_DEFINITIONS } from "./commandRegistry";
const context = { buildVariant: "standard" as const, disabledTools: [] };
describe("settings search catalog", () => {
  it("matches option names, spaced Korean, English and provider filters", () => {
    const ids = (query: string) => searchSettings(query, context).map(item => item.id);
    expect(ids("환경변수")).toEqual(["codex", "claude", "agy", "qwen", "cline"].map(tool => "agents." + tool + ".env"));
    expect(ids("antigravity environment")).toEqual(["agents.agy.env"]);
    expect(ids("환경 변수")).toEqual(ids("환경변수"));
    expect(ids(" CLAUDE   environment ")).toEqual(["agents.claude.env"]);
    expect(ids("codex 기본 계정")[0]).toBe("agents.codex.defaultAccount");
    expect(ids("커서")).toEqual(["terminal.cursorStyle", "terminal.cursorBlink"]);
    expect(ids("")).toEqual([]);
    expect(ids("   ")).toEqual([]);
    expect(ids('<script>alert("fixture")</script>')).toEqual([]);
  });
  it("matches visible translated names as well as Korean and English", () => {
    const results = searchSettings("カーソル", context, (_ko, en) => en === "Cursor shape" ? "カーソルの形" : en);
    expect(results[0].id).toBe("terminal.cursorStyle");
  });
  it("filters unavailable channels and worker options without hiding disabled tools", () => {
    expect(availableSettings({ ...context, buildVariant: "company" }).some(item => item.category === "remote")).toBe(false);
    expect(availableSettings({ ...context, buildVariant: "store" }).some(item => item.category === "remote")).toBe(true);
    const disabled = availableSettings({ ...context, disabledTools: ["codex", "claude"] });
    expect(disabled.some(item => item.requiresWorkers)).toBe(false);
    expect(disabled.some(item => item.id === "agents.claude.enabled")).toBe(true);
  });
  it("uses unique stable targets, complete scopes and the actual shortcut registry", () => {
    expect(new Set(SETTINGS_CATALOG.map(item => item.id)).size).toBe(SETTINGS_CATALOG.length);
    for (const item of SETTINGS_CATALOG) {
      expect(settingById(item.id)).toBe(item);
      expect(SETTING_SCOPES[item.scope].label.every(Boolean)).toBe(true);
      expect(SETTING_SCOPES[item.scope].detail.every(Boolean)).toBe(true);
    }
    expect(SETTINGS_CATALOG.filter(item => item.category === "shortcuts").map(item => item.id))
      .toEqual(COMMAND_DEFINITIONS.map(command => "shortcuts." + command.id));
    expect(settingById("agents.codex.env")?.scope).toBe("newLocal");
    expect(settingById("terminal.cursorStyle")?.scope).toBe("terminal");
    expect(settingById("dashboard.port")?.scope).toBe("nextService");
  });
});
