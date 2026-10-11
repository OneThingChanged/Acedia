import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionModelDefaults } from "./session-model-defaults.mjs";
import { SessionModelMemory } from "./session-model-memory.mjs";
import { sessionModelArgs } from "../shared/session-model.mjs";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });
const catalog = [{ model: "custom", efforts: [{ effort: "high" }] }];
const custom = { model: "custom", effort: "high", serviceTier: "fast" };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-model-defaults-")); roots.push(root);
  const file = path.join(root, "defaults.json");
  const defaults = new SessionModelDefaults(file);
  const memoryFile = path.join(root, "memory.json");
  const memory = new SessionModelMemory(memoryFile, { defaultSettings: args => defaults.get(args.aiToolId).settings });
  return { root, file, defaults, memory, memoryFile, args: { id: "a", aiToolId: "codex", cwd: root } };
}

describe("Acedia model defaults", () => {
  it("launches an unconfigured local session with explicit app defaults", () => {
    const f = fixture();
    const settings = f.memory.resolve(f.args).settings;
    expect(settings).toEqual({ model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "default" });
    expect(sessionModelArgs(settings)).toEqual(["--model", "gpt-6.1-sol", "-c", 'model_reasoning_effort="xhigh"', "-c", 'service_tier="default"', "-c", "features.fast_mode=true"]);
    const claude = f.memory.resolve({ ...f.args, aiToolId: "claude" }).settings;
    expect(sessionModelArgs(claude, undefined, "claude")).toEqual(["--model", "sonnet", "--effort", "medium"]);
  });
  it("persists provider defaults across host reloads and does not share mutable references", () => {
    const f = fixture();
    f.defaults.save("codex", custom, 0, catalog);
    f.defaults.save("claude", { model: "custom" }, 1, catalog);
    const restored = new SessionModelDefaults(f.file);
    expect(restored.get("codex")).toEqual({ settings: custom, revision: 2 });
    expect(restored.get("claude").settings).toEqual({ model: "custom" });
    restored.get("codex").settings.model = "mutated";
    expect(restored.get("codex").settings).toEqual(custom);
  });
  it("uses updated defaults for new sessions while remembered terminal selections survive a restart", () => {
    const f = fixture(); const resolved = f.memory.resolve(f.args);
    const entry = { ...f.args, modelSettings: resolved.settings, configuredModelSettings: resolved.requested };
    f.memory.started(entry);
    entry.runtimeModelSettings = { model: "terminal-choice", effort: "low", serviceTier: "default" };
    f.memory.remember(entry);
    f.defaults.save("codex", custom, 0, catalog);
    const reopened = new SessionModelMemory(f.memoryFile, { defaultSettings: args => new SessionModelDefaults(f.file).get(args.aiToolId).settings });
    expect(reopened.resolve(f.args).settings).toEqual(entry.runtimeModelSettings);
    expect(reopened.resolve({ ...f.args, id: "new-session" }).settings).toEqual(custom);
    expect(reopened.resolve({ ...f.args, modelSettings: { model: "explicit" } }).settings).toEqual({ model: "explicit", serviceTier: "default" });
  });
  it("resetting a session uses the app fallback instead of the previous selection", () => {
    const f = fixture(); f.memory.started({ ...f.args, modelSettings: custom });
    f.memory.stage(f.args, null);
    expect(f.memory.resolve({ ...f.args, modelSettings: custom }).settings).toEqual(f.defaults.get("codex").settings);
  });
  it("excludes SSH and unrelated providers, and respects advanced model/Fast overrides", () => {
    const f = fixture();
    for (const extra of [{ ssh: {} }, { sshHostId: "host" }, { aiToolId: "shell" }]) {
      expect(f.memory.resolve({ ...f.args, ...extra }).settings).toBeUndefined();
    }
    const defaultSettings = vi.fn(() => { throw Error("must not read defaults"); });
    const memory = new SessionModelMemory(f.memoryFile, { defaultSettings });
    expect(memory.resolve({ ...f.args, launchOptions: { args: ["--model", "advanced"] } }).settings).toBeUndefined();
    expect(defaultSettings).not.toHaveBeenCalled();
    const options = { args: ["-c", 'service_tier="fast"'] };
    const settings = f.memory.resolve({ ...f.args, launchOptions: options }).settings;
    expect(settings).toEqual({ model: "gpt-6.1-sol", effort: "xhigh" });
    expect(() => sessionModelArgs(settings, options)).not.toThrow();
  });
  it("rejects stale saves and unsupported model, effort, provider or tier without changing preferences", () => {
    const f = fixture(); f.defaults.save("codex", custom, 0, catalog);
    const original = fs.readFileSync(f.file, "utf8");
    for (const [provider, settings, revision] of [
      ["codex", custom, 0], ["codex", { ...custom, model: "missing" }, 1], ["codex", { ...custom, effort: "max" }, 1],
      ["claude", custom, 1], ["codex", { ...custom, serviceTier: "unknown" }, 1], ["shell", custom, 1],
    ]) expect(() => f.defaults.save(provider, settings, revision, catalog)).toThrow();
    expect(fs.readFileSync(f.file, "utf8")).toBe(original);
  });
  it("reports unreadable preferences and preserves the damaged file", () => {
    const f = fixture(); fs.writeFileSync(f.file, "broken"); const onError = vi.fn();
    const defaults = new SessionModelDefaults(f.file, { onError });
    expect(() => defaults.get("codex")).toThrow("저장 파일");
    expect(() => defaults.save("codex", custom, 0, catalog)).toThrow();
    expect(fs.readFileSync(f.file, "utf8")).toBe("broken"); expect(onError).toHaveBeenCalledOnce();
  });
  it("keeps the previous in-memory default if writing the new file fails", () => {
    const f = fixture(); const target = path.join(f.root, "directory"); fs.mkdirSync(target); f.defaults.file = target;
    const before = f.defaults.get("codex");
    expect(() => f.defaults.save("codex", custom, 0, catalog)).toThrow();
    expect(f.defaults.get("codex")).toEqual(before);
  });
});
