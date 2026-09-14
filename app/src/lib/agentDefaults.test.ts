import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_DEFAULTS_KEY, loadAgentDefaults, normalizeAgentDefaults, saveAgentDefaults } from "./agentDefaults";
import { buildNewProjectWithFirstAgent } from "./projectCreation";
import { loadStoredAgents } from "./persistence";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  return data;
}
describe("per-tool new session defaults", () => {
  it("persists Gemini launch defaults and keeps unsupported integrations disabled", () => {
    storage();
    expect(loadAgentDefaults("gemini").dangerous).toBe(false);
    saveAgentDefaults("gemini", { ...loadAgentDefaults("gemini"), dangerous: true, useAltScreen: true });
    expect(loadAgentDefaults("gemini")).toMatchObject({ dangerous: true, useAltScreen: false, workerSettings: undefined });
    const { agent } = buildNewProjectWithFirstAgent({ name: "Gemini", folder: "project", aiToolId: "gemini", dangerous: false });
    expect(agent.aiToolId).toBe("gemini");
    expect(agent.dangerous).toBe(false);
  });
  it("snapshots advanced options on creation and restores them independently from later defaults", () => {
    storage();
    const launchOptions = { executable: "", args: ["--profile", "work space"], env: [{ name: "LANG", value: "ko_KR.UTF-8" }] };
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), launchOptions });
    const payload = { name: "P", folder: "project", aiToolId: "codex", dangerous: false };
    const { project, agent } = buildNewProjectWithFirstAgent(payload);
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), launchOptions: undefined });
    expect(agent.launchOptions).toEqual(launchOptions);
    expect(loadStoredAgents([JSON.parse(JSON.stringify(agent))], [project])[0].launchOptions).toEqual(launchOptions);
    expect(loadAgentDefaults("claude").launchOptions).toBeUndefined();
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), launchOptions });
    expect(buildNewProjectWithFirstAgent({ ...payload, launchOptions: undefined }).agent.launchOptions).toBeUndefined();
    expect(buildNewProjectWithFirstAgent({ ...payload, sshHostId: "remote" }).agent.launchOptions).toBeUndefined();
    expect(buildNewProjectWithFirstAgent({ ...payload, aiToolId: "none" }).agent.launchOptions).toBeUndefined();
    const { launchOptions: _ignored, ...legacy } = agent;
    expect(loadStoredAgents([legacy], [project])[0].launchOptions).toBeUndefined();
  });
  it("refuses invalid advanced defaults without overwriting saved data", () => {
    storage();
    const before = loadAgentDefaults("codex");
    saveAgentDefaults("codex", before);
    expect(() => saveAgentDefaults("codex", { ...before, launchOptions: { executable: "", args: [], env: [{ name: "CODEX_HOME", value: "bad" }] } })).toThrow("envReserved");
    expect(loadAgentDefaults("codex")).toEqual(before);
  });
  it("persists Claude account defaults and excludes them from SSH project launches", () => {
    storage();
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    saveAgentDefaults("claude", { ...loadAgentDefaults("claude"), claudeAccountId: accountId });
    expect(loadAgentDefaults("claude").claudeAccountId).toBe(accountId);
    expect(loadAgentDefaults("codex").claudeAccountId).toBe("default");
    const payload = { name: "P", folder: "project", aiToolId: "claude", dangerous: false, claudeAccountId: accountId };
    expect(buildNewProjectWithFirstAgent(payload).agent.claudeAccountId).toBe(accountId);
    expect(buildNewProjectWithFirstAgent({ ...payload, sshHostId: "server" }).agent.claudeAccountId).toBeUndefined();
    expect(normalizeAgentDefaults("claude", { claudeAccountId: "../bad" }).claudeAccountId).toBe("default");
  });
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
