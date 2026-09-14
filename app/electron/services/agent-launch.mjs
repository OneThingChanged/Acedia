import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { launchOptionsProblem, normalizeLaunchOptions } from "../shared/launch-options.mjs";

export function mergeLaunchEnvironment(base, raw, platform = process.platform) {
  const problem = launchOptionsProblem(raw);
  if (problem) throw new Error("Invalid advanced launch settings: " + problem);
  const env = { ...base };
  for (const item of normalizeLaunchOptions(raw)?.env ?? []) {
    if (platform === "win32") {
      for (const key of Object.keys(env)) {
        if (key.toUpperCase() === item.name.toUpperCase()) delete env[key];
      }
    }
    Object.defineProperty(env, item.name, { value: item.value, enumerable: true, writable: true, configurable: true });
  }
  return env;
}

function splitGeneratedCommand(command) {
  const result = [];
  let current = "", quote = "";
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (quote) {
      if (char === "'" && quote === "'" && command[index + 1] === "'") { current += "'"; index++; }
      else if (char === quote) quote = "";
      else current += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (/\s/.test(char)) {
      if (current) result.push(current);
      current = "";
    } else current += char;
  }
  if (quote) throw new Error("Invalid generated launch command.");
  if (current) result.push(current);
  return result;
}

// Encode one argv value for the Windows process command line.
function windowsArgument(value) {
  let result = '"', slashes = 0;
  for (const char of value) {
    if (char === "\\") { slashes++; continue; }
    result += "\\".repeat(char === '"' ? slashes * 2 + 1 : slashes) + char;
    slashes = 0;
  }
  return result + "\\".repeat(slashes * 2) + '"';
}

function cmdEscape(value) {
  const meta = '()[]%!^"\x60<>&|;, *?';
  return [...value].map(char => meta.includes(char) ? "^" + char : char).join("");
}

export function prepareLaunchCommand(command, raw, { shell, platform = process.platform, toolId, env = process.env, extraArgs = [] } = {}) {
  const options = normalizeLaunchOptions(raw);
  if (!options && extraArgs.length === 0) return command;
  const problem = launchOptionsProblem(options);
  if (problem) throw new Error("Invalid advanced launch settings: " + problem);
  if (!["codex", "claude", "agy", "qwen", "cline"].includes(toolId)) {
    throw new Error("Advanced launch settings require an agent CLI.");
  }
  if (options?.executable) {
    if (!path.isAbsolute(options.executable) || !fs.statSync(options.executable, { throwIfNoEntry: false })?.isFile()) {
      throw new Error("CLI 실행 파일을 찾을 수 없습니다. CLI executable was not found.");
    }
  }
  const runtimeArgs = [...(options?.args ?? []), ...extraArgs];
  if (!options?.executable && runtimeArgs.length === 0) return command;
  const isPowerShell = /^(?:pwsh|powershell)(?:\.exe)?$/i.test(path.basename(shell || ""));
  if (platform === "win32" && !isPowerShell) {
    throw new Error("고급 실행 설정에는 PowerShell이 필요합니다. Advanced launch settings require PowerShell.");
  }
  const quote = isPowerShell
    ? value => "'" + value.replaceAll("'", "''") + "'"
    : value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const match = command.match(/^(\S+)([\s\S]*)$/);
  if (!match || match[1] !== toolId) throw new Error("Unexpected agent launch command.");
  let executable = options?.executable || match[1];
  if (platform === "win32") {
    if (!options?.executable) {
      const result = spawnSync(path.join(process.env.SystemRoot || "C:/Windows", "System32/where.exe"), [toolId], {
        env, encoding: "utf8", windowsHide: true, timeout: 5000,
      });
      executable = result.stdout?.split(/\r?\n/).map(line => line.trim()).find(file => /\.(?:exe|com|cmd|bat|ps1)$/i.test(file));
      if (!executable) throw new Error("CLI 실행 파일을 찾을 수 없습니다. CLI executable was not found.");
    }
    const generated = splitGeneratedCommand(command);
    const argv = [...generated.slice(1), ...runtimeArgs];
    let argumentsString;
    if (/\.(?:cmd|bat)$/i.test(executable)) {
      // A batch launcher parses its forwarded argv a second time.
      const line = cmdEscape(path.normalize(executable)) + " " + argv.map(arg => cmdEscape(cmdEscape(windowsArgument(arg)))).join(" ");
      argumentsString = '/d /v:off /s /c "' + line + '"';
      executable = path.join(process.env.SystemRoot || "C:/Windows", "System32/cmd.exe");
      if (argumentsString.length > 8000) throw new Error("CLI .cmd arguments exceed the Windows command-line limit.");
    } else if (/\.ps1$/i.test(executable)) {
      argumentsString = ["-NoLogo", "-NoProfile", "-File", executable, ...argv].map(windowsArgument).join(" ");
      executable = shell;
    } else {
      if (!/\.(exe|com)$/i.test(executable)) throw new Error("Choose a CLI .exe, .com, .cmd, .bat, or .ps1 executable.");
      argumentsString = argv.map(windowsArgument).join(" ");
    }
    if (argumentsString.length > 30000) throw new Error("CLI arguments exceed the Windows process limit.");
    // ProcessStartInfo preserves native argv on both PowerShell 5 and 7.
    // Inherit this console so the CLI retains the PTY's input and output.
    return "& { $acLaunchInfo = New-Object System.Diagnostics.ProcessStartInfo; " +
      "$acLaunchInfo.FileName = " + quote(executable) + "; " +
      "$acLaunchInfo.Arguments = " + quote(argumentsString) + "; " +
      "$acLaunchInfo.UseShellExecute = $false; " +
      "$acLaunchProcess = [System.Diagnostics.Process]::Start($acLaunchInfo); " +
      "$acLaunchProcess.WaitForExit(); $global:LASTEXITCODE = $acLaunchProcess.ExitCode; $acLaunchProcess.Dispose() }";
  }
  const prefix = isPowerShell ? "& " : "";
  return prefix + quote(executable) + match[2] + runtimeArgs.map(arg => " " + quote(arg)).join("");
}
