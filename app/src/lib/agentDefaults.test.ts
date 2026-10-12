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
  it("defaults to automatic account selection and preserves explicitly saved modes", () => {
    storage();
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(loadAgentDefaults("codex")).toMatchObject({ codexSessionAccountMode: "automatic", codexPoolAccountId: "" });
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), codexSessionAccountMode: "automatic", codexPoolAccountId: accountId });
    expect(loadAgentDefaults("codex")).toMatchObject({ codexSessionAccountMode: "automatic", codexPoolAccountId: accountId });
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), codexSessionAccountMode: "manual" });
    expect(loadAgentDefaults("codex")).toMatchObject({ codexSessionAccountMode: "manual", codexPoolAccountId: accountId });
    expect(loadAgentDefaults("claude")).toMatchObject({ codexSessionAccountMode: "manual", codexPoolAccountId: "" });
    expect(normalizeAgentDefaults("codex", { codexSessionAccountMode: "bad", codexPoolAccountId: "../bad" }))
      .toMatchObject({ codexSessionAccountMode: "automatic", codexPoolAccountId: "" });
    expect(normalizeAgentDefaults("codex", { dangerous: true }).codexSessionAccountMode).toBe("automatic");
  });
  it("snapshots the automatic pool default on creation, keeps overrides, and excludes SSH", () => {
    storage();
    const accountId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), codexSessionAccountMode: "automatic", codexPoolAccountId: accountId });
    const payload = { name: "P", folder: "project", aiToolId: "codex", dangerous: false };
    const { project, agent } = buildNewProjectWithFirstAgent(payload);
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), codexPoolAccountId: "" });
    expect(loadStoredAgents([JSON.parse(JSON.stringify(agent))], [project])[0].codexPoolAccountId).toBe(accountId);
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), codexPoolAccountId: accountId });
    expect(buildNewProjectWithFirstAgent({ ...payload, codexPoolAccountId: "" }).agent.codexPoolAccountId).toBeUndefined();
    expect(buildNewProjectWithFirstAgent({ ...payload, sshHostId: "remote" }).agent.codexPoolAccountId).toBeUndefined();
    expect(buildNewProjectWithFirstAgent({ ...payload, aiToolId: "claude" }).agent.codexPoolAccountId).toBeUndefined();
  });
  it("persists Antigravity launch defaults and keeps unsupported integrations disabled", () => {
    storage();
    expect(loadAgentDefaults("agy").dangerous).toBe(false);
    saveAgentDefaults("agy", { ...loadAgentDefaults("agy"), dangerous: true, useAltScreen: true });
    expect(loadAgentDefaults("agy")).toMatchObject({ dangerous: true, useAltScreen: false });
    const { agent } = buildNewProjectWithFirstAgent({ name: "Antigravity", folder: "project", aiToolId: "agy", dangerous: false });
    expect(agent.aiToolId).toBe("agy");
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
    expect(loadAgentDefaults("codex")).toMatchObject({ dangerous: false, useAltScreen: false, codexAccountId: "default" });
    data.set(AGENT_DEFAULTS_KEY, "bad JSON");
    expect(loadAgentDefaults("claude").dangerous).toBe(false);
  });
  it("persists launch defaults and isolates tool settings", () => {
    storage();
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), dangerous: true, useAltScreen: true });
    saveAgentDefaults("claude", { ...loadAgentDefaults("claude"), dangerous: false });
    expect(loadAgentDefaults("codex")).toMatchObject({ dangerous: true, useAltScreen: true });
    expect(loadAgentDefaults("claude").dangerous).toBe(false);
  });
  it("ignores unsupported fields and malformed account identifiers", () => {
    expect(normalizeAgentDefaults("cline", { dangerous: true, useAltScreen: true, codexAccountId: "../bad" })).toMatchObject({ dangerous: false, useAltScreen: false, codexAccountId: "default" });
    expect(normalizeAgentDefaults("codex", { dangerous: "true" }).dangerous).toBe(false);
  });
  it("keeps explicit creation overrides", () => {
    storage();
    saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), useAltScreen: true });
    const { agent } = buildNewProjectWithFirstAgent({ name: "P", folder: "project", aiToolId: "codex", dangerous: false, useAltScreen: false }, { createId: () => "id" });
    expect(agent.useAltScreen).toBe(false);
    expect(agent).not.toHaveProperty("workerSettings");
  });
  it("drops retired worker settings while preserving saved accounts and launch options", () => {
    const data = storage();
    const legacy = { dangerous: true, useAltScreen: true, workerSettings: { documents: "codex-luna-max", html: "claude-opus" } };
    data.set(AGENT_DEFAULTS_KEY, JSON.stringify({ codex: legacy }));
    const defaults = loadAgentDefaults("codex");
    expect(defaults).not.toHaveProperty("workerSettings");
    saveAgentDefaults("codex", defaults);
    expect(JSON.parse(data.get(AGENT_DEFAULTS_KEY)!).codex).not.toHaveProperty("workerSettings");
    const { project, agent } = buildNewProjectWithFirstAgent({ name: "P", folder: "project", aiToolId: "codex", ...legacy });
    expect(agent).not.toHaveProperty("workerSettings");
    const raw = { ...agent, workerSettings: legacy.workerSettings };
    const stored = loadStoredAgents([raw], [project])[0];
    expect(stored).not.toHaveProperty("workerSettings");
    expect(stored).toMatchObject({ dangerous: true, useAltScreen: true, codexAccountId: agent.codexAccountId });
  });
  it("reports failed writes instead of silently showing unsaved preferences", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw Error("quota"); } });
    expect(() => saveAgentDefaults("codex", loadAgentDefaults("codex"))).toThrow("quota");
  });
});
