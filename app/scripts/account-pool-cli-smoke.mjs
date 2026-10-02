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
  calls.at(-1).input = request.input;
  const item = { id: 'message_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'POOL_FIXTURE_OK', annotations: [] }] };
  const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: request.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'POOL_FIXTURE_OK' },
    { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: 'POOL_FIXTURE_OK' },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
  const stream = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  // The real CLI stops reading at response.completed. Keep the first upstream
  // stream open to verify that this normal transport close is still completed.
  const body = calls.filter(c => c.url.endsWith('/responses')).length === 1
    ? new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(stream));
      options.signal.addEventListener('abort', () => controller.error(new Error('fixture client finished reading')), { once: true });
    } }) : stream;
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
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
  const execute = async (args, launch) => {
    const child = spawn(binary, args, { env: { ...env, ...launch.env }, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => error = (error + c).slice(-6000));
    const timer = setTimeout(() => child.kill(), 25000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, error); assert.ok(output.includes('POOL_FIXTURE_OK'), output + error);
    return output;
  };
  for (const sessionId of ['one', 'two', 'one']) {
    const launch = await pool.launch(sessionId);
    await execute(['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'danger-full-access', '-m', 'gpt-5.4', ...launch.args, 'Reply with POOL_FIXTURE_OK. Do not call tools.'], launch);
  }
  assert.deepEqual(calls.filter(c => c.url.endsWith('/responses')).map(c => c.account), ['A', 'B', 'A']);
  // Persist a real CLI conversation, exclude its routed account, then resume
  // the same thread through the replacement with its previous messages intact.
  const initial = await pool.launch('one');
  const output = await execute(['exec', '--skip-git-repo-check', '--json', '--sandbox', 'danger-full-access', '-m', 'gpt-5.4', ...initial.args,
    'Remember BEFORE_EXCLUSION. Reply with POOL_FIXTURE_OK. Do not call tools.'], initial);
  const threadId = output.trim().split(/\r?\n/).map(line => JSON.parse(line)).find(event => event.type === 'thread.started')?.thread_id;
  assert.ok(threadId, 'The CLI must persist a thread to resume');
  const originalAccount = pool.state.sessions.one.accountId;
  pool.update(originalAccount, false);
  const restarted = await pool.launch('one');
  assert.notEqual(pool.state.sessions.one.accountId, originalAccount);
  const resumed = await execute(['exec', '--sandbox', 'danger-full-access', 'resume', '--skip-git-repo-check', '--json', ...restarted.args, threadId,
    'Continue AFTER_EXCLUSION. Reply with POOL_FIXTURE_OK. Do not call tools.'], restarted);
  assert.equal(resumed.trim().split(/\r?\n/).map(line => JSON.parse(line)).find(event => event.type === 'thread.started')?.thread_id, threadId);
  const generations = calls.filter(call => call.url.endsWith('/responses'));
  assert.deepEqual(generations.map(call => call.account), ['A', 'B', 'A', 'A', 'B']);
  const continuation = JSON.stringify(generations.at(-1).input);
  assert.ok(continuation.includes('BEFORE_EXCLUSION') && continuation.includes('POOL_FIXTURE_OK') && continuation.includes('AFTER_EXCLUSION'));
  assert.equal(pool.account(originalAccount).enabled, false);
  for (let attempt = 0; attempt < 100 && pool.state.recent.filter(r => r.operation === 'generation').length < 5; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  const records = pool.state.recent.filter(r => r.operation === 'generation');
  assert.equal(records.length, 5);
  assert.ok(records.every(r => r.status === 'completed' && r.completionObserved && r.usageReported));
  assert.equal(records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0), 75);
  console.log('ACCOUNT_POOL_REAL_CLI_RPC_AND_STREAM_OK');
  console.log('ACCOUNT_POOL_EXCLUDED_ACCOUNT_RESUME_OK');
} finally {
  rpc?.close(); pool.close();
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-pool-cli-')) throw new Error('Unexpected cleanup path');
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
