import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionModelMemory, nativeCodexModel, updateNativeSessionModel } from "./session-model-memory.mjs";
import { normalizeSessionModel, sessionModelArgs } from "../shared/session-model.mjs";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-model-memory-")); roots.push(root);
  const file = path.join(root, "session-model-memory.json");
  const memory = new SessionModelMemory(file);
  const args = { id: "session-a", aiToolId: "codex", codexAccountId: "account-a", cwd: root };
  const start = (settings, configured) => {
    const entry = { ...args, modelSettings: settings, configuredModelSettings: configured };
    memory.started(entry); return entry;
  };
  return { root, file, memory, args, start };
}

describe("per-session native model memory", () => {
  it("remembers a routed /model change with inline Fast before another turn and keeps it while the footer is hidden", () => {
    const f = fixture();
    let viewport = "";
    const old = { model: "gpt-5.6-luna", effort: "max", serviceTier: "priority" };
    const entry = { ...f.args, modelSettings: old, filter: { viewportText: () => viewport } };
    updateNativeSessionModel(entry, old); f.memory.started(entry);
    viewport = "› Ask Codex to do anything\nGPT-5.6-Luna max fast · G:\\Project";
    f.memory.remember(entry);
    viewport = "› Ask Codex to do anything\nGPT-6.1-Sol xhigh fast · G:\\Project";
    f.memory.remember(entry);
    // Closing while a popup or a running command hides the footer must not
    // bring the thread's original model back into the saved metadata.
    viewport = "Choose a model\nGPT-5.6-Luna max fast · G:\\Project";
    f.memory.remember(entry);
    expect(new SessionModelMemory(f.file).resolve(f.args).settings)
      .toEqual({ model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "priority" });
  });

  it("keeps a new native notification ahead of the old footer until the TUI redraws", () => {
    const f = fixture();
    let viewport = "› Ask Codex\nGPT-5.6-Luna max fast · G:\\Project";
    const old = { model: "gpt-5.6-luna", effort: "max", serviceTier: "priority" };
    const next = { model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "priority" };
    const entry = { ...f.args, modelSettings: old, filter: { viewportText: () => viewport } };
    updateNativeSessionModel(entry, old); f.memory.started(entry);
    updateNativeSessionModel(entry, next); f.memory.remember(entry);
    expect(f.memory.resolve(f.args).settings).toEqual(next);
    viewport = "› Ask Codex\nGPT-6.1-Sol xhigh fast · G:\\Project";
    f.memory.remember(entry);
    expect(f.memory.resolve(f.args).settings).toEqual(next);
    viewport = "› Ask Codex\nGPT-6.1-Sol high · G:\\Project · Standard";
    f.memory.remember(entry);
    expect(f.memory.resolve(f.args).settings).toEqual({ model: "gpt-6.1-sol", effort: "high", serviceTier: "default" });
  });

  it("reconciles a routed snapshot with an already visible current footer after the repaint wait", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const f = fixture();
    let viewport = "› Ask Codex\nGPT-6.1-Sol xhigh fast · G:\\Project";
    const old = { model: "gpt-5.6-luna", effort: "max", serviceTier: "priority" };
    const actual = { model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "priority" };
    const entry = { ...f.args, modelSettings: old, filter: { viewportText: () => viewport } };
    try {
      updateNativeSessionModel(entry, old); f.memory.started(entry);
      // The unchanged footer was already current when the routed snapshot
      // arrived. Waiting for another repaint must not freeze Luna forever.
      clock.mockReturnValue(10_500);
      expect(f.memory.remember(entry)).toEqual(old);
      clock.mockReturnValue(14_500);
      updateNativeSessionModel(entry, old);
      clock.mockReturnValue(15_000);
      expect(f.memory.remember(entry)).toEqual(actual);
      viewport = "Choose a model";
      expect(f.memory.remember(entry)).toEqual(actual);
      expect(new SessionModelMemory(f.file).resolve(f.args).settings).toEqual(actual);
    } finally { clock.mockRestore(); }
  });

  it("bounds the repaint wait without letting an older transcript replace an invisible native footer", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const f = fixture();
    let viewport = "› Ask Codex\nGPT-5.6-Luna max fast · G:\\Project";
    const old = { model: "gpt-5.6-luna", effort: "max", serviceTier: "priority" };
    const actual = { model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "priority" };
    const entry = { ...f.args, modelSettings: old, filter: { viewportText: () => viewport } };
    try {
      updateNativeSessionModel(entry, actual); f.memory.started(entry);
      clock.mockReturnValue(10_500);
      expect(f.memory.remember(entry, old)).toEqual(actual);
      viewport = "Choose a model";
      clock.mockReturnValue(15_000);
      expect(f.memory.remember(entry, old)).toEqual(actual);
    } finally { clock.mockRestore(); }
  });

  it("restores terminal changes after closing and reloading the app profile", () => {
    const f = fixture();
    const original = { model: "gpt-6-sol", effort: "low" };
    const last = { model: "gpt-6-astra", effort: "max", serviceTier: "fast" };
    const entry = f.start(original, original);
    entry.runtimeModelSettings = last; f.memory.remember(entry);
    const reopened = new SessionModelMemory(f.file);
    expect(reopened.resolve({ ...f.args, modelSettings: original }).settings).toEqual(last);
    expect(reopened.resolve({ ...f.args, id: "another-session", modelSettings: original }).settings).toEqual(original);
    expect(fs.readFileSync(f.file, "utf8")).not.toMatch(/prompt|accessToken|auth/);
  });

  it.each([null, "default", "fast"])("retains a known tier when a later transcript omits it (%s)", serviceTier => {
    const f = fixture();
    const original = { model: "old", effort: "high", serviceTier };
    const entry = f.start(original, original);
    f.memory.remember(entry, { model: "new", effort: "max" });
    expect(f.memory.resolve({ ...f.args, modelSettings: entry.modelSettings }).settings).toEqual({ model: "new", effort: "max", serviceTier });
  });

  it("records Fast turning off explicitly, and native settings outrank an older transcript", () => {
    const f = fixture(); const original = { model: "one", effort: "high", serviceTier: "fast" };
    const entry = f.start(original, original);
    entry.runtimeModelSettings = { model: "one", effort: "low", serviceTier: null };
    f.memory.remember(entry, { model: "outdated", effort: "max", serviceTier: "fast" });
    expect(f.memory.resolve({ ...f.args, modelSettings: entry.modelSettings }).settings).toEqual(entry.runtimeModelSettings);
    expect(sessionModelArgs(entry.runtimeModelSettings)).toContain('service_tier="default"');
  });

  it("does not restore the old explicit effort after native settings return to the default", () => {
    const f = fixture(); const configured = { model: "one", effort: "high", serviceTier: "fast" };
    const entry = f.start(configured, configured);
    entry.runtimeModelSettings = { model: "one", serviceTier: "fast" }; f.memory.remember(entry);
    expect(new SessionModelMemory(f.file).resolve({ ...f.args, modelSettings: configured }).settings)
      .toEqual({ model: "one", serviceTier: "fast" });
  });

  it("retains Claude effort when its transcript resolves an alias but does not report effort", () => {
    const f = fixture(); const args = { ...f.args, aiToolId: "claude", claudeAccountId: "claude-a" };
    const configured = { model: "opus", effort: "max" };
    const entry = { ...args, modelSettings: configured, configuredModelSettings: configured };
    f.memory.started(entry); f.memory.remember(entry, { model: "claude-opus-full-id" });
    expect(new SessionModelMemory(f.file).resolve({ ...args, modelSettings: configured }).settings)
      .toEqual({ model: "claude-opus-full-id", effort: "max" });
  });

  it("a new app model wins while retaining Fast, and an explicit default effort removes the old effort", () => {
    const f = fixture(); const old = { model: "one", effort: "max", serviceTier: "fast" };
    const entry = f.start(old);
    expect(f.memory.resolve({ ...f.args, modelSettings: { model: "two", effort: "low" } }).settings)
      .toEqual({ model: "two", effort: "low", serviceTier: "fast" });
    f.memory.stage(f.args, { model: "one" }); f.memory.remember(entry);
    expect(f.memory.resolve({ ...f.args, modelSettings: old }).settings).toEqual({ model: "one", serviceTier: "fast" });
  });

  it("saving the next selection during work survives the old process's final capture", () => {
    const f = fixture(); const entry = f.start({ model: "one", effort: "low" });
    f.memory.stage(f.args, { model: "two", effort: "max" });
    entry.runtimeModelSettings = { model: "one", effort: "high", serviceTier: "fast" };
    f.memory.remember(entry);
    const restored = new SessionModelMemory(f.file);
    const resolved = restored.resolve({ ...f.args, modelSettings: entry.modelSettings });
    expect(resolved.settings).toEqual({ model: "two", effort: "max", serviceTier: "fast" });
    restored.started({ ...f.args, modelSettings: resolved.settings, configuredModelSettings: resolved.requested, modelMemoryToken: resolved.token });
    expect(restored.record(f.args)).not.toHaveProperty("next");
  });

  it("an explicit CLI default reset is not replaced by the old model", () => {
    const f = fixture(); f.start({ model: "one", effort: "max", serviceTier: "fast" });
    f.memory.stage(f.args, null);
    expect(f.memory.resolve({ ...f.args, modelSettings: { model: "one", effort: "max", serviceTier: "fast" } }).settings).toBeUndefined();
  });

  it("keeps a sleeping child's next selection when its renderer folder differs from the inherited launch folder", () => {
    const f = fixture(); const configured = { model: "one", effort: "low", serviceTier: "fast" };
    const entry = f.start(configured, configured);
    entry.runtimeModelSettings = { model: "two", effort: "max", serviceTier: "fast" }; f.memory.remember(entry);
    f.memory.stage({ ...f.args, cwd: os.homedir() }, configured);
    // A closing old PTY must not replace the explicit user request.
    f.memory.remember(entry);
    const next = new SessionModelMemory(f.file).resolve({ ...f.args, modelSettings: configured });
    expect(next.settings).toEqual(configured); expect(next.token).toBeTruthy();
    expect(f.memory.lastSettings({ ...f.args, cwd: os.homedir() })).toEqual(entry.runtimeModelSettings);
    expect(f.memory.lastSettings({ ...f.args, codexAccountId: "different" })).toBeUndefined();
    expect(f.memory.resolve({ ...f.args, codexAccountId: "different" }).settings).toBeUndefined();
  });

  it("does not consume a newer selection when an earlier launch finishes", () => {
    const f = fixture(); f.start({ model: "one" });
    f.memory.stage(f.args, { model: "two" }); const first = f.memory.resolve(f.args);
    f.memory.stage(f.args, { model: "three", effort: "high" });
    f.memory.started({ ...f.args, modelSettings: first.settings, configuredModelSettings: first.requested, modelMemoryToken: first.token });
    expect(f.memory.resolve(f.args).settings).toEqual({ model: "three", effort: "high" });
  });

  it("rolls back a rejected selection without undoing a newer request", () => {
    const f = fixture(); f.start({ model: "one", serviceTier: "fast" });
    const rejected = f.memory.stage(f.args, { model: "two" }); f.memory.rollback(rejected);
    expect(f.memory.resolve(f.args).settings).toEqual({ model: "one", serviceTier: "fast" });
    const earlier = f.memory.stage(f.args, { model: "two" }); f.memory.stage(f.args, { model: "three" });
    f.memory.rollback(earlier);
    expect(f.memory.resolve(f.args).settings).toEqual({ model: "three", serviceTier: "fast" });
  });

  it("never restores another provider, account, folder, SSH or shell session", () => {
    const f = fixture(); f.start({ model: "one", effort: "max", serviceTier: "fast" }, undefined);
    for (const extra of [{ aiToolId: "claude" }, { codexAccountId: "account-b" }, { cwd: os.homedir() }, { ssh: {} }, { sshHostId: "remote" }, { aiToolId: "shell" }]) {
      expect(f.memory.resolve({ ...f.args, ...extra }).settings).toBeUndefined();
    }
    const localClaude = { ...f.args, aiToolId: "claude", claudeAccountId: "claude-a" };
    f.memory.started({ ...localClaude, modelSettings: { model: "opus", effort: "high" } });
    expect(f.memory.resolve(localClaude).settings).toEqual({ model: "opus", effort: "high" });
  });

  it.each([["--model", "custom"], ["-c", 'model="custom"'], ["--config=model_reasoning_effort=\"low\""]])("respects explicit advanced model overrides (%j)", (...args) => {
    const f = fixture(); f.start({ model: "one", effort: "max", serviceTier: "fast" });
    expect(f.memory.resolve({ ...f.args, launchOptions: { args } }).settings).toBeUndefined();
  });

  it.each([["-c", 'service_tier="default"'], ["--disable", "fast_mode"], ["--config=features.fast_mode=false"]])("respects explicit advanced speed overrides (%j)", (...args) => {
    const f = fixture(); f.start({ model: "one", effort: "high", serviceTier: "fast" });
    expect(f.memory.resolve({ ...f.args, launchOptions: { args } }).settings).toEqual({ model: "one", effort: "high" });
  });

  it("rejects unreadable saved data before launching, without overwriting the file", () => {
    const f = fixture(); fs.writeFileSync(f.file, "{broken"); const onError = vi.fn();
    const memory = new SessionModelMemory(f.file, { onError });
    expect(() => memory.resolve(f.args)).toThrow("저장 파일"); expect(onError).toHaveBeenCalledOnce();
    expect(fs.readFileSync(f.file, "utf8")).toBe("{broken");
  });

  it("does not leave a failed save staged in memory", () => {
    const f = fixture(); f.start({ model: "one" });
    // Use an explicitly checked temporary fixture target, never a user's file.
    const file = path.join(f.root, "unwritable-target"); fs.mkdirSync(file); f.memory.file = file;
    expect(() => f.memory.stage(f.args, { model: "two" })).toThrow();
    expect(f.memory.resolve(f.args).settings).toEqual({ model: "one" });
  });
});

describe("native Codex footer observation", () => {
  const entry = text => ({ aiToolId: "codex", filter: { viewportText: () => text } });
  it.each([["fast", "fast"], ["ultrafast", "ultrafast"], ["standard", "default"], ["(fast)", "fast"]])("reads inline %s next to effort", (label, serviceTier) => {
    expect(nativeCodexModel(entry(`› Ask Codex to do anything\nGPT-6.1-Sol xhigh ${label} · G:\\Project`)))
      .toEqual({ model: "gpt-6.1-sol", effort: "xhigh", serviceTier });
  });
  it("reads the current composer footer before the next turn exists", () => {
    expect(nativeCodexModel(entry("Assistant text\n› Ask Codex to do anything\nGPT-6-Astra max · G:\\Project · Fast")))
      .toEqual({ model: "gpt-6-astra", effort: "max", serviceTier: "fast" });
    expect(nativeCodexModel(entry("› Ask Codex\ngpt-6-sol high · C:\\Fast\\project")))
      .toEqual({ model: "gpt-6-sol", effort: "high" });
  });
  it("rejects text outside a native footer and excludes SSH", () => {
    expect(nativeCodexModel(entry("gpt-6-astra max · Fast\nThis is assistant prose"))).toBeUndefined();
    expect(nativeCodexModel(entry("gpt-6-astra max · Fast\n› Ask Codex to do anything\nTyping prompt..."))).toBeUndefined();
    expect(nativeCodexModel({ ...entry("› Ask Codex\ngpt-6-sol high · Fast"), ssh: {} })).toBeUndefined();
  });
  it("prefers the actual footer below a multiline draft containing model-looking text", () => {
    expect(nativeCodexModel(entry("› Compare these models\ngpt-6-astra max · Fast\nmore draft text\nmore draft text\nmore draft text\n\ngpt-6-sol low · C:\\Project · Standard")))
      .toEqual({ model: "gpt-6-sol", effort: "low", serviceTier: "default" });
  });
  it("drops undefined and rejects invalid speed values", () => {
    expect(normalizeSessionModel({ model: "one", serviceTier: undefined })).toEqual({ model: "one" });
    expect(normalizeSessionModel({ model: "one", serviceTier: true })).toBeUndefined();
    expect(normalizeSessionModel({ model: "one", serviceTier: "fast\n-c bad" })).toBeUndefined();
  });
});
