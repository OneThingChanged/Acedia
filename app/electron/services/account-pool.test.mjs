import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it, expect } from 'vitest';
import { AccountPool } from './account-pool.mjs';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';

const resources = [];
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s).reverse(), decryptString: b => Buffer.from(b).reverse().toString() };
afterEach(async () => { for (const { pool, root, web } of resources.splice(0)) { pool.close(); await web?.stop(); fs.rmSync(root, { recursive: true, force: true }); } });
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
  it('distributes new sessions, preserves continuation ownership and counts actual response usage', async () => {
    const { pool, seen } = fixture(); const a = add(pool, 'A'), b = add(pool, 'B'); await pool.setEnabled(true);
    expect((await request(pool, 'one')).response.status).toBe(200);
    expect((await request(pool, 'two')).response.status).toBe(200);
    await request(pool, 'one');
    expect(seen.map(r => r.headers['chatgpt-account-id'])).toEqual(['A', 'B', 'A']);
    expect(pool.snapshot().accounts.find(x => x.id === a).stats).toEqual({ requests: 2, failures: 0, inputTokens: 24, outputTokens: 6, cachedTokens: 8 });
    expect(pool.state.sessions.two.accountId).toBe(b);
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
  it('starts device login, observes completion and clears the temporary credential file', async () => {
    let rpc;
    const { pool } = fixture({ rpcFactory: (_env, home) => {
      rpc = new EventEmitter(); rpc.initialize = async () => rpc; rpc.close = () => {};
      rpc.call = async method => {
        if (method === 'account/login/start') return { type: 'chatgptDeviceCode', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234' };
        fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify(auth('identity')));
        return { account: { type: 'chatgpt', email: 'test@example.invalid', planType: 'plus' } };
      }; return rpc;
    } });
    const id = pool.create('Test'); const login = await pool.beginLogin(id); expect(login.code).toBe('TEST-1234');
    rpc.emit('notification', { method: 'account/login/completed', params: { success: true } });
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
    }
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
