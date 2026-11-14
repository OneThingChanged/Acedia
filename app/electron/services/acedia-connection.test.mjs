import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const bridge = fileURLToPath(new URL('./browser-mcp-server.mjs', import.meta.url));
const helper = fileURLToPath(new URL('./acedia-skills/acedia-connection/scripts/check.mjs', import.meta.url));
async function fixture() {
  const requests = [], state = { status: 200, body: { ok: true, schemaVersion: 1, host: { name: 'Acedia', version: 'fixture' },
    caller: { registered: true, active: true, aiToolId: 'codex' }, features: {}, tools: ['acedia_connection', 'future_host_tool'] } };
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, id: req.headers['x-acedia-agent-id'] });
    res.writeHead(state.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(state.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const env = { ...process.env, MULTIAGENT_PORT: String(server.address().port), MULTIAGENT_TOKEN: 'fixture-secret-never-print', MULTIAGENT_AGENT_ID: 'own-session' };
  return { requests, state, env };
}
function mcp(env) {
  const child = spawn(process.execPath, [bridge], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  cleanups.push(() => { child.stdin.end(); child.kill(); });
  let buffer = '', next = 0; const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) { const end = buffer.indexOf('\n'), reply = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); pending.get(reply.id)?.(reply.result); pending.delete(reply.id); }
  });
  return (method, params) => new Promise(resolve => { const id = ++next; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
}
async function fallback(env, args = []) {
  const child = spawn(process.execPath, [helper, ...args], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  if (!stdout.trim()) throw new Error('Connection helper returned no JSON: code=' + code + ' stderr=' + stderr);
  return { code, stdout, stderr, value: JSON.parse(stdout) };
}
it('checks the real host without mutations and distinguishes bridge tools from supported host tools', async () => {
  const f = await fixture(), call = mcp(f.env);
  const reply = await call('tools/call', { name: 'acedia_connection', arguments: {} });
  expect(reply.structuredContent).toMatchObject({ connected: true, host: { version: 'fixture' },
    bridge: { hostOnlyTools: ['future_host_tool'], reloadClientRecommended: true } });
  expect(f.requests).toEqual([{ method: 'GET', url: '/integration/v1/workspace/capabilities', auth: 'Bearer ' + f.env.MULTIAGENT_TOKEN, id: 'own-session' }]);
  expect(JSON.stringify(reply)).not.toContain(f.env.MULTIAGENT_TOKEN);
  expect((await call('tools/call', { name: 'acedia_connection', arguments: { restart: true } })).isError).toBe(true);
  expect(f.requests).toHaveLength(1);
});
it('reports old host, rejected authentication and invalid schema without trying alternative mutations or echoing errors', async () => {
  const f = await fixture(), call = mcp(f.env);
  for (const [status, expected] of [[404, 'capabilities-unavailable'], [401, 'authentication-failed'], [403, 'authentication-failed'], [503, 'host-error']]) {
    f.state.status = status; f.state.body = { error: 'raw ' + f.env.MULTIAGENT_TOKEN };
    const reply = await call('tools/call', { name: 'acedia_connection', arguments: {} });
    expect(reply).toMatchObject({ isError: true, structuredContent: { connected: true, reason: expected } });
    expect(JSON.stringify(reply)).not.toContain(f.env.MULTIAGENT_TOKEN);
  }
  f.state.status = 200; f.state.body = { schemaVersion: 999, tools: [] };
  expect((await call('tools/call', { name: 'acedia_connection', arguments: {} })).structuredContent.reason).toBe('unsupported-capabilities-schema');
  expect(f.requests.every(req => req.method === 'GET')).toBe(true);
});
it('diagnoses a missing session environment without a request', async () => {
  const f = await fixture(); delete f.env.MULTIAGENT_AGENT_ID;
  expect((await mcp(f.env)('tools/call', { name: 'acedia_connection', arguments: {} })).structuredContent.reason).toBe('session-environment-missing');
  expect(f.requests).toHaveLength(0);
});
it('runs the bundled fallback with the inherited identity, bypassing proxies and sanitizing errors', async () => {
  const f = await fixture(); f.env.HTTP_PROXY = 'http://127.0.0.1:1';
  const checked = await fallback(f.env);
  expect(checked).toMatchObject({ code: 0, stderr: '', value: { connected: true, host: { version: 'fixture' } } });
  expect(checked.stdout).not.toContain(f.env.MULTIAGENT_TOKEN);
  f.state.status = 401; f.state.body = { error: f.env.MULTIAGENT_TOKEN };
  const rejected = await fallback(f.env);
  expect(rejected).toMatchObject({ code: 1, value: { reason: 'authentication-failed' } });
  expect(rejected.stdout).not.toContain(f.env.MULTIAGENT_TOKEN);
  delete f.env.MULTIAGENT_TOKEN;
  expect((await fallback(f.env)).value.reason).toBe('session-environment-missing');
  expect((await fallback(f.env, ['--token', 'do-not-accept'])).value.reason).toBe('no-arguments-accepted');
  expect(f.requests).toHaveLength(2);
});
