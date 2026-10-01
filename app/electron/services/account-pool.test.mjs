import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it, expect } from 'vitest';
import { browserLoginUrl, accountLoginError } from './account-login.mjs';
import { AccountPool } from './account-pool.mjs';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';

const resources = [];
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s).reverse(), decryptString: b => Buffer.from(b).reverse().toString() };
afterEach(async () => { for (const { pool, root, web } of resources.splice(0)) { pool.close(); await pool.refreshing; await web?.stop(); fs.rmSync(root, { recursive: true, force: true }); } });
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-pool-test-'));
  const seen = [];
  const pool = new AccountPool(root, { safeStorage, port: 0, fetchImpl: async (url, options) => {
    seen.push({ url, ...options });
    return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { id: 'r1', usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 4 } } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
  }, ...options });
  const item = { pool, root }; resources.push(item); return { ...item, item, seen };
}
function auth(identity) {
  const jwt = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.x';
  return { auth_mode: 'chatgpt', tokens: { access_token: jwt, refresh_token: 'secret-refresh', id_token: jwt, account_id: identity } };
}
function add(pool, label) {
  const id = pool.create(label); const a = pool.account(id);
  a.auth = pool.seal(JSON.stringify(auth(label))); a.identity = label; a.status = 'ready'; pool.update(id, true); return id;
}
async function request(pool, id, overrides = {}) {
  const launch = await pool.launch(id);
  const response = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/responses`, { method: 'POST', headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}`, 'content-type': 'application/json', ...overrides.headers }, body: JSON.stringify({ model: 'test', stream: true, input: [] }) });
  return { response, text: await response.text() };
}
describe('Acedia account pool', () => {
  it('discovers models through the session owner and removes temporary credentials on success and failure', async () => {
    let rpcHome, closes = 0, failed = false;
    const { pool } = fixture({ rpcFactory: (_env, home) => {
      rpcHome = home;
      return { initialize: async () => {}, close: () => { closes++; }, call: async method => {
        expect(method).toBe('model/list');
        if (failed) throw new Error('catalog unavailable');
        return { data: [{ id: 'owner-model', model: 'owner-model', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] };
      } };
    } });
    const first = add(pool, 'A'), second = add(pool, 'B');
    await pool.setEnabled(true); await pool.launch('models', second);
    const result = await pool.sessionModels('models', first);
    expect(result.accountLabel).toBe('B'); expect(result.models[0].model).toBe('owner-model');
    expect(rpcHome).toBe(pool.home(second)); expect(fs.existsSync(path.join(rpcHome, 'auth.json'))).toBe(false);
    failed = true;
    await expect(pool.sessionModels('models', first)).rejects.toThrow('catalog unavailable');
    expect(fs.existsSync(path.join(rpcHome, 'auth.json'))).toBe(false);
    expect(pool.locks.size).toBe(0); expect(closes).toBe(2);
  });
  it('keeps the routed owner for a model restart without turning Auto into an account pin', async () => {
    const { pool } = fixture(); const first = add(pool, 'A'); add(pool, 'B');
    await pool.setEnabled(true); await pool.launch('model-session');
    await pool.launch('model-session', null, first);
    expect(pool.state.sessions['model-session'].accountId).toBe(first);
    expect(pool.state.sessions['model-session'].preferredAccountId).toBeUndefined();
    pool.account(first).cooldownUntil = Date.now() + 60000;
    await expect(pool.launch('model-session', null, first)).rejects.toMatchObject({ status: 409 });
    expect(pool.state.sessions['model-session'].accountId).toBe(first);
    await pool.setEnabled(false);
    await expect(pool.launch('model-session', null, first)).rejects.toMatchObject({ status: 409 });
  });
  it('assigns new sessions at launch and keeps the same account across restarts and turns', async () => {
    const { pool, seen } = fixture(); const first = add(pool, 'A'), second = add(pool, 'B');
    await pool.setEnabled(true);
    await pool.launch('one');
    expect(pool.state.sessions.one.accountId).toBe(first);
    expect(pool.sessionAssignment('one')).toMatchObject({ label: 'A', assigned: true });
    expect(pool.account(first).stats.requests).toBe(0);
    await pool.launch('two');
    expect(pool.state.sessions.two.accountId).toBe(second);
    await pool.launch('one');
    expect(pool.state.sessions.one.accountId).toBe(first);
    await request(pool, 'one'); await request(pool, 'one');
    expect(seen.map(call => call.headers['chatgpt-account-id'])).toEqual(['A', 'A']);
  });
  it('pins a chosen account, rejects an unavailable pin, and rebalances when changed back to auto', async () => {
    const { pool, root } = fixture(); const first = add(pool, 'A'), second = add(pool, 'B');
    await pool.setEnabled(true);
    expect(pool.choices().accounts).toMatchObject([{ id: first, available: true }, { id: second, available: true }]);
    await pool.launch('manual', second);
    expect(pool.state.sessions.manual).toMatchObject({ accountId: second, preferredAccountId: second });
    const restored = new AccountPool(root, { safeStorage });
    expect(restored.state.sessions.manual).toMatchObject({ accountId: second, preferredAccountId: second });
    restored.close();
    expect(pool.choose('manual').id).toBe(second);
    await pool.launch('manual', second);
    expect(pool.state.sessions.manual.accountId).toBe(second);
    pool.account(second).limits = { rateLimits: { primary: { usedPercent: 100, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } };
    await expect(pool.launch('manual', second)).rejects.toThrow(/선택한 분산 계정/);
    expect(pool.state.sessions.manual.accountId).toBe(second);
    await pool.launch('manual');
    expect(pool.state.sessions.manual).toMatchObject({ accountId: first, preferredAccountId: null });
  });
  it('distributes new sessions, preserves continuation ownership and counts actual response usage', async () => {
    const { pool, seen } = fixture(); const a = add(pool, 'A'), b = add(pool, 'B'); await pool.setEnabled(true);
    expect((await request(pool, 'one')).response.status).toBe(200);
    expect((await request(pool, 'two')).response.status).toBe(200);
    await request(pool, 'one');
    expect(seen.map(r => r.headers['chatgpt-account-id'])).toEqual(['A', 'B', 'A']);
    expect(pool.snapshot().accounts.find(x => x.id === a).stats).toMatchObject({ version: 3, requests: 2, failures: 0, cancelled: 0,
      measuredRequests: 2, unmeasuredRequests: 0, inputTokens: 24, outputTokens: 6, cachedTokens: 8 });
    expect(pool.state.sessions.two.accountId).toBe(b);
    expect(pool.sessionAssignment('one')).toMatchObject({ label: 'A', assigned: true });
    expect(pool.sessionAssignment('not-launched')).toMatchObject({ label: null, assigned: false });
  });
  it('never silently migrates a paused or deleted conversation account', async () => {
    const { pool, seen } = fixture(); const id = add(pool, 'A'); add(pool, 'B'); await pool.setEnabled(true);
    await request(pool, 'one'); pool.update(id, false);
    expect((await request(pool, 'one')).response.status).toBe(503);
    pool.remove(id); expect((await request(pool, 'one')).response.status).toBe(404);
    expect(seen).toHaveLength(1);
  });
  it('does not forward unauthenticated, cross-origin or unsupported requests', async () => {
    const { pool, seen } = fixture(); add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('one'); const base = `http://127.0.0.1:${pool.server.address().port}`;
    expect((await fetch(base + '/provider/models')).status).toBe(401);
    expect((await request(pool, 'one', { headers: { origin: 'https://evil.invalid' } })).response.status).toBe(403);
    expect((await fetch(base + '/provider/secrets', { headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}` } })).status).toBe(404);
    expect(seen).toHaveLength(0);
  });
  it('persists encrypted credentials and conversation ownership without exposing secrets in the dashboard', async () => {
    const { pool, root } = fixture(); const id = add(pool, 'A'); await pool.setEnabled(true); await request(pool, 'one');
    const restored = new AccountPool(root, { safeStorage });
    expect(restored.state.sessions.one.accountId).toBe(id);
    expect(restored.token('one')).toBe(pool.token('one'));
    expect(JSON.stringify(restored.snapshot())).not.toMatch(/secret-refresh|access_token|encrypted|auth_mode/);
    expect(fs.readFileSync(pool.file, 'utf8')).not.toContain('secret-refresh');
    expect(restored.snapshot(false).accounts).toEqual([]);
  });
  it('fails closed when encryption or the registry is unavailable', () => {
    const { pool, root } = fixture({ safeStorage: { isEncryptionAvailable: () => false } });
    expect(() => pool.create('A')).toThrow(/암호화/); expect(pool.state.accounts).toHaveLength(0);
    fs.writeFileSync(path.join(root, 'pool.json'), 'bad');
    expect(() => new AccountPool(root).snapshot()).toThrow(/복구/);
  });
  it('marks limited accounts, skips them for new sessions and does not retry a generation on another account', async () => {
    const { pool } = fixture({ fetchImpl: async () => new Response('private upstream body', { status: 429, headers: { 'retry-after': '120' } }) });
    const id = add(pool, 'A'); add(pool, 'B'); await pool.setEnabled(true);
    const result = await request(pool, 'one'); expect(result.response.status).toBe(429); expect(result.text).not.toContain('private upstream');
    expect(pool.account(id).cooldownUntil).toBeGreaterThan(Date.now());
    expect(pool.account(id).stats.failures).toBe(1);
    await request(pool, 'two'); expect(pool.state.sessions.two.accountId).not.toBe(id);
  });
  it('preserves ambiguous old failures separately instead of presenting them as confirmed errors', () => {
    const { pool, root } = fixture(); const id = add(pool, 'A');
    pool.account(id).stats = { requests: 100, failures: 90, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    pool.persist();
    const restored = new AccountPool(root, { safeStorage });
    expect(restored.snapshot().accounts[0].stats).toMatchObject({ version: 3, requests: 100, failures: 0,
      cancelled: 0, legacyDisconnected: 0, legacyFailedOrCancelled: 90, inputTokens: 0, outputTokens: 0 });
    restored.close();
  });
  it('preserves old disconnect counts without treating them as confirmed cancellations', () => {
    const { pool, root } = fixture(); const id = add(pool, 'A');
    pool.account(id).stats = { version: 2, requests: 100, failures: 2, cancelled: 80,
      legacyFailedOrCancelled: 7, measuredRequests: 4, unmeasuredRequests: 96,
      inputTokens: 30, outputTokens: 12, cachedTokens: 10 };
    pool.persist();
    const restored = new AccountPool(root, { safeStorage });
    expect(restored.account(id).stats).toMatchObject({ version: 3, requests: 100, failures: 2,
      cancelled: 0, legacyDisconnected: 80, legacyFailedOrCancelled: 7,
      measuredRequests: 4, unmeasuredRequests: 96, inputTokens: 30, outputTokens: 12, cachedTokens: 10 });
    restored.persist(); restored.close();
    const reopened = new AccountPool(root, { safeStorage });
    expect(reopened.account(id).stats).toMatchObject({ cancelled: 0, legacyDisconnected: 80 });
    reopened.close();
  });
  it.each([false, true])('keeps completion when the client closes after its final event (usage: %s)', async usage => {
    const { pool } = fixture({ fetchImpl: async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        const event = { type: 'response.completed', response: { id: 'r1',
          ...(usage ? { usage: { input_tokens: 12, output_tokens: 3 } } : {}) } };
        controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
        options.signal.addEventListener('abort', () => controller.error(new Error('client finished reading')), { once: true });
      },
    }), { headers: { 'content-type': 'text/event-stream' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('completed');
    const response = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/responses`, {
      method: 'POST', headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: [] }),
    });
    const reader = response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('response.completed');
    await reader.cancel();
    for (let attempt = 0; attempt < 100 && pool.state.recent.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'completed', completionObserved: true,
      httpStatus: 200, usageReported: usage, inputTokens: usage ? 12 : 0, outputTokens: usage ? 3 : 0 });
    expect(pool.account(id).stats).toMatchObject({ requests: 1, failures: 0, cancelled: 0,
      measuredRequests: usage ? 1 : 0, unmeasuredRequests: usage ? 0 : 1 });
  });
  it('keeps an explicit failure when the client closes after the error event', async () => {
    const { pool } = fixture({ fetchImpl: async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.failed"}\n\n'));
        options.signal.addEventListener('abort', () => controller.error(new Error('client read the error')), { once: true });
      },
    }), { headers: { 'content-type': 'text/event-stream' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('failed');
    const response = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/responses`, {
      method: 'POST', headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: [] }),
    });
    const reader = response.body.getReader(); await reader.read(); await reader.cancel();
    for (let attempt = 0; attempt < 100 && pool.state.recent.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'failed', completionObserved: false });
    expect(pool.account(id).stats).toMatchObject({ failures: 1, cancelled: 0 });
  });
  it('reads multiline SSE data and event names across byte and CRLF boundaries', async () => {
    const text = ': keepalive\r\nevent: response.completed\r\ndata: {"response":\r\ndata: {"usage":{"input_tokens":12,"output_tokens":3,"cached_input_tokens":4},"note":"완료"}}\r\n\r\n';
    const { pool } = fixture({ fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
    }), { headers: { 'content-type': 'text/event-stream' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true);
    expect((await request(pool, 'multiline')).text).toBe(text);
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'completed', completionObserved: true,
      usageReported: true, inputTokens: 12, outputTokens: 3, cachedTokens: 4 });
    expect(pool.account(id).stats).toMatchObject({ measuredRequests: 1, failures: 0, inputTokens: 12, outputTokens: 3 });
  });
  it('does not count cumulative usage snapshots twice and preserves measured zero', async () => {
    let text = 'data: {"type":"response.created","response":{"usage":{"input_tokens":10,"output_tokens":2}}}\n\n'
      + 'data: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":3}}}\n\n';
    const { pool } = fixture({ fetchImpl: async () => new Response(text, { headers: { 'content-type': 'text/event-stream' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true); await request(pool, 'snapshots');
    text = 'data: {"type":"response.completed","response":{"usage":{"input_tokens":0,"output_tokens":0}}}\n\n';
    await request(pool, 'zero');
    expect(pool.state.recent.at(-1)).toMatchObject({ usageReported: true, inputTokens: 0, outputTokens: 0 });
    expect(pool.account(id).stats).toMatchObject({ measuredRequests: 2, inputTokens: 12, outputTokens: 3 });
  });
  it('preserves forwarding and reads later completion after an oversized SSE event', async () => {
    const prefix = 'data: {"type":"response.output_text.delta","delta":"' + 'x'.repeat(2 * 1024 * 1024);
    const suffix = '"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":3}}}\n\n';
    const { pool } = fixture({ fetchImpl: async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(prefix));
      controller.enqueue(new TextEncoder().encode(suffix)); controller.close();
    } }), { headers: { 'content-type': 'text/event-stream' } }) });
    add(pool, 'A'); await pool.setEnabled(true);
    const { text } = await request(pool, 'oversized');
    expect(text.length).toBe(prefix.length + suffix.length);
    expect(text.endsWith(suffix)).toBe(true);
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'completed', usageReported: true,
      inputTokens: 12, outputTokens: 3 });
  });
  it('recognizes an explicitly completed untyped response in SSE', async () => {
    const { pool } = fixture({ fetchImpl: async () => new Response('data: {"status":"completed","usage":{"input_tokens":2,"output_tokens":1}}\n\n',
      { headers: { 'content-type': 'text/event-stream' } }) });
    add(pool, 'A'); await pool.setEnabled(true); await request(pool, 'untyped');
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'completed', completionObserved: true,
      usageReported: true, inputTokens: 2, outputTokens: 1 });
  });
  it('keeps failed and incomplete JSON responses as failures even if they contain usage', async () => {
    let status = 'failed';
    const { pool } = fixture({ fetchImpl: async () => new Response(JSON.stringify({ status,
      usage: { input_tokens: 2, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true); await request(pool, 'failed');
    status = 'incomplete'; await request(pool, 'incomplete');
    expect(pool.state.recent.map(record => record.status)).toEqual(['failed', 'failed']);
    expect(pool.account(id).stats).toMatchObject({ failures: 2, cancelled: 0, measuredRequests: 2 });
  });
  it('orders recent requests by their displayed start time when streams finish out of order', async () => {
    let now = Date.now(), finishFirst, calls = 0;
    const { pool } = fixture({ now: () => now, fetchImpl: async () => ++calls === 1
      ? new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n'));
        finishFirst = () => { controller.enqueue(new TextEncoder().encode('data: {"type":"response.completed"}\n\n')); controller.close(); };
      } }), { headers: { 'content-type': 'text/event-stream' } })
      : new Response('data: {"type":"response.completed"}\n\n', { headers: { 'content-type': 'text/event-stream' } }) });
    add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('earlier');
    const first = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/responses`, {
      method: 'POST', headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: [] }),
    });
    now += 10_000; await request(pool, 'later'); finishFirst(); await first.text();
    expect(pool.snapshot().recent.map(record => record.sessionId)).toEqual(['later', 'earlier']);
  });
  it('counts a client-aborted successful HTTP stream as cancelled, not failed or zero measured tokens', async () => {
    const { pool } = fixture({ fetchImpl: async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n'));
        options.signal.addEventListener('abort', () => controller.error(new Error('client disconnected')), { once: true });
      },
    }), { headers: { 'content-type': 'text/event-stream' } }) });
    const accountId = add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('interrupted');
    const abort = new AbortController();
    const response = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/responses`, {
      method: 'POST', signal: abort.signal,
      headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: [] }),
    });
    await response.body.getReader().read(); abort.abort();
    for (let attempt = 0; attempt < 50 && pool.state.recent.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'cancelled', httpStatus: 200,
      operation: 'generation', usageReported: false, inputTokens: 0, outputTokens: 0 });
    expect(pool.account(accountId).stats).toMatchObject({ requests: 1, failures: 0, cancelled: 1,
      measuredRequests: 0, unmeasuredRequests: 1 });
  });
  it('counts an internally aborted upstream stream as a failure', async () => {
    const { pool } = fixture({ fetchImpl: async (_url, options) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n'));
        options.signal.addEventListener('abort', () => controller.error(new Error('upstream timeout')), { once: true });
      },
    }), { headers: { 'content-type': 'text/event-stream' } }) });
    const accountId = add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('timeout');
    const response = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: [] }),
    });
    await response.body.getReader().read();
    for (const controller of pool.controllers) controller.abort();
    for (let attempt = 0; attempt < 50 && pool.state.recent.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'failed', httpStatus: 200 });
    expect(pool.account(accountId).stats).toMatchObject({ requests: 1, failures: 1, cancelled: 0 });
  });
  it('ignores model-list responses in generation usage coverage', async () => {
    const { pool } = fixture({ fetchImpl: async () => new Response('{"data":[]}', { headers: { 'content-type': 'application/json' } }) });
    const accountId = add(pool, 'A'); await pool.setEnabled(true);
    const launch = await pool.launch('models-only');
    const response = await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/models`, {
      headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}` },
    });
    expect(response.status).toBe(200); await response.text();
    expect(pool.state.recent.at(-1)).toMatchObject({ status: 'completed', operation: 'models', usageReported: false });
    expect(pool.account(accountId).stats).toMatchObject({ requests: 1, failures: 0, cancelled: 0,
      measuredRequests: 0, unmeasuredRequests: 0 });
  });
  it('moves an exhausted conversation to another account when its CLI session restarts', async () => {
    const calls = [];
    const { pool } = fixture({ fetchImpl: async (_url, options) => {
      calls.push(options.headers['chatgpt-account-id']);
      return calls.at(-1) === 'A'
        ? new Response('limited', { status: 429, headers: { 'retry-after': '120' } })
        : new Response('data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    } });
    const a = add(pool, 'A'), b = add(pool, 'B'); await pool.setEnabled(true);
    expect((await request(pool, 'one')).response.status).toBe(429);
    expect(pool.state.sessions.one.accountId).toBe(a);
    await pool.launch('one');
    expect(pool.state.sessions.one.accountId).toBe(b);
    expect((await request(pool, 'one')).response.status).toBe(200);
    expect(calls).toEqual(['A', 'B']);
  });
  it('keeps separate transcript attribution periods when a session changes accounts', async () => {
    let now = Date.now();
    const { pool } = fixture({ now: () => now, transcriptUsageForPeriods: periods => (
      periods.length ? { events: periods.length, inputTokens: 13, outputTokens: 6, cachedTokens: 3 } : null
    ) });
    const first = add(pool, 'A'), second = add(pool, 'B'); await pool.setEnabled(true);
    await request(pool, 'one');
    expect(pool.state.sessions.one.assignmentPeriods).toEqual([{ accountId: first, startedAt: now }]);
    now += 10_000;
    pool.account(first).limits = { rateLimits: { primary: { usedPercent: 100, resetsAt: Math.floor(now / 1000) + 3600 } } };
    await pool.launch('one');
    expect(pool.state.sessions.one.assignmentPeriods).toEqual([
      { accountId: first, startedAt: now - 10_000, endedAt: now },
      { accountId: second, startedAt: now },
    ]);
    expect(pool.snapshot().accounts.map(account => account.transcriptUsage?.events)).toEqual([1, 1]);
  });
  it('rotates a pinned account on restart when its recorded quota is full', async () => {
    const { pool } = fixture(); const a = add(pool, 'A'), b = add(pool, 'B'); await pool.setEnabled(true);
    await request(pool, 'one');
    pool.account(a).limits = { rateLimits: { primary: { usedPercent: 100, resetsAt: Math.floor(Date.now()/1000)+3600 } } };
    await pool.launch('one');
    expect(pool.state.sessions.one.accountId).toBe(b);
    expect((await request(pool, 'one')).response.status).toBe(200);
  });
  it('detects incomplete streams instead of reporting them as successful requests', async () => {
    const { pool } = fixture({ fetchImpl: async () => new Response('data: {"type":"response.created"}\n\n', { headers: { 'content-type': 'text/event-stream' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true); await request(pool, 'one'); expect(pool.account(id).stats.failures).toBe(1);
  });
  it('refreshes once on an authentication rejection and retries only the same account', async () => {
    let calls = 0, refreshes = 0;
    const { pool } = fixture({ fetchImpl: async () => ++calls === 1 ? new Response('denied', { status: 401 }) : new Response('{"usage":{"input_tokens":2,"output_tokens":1}}') });
    const id = add(pool, 'A'); add(pool, 'B'); await pool.setEnabled(true);
    const original = pool.credentials.bind(pool);
    pool.credentials = async (account, force) => { if (force) refreshes++; expect(account).toBe(id); return original(account, false); };
    expect((await request(pool, 'one')).response.status).toBe(200); expect(calls).toBe(2); expect(refreshes).toBe(1);
    expect(pool.account(id).stats.requests).toBe(1);
  });
  it('reports failed response events even when upstream HTTP status is successful', async () => {
    const { pool } = fixture({ fetchImpl: async () => new Response('data: {"type":"response.failed"}\n\n', { headers: { 'content-type': 'text/event-stream' } }) });
    const id = add(pool, 'A'); await pool.setEnabled(true); await request(pool, 'one'); expect(pool.account(id).stats.failures).toBe(1);
  });
  it('does not launch through a paused pool and excludes quota-exhausted accounts', async () => {
    const { pool } = fixture(); const a = add(pool, 'A'), b = add(pool, 'B');
    expect(await pool.launch('one')).toBeNull();
    pool.account(a).limits = { rateLimits: { primary: { usedPercent: 100, resetsAt: Math.floor(Date.now()/1000)+3600 } } };
    await pool.setEnabled(true); await request(pool, 'one'); expect(pool.state.sessions.one.accountId).toBe(b);
    const launch = await pool.launch('one'); await pool.setEnabled(false);
    expect((await fetch(`http://127.0.0.1:${pool.server.address().port}/provider/models`, { headers: { authorization: `Bearer ${launch.env.ACEDIA_ACCOUNT_POOL_KEY}` } })).status).toBe(503);
  });
  it.each(['browser','device'])('starts %s login, correlates completion and clears temporary credentials', async mode => {
    let rpc;
    const { pool } = fixture({ rpcFactory: (_env, home) => {
      rpc = new EventEmitter(); rpc.initialize = async () => rpc; rpc.close = () => {};
      rpc.call = async (method, params) => {
        if (method === 'account/login/start') {
          expect(params.type).toBe(mode === 'browser' ? 'chatgpt' : 'chatgptDeviceCode');
          return mode === 'browser' ? {type:'chatgpt',loginId:'fixture-login',authUrl:'https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback'} : { type: 'chatgptDeviceCode', loginId:'fixture-login', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' };
        }
        fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth('identity')));
        return { account: { type: 'chatgpt', email: 'test@example.invalid', planType: 'plus' } };
      }; return rpc;
    } });
    const id = pool.create('Test'); const login = await pool.beginLogin(id, mode); expect(login.method).toBe(mode); expect(login.code).toBe(mode === 'device' ? 'TEST-1234' : undefined);
    rpc.emit('notification', {method:'account/login/completed',params:{loginId:'other',success:true}});
    expect(pool.jobs.has(id)).toBe(true);
    rpc.emit('notification', { method: 'account/login/completed', params: { loginId:'fixture-login', success: true } });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(pool.account(id).status).toBe('ready'); expect(pool.account(id).enabled).toBe(false);
    expect(fs.existsSync(path.join(pool.home(id), 'auth.json'))).toBe(false);
    expect(pool.snapshot().accounts[0].login).toBeNull();
  });
  it('serializes concurrent credential refresh operations for a single account', async () => {
    let active = 0, maximum = 0;
    const { pool } = fixture({ rpcFactory: () => ({ initialize: async () => {}, close: () => {}, call: async method => {
      active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return method === 'account/read' ? { account: { type: 'chatgpt' } } : { rateLimits: { primary: { usedPercent: 20 } } };
    } }) });
    const id = add(pool, 'A'); await Promise.all([pool.credentials(id, true), pool.credentials(id, true)]);
    expect(maximum).toBe(1); expect(fs.existsSync(path.join(pool.home(id), 'auth.json'))).toBe(false);
  });
  it('refreshes every authenticated account with two RPCs at most and shares duplicate jobs', async () => {
    const seen = []; let active = 0, maximum = 0;
    const { pool } = fixture({ rpcFactory: (_env, home) => ({
      initialize: async () => { active++; maximum = Math.max(maximum, active); }, close: () => { active--; },
      call: async method => {
        if (method === 'account/read') return { account: { type: 'chatgpt' } };
        expect(method).toBe('account/rateLimits/read'); seen.push(JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')).tokens.account_id);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { rateLimits: { primary: { usedPercent: 25 } } };
      },
    }) });
    const ids = ['A', 'B', 'C', 'D', 'E'].map(label => add(pool, label));
    pool.update(ids[1], false);
    pool.account(ids[2]).limits = { rateLimits: { primary: { usedPercent: 100 } } };
    const empty = pool.create('Not signed in');
    const first = pool.refreshAll(); const second = pool.refreshAll();
    expect(second.id).toBe(first.id); expect(first.running).toBe(true);
    await pool.refreshing;
    expect(seen.sort()).toEqual(['A', 'B', 'C', 'D', 'E']); expect(maximum).toBe(2); expect(active).toBe(0);
    expect(first).toMatchObject({ running: false, total: 6, completed: 6, succeeded: 5, failed: 0, skipped: 1 });
    expect(first.results.find(item => item.id === empty)).toMatchObject({ status: 'skipped', reason: 'login_required' });
    expect(pool.account(ids[1]).enabled).toBe(false);
    for (const id of ids) {
      expect(pool.account(id).limits.rateLimits.primary.usedPercent).toBe(25);
      expect(pool.account(id).limitsAt).toBeGreaterThan(0);
      expect(pool.account(id).stats.requests).toBe(0);
      expect(fs.existsSync(path.join(pool.home(id), 'auth.json'))).toBe(false);
    }
    expect(pool.rpcs.size).toBe(0);
    expect(pool.snapshot(false).quotaRefresh).toBeUndefined();
  });
  it('preserves previous readings on partial refresh failure and still updates other accounts', async () => {
    const { pool } = fixture({ rpcFactory: (_env, home) => ({ initialize: async () => {}, close: () => {}, call: async method => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (JSON.parse(fs.readFileSync(path.join(home, 'auth.json'), 'utf8')).tokens.account_id === 'A') throw new Error('private-upstream-error SECRET');
      return { rateLimits: { primary: { usedPercent: 30 } } };
    } }) });
    const a = add(pool, 'A'), b = add(pool, 'B');
    pool.account(a).limits = { rateLimits: { primary: { usedPercent: 20 } } }; pool.account(a).limitsAt = 1000;
    const job = pool.refreshAll(); await pool.refreshing;
    expect(job).toMatchObject({ completed: 2, succeeded: 1, failed: 1, skipped: 0 });
    expect(pool.account(a)).toMatchObject({ limits: { rateLimits: { primary: { usedPercent: 20 } } }, limitsAt: 1000 });
    expect(pool.account(b).limits.rateLimits.primary.usedPercent).toBe(30);
    expect(JSON.stringify(pool.snapshot())).not.toMatch(/private-upstream|SECRET|secret-refresh|access_token/);
  });
  it('skips accounts with an active login and handles an empty account list', async () => {
    const { pool } = fixture({ rpcFactory: () => { throw new Error('Unexpected RPC'); } });
    const empty = pool.refreshAll(); await pool.refreshing;
    expect(empty).toMatchObject({ running: false, total: 0, completed: 0 });
    const id = add(pool, 'A'); pool.jobs.set(id, { public: null, finish: () => {} });
    const job = pool.refreshAll(); await pool.refreshing;
    expect(job).toMatchObject({ total: 1, succeeded: 0, failed: 0, skipped: 1 });
    expect(job.results[0]).toMatchObject({ status: 'skipped', reason: 'login_pending' });
  });
  it('recovers temporary credentials when constructing the quota RPC fails', async () => {
    const { pool } = fixture({ rpcFactory: () => { throw new Error('Cannot start CLI'); } });
    const id = add(pool, 'A'); const saved = pool.unseal(pool.account(id).auth);
    const job = pool.refreshAll(); await pool.refreshing;
    expect(job).toMatchObject({ running: false, total: 1, completed: 1, failed: 1 });
    expect(pool.unseal(pool.account(id).auth)).toBe(saved);
    expect(fs.existsSync(path.join(pool.home(id), 'auth.json'))).toBe(false);
    expect(pool.rpcs.size).toBe(0); expect(pool.locks.size).toBe(0);
  });
  it('stops quota RPCs and queued accounts on service shutdown', async () => {
    let started = 0, closed = 0;
    const { pool } = fixture({ rpcFactory: () => {
      let rejectPending, terminated = false;
      return { initialize: async () => {}, close: () => { if (terminated) return; terminated = true; closed++; rejectPending?.(new Error('closed')); }, call: async method => {
        if (method === 'account/read') return { account: { type: 'chatgpt' } };
        started++; return new Promise((_resolve, reject) => { rejectPending = reject; });
      } };
    } });
    const ids = ['A', 'B', 'C'].map(label => add(pool, label));
    const job = pool.refreshAll(); const pending = pool.refreshing;
    for (let attempt = 0; attempt < 100 && started < 2; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(started).toBe(2); pool.close(); await pending;
    expect(job).toMatchObject({ running: false, total: 3, completed: 3, failed: 0, skipped: 3 });
    expect(pool.rpcs.size).toBe(0); expect(closed).toBe(2);
    for (const id of ids) expect(fs.existsSync(path.join(pool.home(id), 'auth.json'))).toBe(false);
  });
  it('starts a background quota refresh through the local Dashboard and polls the shared job', async () => {
    let release, reads = 0;
    const held = new Promise(resolve => { release = resolve; });
    const { pool, root, item } = fixture({ rpcFactory: () => ({ initialize: async () => {}, close: () => release(), call: async method => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      reads++; await held; return { rateLimits: { primary: { usedPercent: 25 } } };
    } }) });
    add(pool, 'A');
    const web = new LocalDashboardService({ baseDir: root, configName: 'web.json', defaultPort: 0, providers: { accountPoolApi: (...args) => pool.api(...args) } }); item.web = web;
    const { url } = await web.start();
    const start = () => fetch(url + '/api/account-pool', { method: 'POST', headers: { 'content-type': 'application/json', origin: new URL(url).origin }, body: JSON.stringify({ action: 'refresh_all' }) }).then(response => response.json());
    const first = await start(); expect(first.quotaRefresh.running).toBe(true);
    const second = await start(); expect(second.quotaRefresh.id).toBe(first.quotaRefresh.id);
    expect((await fetch(url + '/api/account-pool').then(response => response.json())).quotaRefresh.running).toBe(true);
    release(); await pool.refreshing;
    expect(reads).toBe(1);
    expect((await fetch(url + '/api/account-pool').then(response => response.json())).quotaRefresh).toMatchObject({ running: false, succeeded: 1 });
  });
  it('requires owner permissions and same-origin JSON for web management', async () => {
    const { pool, root, item } = fixture();
    const web = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), accountPoolApi: (...args) => pool.api(...args) });
    item.web = web; web.config.server_port = 0; web.config.owner = 'owner'; web.access.approved = ['guest'];
    web.isDirectLocal = () => false;
    const status = await web.start(); const base = status.url || `http://127.0.0.1:${web.server.address().port}`;
    const owner = { cookie: `multiagent_remote=${web.sign('owner')}`, origin: base };
    const guest = { cookie: `multiagent_remote=${web.sign('guest')}` };
    expect((await fetch(base + '/api/account-pool')).status).toBe(401);
    expect(await fetch(base + '/api/account-pool', { headers: guest }).then(r => r.json())).toMatchObject({ canManage: false });
    for (const headers of [guest, { ...owner, origin: 'https://evil.invalid' }]) {
      expect((await fetch(base + '/api/account-pool', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', label: 'A' }) })).status).toBe(403);
      expect((await fetch(base + '/api/account-pool', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh_all' }) })).status).toBe(403);
    }
    expect(pool.quotaRefresh).toBeNull();
    expect((await fetch(base + '/api/account-pool', { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', label: 'A' }) })).status).toBe(200);
  });
  it('serves the account UI through the existing local Dashboard', async () => {
    const { pool, root, item } = fixture();
    const web = new LocalDashboardService({ baseDir: root, configName: 'web.json', defaultPort: 0, providers: { accountPoolApi: (...args) => pool.api(...args) } }); item.web = web;
    const { url } = await web.start();
    expect(await fetch(url).then(r => r.text())).toContain('accountPoolView');
    expect((await fetch(url + '/pwa/account-pool.js')).status).toBe(200);
    expect(await fetch(url + '/api/account-pool').then(r => r.json())).toMatchObject({ canManage: true, enabled: false });
  });
});

it('validates browser origins and loopback redirects and redacts raw errors', () => {
  for (const url of ['https://evil.test/?redirect_uri=http://localhost:1455/auth/callback','https://auth.openai.com/?redirect_uri=https://evil.test/auth/callback','http://auth.openai.com/?redirect_uri=http://localhost:1455/auth/callback']) expect(()=>browserLoginUrl(url)).toThrow();
  expect(accountLoginError('device code authentication is disabled SECRET')).toContain('비활성화');
  expect(accountLoginError('EADDRINUSE SECRET')).toContain('콜백 포트');
  expect(accountLoginError('unrecognized SECRET')).not.toContain('SECRET');
});
it('cancels the matching login and preserves previous encrypted credentials on failure', async () => {
  const calls = [];
  const rpc = new EventEmitter(); rpc.initialize=async()=>rpc; rpc.close=()=>{};
  rpc.call=async(method,params)=>{calls.push({method,params});return {type:'chatgpt',loginId:'cancel-id',authUrl:'https://auth.openai.com/oauth/authorize?redirect_uri=http://localhost:1455/auth/callback'};};
  const {pool}=fixture({rpcFactory:()=>rpc}); const id=add(pool,'Existing'); const original=pool.account(id).auth;
  await pool.beginLogin(id); await pool.cancelLogin(id);
  expect(calls).toContainEqual({method:'account/login/cancel',params:{loginId:'cancel-id'}});
  expect(pool.account(id).auth).toEqual(original);
  expect(pool.account(id).loginError).toContain('취소');
  expect(pool.jobs.size).toBe(0);
  expect(fs.existsSync(path.join(pool.home(id),'auth.json'))).toBe(false);
});

it('advertises and applies a server-selected default login method for each access context', async () => {
  const {pool}=fixture(); const calls=[]; pool.beginLogin=async(...args)=>calls.push(args);
  for(const local of [true,false]) {
    const result={writeHead(){},end(body){this.body=JSON.parse(body);}};
    await pool.api({method:'GET'},result,new URL('http://localhost/api/account-pool'),{local,admin:true});
    expect(result.body.defaultLoginMethod).toBe(local?'browser':'device');
    await pool.api({method:'POST',headers:{'content-type':'application/json'}},result,new URL('http://localhost/api/account-pool'),{local,admin:true,allowed:()=>true,readJson:async()=>({action:'login',id:'fixture'})});
    expect(calls.at(-1)).toEqual(['fixture',local?'browser':'device']);
  }
});
