import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';
import * as pty from 'node-pty';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { codexRemoteTuiArgs } from '../electron/services/account-pool-session.mjs';

// Installed CLI + local HTTPS fixtures only. No real account, model, image, or
// connector request leaves the machine. The temporary CA is scoped to children.
const binary = process.env.ACEDIA_CODEX_BINARY;
assert.ok(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set ACEDIA_CODEX_BINARY to Codex CLI 0.160.0 or newer.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-native-tools-'));
const certFile = path.join(root, 'cert.pem'), keyFile = path.join(root, 'key.pem');
function createCertificate() {
  if (process.platform === 'win32') {
    const script = `
      $rsa = [System.Security.Cryptography.RSA]::Create(2048)
      $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
      $san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
      $san.AddDnsName('localhost'); $san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
      $request.CertificateExtensions.Add($san.Build())
      $request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
      $certificate = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddDays(2))
      [System.IO.File]::WriteAllText((Join-Path $env:ACEDIA_TEST_CERT_DIR 'cert.pem'), $certificate.ExportCertificatePem())
      [System.IO.File]::WriteAllText((Join-Path $env:ACEDIA_TEST_CERT_DIR 'key.pem'), $rsa.ExportPkcs8PrivateKeyPem())
      $certificate.Dispose(); $rsa.Dispose()
    `;
    const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', script], { env: { ...process.env, ACEDIA_TEST_CERT_DIR: root }, encoding: 'utf8', windowsHide: true, timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || 'PowerShell 7 is required for the isolated TLS fixture.');
  } else {
    const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-addext', 'basicConstraints=critical,CA:FALSE'], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
  }
}
createCertificate();
const requests = [], responses = [], toolRequests = [], toolResults = [], sockets = [], pending = new Set();
const claims = label => ({ exp: Math.floor(Date.now() / 1000) + 3600, fixture: label, 'https://api.openai.com/auth': { chatgpt_account_id: label, chatgpt_plan_type: 'pro', chatgpt_user_id: label } });
const token = (label, revision = 1) => 'x.' + Buffer.from(JSON.stringify({ ...claims(label), revision })).toString('base64url') + '.x';
const accounts = ['fixture-A', 'fixture-B'];
let base, pool;
const backend = https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  let body; try { body = JSON.parse(Buffer.concat(chunks)); } catch {}
  let jwt; try { jwt = JSON.parse(Buffer.from(req.headers.authorization?.split('.')[1], 'base64url')); } catch {}
  requests.push({ path: req.url, account: req.headers['chatgpt-account-id'] || jwt?.fixture, revision: jwt?.revision, method: body?.method,
    ...(req.url.includes('/ps/mcp') ? { meta: body?.params?._meta, headers: Object.keys(req.headers) } : {}) });
  const json = value => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.url.includes('/accounts/check')) return json({ accounts: accounts.map(id => ({ id, plan_type: 'pro', structure: 'personal', workspace_backend_origin: base, account_routing_override: 'NO_CONSTRAINT' })) });
  if (req.url.includes('/settings/user')) return json({});
  if (req.url === '/mcp' || req.url === '/api/codex/ps/mcp') {
    if (body?.method === 'initialize') return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } } });
    if (body?.method === 'tools/list') return json({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'echo', description: 'Local account fixture', annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, inputSchema: { type: 'object', properties: {} } }] } });
    if (body?.method === 'tools/call') return json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'MCP_FIXTURE_OK' }] } });
    res.writeHead(202); return res.end();
  }
  if (jwt?.revision === 1) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Refresh local fixture token"}}'); }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":{"message":"Local tool fixture"}}');
});
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
base = `https://127.0.0.1:${backend.address().port}`;
const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value).reverse(), decryptString: value => Buffer.from(value).reverse().toString() };
const home = path.join(root, 'home'); fs.mkdirSync(home);
fs.writeFileSync(path.join(home, 'config.toml'), `[projects.${JSON.stringify(root)}]\ntrust_level = "trusted"\n`);
fs.writeFileSync(path.join(home, 'fixture.config.toml'), `developer_instructions="PROFILE_FIXTURE_MARKER"\n[mcp_servers.account_fixture]\nurl=${JSON.stringify(base + '/mcp')}\nauth="chatgpt"\n`);
const env = { ...process.env, CODEX_HOME: home, CODEX_CA_CERTIFICATE: certFile, SSL_CERT_FILE: certFile };
for (const name of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|OPENAI_BASE_URL|RUST_LOG)$/i.test(name)) delete env[name];
const catalog = JSON.parse(spawnSync(binary, ['debug', 'models', '--bundled'], { env, cwd: root, encoding: 'utf8', windowsHide: true }).stdout);
const configArgs = Object.entries({ model: 'gpt-6-astra', chatgpt_base_url: base, web_search: 'live', 'features.apps': true, 'features.plugins': false, 'features.hooks': false,
  'features.daemon_auto_start': false, 'analytics.enabled': false,
}).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
configArgs.push('--profile', 'fixture');
function stream(body, item) {
  const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: body.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 4 } } };
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'application/json', 'x-codex-turn-state': 'fixture-turn-state' } });
}
pool = new AccountPool(path.join(root, 'pool'), { safeStorage, port: 0,
  command: () => ({ file: binary, args: ['app-server'] }),
  rpcFactory: (_env, accountHome) => ({ initialize: async () => {}, close() {}, async call(method) {
    assert.equal(method, 'account/read');
    const authPath = path.join(accountHome, 'auth.json'); const auth = JSON.parse(fs.readFileSync(authPath));
    auth.tokens.access_token = token(auth.tokens.account_id, 2); fs.writeFileSync(authPath, JSON.stringify(auth));
    return { account: { type: 'chatgpt', planType: 'pro' }, workspaceRouting: { backendOrigin: base } };
  } }),
  fetchImpl: async (url, options) => {
    if (url.includes('/models')) return new Response(JSON.stringify(catalog), { headers: { 'content-type': 'application/json' } });
    if (!url.endsWith('/responses')) {
      assert.ok(url.startsWith(base + '/backend-api/codex/'));
      const jwt = JSON.parse(Buffer.from(options.headers.authorization.split('.')[1], 'base64url'));
      const account = options.headers['chatgpt-account-id']; assert.equal(jwt.fixture, account);
      toolRequests.push({ endpoint: new URL(url).pathname, account, revision: jwt.revision });
      if (jwt.revision === 1) return new Response('{"error":{"message":"Refresh fixture"}}', { status: 401 });
      const data = url.endsWith('/images/generations') ? { created: 1, data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=' }] }
        : { output: 'WEB_FIXTURE_OK' };
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    }
    const body = JSON.parse(options.body); const text = JSON.stringify(body);
    assert.ok(text.includes('PROFILE_FIXTURE_MARKER'), 'The named profile must reach the native thread.');
    assert.equal(options.headers['session-id'], body.prompt_cache_key);
    assert.ok(options.headers['thread-id']); assert.equal(options.headers['x-client-request-id'], options.headers['thread-id']);
    const account = options.headers['chatgpt-account-id'];
    responses.push({ account, sessionId: options.headers['session-id'], threadId: options.headers['thread-id'], turnState: options.headers['x-codex-turn-state'],
      image: text.includes('image_gen__imagegen'), web: /web__|web_search/.test(text), mcp: text.includes('account_fixture'), input: body.input });
    const output = body.input.find(item => item.type === 'custom_tool_call_output' && item.call_id === 'fixture-exec');
    if (output) toolResults.push({ account, output: JSON.stringify(output) });
    const item = output ? { type: 'message', id: 'msg_fixture', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'NATIVE_TOOLS_OK', annotations: [] }] }
      : { type: 'custom_tool_call', id: 'call_fixture', call_id: 'fixture-exec', name: 'exec', input: 'text(ALL_TOOLS.filter(t => /image|web|search|account_fixture|codex_apps/.test(t.name)).map(t => t.name)); text(await tools.mcp__account_fixture__echo({})); try { const r = await tools.image_gen__imagegen({prompt:"Isolated local fixture"}); text({imageResult: typeof r}); } catch (e) { text("LOCAL_IMAGE_FIXTURE_ERROR " + String(e)); } try { text(await tools.web__run({search_query:[{q:"isolated local fixture"}],response_length:"short"})); } catch (e) { text("LOCAL_WEB_FIXTURE_ERROR " + String(e)); }' };
    return stream(body, item);
  },
});
async function connect(launch) {
  const socket = new WebSocket(launch.args[1], { headers: { authorization: 'Bearer ' + launch.env.ACEDIA_CODEX_REMOTE_TOKEN } }); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0; const callbacks = new Map(); let turnResult;
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (!message.method && callbacks.has(message.id)) {
      const job = callbacks.get(message.id); callbacks.delete(message.id); clearTimeout(job.timer); pending.delete(job.timer);
      message.error ? job.reject(new Error(JSON.stringify(message.error))) : job.resolve(message.result);
    }
    if (message.method === 'turn/completed') turnResult?.(message.params.turn);
    assert.notEqual(message.method, 'account/chatgptAuthTokens/refresh', 'The TUI must never compete with Acedia for auth refresh.');
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id; const timer = setTimeout(() => reject(new Error('RPC timeout: ' + method)), 20000); pending.add(timer);
    callbacks.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  await call('initialize', { clientInfo: { name: 'acedia_fixture_tui', version: '1' }, capabilities: { experimentalApi: true } });
  socket.send(JSON.stringify({ method: 'initialized' }));
  return { call, async turn(threadId, prompt) {
    const finished = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Turn timeout')), 30000); pending.add(timer); turnResult = turn => { clearTimeout(timer); pending.delete(timer); resolve(turn); }; });
    await call('turn/start', { threadId, input: [{ type: 'text', text: prompt }] });
    const result = await finished; assert.equal(result.status, 'completed', JSON.stringify(result.error));
  } };
}
async function tui(launch, resumeId) {
  const responseCount = responses.length;
  const terminal = pty.spawn(binary, codexRemoteTuiArgs([...(resumeId ? ['resume', resumeId] : []), ...launch.args, ...configArgs,
    '--no-alt-screen', '--model', 'gpt-6-astra', '--sandbox', 'danger-full-access', '--ask-for-approval', 'never', 'TUI fixture; use localhost tools.']),
  { env: { ...env, ...launch.env, TERM: 'xterm-256color' }, cwd: root, cols: 140, rows: 40, useConpty: true });
  let output = '', exited = false;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TUI timeout: ' + output.slice(-4000))), 25000);
      terminal.onExit(({ exitCode }) => { exited = true; clearTimeout(timer); reject(new Error('TUI exited ' + exitCode + ': ' + output.slice(-4000))); });
      terminal.onData(chunk => {
        output = (output + chunk).slice(-32000);
        if (chunk.includes('\x1b[6n')) terminal.write('\x1b[1;1R');
        if (responses.length > responseCount && output.includes('NATIVE_TOOLS_OK')) { clearTimeout(timer); resolve(); }
      });
    });
  } finally {
    if (!exited) {
      const closed = new Promise(resolve => { const timer = setTimeout(resolve, 3000); terminal.onExit(() => { clearTimeout(timer); resolve(); }); });
      terminal.kill(); await closed;
    }
  }
}
try {
  const ids = accounts.map(label => {
    const id = pool.create(label); const account = pool.account(id);
    account.auth = pool.seal(JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: token(label), id_token: token(label), refresh_token: 'fixture-refresh', account_id: label } }));
    account.backendOrigin = base; account.status = 'ready'; pool.update(id, true); return id;
  });
  await pool.setEnabled(true);
  const launches = [], threadIds = [];
  for (let index = 0; index < ids.length; index++) {
    const launch = await pool.launchNative('session-' + index, ids[index], null, { cwd: root, env, configArgs }); launches.push(launch);
    const client = await connect(launch);
    const account = await client.call('account/read', { refreshToken: false }); assert.equal(account.workspaceRouting.chatgptAccountId, accounts[index]);
    const thread = await client.call('thread/start', { model: 'gpt-6-astra', cwd: root, approvalPolicy: 'never', sandbox: 'danger-full-access' });
    threadIds.push(thread.thread.id);
    await client.turn(thread.thread.id, 'Call the local image, web and MCP fixture tools. All endpoints point to localhost.');
    assert.equal(fs.existsSync(path.join(home, 'auth.json')), false);
  }
  assert.ok(responses.length >= 4);
  assert.ok(responses.every(response => response.image));
  assert.ok(responses.some(response => response.turnState === 'fixture-turn-state'), 'The server turn state must reach continuation requests.');
  assert.deepEqual([...new Set(responses.map(response => response.account))], accounts);
  assert.equal(toolResults.length, 2);
  for (const result of toolResults) {
    assert.ok(!result.output.includes('FIXTURE_ERROR'), result.output);
    assert.ok(result.output.includes('imageResult') && result.output.includes('WEB_FIXTURE_OK') && result.output.includes('MCP_FIXTURE_OK'), result.output);
  }
  for (const account of accounts) {
    assert.deepEqual(toolRequests.filter(r => r.account === account).map(r => [r.endpoint, r.revision]), [
      ['/backend-api/codex/images/generations', 1], ['/backend-api/codex/images/generations', 2], ['/backend-api/codex/alpha/search', 2],
    ]);
  }
  pool.update(ids[0], false);
  const restarted = await pool.launchNative('session-0', null, null, { cwd: root, env, configArgs });
  launches.push(restarted);
  launches[0].release(); // An old PTY cleanup must not revoke the replacement.
  const resumed = await connect(restarted);
  assert.equal((await resumed.call('account/read', { refreshToken: false })).workspaceRouting.chatgptAccountId, accounts[1]);
  const continuation = await resumed.call('thread/resume', { threadId: threadIds[0] });
  assert.equal(continuation.thread.id, threadIds[0]);
  await tui(restarted, threadIds[0]);
  const last = responses.at(-1);
  assert.equal(last.account, accounts[1]);
  assert.ok(JSON.stringify(last.input).includes('Call the local image, web and MCP fixture tools.'));
  assert.ok(JSON.stringify(last.input).includes('TUI fixture; use localhost tools.'));
  assert.equal(last.threadId, threadIds[0]); assert.equal(last.sessionId, threadIds[0]);
  for (let attempt = 0; attempt < 100 && pool.state.recent.filter(record => record.operation === 'generation').length < responses.length; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const generations = pool.state.recent.filter(record => record.operation === 'generation');
  assert.equal(generations.length, responses.length);
  assert.ok(generations.every(record => record.status === 'completed' && record.completionObserved && record.usageReported && record.cachedTokens === 4));
  console.log('ACCOUNT_POOL_NATIVE_CACHE_IDENTITY_AND_STREAM_USAGE_OK');
  console.log('ACCOUNT_POOL_NATIVE_TUI_EXCLUSION_AND_RESUME_OK');
  for (const launch of launches) launch.release();
  assert.equal(pool.nativeSessions.size, 0);
  console.log('ACCOUNT_POOL_NATIVE_TOOLS_AND_ACCOUNT_ISOLATION_OK');
} finally {
  for (const timer of pending) clearTimeout(timer);
  for (const socket of sockets) socket.terminate();
  pool.close(); backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-native-tools-')) throw new Error('Unexpected cleanup path');
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
