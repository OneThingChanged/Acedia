import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { AccountPoolRpc } from '../electron/services/account-pool-rpc.mjs';

const binary = process.env.ACEDIA_CODEX_BINARY;
if (!binary || !path.isAbsolute(binary) || !fs.existsSync(binary)) throw new Error('Set ACEDIA_CODEX_BINARY to the installed executable.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-pool-cli-'));
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s).reverse(), decryptString: b => Buffer.from(b).reverse().toString() };
const calls = [];
const pool = new AccountPool(path.join(root, 'pool'), { safeStorage, port: 0, fetchImpl: async (url, options) => {
  calls.push({ url, account: options.headers['chatgpt-account-id'] });
  if (url.includes('/models')) return new Response('{"models":[]}', { headers: { 'content-type': 'application/json' } });
  const request = JSON.parse(options.body); assert.equal(request.stream, true); assert.ok(Array.isArray(request.input));
  const item = { id: 'message_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'POOL_FIXTURE_OK', annotations: [] }] };
  const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: request.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'POOL_FIXTURE_OK' },
    { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: 'POOL_FIXTURE_OK' },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
  return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
} });
let rpc;
try {
  const home = path.join(root, 'cli'); fs.mkdirSync(home);
  const env = { ...process.env, CODEX_HOME: home };
  for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
  // Validate the installed RPC handshake against an empty, isolated home; no login or model call.
  rpc = new AccountPoolRpc({ file: binary, args: ['app-server', '-c', 'cli_auth_credentials_store=file'] }, env, home);
  await rpc.initialize(); assert.equal((await rpc.call('account/read', { refreshToken: false })).account, null); rpc.close();
  for (const name of ['A', 'B']) {
    const id = pool.create(name); const a = pool.account(id);
    const jwt = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.x';
    a.auth = pool.seal(JSON.stringify({ tokens: { access_token: jwt, refresh_token: 'fixture', account_id: name } })); a.status = 'ready'; pool.update(id, true);
  }
  await pool.setEnabled(true);
  for (const sessionId of ['one', 'two', 'one']) {
    const launch = await pool.launch(sessionId); Object.assign(env, launch.env);
    const child = spawn(binary, ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'danger-full-access', '-m', 'gpt-5.4', ...launch.args, 'Reply with POOL_FIXTURE_OK. Do not call tools.'], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => error = (error + c).slice(-6000));
    const timer = setTimeout(() => child.kill(), 25000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, error); assert.ok(output.includes('POOL_FIXTURE_OK'), output + error);
  }
  assert.deepEqual(calls.filter(c => c.url.endsWith('/responses')).map(c => c.account), ['A', 'B', 'A']);
  console.log('ACCOUNT_POOL_REAL_CLI_RPC_AND_STREAM_OK');
} finally {
  rpc?.close(); pool.close();
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-pool-cli-')) throw new Error('Unexpected cleanup path');
  await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
