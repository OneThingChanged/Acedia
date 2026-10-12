// Installed Codex TUI + isolated profile + loopback-only Responses fixture.
// No real login, account tokens, external model request or billable Fast check.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { CodexScrollbackFilter } from "../electron/services/terminal-stream.mjs";
import { TerminalSessionService } from "../electron/services/terminal-session-service.mjs";
import { SessionModelMemory, nativeCodexModel, updateNativeSessionModel } from "../electron/services/session-model-memory.mjs";
import { lastTurnModel } from "../electron/services/session-model-service.mjs";
import { sessionModelArgs } from "../electron/shared/session-model.mjs";
import { codexServerConfigArgs } from "../electron/services/account-pool-session.mjs";
import { AccountPoolRpc } from "../electron/services/account-pool-rpc.mjs";
import { decodeCodexRequestBody } from "../electron/services/codex-request-body.mjs";

const require = createRequire(import.meta.url);
const binary = process.env.ACEDIA_CODEX_BINARY;
assert.ok(binary && path.isAbsolute(binary), "Set ACEDIA_CODEX_BINARY to the installed native executable");
const output = path.resolve(import.meta.dirname, "../../output/session-settings-cli");
await fs.mkdir(output, { recursive: true });
const root = await fs.mkdtemp(path.join(output, "profile-"));
const cliHome = path.join(root, "cli"); await fs.mkdir(cliHome);
const memoryFile = path.join(root, "app", "session-model-memory.json");
let memory = new SessionModelMemory(memoryFile);
const calls = [], terminalOutput = [];
const sessions = new TerminalSessionService({ onBeforeClose: entry => memory.remember(entry) });
const context = { id: "fixture-session", aiToolId: "codex", codexAccountId: "default", cwd: root };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) { if (await test()) return; await wait(100); }
  throw Error(`Timeout: ${label}\n${sessions.get(context.id)?.filter.viewportText() || ""}`);
}
const server = http.createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (request.method !== "POST" || !raw.length || !request.url.endsWith("/responses")) {
    response.writeHead(200, { "content-type": "application/json" }); response.end('{"models":[]}'); return;
  }
  const decoded = await decodeCodexRequestBody(raw, request.headers['content-encoding']);
  const body = JSON.parse(decoded.toString('utf8')); calls.push(body);
  const item = { type: "message", id: `message-${calls.length}`, role: "assistant", status: "completed",
    content: [{ type: "output_text", text: "MODEL_SETTINGS_FIXTURE_OK", annotations: [] }] };
  const result = { id: `response-${calls.length}`, object: "response", status: "completed", model: body.model,
    output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of [{ type: "response.created", response: { ...result, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item }, { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response: result }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, CODEX_HOME: cliHome, TERM: "xterm-256color" };
for (const key of Object.keys(env)) if (/^(?:OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
async function config(model, effort) {
  const base = `http://127.0.0.1:${server.address().port}`;
  const provider = process.argv.includes("--inline-fast")
    ? `model_provider="openai"\nopenai_base_url=${JSON.stringify(base + "/v1")}\nchatgpt_base_url=${JSON.stringify(base)}\n`
    : 'model_provider="fixture"\n';
  await fs.writeFile(path.join(cliHome, "config.toml"), `model=${JSON.stringify(model)}\nmodel_reasoning_effort=${JSON.stringify(effort)}\n${provider}[windows]\nsandbox="unelevated"\n[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n[model_providers.fixture]\nname="Fixture"\nbase_url="${base}/v1"\nwire_api="responses"\n`);
}
async function start(sessionId) {
  const resolved = memory.resolve(context);
  const filter = new CodexScrollbackFilter(40, 120);
  const args = ["--no-daemon", "--disable", "plugins", "--no-alt-screen", "--sandbox", "read-only", "--ask-for-approval", "never",
    "-C", root, ...sessionModelArgs(resolved.settings), ...(sessionId ? ["resume", sessionId] : [])];
  const child = require("node-pty").spawn(binary, args, { cwd: root, env, cols: 120, rows: 40, useConptyDll: true });
  child.onData(data => {
    terminalOutput.push(data);
    if (data.includes("\x1b[6n")) child.write("\x1b[1;1R");
    if (data.includes("\x1b[c")) child.write("\x1b[?1;2c");
  });
  const entry = { ...context, process: child, filter, modelSettings: resolved.settings,
    configuredModelSettings: resolved.requested, modelMemoryToken: resolved.token };
  assert.ok(sessions.register(entry, sessions.beginSpawn(context.id)));
  memory.started(entry);
  let keptExistingModel = false;
  await until(async () => {
    const viewport = entry.filter.viewportText();
    if (!keptExistingModel && viewport.includes("2. Use existing model") && viewport.includes("Meet GPT-6 Luna")) {
      keptExistingModel = true;
      child.write("2"); await wait(200); child.write("\r");
    }
    return nativeCodexModel(entry);
  }, "native model composer/footer");
  // A resumed history can paint a footer before the input handler is ready.
  // Production model changes also require a settled, empty native composer.
  await wait(3500);
  return entry;
}
async function records() {
  const directory = path.join(cliHome, "sessions");
  let files; try { files = (await fs.readdir(directory, { recursive: true })).filter(file => file.endsWith(".jsonl")); } catch { return []; }
  const values = [];
  for (const file of files) for (const line of (await fs.readFile(path.join(directory, file), "utf8")).split("\n")) {
    try { values.push({ file: path.join(directory, file), row: JSON.parse(line) }); } catch { /* concurrent partial line */ }
  }
  return values;
}
async function message(text, count) {
  const entry = sessions.get(context.id);
  entry.process.write(text); await wait(500); entry.process.write("\r");
  await until(async () => (await records()).filter(item => item.row.payload?.type === "task_complete").length >= count, text);
  await until(() => nativeCodexModel(entry), "composer restored after response");
}
async function inlineFastRoundTrip() {
  // Fast UI is available only with ChatGPT authentication. These unsigned
  // fixture tokens and every provider URL exist solely in the isolated home
  // and loopback server; no real account is read or contacted.
  const token = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400,
    'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-fast', chatgpt_plan_type: 'pro', chatgpt_user_id: 'fixture-fast' } })).toString('base64url') + '.x';
  await fs.writeFile(path.join(cliHome, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt',
    tokens: { id_token: token, access_token: token, refresh_token: 'fixture-only' }, last_refresh: new Date().toISOString() }));
  const old = { model: "gpt-5.6-luna", effort: "max", serviceTier: "priority" };
  const selected = { model: "gpt-6.1-sol", effort: "xhigh", serviceTier: "priority" };
  await config(old.model, old.effort);
  memory.stage(context, old);
  const entry = await start();
  assert.deepEqual(nativeCodexModel(entry), { ...old, serviceTier: "fast" });
  await message("INLINE_FAST_INITIAL", 1);
  const meta = (await records()).find(item => item.row.type === "session_meta");
  assert.ok(meta?.row.payload.id);
  const threadId = meta.row.payload.id;
  const messagesBeforeChange = (await records()).filter(item => item.row.payload?.type === 'user_message').length;
  // Keep the initial native thread snapshot as a routed app-server does.
  // No synthetic footer: observe every model change from the actual TUI.
  updateNativeSessionModel(entry, old);
  entry.process.write("/model"); await wait(500); entry.process.write("\r");
  await until(() => entry.filter.viewportText().includes("Select Model and Effort"), "native model menu");
  assert.match(entry.filter.viewportText(), /1\.\s+GPT-6\.1-Sol/);
  entry.process.write("1");
  await until(() => entry.filter.viewportText().includes("Select Reasoning Level for GPT-6.1-Sol"), "native effort menu");
  assert.match(entry.filter.viewportText(), /4\.\s+Extra high/);
  entry.process.write("4");
  await until(() => {
    const current = nativeCodexModel(entry);
    return current?.model === selected.model && current?.effort === selected.effort && current.serviceTier === "fast";
  }, "Sol xhigh inline Fast footer before another turn");
  await fs.writeFile(path.join(root, "inline-fast-changed.txt"), entry.filter.viewportText());
  // The CLI may warm up a newly selected model in the background. Verify that
  // the user has not sent another message rather than counting provider calls.
  assert.equal((await records()).filter(item => item.row.payload?.type === 'user_message').length, messagesBeforeChange);
  // Close immediately without querying model UI or producing a new transcript
  // turn. The production pre-close capture must be enough to remember it.
  sessions.action(context.id, "sleep"); await wait(300);
  memory = new SessionModelMemory(memoryFile);
  assert.deepEqual(memory.resolve(context).settings, selected);
  await config(old.model, old.effort);
  const resumed = await start(threadId);
  assert.deepEqual(nativeCodexModel(resumed), { ...selected, serviceTier: "fast" });
  await fs.writeFile(path.join(root, "inline-fast-resumed.txt"), resumed.filter.viewportText());
  await message("INLINE_FAST_RESUMED", 2);
  const request = calls.findLast(body => JSON.stringify(body.input).includes('INLINE_FAST_RESUMED'));
  assert.ok(request);
  assert.equal(request.model, selected.model);
  assert.equal(request.reasoning.effort, selected.effort);
  assert.equal(request.service_tier, "priority");
  assert.deepEqual([...new Set((await records()).filter(item => item.row.type === "session_meta").map(item => item.row.payload.id))], [threadId]);
  await fs.writeFile(path.join(root, "passed.json"), JSON.stringify({ sameThread: threadId, inlineFast: true,
    changedBeforeAnotherTurn: true, initial: old, restored: selected, loopbackOnly: true }, null, 2));
  console.log("CODEX_INLINE_FAST_MODEL_MEMORY_OK Luna max Fast -> /model Sol xhigh -> immediate sleep -> profile reload -> same-thread resume; native footer and request settings verified");
  console.log(root);
}
async function modelSettingsRoundTrip() {
  await config("gpt-5.4", "high");
  const first = await start(); await message("FIRST_SETTINGS_CHECK", 1);
  const firstRecords = await records();
  const meta = firstRecords.find(item => item.row.type === "session_meta"); assert.ok(meta?.row.payload.id);
  const threadId = meta.row.payload.id;
  assert.equal(calls.at(-1).model, "gpt-5.4"); assert.equal(calls.at(-1).reasoning.effort, "high");
  assert.deepEqual(await lastTurnModel(meta.file), { model: "gpt-5.4", effort: "high" });
  memory.remember(first); sessions.action(context.id, "sleep"); await wait(300);

  await config("gpt-5.3-codex", "low");
  memory = new SessionModelMemory(memoryFile);
  assert.deepEqual(memory.resolve(context).settings, { model: "gpt-5.4", effort: "high" });
  const resumed = await start(threadId); await message("RESUMED_SETTINGS_CHECK", 2);
  assert.equal(calls.at(-1).model, "gpt-5.4"); assert.equal(calls.at(-1).reasoning.effort, "high");
  assert.deepEqual([...new Set((await records()).filter(item => item.row.type === "session_meta").map(item => item.row.payload.id))], [threadId]);

  memory.stage(context, { model: "gpt-5.3-codex", effort: "medium" }); memory.remember(resumed);
  sessions.action(context.id, "restart"); await wait(300);
  const changed = await start(threadId); await message("CHANGED_SETTINGS_CHECK", 3);
  assert.equal(calls.at(-1).model, "gpt-5.3-codex"); assert.equal(calls.at(-1).reasoning.effort, "medium");
  memory.remember(changed); sessions.closeAll(); await wait(300);

  // Verify native config decoding of our Fast/Off arguments without a model call.
  for (const serviceTier of ["fast", null]) {
    const rpc = new AccountPoolRpc({ file: binary, args: ["--no-daemon", "app-server", ...codexServerConfigArgs(sessionModelArgs({ model: "gpt-5.4", effort: "high", serviceTier }))] }, env, cliHome);
    try {
      await rpc.initialize(); const value = await rpc.call("config/read", { includeLayers: false });
      assert.equal(value.config.service_tier, serviceTier === "fast" ? "fast" : "default");
    } finally { rpc.close(); }
  }
  const result = { fixture: root, modelEffortResume: true, sameThread: threadId, explicitSelection: true,
    nativeTierConfig: true, fastEntitlementOrBillingChecked: false, calls: calls.map(value => ({ model: value.model, effort: value.reasoning.effort })) };
  await fs.writeFile(path.join(root, "passed.json"), JSON.stringify(result, null, 2));
  console.log("CODEX_SESSION_SETTINGS_OK same-thread sleep/reload/resume model + effort, next model selection, native Fast/Off config; loopback fixture only");
  console.log(root);
}
try {
  if (process.argv.includes("--inline-fast")) await inlineFastRoundTrip();
  else await modelSettingsRoundTrip();
} finally {
  sessions.closeAll();
  await fs.writeFile(path.join(root, "terminal-output.txt"), terminalOutput.join(""));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
// This isolated runner owns every spawned CLI. ConPTY socket workers may keep
// Node alive after all assertions, processes and server cleanup have completed.
process.exit(0);
