import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepareLaunchCommand, mergeLaunchEnvironment } from "./agent-launch.mjs";
import { launchOptionsProblem, normalizeLaunchOptions } from "../shared/launch-options.mjs";

describe("advanced agent launch", () => {
  it("keeps legacy sessions unchanged and clones options", () => {
    expect(prepareLaunchCommand("codex resume saved --no-alt-screen", undefined)).toBe("codex resume saved --no-alt-screen");
    const input = { executable: "", args: ["--profile", "work space"], env: [{ name: "LANG", value: "" }] };
    const normalized = normalizeLaunchOptions(input);
    normalized.env[0].value = "changed";
    expect(input.env[0].value).toBe("");
    expect(normalizeLaunchOptions({ args: [""], env: [{ name: "", value: "" }] })).toBeUndefined();
  });
  it("protects account and terminal settings with case-insensitive names", () => {
    for (const name of ["CodeX_Home", "Home", "claude_config_dir", "Anthropic_Auth_Token", "NO_color", "multiagent_TOKEN"]) {
      expect(launchOptionsProblem({ env: [{ name, value: "override" }] })).toBe("envReserved");
      expect(() => mergeLaunchEnvironment({}, { env: [{ name, value: "override" }] })).toThrow("envReserved");
    }
    expect(launchOptionsProblem({ env: [{ name: "LANG", value: "" }, { name: "lang", value: "" }] })).toBe("envDuplicate");
  });
  it("rejects invalid paths, controls, and competing managed arguments", () => {
    expect(launchOptionsProblem({ executable: "relative.exe" })).toBe("path");
    expect(launchOptionsProblem({ args: ["line\rcommand"] })).toBe("args");
    expect(launchOptionsProblem({ args: ["--resume=other"] })).toBe("managedArgs");
    expect(launchOptionsProblem({ args: ["--profile", "resume-work"] })).toBeNull();
    expect(launchOptionsProblem({ args: ["-c", "cli_auth_credentials_store=keyring"] })).toBe("managedArgs");
    expect(() => prepareLaunchCommand("codex", { executable: path.join(os.tmpdir(), "missing-launch-fixture.exe") }, { shell: "pwsh.exe", toolId: "codex" })).toThrow("executable");
  });
  it("overrides Windows environment keys once without touching the parent or other sessions", () => {
    const base = { Path: "original", LANG: "en", CODEX_HOME: "account-home" };
    const first = mergeLaunchEnvironment(base, { env: [{ name: "PATH", value: "custom" }, { name: "LANG", value: "" }] }, "win32");
    expect(first).toEqual({ PATH: "custom", LANG: "", CODEX_HOME: "account-home" });
    expect(base.Path).toBe("original");
    expect(mergeLaunchEnvironment(base, undefined)).toEqual(base);
  });
  it("quotes POSIX arguments and keeps generated resume flags", () => {
    const command = prepareLaunchCommand("codex resume saved --no-alt-screen", { args: ["a'b", "$(echo bad)", "two words"] }, { toolId: "codex", shell: "/bin/bash", platform: "linux" });
    expect(command).toBe("'codex' resume saved --no-alt-screen 'a'\"'\"'b' '$(echo bad)' 'two words'");
  });
  it("quotes an automatic first prompt as one trailing argv value", () => {
    const prompt = "[Account switch handoff] inspect $(echo bad) and 'continue'";
    const command = prepareLaunchCommand("codex --no-alt-screen", undefined, {
      toolId: "codex",
      shell: "/bin/bash",
      platform: "linux",
      extraArgs: [prompt],
    });
    expect(command).toBe("'codex' --no-alt-screen '[Account switch handoff] inspect $(echo bad) and '\"'\"'continue'\"'\"''");
  });
  const detectedPowerShell = process.platform === "win32" ? spawnSync("where.exe", ["pwsh.exe"], { encoding: "utf8", windowsHide: true }).stdout?.trim().split(/\r?\n/)[0] : null;
  const shells = process.platform === "win32" ? [...new Set([
    detectedPowerShell,
    path.join(process.env.ProgramFiles || "C:/Program Files", "PowerShell/7/pwsh.exe"),
    path.join(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"),
  ].filter(file => file && fs.existsSync(file)))] : [];
  for (const shell of shells) {
    for (const shim of [false, true]) {
      it("preserves actual argv and environment in " + path.basename(shell) + (shim ? " cmd shim" : " native executable"), () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), "acedia launch &(test) '"));
        try {
          const fixture = path.join(folder, "fixture.cjs");
          fs.writeFileSync(fixture, "process.stdout.write(JSON.stringify({args:process.argv.slice(2),env:process.env.ACEDIA_LAUNCH_FIXTURE}));");
          const executable = shim ? path.join(folder, "fixture.cmd") : process.execPath;
          if (shim) fs.writeFileSync(executable, '@echo off\r\n"' + process.execPath + '" "' + fixture + '" %*\r\n');
          const expected = ["space value", "한국어", "a'b", 'model="quoted value"', "$([System.Environment]::Exit(9))", "a&b|c", "%ACEDIA_LAUNCH_FIXTURE%", "end\\", "^caret!", "semi;colon"];
          const automatic = ["[Account switch handoff] 같은 폴더의 작업을 이어서 진행하세요"];
          const generated = ["resume", "fixed-session", "--no-alt-screen", "-c", 'developer_instructions="first\\nsecond"'];
          const options = { executable, args: expected, env: [{ name: "ACEDIA_LAUNCH_FIXTURE", value: "local-only" }] };
          const command = prepareLaunchCommand("codex " + [...(shim ? [] : [fixture]), ...generated].map(x => "'" + x.replaceAll("'", "''") + "'").join(" "), options, { shell, toolId: "codex", extraArgs: automatic });
          const result = spawnSync(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command + "; exit $LASTEXITCODE"], {
            encoding: "utf8", windowsHide: true, timeout: 15000,
            env: mergeLaunchEnvironment(process.env, options),
          });
          expect(result.status, result.stderr).toBe(0);
          expect(JSON.parse(result.stdout)).toEqual({ args: [...generated, ...expected, ...automatic], env: "local-only" });
        } finally {
          if (path.dirname(folder) !== path.resolve(os.tmpdir()) || !path.basename(folder).startsWith("acedia launch ")) throw new Error("Unexpected fixture path");
          fs.rmSync(folder, { recursive: true, force: true });
        }
      });
    }
  }
});
