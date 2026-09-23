import { describe, expect, it } from "vitest";
import {
  addSessionWorkerArgs,
  availableSessionWorkerOptions,
  defaultSessionWorkerSettings,
  normalizeSessionWorkerSettings,
  sessionWorkerDeveloperInstructions,
  updateSessionWorkerSetting,
  resolveSessionWorker,
  workerEfforts,
} from "./sessionWorkers";

describe("custom worker settings", () => {
  it("keeps document and HTML models independent across serialization and launch", () => {
    const settings = { documents: { provider: "codex", model: "gpt-6-sol", effort: "xhigh" }, html: { provider: "codex", model: "gpt-6-luna", effort: "max" } };
    const normalized = normalizeSessionWorkerSettings(JSON.parse(JSON.stringify(settings)));
    expect(normalized).toEqual(settings);
    const cmd = addSessionWorkerArgs("codex", "codex", normalized, { documents: "C:/docs.toml", html: "C:/html.toml" });
    expect(cmd).toContain('agents.multiagent_docs_writer.config_file="C:/docs.toml"');
    expect(cmd).toContain('agents.multiagent_html_builder.config_file="C:/html.toml"');
    expect(cmd).toContain("model=gpt-6-sol, reasoning_effort=xhigh");
    expect(cmd).toContain("model=gpt-6-luna, reasoning_effort=max");
    expect(cmd).not.toContain("default_subagent_model");
  });
  it("resolves legacy defaults and rejects unsafe model strings or invalid efforts", () => {
    expect(resolveSessionWorker("codex-luna-max")).toEqual({ provider: "codex", model: "gpt-6-luna", effort: "max" });
    for (const model of ["", "-option", "a;evil", "a\nmodel=evil", "$(evil)"]) {
      expect(resolveSessionWorker({ provider: "codex", model, effort: "max" })).toBeUndefined();
    }
    expect(resolveSessionWorker({ provider: "codex", model: "gpt-6-luna", effort: "ultra" })).toBeUndefined();
    expect(workerEfforts("codex", "gpt-5.5")).not.toContain("max");
  });
  it("routes a custom Claude model and effort without shell interpolation", () => {
    const cmd = addSessionWorkerArgs("codex", "codex", { documents: { provider: "claude", model: "sonnet", effort: "high" } });
    expect(cmd).toContain("claude -p --model sonnet --effort high");
    expect(cmd).not.toContain("default_subagent_model");
  });
});

describe("session worker availability", () => {
  it("defaults both Codex content workers to Luna max", () => {
    expect(defaultSessionWorkerSettings("codex")).toEqual({
      documents: "codex-luna-max",
      html: "codex-luna-max",
    });
    expect(defaultSessionWorkerSettings("claude")).toBeUndefined();
  });

  it("only exposes providers enabled in Settings", () => {
    expect(availableSessionWorkerOptions([]).map((item) => item.id)).toEqual([
      "codex-luna-max",
      "claude-opus",
    ]);
    expect(
      availableSessionWorkerOptions(["claude"]).map((item) => item.id)
    ).toEqual(["codex-luna-max"]);
    expect(
      availableSessionWorkerOptions(["codex"]).map((item) => item.id)
    ).toEqual(["claude-opus"]);
    expect(availableSessionWorkerOptions(["codex", "claude"])).toEqual([]);
  });

  it("normalizes legacy or invalid stored values", () => {
    expect(normalizeSessionWorkerSettings(undefined)).toBeUndefined();
    expect(normalizeSessionWorkerSettings({ documents: "unknown" })).toBeUndefined();
    expect(
      normalizeSessionWorkerSettings({
        documents: "codex-luna-max",
        html: "claude-opus",
      })
    ).toEqual({ documents: "codex-luna-max", html: "claude-opus" });
  });

  it("removes an empty settings object", () => {
    const settings = updateSessionWorkerSetting(
      { documents: "codex-luna-max" },
      "documents",
      undefined
    );
    expect(settings).toBeUndefined();
  });
});

describe("Codex session worker arguments", () => {
  it("does not modify non-Codex or unconfigured sessions", () => {
    expect(addSessionWorkerArgs("claude", "claude", {
      documents: "claude-opus",
    })).toBe("claude");
    expect(addSessionWorkerArgs("codex", "codex", undefined)).toBe("codex");
  });

  it("adds Luna max defaults and per-session routing instructions", () => {
    const command = addSessionWorkerArgs("codex", "codex --no-alt-screen", {
      documents: "codex-luna-max",
      html: "claude-opus",
    });

    expect(command).toContain("-c 'agents.enabled=true'");
    expect(command).toContain(
      "-c 'agents.max_concurrent_threads_per_session=2'"
    );
    expect(command).toContain(
      "-c 'agents.default_subagent_model=\"gpt-6-luna\"'"
    );
    expect(command).toContain(
      "-c 'agents.default_subagent_reasoning_effort=\"max\"'"
    );
    expect(command).toContain("claude -p --model opus --effort max");
    expect(command).not.toContain("dangerously-skip-permissions");
  });

  it("keeps apostrophes out of single-quoted shell config arguments", () => {
    const instructions = sessionWorkerDeveloperInstructions({
      documents: "claude-opus",
    });
    expect(instructions).not.toContain("'");
  });
});
