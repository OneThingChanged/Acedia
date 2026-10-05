import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as pty from 'node-pty';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { ActiveQuestions } from '../electron/services/active-questions.mjs';
import { CodexCapacityRetry, codexRetryPromptReady, CAPACITY_RETRY_PROMPT } from '../electron/services/codex-capacity-retry.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';
import { submitPtyMessage } from '../electron/services/pty-submit.mjs';

// All responses are loopback fixtures; no real account or model is contacted.
const binary = process.env.ACEDIA_CODEX_BINARY;
assert.ok(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set ACEDIA_CODEX_BINARY to the installed Codex executable.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-capacity-cli-'));
const home = path.join(root, 'cli'); fs.mkdirSync(home);
fs.writeFileSync(path.join(home, 'config.toml'), `[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n`);
const calls = [], updates = [];
let mode = 'recover', terminal, service, transcript, sessionId, polling;
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const pool = new AccountPool(path.join(root, 'pool'), { port: 0, safeStorage, fetchImpl: async (url, options) => {
  if (url.includes('/models')) return new Response('{"models":[]}', { headers: { 'content-type': 'application/json' } });
  const request = JSON.parse(options.body);
  calls.push({ account: options.headers['chatgpt-account-id'], model: request.model, effort: request.reasoning?.effort, input: request.input });
  const continuations = request.input.filter(item => item.type === 'message' && item.role === 'user'
    && JSON.stringify(item.content).includes(CAPACITY_RETRY_PROMPT)).length;
  const failed = mode === 'exhaust' || continuations < 2;
  const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'CAPACITY_RECOVERY_OK', annotations: [] }] };
  const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: request.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const events = failed ? [{ type: 'response.failed', response: { id: 'resp_failed', status: 'failed', error: { code: 'server_overloaded', message: 'Selected model is at capacity. Please try a different model.' } } }]
    : [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } },
      { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
  return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
} });
const filter = new CodexScrollbackFilter(34, 140), questions = new ActiveQuestions();
const wait = delay => new Promise(resolve => setTimeout(resolve, delay));
const waitFor = async (condition, label) => {
  const end = Date.now() + 45000;
  while (Date.now() < end) { if (await condition()) return; await wait(100); }
  throw new Error(`Timed out: ${label}\n${filter.viewportText()}`);
};
try {
  const a = pool.account(pool.create('local fixture'));
  a.auth = pool.seal(JSON.stringify({ tokens: { access_token: 'x.' + Buffer.from(JSON.stringify({ exp: Date.now()/1000 + 3600 })).toString('base64url') + '.x', refresh_token: 'fixture', account_id: 'fixture' } }));
  a.status = 'ready'; pool.update(a.id, true); await pool.setEnabled(true);
  const launch = await pool.launch('fixture');
  const env = { ...process.env, CODEX_HOME: home, ...launch.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
  const args = ['--no-alt-screen', '-m', 'gpt-6.1-sol', ...launch.args, '-c', 'model_providers.acedia_pool.stream_max_retries=0',
    '-c', 'model_reasoning_effort="high"',
    '-c', 'features.daemon_auto_start=false', '-c', 'features.hooks=false', '-c', 'features.plugins=false', '-c', 'analytics.enabled=false'];
  terminal = pty.spawn(binary, args, { cwd: root, env, cols: 140, rows: 34, name: 'xterm-256color', useConpty: true });
  const entry = { id: 'fixture', aiToolId: 'codex', startedAt: Date.now(), lastInputAt: 0, process: terminal, filter };
  terminal.onData(data => { if (data.includes('\x1b[6n')) terminal.write('\x1b[1;1R'); filter.push(data); });
  const read = async () => {
    if (!transcript) {
      const folder = path.join(home, 'sessions');
      if (!fs.existsSync(folder)) return null;
      const file = fs.readdirSync(folder, { recursive: true }).find(file => file.endsWith('.jsonl'));
      if (!file) return null;
      transcript = path.join(folder, file); sessionId = path.basename(file).match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
    }
    return questions.read({ id: entry.id, tool: 'codex', root: path.join(home, 'sessions'), transcriptPath: transcript, sessionId, startedAt: entry.startedAt });
  };
  service = new CodexCapacityRetry({ entryFor: () => entry, read, delays: [700, 900, 1200],
    ready: () => codexRetryPromptReady(filter.viewportText()), publish: payload => updates.push(payload),
    submit: (_id, _entry, message, isCurrent) => submitPtyMessage({ ptyProcess: terminal, message, isCurrent }) });
  let busy = false;
  polling = setInterval(async () => {
    if (busy) return; busy = true;
    try { const result = await read(); if (result) service.observe(entry.id, entry, result); } finally { busy = false; }
  }, 100);
  await waitFor(() => codexRetryPromptReady(filter.viewportText()), 'initial composer');
  entry.lastInputAt = Date.now(); await submitPtyMessage({ ptyProcess: terminal, message: 'Remember ORIGINAL_TASK_MARKER. Reply with CAPACITY_RECOVERY_OK. Do not call tools.' });
  await waitFor(() => service.get(entry.id)?.status === 'resolved' && service.get(entry.id)?.reason === 'completed', 'successful same-model recovery');
  assert.equal(updates.filter(p => p.status === 'retrying').length, 2);
  const generations = calls.filter(c => !JSON.stringify(c.input).includes('Generate a concise, single-line task title'));
  assert.ok(generations.at(-1).input.some(item => JSON.stringify(item).includes('ORIGINAL_TASK_MARKER')));
  assert.equal(new Set(calls.map(c => c.model)).size, 1); assert.equal(calls[0].model, 'gpt-6.1-sol');
  assert.deepEqual([...new Set(generations.map(c => c.effort))], ['high']);
  assert.deepEqual([...new Set(calls.map(c => c.account))], ['fixture']);
  const firstSession = sessionId;
  console.log('CAPACITY_REAL_CODEX_SAME_MODEL_ACCOUNT_AND_CONTEXT_RECOVERY_OK');
  mode = 'exhaust'; updates.length = 0; service.cancel(entry.id); entry.lastInputAt = Date.now();
  await submitPtyMessage({ ptyProcess: terminal, message: 'Second task: exercise persistent capacity failure. Do not call tools.' });
  await waitFor(() => service.get(entry.id)?.status === 'failed', 'bounded failure notification');
  assert.equal(service.get(entry.id).reason, 'exhausted'); assert.equal(service.get(entry.id).attempt, 3);
  assert.equal(updates.filter(p => p.status === 'failed').length, 1); assert.equal(sessionId, firstSession);
  const total = calls.length; await wait(1800); assert.equal(calls.length, total);
  console.log('CAPACITY_REAL_CODEX_THREE_RETRIES_AND_FAILURE_ONCE_OK');
} finally {
  clearInterval(polling); service?.dispose();
  if (terminal) { const closed = new Promise(resolve => { const timer = setTimeout(resolve, 2000); terminal.onExit(() => { clearTimeout(timer); resolve(); }); }); terminal.kill(); await closed; }
  filter.dispose(); pool.close();
  assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('acedia-capacity-cli-'));
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
