// Optional integration check; requires the locally installed Codex CLI.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { devElectronEnvironment } from "./electron-dev-environment.mjs";

const require = createRequire(import.meta.url);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
if (!process.versions.electron) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-terminal-colors-"));
  const env = devElectronEnvironment({ ...process.env, NO_COLOR: "1" });
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(require("electron"), [fileURLToPath(import.meta.url), temporary], { env, windowsHide: true, stdio: "inherit" });
      const timeout = setTimeout(() => child.kill(), 45000);
      child.once("error", reject);
      child.once("exit", code => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error(`Terminal color smoke failed: ${code}`));
      });
    });
  } finally {
    if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("multiagent-terminal-colors-")) throw new Error("Unexpected cleanup path");
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  const { app } = require("electron");
  const pty = require("node-pty");
  const temporary = process.argv[2];
  app.setPath("userData", path.join(temporary, "electron"));
  void app.whenReady().then(async () => {
  let terminal;
  let requests = 0;
  const mock = http.createServer((_request, response) => {
    requests++;
    response.writeHead(400, { "content-type": "application/json" });
    response.end('{"error":{"message":"Local color smoke; no model invoked"}}');
  });
  let failed;
  try {
    assert.equal(process.env.NO_COLOR, undefined, "Dev launcher leaked NO_COLOR into Electron");
    await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
    const found = spawnSync("where.exe", ["codex.exe"], { encoding: "utf8", windowsHide: true });
    const codex = (found.stdout || "").split(/\r?\n/).find(file => file && fs.existsSync(file) && !/WindowsApps/i.test(file));
    assert.ok(codex, "Install Codex CLI before this optional integration smoke");
    const counts = [];
    for (const noColor of [true, false]) {
      const home = path.join(temporary, noColor ? "muted" : "colored");
      fs.mkdirSync(home);
      fs.writeFileSync(path.join(home, "config.toml"), `model = "probe"
model_provider = "probe"
check_for_update_on_startup = false
[analytics]
enabled = false
[model_providers.probe]
name = "Probe"
base_url = "http://127.0.0.1:${mock.address().port}/v1"
wire_api = "responses"
requires_openai_auth = false
[projects.${JSON.stringify(temporary)}]
trust_level = "trusted"
`);
      const inherited = { ...process.env, NO_COLOR: "1", CODEX_HOME: home, TERM: "xterm-256color", COLORTERM: "truecolor" };
      const env = noColor ? inherited : devElectronEnvironment(inherited);
      for (const key of Object.keys(env)) if (/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|OTEL_/.test(key)) delete env[key];
      terminal = pty.spawn(codex, ["--no-alt-screen", "--sandbox", "read-only"], { cwd: temporary, env, cols: 120, rows: 35, useConpty: true });
      let exited = false;
      const exit = new Promise(resolve => terminal.onExit(() => { exited = true; resolve(); }));
      let output = "";
      terminal.onData(data => {
        output = (output + data).slice(-100000);
        if (data.includes("\x1b[6n")) terminal.write("\x1b[1;1R");
      });
      const deadline = Date.now() + 12000;
      while (!output.includes("Ask Codex to do anything") && Date.now() < deadline) await delay(50);
      assert.ok(output.includes("Ask Codex to do anything"), "Isolated Codex composer not ready");
      await delay(400);
      // Inspect only color SGR parameters; never print CLI output or user data.
      const colors = [...output.matchAll(/\x1b\[([0-9;:]+)m/g)]
        .map(match => match[1]).filter(params => /(?:^|;)(?:3[0-8]|9[0-7])(?:;|$)/.test(params));
      counts.push(new Set(colors).size);
      terminal.write("\x04");
      await Promise.race([exit, delay(2000)]);
      if (!exited) {
        terminal.kill();
        await Promise.race([exit, delay(1500)]);
      }
      terminal = null;
    }
    console.log(`CODEX_TERMINAL_COLOR_COUNTS suppressed=${counts[0]} corrected=${counts[1]}`);
    assert.ok(counts[1] > counts[0], "Corrected launch did not restore additional Codex colors");
    assert.equal(requests, 0, "Color check unexpectedly submitted a request");
    console.log("DEV_TERMINAL_COLORS_OK; no model requests");
  } catch (error) {
    failed = error;
  } finally {
    try { terminal?.kill(); } catch {}
    mock.closeAllConnections();
    await new Promise(resolve => mock.close(resolve));
  }
  if (failed) console.error(failed);
  app.exit(failed ? 1 : 0);
  });
}
