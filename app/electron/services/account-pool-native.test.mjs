import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { gzipSync, zstdCompressSync } from 'node:zlib';
import WebSocket from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPool } from './account-pool.mjs';

const fixtures = [];
const storage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value).reverse(), decryptString: value => Buffer.from(value).reverse().toString() };
afterEach(() => { for (const { pool, root } of fixtures.splice(0)) {
  pool.close();
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-native-pool-')) throw new Error('Unexpected fixture path');
  fs.rmSync(root, { recursive: true });
} });
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-native-pool-'));
  const runtimes = [], requests = [];
  const pool = new AccountPool(root, { safeStorage: storage, port: 0, sessionFactory: options => {
    const runtime = Object.assign(new EventEmitter(), options, { publicToken: randomUUID(), closed: false,
      async start() { this.auth = await options.getAuth(false); return this; },
      attach: vi.fn(client => { client.send('{"fixture":true}'); client.close(); }),
      close() { if (this.closed) return; this.closed = true; this.emit('closed'); },
    }); runtimes.push(runtime); return runtime;
  }, fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    return new Response('data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":12,"output_tokens":3}}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  } });
  const accounts = ['A', 'B'].map(label => {
    const id = pool.create(label), account = pool.account(id);
    const token = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, fixture: label })).toString('base64url') + '.x';
    account.auth = pool.seal(JSON.stringify({ tokens: { access_token: token, refresh_token: 'private-refresh-' + label, account_id: 'chatgpt-' + label } }));
    account.backendOrigin = 'https://chatgpt.com'; account.status = 'ready'; pool.update(id, true);
    return id;
  });
  const context = { cwd: root, env: { CODEX_HOME: root }, configArgs: ['--enable', 'apps'] };
  fixtures.push({ pool, root }); await pool.setEnabled(true);
  return { pool, accounts, runtimes, requests, context, root };
}
async function request(runtime, { token = runtime.auth.accessToken, accountId = runtime.auth.chatgptAccountId, body = '{"model":"fixture","input":[]}', headers = {}, endpoint = '/responses' } = {}) {
  const response = await fetch(runtime.providerUrl + endpoint, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'chatgpt-account-id': accountId, 'content-type': 'application/json', ...headers }, body });
  return { status: response.status, text: await response.text() };
}
const deniedSocket = (url, options) => new Promise(resolve => {
  const socket = new WebSocket(url, options);
  socket.on('error', error => resolve(error.message));
});

describe('routed native tool credentials', () => {
  it('relays native search, image editing and future tool routes without changing binary payloads or counting them as model tokens', async () => {
    const f = await fixture(); await f.pool.launchNative('one', null, null, f.context);
    f.pool.fetch = vi.fn(async () => new Response('{"data":[],"usage":{"input_tokens":500,"output_tokens":20}}'));
    const bytes = Buffer.from([0, 255, 1, 2]);
    for (const endpoint of ['/alpha/search', '/images/edits', '/future_tool/uploads/file_1']) {
      expect((await request(f.runtimes[0], { endpoint, body: bytes, headers: { 'content-type': 'multipart/form-data; boundary=fixture', 'content-encoding': 'gzip' } })).status).toBe(200);
    }
    expect(f.pool.fetch.mock.calls[0][1]).toMatchObject({ body: bytes, redirect: 'manual', headers: { 'content-type': 'multipart/form-data; boundary=fixture', 'content-encoding': 'gzip', 'chatgpt-account-id': 'chatgpt-A' } });
    expect(f.pool.account(f.accounts[0]).stats).toMatchObject({ measuredRequests: 0, unmeasuredRequests: 0, inputTokens: 0, outputTokens: 0 });
    expect(f.pool.state.recent.every(r => r.operation === 'tool' && r.status === 'completed')).toBe(true);
  });
  it.each([403, 429])('preserves tool-specific HTTP %s errors without disabling model requests on the account', async status => {
    const f = await fixture(); await f.pool.launchNative('one', null, null, f.context);
    f.pool.fetch = vi.fn(async () => new Response('{"error":{"code":"tool_not_available"}}', { status }));
    expect(await request(f.runtimes[0], { endpoint: '/images/generations' })).toEqual({ status, text: '{"error":{"code":"tool_not_available"}}' });
    expect(f.pool.eligible(f.pool.account(f.accounts[0]))).toBe(true);
    expect(f.pool.state.recent[0].status).toBe('failed');
  });
  it('rejects oversized, foreign-origin and traversal requests before contacting upstream', async () => {
    const f = await fixture(); await f.pool.launchNative('one', null, null, f.context);
    const runtime = f.runtimes[0];
    expect((await request(runtime, { endpoint: '/images/%2e%2e%2foutside' })).status).toBe(404);
    expect((await request(runtime, { endpoint: '/images/generations', headers: { origin: 'https://unrelated.invalid' } })).status).toBe(403);
    expect((await request(runtime, { body: gzipSync(Buffer.alloc(33 * 1024 * 1024, 32)), headers: { 'content-encoding': 'gzip' } })).status).toBe(415);
    expect(f.requests).toHaveLength(0);
  });
  it('keeps two sessions on separate accounts and never exposes real credentials in launch arguments or snapshots', async () => {
    const f = await fixture();
    const first = await f.pool.launchNative('one', f.accounts[0], null, f.context);
    const second = await f.pool.launchNative('two', f.accounts[1], null, f.context);
    expect(first.args[0]).toBe('--remote'); expect(first.env.ACEDIA_ACCOUNT_POOL_KEY).toBeUndefined();
    expect(f.runtimes.map(r => r.auth.chatgptAccountId)).toEqual(['chatgpt-A', 'chatgpt-B']);
    expect((await request(f.runtimes[0])).status).toBe(200);
    expect((await request(f.runtimes[1])).status).toBe(200);
    expect(f.requests.map(r => r.headers['chatgpt-account-id'])).toEqual(['chatgpt-A', 'chatgpt-B']);
    expect((await request(f.runtimes[0], { token: f.runtimes[1].auth.accessToken })).status).toBe(401);
    expect((await request(f.runtimes[0], { accountId: 'chatgpt-B' })).status).toBe(401);
    expect(f.requests).toHaveLength(2);
    const publicData = JSON.stringify({ first, second, snapshot: f.pool.snapshot() });
    for (const runtime of f.runtimes) expect(publicData).not.toContain(runtime.auth.accessToken);
    expect(publicData).not.toContain('private-refresh');
    expect(fs.existsSync(path.join(f.root, 'auth.json'))).toBe(false);
  });
  it.each(['gzip', 'zstd'])('preserves native tool metadata in bounded %s requests and counts native response usage', async encoding => {
    const f = await fixture(); await f.pool.launchNative('one', null, null, f.context);
    const body = JSON.stringify({ model: 'fixture', input: [{ type: 'additional_tools', role: 'developer', tools: [{ type: 'function', name: 'image_gen' }] }], client_metadata: { native: 'fixture' } });
    const compressed = (encoding === 'gzip' ? gzipSync : zstdCompressSync)(Buffer.from(body));
    expect((await request(f.runtimes[0], { body: compressed, headers: { 'content-encoding': encoding, 'x-codex-turn-metadata': 'native-metadata' } })).status).toBe(200);
    expect(f.requests[0].body.toString()).toBe(body);
    expect(f.requests[0].headers['x-codex-turn-metadata']).toBe('native-metadata');
    expect(f.pool.account(f.accounts[0]).stats).toMatchObject({ requests: 1, measuredRequests: 1, inputTokens: 12, outputTokens: 3 });
  });
  it.each(['identity', 'gzip', 'zstd'])('preserves cache affinity and JSON bytes for %s requests on separate native accounts', async encoding => {
    const f = await fixture();
    for (const [index, name] of ['one', 'two'].entries()) {
      await f.pool.launchNative(name, f.accounts[index], null, f.context);
      const body = ` { "model": "fixture", "stream": true, "prompt_cache_key": "cache-${name}", "input": [] } `;
      const wire = encoding === 'identity' ? body : (encoding === 'gzip' ? gzipSync : zstdCompressSync)(Buffer.from(body));
      const identity = { 'session-id': `cache-${name}`, 'thread-id': `thread-${name}`, 'x-client-request-id': `thread-${name}`,
        'x-codex-turn-state': `turn-${name}`, session_id: `legacy-${name}`, conversation_id: `conversation-${name}` };
      expect((await request(f.runtimes[index], { body: wire, headers: { ...identity, 'content-encoding': encoding,
        cookie: 'must-not-forward', 'x-unrelated': 'must-not-forward' } })).status).toBe(200);
      const sent = f.requests.at(-1);
      expect(sent.headers).toMatchObject({ ...identity, 'chatgpt-account-id': `chatgpt-${index === 0 ? 'A' : 'B'}` });
      expect(sent.body.toString()).toBe(body);
      expect(sent.headers.cookie).toBeUndefined(); expect(sent.headers['x-unrelated']).toBeUndefined();
      expect(sent.headers['content-encoding']).toBeUndefined();
    }
  });
  it('preserves native cache identity through same-account authentication refresh', async () => {
    const f = await fixture(); await f.pool.launchNative('one', f.accounts[0], null, f.context);
    const calls = [];
    f.pool.credentials = vi.fn(async () => ({ access_token: 'renewed-local-token', account_id: 'chatgpt-A' }));
    f.pool.fetch = async (_url, options) => {
      calls.push({ headers: { ...options.headers }, body: options.body.toString() });
      return calls.length === 1 ? new Response('{}', { status: 401 })
        : new Response('data: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":3,"cached_input_tokens":4}}}\n\n',
          { headers: { 'content-type': 'application/json', 'x-codex-turn-state': 'server-turn-state' } });
    };
    const identity = { 'session-id': 'cache-one', 'thread-id': 'thread-one', 'x-client-request-id': 'thread-one', 'x-codex-turn-state': 'turn-one' };
    const body = '{"model":"fixture","stream":true,"prompt_cache_key":"cache-one","input":[]}';
    expect((await request(f.runtimes[0], { body, headers: identity })).status).toBe(200);
    expect(calls).toHaveLength(2);
    for (const call of calls) { expect(call.headers).toMatchObject({ ...identity, 'chatgpt-account-id': 'chatgpt-A' }); expect(call.body).toBe(body); }
    expect(f.pool.state.recent.at(-1)).toMatchObject({ status: 'completed', completionObserved: true, usageReported: true, cachedTokens: 4 });
  });
  it('protects the TUI socket with a per-launch token and rejects browser origins', async () => {
    const f = await fixture(); const launch = await f.pool.launchNative('one', null, null, f.context);
    const url = launch.args[1];
    expect(await deniedSocket(url)).toContain('401');
    const headers = { authorization: 'Bearer ' + launch.env.ACEDIA_CODEX_REMOTE_TOKEN };
    expect(await deniedSocket(url, { headers: { ...headers, origin: 'https://unrelated.invalid' } })).toContain('403');
    const result = await new Promise((resolve, reject) => { const socket = new WebSocket(url, { headers }); socket.on('message', raw => resolve(JSON.parse(raw))); socket.on('error', reject); });
    expect(result).toEqual({ fixture: true }); expect(f.runtimes[0].attach).toHaveBeenCalledOnce();
  });
  it('revokes the old runtime when an excluded automatic account is reassigned on restart', async () => {
    const f = await fixture(); const first = await f.pool.launchNative('one', null, null, f.context);
    const old = f.runtimes[0]; f.pool.update(f.accounts[0], false);
    expect((await request(old)).status).toBe(503);
    const replacement = await f.pool.launchNative('one', null, null, f.context);
    expect(old.closed).toBe(true); expect(f.runtimes[1].auth.chatgptAccountId).toBe('chatgpt-B');
    expect((await request(old)).status).toBe(401);
    first.release(); expect(f.runtimes[1].closed).toBe(false);
    expect((await request(f.runtimes[1])).status).toBe(200);
    replacement.release(); expect(f.pool.nativeSessions.size).toBe(0);
    expect((await request(f.runtimes[1])).status).toBe(401);
  });
  it('fails closed on startup errors, account mismatch, pool disable and shutdown', async () => {
    const f = await fixture(); await f.pool.launchNative('one', null, null, f.context);
    await expect(f.runtimes[0].getAuth(true, 'chatgpt-B')).rejects.toMatchObject({ status: 409 });
    await f.pool.setEnabled(false);
    await expect(f.runtimes[0].getAuth()).rejects.toMatchObject({ status: 503 });
    expect(await f.pool.launchNative('two', null, null, f.context)).toBeNull();
    f.pool.close(); expect(f.runtimes[0].closed).toBe(true); expect(f.pool.nativeSessions.size).toBe(0);
  });
});
