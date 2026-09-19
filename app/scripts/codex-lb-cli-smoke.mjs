import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { CodexLbConnection } from "../electron/services/codex-lb.mjs";

// Opt-in real CLI catalog request against an isolated loopback fixture. No
// provider login, model generation, live account, or user config is touched.
const executable = process.env.ACEDIA_CODEX_BINARY;
if (!executable || !path.isAbsolute(executable) || !fs.existsSync(executable)) throw new Error("Set ACEDIA_CODEX_BINARY to the installed Codex executable.");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-codex-lb-cli-"));
const seen = [];
const server = http.createServer((req, res) => {
  seen.push({ path: req.url.split("?")[0], authorization: req.headers.authorization });
  res.writeHead(200, { "content-type": "application/json" }); res.end('{"models":[]}');
});
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const connection = new CodexLbConnection(directory);
  connection.save({ revision: 0, settings: { enabled: true, supportsWebsockets: true, baseUrl: `http://127.0.0.1:${server.address().port}` } });
  const home = path.join(directory, "home"); fs.mkdirSync(home);
  const jwt = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url") + "." + Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600, email: "fixture@example.invalid",
    "https://api.openai.com/auth": { chatgpt_account_id: "fixture-account", chatgpt_plan_type: "plus", user_id: "fixture-user" },
  })).toString("base64url") + ".fixture";
  fs.writeFileSync(path.join(home, "auth.json"), JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: jwt, access_token: jwt, refresh_token: "fixture-only", account_id: "fixture-account" }, last_refresh: new Date().toISOString() }));
  fs.writeFileSync(path.join(home, "config.toml"), 'cli_auth_credentials_store = "file"\n');
  const launch = connection.launch();
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^(?:CODEX_HOME|HOME|USERPROFILE|OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|ACEDIA_CODEX_LB_API_KEY)$/i.test(name)) delete env[name];
  Object.assign(env, launch.env, { CODEX_HOME: home, HOME: home, USERPROFILE: home });
  const child = spawn(executable, ["debug", "models", ...launch.args], { env, cwd: directory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stdout.resume(); child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4096); });
  const timeout = setTimeout(() => child.kill(), 20_000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timeout));
  assert.equal(code, 0, "Codex catalog command failed: " + stderr);
  assert.ok(seen.length > 0, "Codex did not query the configured proxy");
  assert.ok(seen.every(request => request.path === "/backend-api/codex/models"), "Unexpected request outside the catalog");
  assert.ok(seen.every(request => request.authorization === "Bearer acedia-local-no-auth"), "Provider env_key did not replace the fixture ChatGPT bearer");
  console.log("CODEX_LB_REAL_CLI_CATALOG_OK");
} finally {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-codex-lb-cli-")) throw new Error("Unexpected smoke cleanup path");
  fs.rmSync(directory, { recursive: true, force: true });
}
