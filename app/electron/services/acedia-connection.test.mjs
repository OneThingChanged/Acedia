import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { HookService } from './hook-service.mjs';

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
  const env = { ...process.env, MULTIAGENT_RUNTIME_FILE: '', MULTIAGENT_RUNTIME_ID: '',
    MULTIAGENT_PORT: String(server.address().port), MULTIAGENT_TOKEN: 'fixture-secret-never-print', MULTIAGENT_AGENT_ID: 'own-session' };
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

async function runtimeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-mcp-reconnect-'));
  cleanups.push(() => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-mcp-reconnect-')) throw new Error('Invalid fixture path');
    return fs.rm(root, { recursive: true });
  });
  const calls = [];
  const hook = new HookService({
    baseDir: root,
    workspaceProvider(request) {
      calls.push(request);
      if (request.action === 'capabilities') {
        return { ok: true, schemaVersion: 1, tools: ['acedia_connection'], caller: { registered: true, active: true } };
      }
      return { ok: true, ack: request.body.messageId };
    },
    browserProvider: ({ agentId }) => ({ ok: true, agentId }),
  });
  cleanups.push(() => hook.stop());
  await hook.start();
  const env = { ...process.env, MULTIAGENT_RUNTIME_FILE: hook.infoPath, MULTIAGENT_RUNTIME_ID: hook.runtimeId,
    MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: 'own-session' };
  return { hook, env, calls };
}

it('keeps an owned listener and credentials when health probing is slow', async () => {
  const { hook } = await runtimeFixture();
  const { server, port, token } = hook;
  hook.health = async () => false;
  expect(await hook.refresh()).toBe(false);
  expect(hook.server).toBe(server);
  expect(hook.port).toBe(port);
  expect(hook.token).toBe(token);
});

it('reconnects the same running stdio bridge after loopback rebind and token rotation', async () => {
  const { hook, env, calls } = await runtimeFixture();
  const rpc = mcp(env);
  const call = (name, args = {}) => rpc('tools/call', { name, arguments: args });
  expect((await call('acedia_connection')).structuredContent).toMatchObject({ ok: true, connected: true });
  const originalServer = hook.server;
  await hook.stop();
  let staleRequests = 0;
  const stale = http.createServer((_request, response) => { staleRequests++; response.writeHead(401).end(); });
  await new Promise((resolve, reject) => {
    stale.once('error', reject);
    stale.listen(Number(env.MULTIAGENT_PORT), '127.0.0.1', resolve);
  });
  cleanups.push(() => new Promise(resolve => { stale.closeAllConnections(); stale.close(resolve); }));
  const replacements = await Promise.all([hook.start(), hook.refresh(), hook.start()]);
  expect(hook.server).not.toBe(originalServer);
  expect(hook.port).not.toBe(Number(env.MULTIAGENT_PORT));
  expect(hook.token).not.toBe(env.MULTIAGENT_TOKEN);
  expect(replacements).toEqual([{ port: hook.port, token: hook.token }, false, { port: hook.port, token: hook.token }]);

  const messageId = 'example-handoff-id';
  expect((await call('acedia_session_message_receive', { messageId, markRead: false })).structuredContent)
    .toMatchObject({ ok: true, ack: messageId });
  expect(calls.filter(request => request.action === 'message-receive'))
    .toEqual([{ action: 'message-receive', agentId: 'own-session', body: { messageId, markRead: false } }]);
  expect((await call('browser_tabs')).structuredContent).toMatchObject({ ok: true, agentId: 'own-session' });
  expect((await fallback(env)).value).toMatchObject({ ok: true, connected: true });
  expect(staleRequests).toBe(0);
});

it('closes the new listener if publishing its runtime descriptor fails and allows a later retry', async () => {
  const { hook } = await runtimeFixture();
  await hook.stop();
  const write = hook.writeRuntimeFiles.bind(hook);
  hook.writeRuntimeFiles = async () => { throw new Error('fixture write failure'); };
  await expect(hook.start()).rejects.toThrow('fixture write failure');
  expect(hook.server).toBeNull();
  expect(hook.port).toBe(0);
  hook.writeRuntimeFiles = write;
  const endpoint = await hook.start();
  const descriptor = JSON.parse(await fs.readFile(hook.infoPath, 'utf8'));
  expect(descriptor).toMatchObject({ ...endpoint, runtimeId: hook.runtimeId });
});

it.each(['wrong instance', 'invalid port', 'missing descriptor'])('fails closed for a %s', async mode => {
  const managed = await runtimeFixture();
  const foreign = await fixture();
  if (mode === 'missing descriptor') await fs.unlink(managed.hook.infoPath);
  else await fs.writeFile(managed.hook.infoPath, JSON.stringify({
    runtimeId: mode === 'wrong instance' ? 'different-runtime' : managed.hook.runtimeId,
    port: mode === 'invalid port' ? 65536 : Number(foreign.env.MULTIAGENT_PORT),
    token: foreign.env.MULTIAGENT_TOKEN,
  }));
  const reason = mode === 'wrong instance' ? 'runtime-instance-changed' : 'runtime-descriptor-unavailable';
  expect((await mcp(managed.env)('tools/call', { name: 'acedia_connection', arguments: {} })).structuredContent)
    .toMatchObject({ ok: false, connected: false, reason });
  expect((await fallback(managed.env)).value).toMatchObject({ ok: false, connected: false, reason });
  expect(managed.calls).toHaveLength(0);
  expect(foreign.requests).toHaveLength(0);
});

it('does not replay a write when its response is lost after delivery', async () => {
  const managed = await runtimeFixture();
  const foreign = await fixture();
  let received = 0;
  managed.hook.server.removeAllListeners('request');
  managed.hook.server.on('request', async (request, response) => {
    for await (const _chunk of request) { /* accept and read the write */ }
    received++;
    await fs.writeFile(managed.hook.infoPath, JSON.stringify({
      runtimeId: managed.hook.runtimeId, port: Number(foreign.env.MULTIAGENT_PORT), token: foreign.env.MULTIAGENT_TOKEN,
    }));
    response.destroy();
  });
  expect(await mcp(managed.env)('tools/call', { name: 'acedia_session_message_send', arguments: { message: 'fixture write' } }))
    .toMatchObject({ isError: true });
  expect(received).toBe(1);
  expect(foreign.requests).toHaveLength(0);
});
