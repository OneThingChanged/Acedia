import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_DEFAULTS_KEY, loadAgentDefaults, normalizeAgentDefaults, saveAgentDefaults } from "./agentDefaults";
import { buildNewProjectWithFirstAgent } from "./projectCreation";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  return data;
}
describe("per-tool new session defaults", () => {
  it("retains existing defaults on missing or corrupt preferences", () => {
    const data = storage();
    expect(loadAgentDefaults("codex")).toMatchObject({ dangerous: false, useAltScreen: false, codexAccountId: "default", workerSettings: { documents: "codex-luna-max", html: "codex-luna-max" } });
    data.set(AGENT_DEFAULTS_KEY, "bad JSON");
    expect(loadAgentDefaults("claude").dangerous).toBe(false);
  });
  it("persists explicit disabled workers and isolates tool settings", () => {
    storage();
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), dangerous: true, useAltScreen: true, workerSettings: undefined });
    saveAgentDefaults("claude", { ...loadAgentDefaults("claude"), dangerous: false });
    expect(loadAgentDefaults("codex")).toMatchObject({ dangerous: true, useAltScreen: true, workerSettings: undefined });
    expect(loadAgentDefaults("claude").dangerous).toBe(false);
  });
  it("ignores unsupported fields and malformed account identifiers", () => {
    expect(normalizeAgentDefaults("cline", { dangerous: true, useAltScreen: true, codexAccountId: "../bad" })).toMatchObject({ dangerous: false, useAltScreen: false, codexAccountId: "default", workerSettings: undefined });
    expect(normalizeAgentDefaults("codex", { dangerous: "true" }).dangerous).toBe(false);
  });
  it("keeps explicit creation overrides including disabled workers", () => {
    storage();
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), useAltScreen: true });
    const { agent } = buildNewProjectWithFirstAgent({ name: "P", folder: "project", aiToolId: "codex", dangerous: false, useAltScreen: false, workerSettings: undefined }, { createId: () => "id" });
    expect(agent.useAltScreen).toBe(false);
    expect(agent.workerSettings).toBeUndefined();
  });
  it("reports failed writes instead of silently showing unsaved preferences", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw Error("quota"); } });
    expect(() => saveAgentDefaults("codex", loadAgentDefaults("codex"))).toThrow("quota");
  });
});
