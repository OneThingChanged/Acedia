import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { HookService, hookInternals } from "./hook-service.mjs";

async function runHelper(binary, args, input, env) {
  const child = spawn(binary, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.stdin.end(JSON.stringify(input));
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(output || `helper exited ${code}`)));
  });
}

it.each(process.platform === "win32" ? ["powershell", "node"] : ["node"])("%s hook preserves Codex questions and resumes on PostToolUse", async kind => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-question-hook-"));
  const events = [];
  const service = new HookService({ baseDir: root, sessionService: { noteHook: async () => {} }, sendEvent: (_name, payload) => events.push(payload) });
  try {
    const { port, token } = await service.start();
    const env = { ...process.env, MULTIAGENT_PORT: String(port), MULTIAGENT_TOKEN: token, MULTIAGENT_AGENT_ID: "fixture" };
    const tool_input = { questions: [{ question: "상세한 질문 ".repeat(400), options: [{ label: "A" }, { label: "B" }] }] };
    const payload = { session_id: "fixture-session", tool_name: "functions.request_user_input", tool_input };
    let binary, prefix;
    if (kind === "powershell") {
      binary = "powershell.exe";
      prefix = ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", service.helperPath];
    } else {
      const bootstrap = hookInternals.remoteBootstrap("codex");
      const encoded = bootstrap.match(/Buffer\.from\("([A-Za-z0-9+/=]+)","base64"\)/)?.[1];
      expect(encoded).toBeTruthy();
      const file = path.join(root, "notify.mjs");
      fs.writeFileSync(file, Buffer.from(encoded, "base64"));
      binary = process.execPath; prefix = [file];
    }
    await runHelper(binary, [...prefix, "tool-start", "PreToolUse"], payload, env);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("waiting");
    expect(JSON.parse(events[0].interactive_question)).toEqual(tool_input);
    expect(events[0].interactive_question.length).toBeGreaterThan(2000);
    await runHelper(binary, [...prefix, "tool-end", "PostToolUse"], payload, env);
    expect(events).toHaveLength(2);
    expect(events[1].event).toBe("tool-end");
    expect(events[1].interactive_question).toBeNull();
  } finally {
    await service.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-question-hook-")) throw new Error("Unexpected fixture path");
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 20000);
