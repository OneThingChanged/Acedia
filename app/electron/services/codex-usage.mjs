import { spawn } from "node:child_process";
import os from "node:os";
import { terminateWindowsProcessTree } from "./process-tree.mjs";

// Only account RPCs: never create a thread, run a turn, or change the login.
// The caller supplies the same isolated environment used to launch that account.
export function fetchCodexUsage({ command, env, timeoutMs = 15_000, start = spawn,
  stop = child => { if (!terminateWindowsProcessTree(child.pid)) child.kill(); },
}) {
  return new Promise(resolve => {
    let child, timer, settled = false, buffer = "", expectedId = 1;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child?.stdin.end(); } catch { /* already closed */ }
      try { if (child?.pid && child.exitCode == null) stop(child); } catch { /* already exited */ }
      resolve(result);
    };
    const send = message => {
      try { child.stdin.write(JSON.stringify(message) + "\n"); }
      catch { finish({ status: "failed" }); }
    };
    try {
      child = start(command.file, command.args, {
        cwd: os.homedir(), env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"],
      });
      timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
      child.on("error", () => finish({ status: "failed" }));
      child.on("exit", () => finish({ status: "failed" }));
      child.stdin.on("error", () => finish({ status: "failed" }));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        if (settled) return;
        buffer += chunk;
        if (buffer.length > 1024 * 1024) return finish({ status: "failed" });
        let newline;
        while (!settled && (newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          let message;
          try { message = JSON.parse(line); } catch { continue; }
          if (message.id !== expectedId || message.method) continue;
          if (message.error) {
            // Never expose raw RPC errors: they may contain auth or local paths.
            const loginRequired = /unauthorized|not authenticated|not logged in|requires.*auth|401|refresh.token/i.test(message.error.message || "");
            return finish({ status: loginRequired ? "login_required" : "failed" });
          }
          if (!message.result) return finish({ status: "failed" });
          if (expectedId === 1) {
            expectedId = 2;
            send({ method: "initialized" });
            send({ id: 2, method: "account/read", params: { refreshToken: false } });
          } else if (expectedId === 2) {
            if (!message.result.account) return finish({ status: "login_required" });
            if (message.result.account.type === "apiKey") return finish({ status: "unavailable" });
            expectedId = 3;
            send({ id: 3, method: "account/rateLimits/read" });
          } else {
            finish({ status: "success", data: message.result });
          }
        }
      });
      send({ id: 1, method: "initialize", params: {
        clientInfo: { name: "acedia_usage", title: "Acedia account usage", version: "1.0.0" },
      } });
    } catch { finish({ status: "failed" }); }
  });
}

export function codexUsageSnapshot(result, account, updatedAt = Math.floor(Date.now() / 1000)) {
  const bucket = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  if (!bucket || (bucket.limitId && bucket.limitId !== "codex")) return null;
  const window = value => value && typeof value.usedPercent === "number" && Number.isFinite(value.usedPercent)
    ? { usedPercent: value.usedPercent, windowMinutes: value.windowDurationMins ?? null, resetsAt: value.resetsAt ?? null }
    : null;
  const primary = window(bucket.primary), secondary = window(bucket.secondary);
  if (!primary && !secondary && !bucket.credits) return null;
  return {
    limitId: account.id === "default" ? "codex" : `codex:${account.id}`,
    limitName: account.id === "default" ? "Codex" : `Codex · ${account.label}`,
    planType: bucket.planType ?? null, primary, secondary,
    hasCredits: Boolean(bucket.credits?.hasCredits), unlimited: Boolean(bucket.credits?.unlimited),
    creditBalance: bucket.credits?.balance == null ? null : String(bucket.credits.balance),
    sourcePath: "codex:app-server", updatedAt,
  };
}
