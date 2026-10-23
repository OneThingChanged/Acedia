import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AGENT_DEFAULTS_KEY, loadAgentDefaults, saveAgentDefaults } from "./agentDefaults";
import { NEW_SESSION_PREFERENCES_KEY, newSessionDangerous, newSessionToolId, rememberNewSession } from "./newSessionPreferences";

let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("uses enabled tool defaults until a session has been created", () => {
  expect(newSessionToolId([])).toBe("claude");
  expect(newSessionToolId(["claude"])).toBe("codex");
  saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), dangerous: true });
  expect(newSessionDangerous("codex")).toBe(true);
  expect(newSessionDangerous("claude")).toBe(false);
});

it("restores the latest provider and each provider's explicit on/off choice without changing Settings", () => {
  saveAgentDefaults("codex", { ...loadAgentDefaults("codex"), dangerous: true });
  const defaults = stored.get(AGENT_DEFAULTS_KEY);
  rememberNewSession("codex", false);
  expect(newSessionToolId([])).toBe("codex");
  expect(newSessionDangerous("codex")).toBe(false);
  rememberNewSession("claude", true);
  expect(newSessionToolId([])).toBe("claude");
  expect(newSessionDangerous("claude")).toBe(true);
  expect(newSessionDangerous("codex")).toBe(false);
  expect(stored.get(AGENT_DEFAULTS_KEY)).toBe(defaults);
  rememberNewSession("none", true);
  expect(newSessionToolId(["none"])).toBe("none");
  expect(newSessionDangerous("none")).toBe(false);
});

it("prefers a child's enabled parent and falls back when remembered tools are disabled", () => {
  rememberNewSession("codex", true);
  expect(newSessionToolId([], "claude")).toBe("claude");
  expect(newSessionToolId(["claude"], "claude")).toBe("codex");
  expect(newSessionToolId(["codex"])).toBe("claude");
  expect(newSessionToolId(["claude", "codex", "agy", "qwen", "cline"])).toBe("none");
  expect(newSessionToolId([], "retired-provider")).toBe("codex");
  expect(newSessionToolId([])).toBe("codex");
});

it.each(["codex", "claude", "qwen", "agy"])("keeps fixed Dangerous defaults above remembered overrides for %s", toolId => {
  rememberNewSession(toolId, false);
  saveAgentDefaults(toolId, { ...loadAgentDefaults(toolId), dangerousDefaultMode: "on" });
  expect(newSessionDangerous(toolId)).toBe(true);
  rememberNewSession(toolId, false);
  expect(newSessionDangerous(toolId)).toBe(true);
  saveAgentDefaults(toolId, { ...loadAgentDefaults(toolId), dangerousDefaultMode: "off" });
  rememberNewSession(toolId, true);
  expect(newSessionDangerous(toolId)).toBe(false);
  expect(newSessionDangerous("none")).toBe(false);
  saveAgentDefaults(toolId, { ...loadAgentDefaults(toolId), dangerousDefaultMode: "remember" });
  expect(newSessionDangerous(toolId)).toBe(true);
  rememberNewSession(toolId, false);
  expect(newSessionDangerous(toolId)).toBe(false);
});

it("uses legacy fallback values in remember mode without overriding fixed settings", () => {
  stored.set(AGENT_DEFAULTS_KEY, JSON.stringify({ codex: { dangerous: true }, claude: { dangerousDefaultMode: "off", dangerous: true } }));
  expect(newSessionDangerous("codex")).toBe(true);
  expect(newSessionDangerous("claude")).toBe(false);
  rememberNewSession("codex", false);
  rememberNewSession("claude", true);
  expect(newSessionDangerous("codex")).toBe(false);
  expect(newSessionDangerous("claude")).toBe(false);
});

it("ignores corrupt preferences and rejects retired tools or nonboolean permission choices", () => {
  for (const raw of ["bad JSON", "null", "[]", '{"aiToolId":"gemini","dangerousByTool":{"codex":"true"}}']) {
    stored.set(NEW_SESSION_PREFERENCES_KEY, raw);
    expect(newSessionToolId([])).toBe("claude");
    expect(newSessionDangerous("codex")).toBe(false);
  }
  rememberNewSession("codex", true);
  const before = stored.get(NEW_SESSION_PREFERENCES_KEY);
  rememberNewSession("retired-provider", true);
  expect(stored.get(NEW_SESSION_PREFERENCES_KEY)).toBe(before);
});
