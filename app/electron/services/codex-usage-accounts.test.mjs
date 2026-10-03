import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ProviderAccounts } from './provider-accounts.mjs';
import { AccountPool } from './account-pool.mjs';
import { CodexUsageAccounts } from './codex-usage-accounts.mjs';
import { UsageService } from './usage-service.mjs';
import { storedCodexAccountKey } from './account-identity.mjs';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';

const resources = [];
const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value).reverse(), decryptString: value => Buffer.from(value).reverse().toString() };
const auth = (workspace, subject, email = 'same@example.invalid') => ({ tokens: {
  account_id: workspace, refresh_token: 'fixture-refresh-secret',
  access_token: `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.x`,
  id_token: `x.${Buffer.from(JSON.stringify({ sub: subject, email })).toString('base64url')}.x`,
} });
const quota = usedPercent => ({ rateLimitsByLimitId: { codex: { planType: 'plus',
  primary: { usedPercent, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
  secondary: { usedPercent: usedPercent + 1, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 7200 },
} } });
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-unified-usage-'));
  const local = new ProviderAccounts(root, 'codex', { baseEnv: { CODEX_HOME: path.join(root, 'default') } });
  const pool = new AccountPool(path.join(root, 'pool'), { safeStorage, ...options });
  const usage = new UsageService(path.join(root, 'usage.db'), { scan: async () => [] });
  const registry = new CodexUsageAccounts(local, pool);
  usage.codexUsageAccounts = registry;
  usage.accountProfiles = provider => provider === 'codex' ? local.accounts : [];
  usage.claudeAccounts = () => [];
  const resource = { root, local, pool, usage, registry, servers: [] };
  resources.push(resource);
  return resource;
}
function login(local, id, workspace, subject) {
  fs.mkdirSync(local.home(id), { recursive: true });
  fs.writeFileSync(path.join(local.home(id), 'auth.json'), JSON.stringify(auth(workspace, subject)));
}
function add(pool, label, workspace, subject, used = 25) {
  const id = pool.create(label), account = pool.account(id);
  Object.assign(account, { auth: pool.seal(JSON.stringify(auth(workspace, subject))),
    identity: `${workspace}:${subject}`, email: 'same@example.invalid', plan: 'plus', status: 'ready',
    limits: quota(used), limitsAt: Date.now(), enabled: true });
  pool.persist();
  return account;
}
afterEach(async () => {
  for (const { root, usage, pool, servers } of resources.splice(0)) {
    await Promise.all(servers.map(server => server.stop()));
    pool.close(); await pool.refreshing; usage.close();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-unified-usage-')) throw new Error('Invalid fixture cleanup');
    fs.rmSync(root, { recursive: true });
  }
});

it('uses the registered name and quota for a matching default login, with no duplicate or secrets', () => {
  const { local, pool, usage, registry } = fixture();
  const first = add(pool, 'Work', 'workspace', 'user', 71);
  const second = add(pool, 'Personal', 'personal', 'user', 1);
  login(local, 'default', 'personal', 'user');
  const extra = local.create('Old label'); login(local, extra, 'personal', 'user');
  // Newer legacy numbers must not overwrite the quota of a known pool account.
  usage.writeRateLimitSnapshot({ ...registry.snapshot().snapshots[0], limitId: 'codex', updatedAt: Math.floor(Date.now() / 1000) + 60 });
  const summary = usage.rateLimitSummary();
  expect(summary.profiles.map(profile => profile.id)).toEqual([first.id, second.id]);
  expect(summary.limits.map(limit => limit.primary.usedPercent)).toEqual([71, 1]);
  expect(summary.profiles[1]).toMatchObject({ label: 'Personal', aliases: ['codex:default', `codex:${extra}`], source: 'pool' });
  expect(registry.localAccounts()).toEqual([]);
  expect(JSON.stringify(summary)).not.toMatch(/fixture-refresh-secret|access_token|id_token|workspace:user|same@example/);
  expect(fs.readFileSync(path.join(local.home('default'), 'auth.json'), 'utf8')).toContain('fixture-refresh-secret');
});

it('requires both account and subject and never combines equal emails, names or percentages', () => {
  const { local, pool, usage } = fixture();
  add(pool, 'Same name', 'workspace', 'first');
  add(pool, 'Same name', 'other-workspace', 'first');
  login(local, 'default', 'workspace', 'second');
  expect(usage.rateLimitSummary().profiles).toHaveLength(3);
  expect(usage.rateLimitSummary().profiles.every(profile => !profile.aliases?.length)).toBe(true);
  login(local, 'default', 'workspace', undefined);
  expect(storedCodexAccountKey(local.home('default'))).toBeNull();
  expect(usage.rateLimitSummary().profiles).toHaveLength(3);
  fs.writeFileSync(path.join(local.home('default'), 'auth.json'), 'x'.repeat(256 * 1024 + 1));
  expect(storedCodexAccountKey(local.home('default'))).toBeNull();
});

it('reflects rename, exclusion, pending login and removal while preserving session owners', () => {
  const { local, pool, usage } = fixture();
  const account = add(pool, 'Before', 'workspace', 'user'); login(local, 'default', 'workspace', 'user');
  pool.state.sessions.session = { accountId: account.id };
  const sessions = JSON.stringify(pool.state.sessions);
  pool.update(account.id, false, 'After');
  expect(usage.rateLimitSummary().profiles[0]).toMatchObject({ label: 'After', registered: true, visible: true, routing: { enabled: false, available: false } });
  const pending = pool.create('Pending');
  expect(usage.rateLimitSummary().profiles.find(profile => profile.id === pending)).toMatchObject({ visible: true, refresh: { status: 'login_required' } });
  expect(usage.rateLimitSummary().limits).toHaveLength(1);
  // Display changes must not mutate the routing service's assignments.
  expect(JSON.stringify(pool.state.sessions)).toBe(sessions);
  pool.state.accounts = pool.state.accounts.filter(item => item.id !== account.id);
  expect(usage.rateLimitSummary().profiles.find(profile => profile.id === account.id)).toMatchObject({ registered: false, visible: false });
  expect(JSON.stringify(pool.state.sessions)).toBe(sessions);
});

it('inherits previous visibility and persists an explicit canonical override across reload', () => {
  const { local, pool, usage } = fixture();
  usage.setProfileVisibility('codex:default', true);
  const account = add(pool, 'Unified', 'workspace', 'user'); login(local, 'default', 'workspace', 'user');
  expect(usage.rateLimitSummary().profiles[0]).toMatchObject({ id: account.id, hidden: true, visible: false });
  usage.setProfileVisibility('codex:default', false);
  usage.close();
  expect(usage.rateLimitSummary().profiles[0]).toMatchObject({ hidden: false, visible: true });
  usage.setProfileVisibility(`codex:${account.id}`, true);
  expect(usage.rateLimitSummary().profiles[0].visible).toBe(false);
  login(local, 'default', 'different-workspace', 'user');
  expect(usage.rateLimitSummary().profiles.find(profile => profile.id === account.id).visible).toBe(false);
});

it('keeps inherited visibility after the default CLI login changes to another identity', () => {
  const { local, pool, usage } = fixture();
  usage.setProfileVisibility('codex:default', true);
  const account = add(pool, 'Unified', 'workspace', 'user'); login(local, 'default', 'workspace', 'user');
  expect(usage.rateLimitSummary().profiles[0].hidden).toBe(true);
  login(local, 'default', 'different-workspace', 'user');
  usage.close();
  expect(usage.rateLimitSummary().profiles.find(profile => profile.id === account.id)).toMatchObject({ hidden: true, visible: false, aliases: [] });
});

it('keeps an unmatched direct login usable and updates aliases when that login changes', () => {
  const { local, pool, usage, registry } = fixture();
  const account = add(pool, 'Pool', 'workspace', 'user'); login(local, 'default', 'workspace', 'user');
  expect(registry.localAccounts()).toEqual([]);
  login(local, 'default', 'workspace', 'someone-else');
  expect(registry.localAccounts().map(item => item.id)).toEqual(['default']);
  expect(usage.rateLimitSummary().profiles).toHaveLength(2);
  expect(usage.rateLimitSummary().profiles.find(profile => profile.id === account.id).aliases).toEqual([]);
});

it('shares the pool refresh job across screens, checks excluded accounts and keeps old quotas on failure', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const reads = new Map(); let active = 0, peak = 0, failedId;
  const { local, pool, usage, registry } = fixture({ rpcFactory: (_env, home) => ({
    initialize: async () => {}, close: () => {},
    call: async method => {
      if (method === 'account/read') return { account: { type: 'chatgpt', planType: 'plus' } };
      if (method !== 'account/rateLimits/read') throw new Error('Unexpected RPC');
      const id = path.basename(home); reads.set(id, (reads.get(id) || 0) + 1);
      peak = Math.max(peak, ++active);
      await gate; active--;
      if (id === failedId) throw new Error('fixture failure');
      return quota(42);
    },
  }) });
  const first = add(pool, 'First', 'first', 'user'); login(local, 'default', 'first', 'user');
  const excluded = add(pool, 'Excluded', 'second', 'user'); pool.update(excluded.id, false);
  const failed = add(pool, 'Failed', 'third', 'user'); failedId = failed.id;
  usage.codexUsageFetcher = vi.fn();
  const fromDesktop = await usage.getRateLimits(true);
  const sharedJob = pool.quotaRefresh;
  expect(fromDesktop.refreshing).toBe(true);
  expect(pool.refreshAll()).toBe(sharedJob);
  registry.refresh(); expect(pool.quotaRefresh).toBe(sharedJob);
  expect((await usage.browserSummary()).refreshPending).toBe(true);
  release(); await pool.refreshing;
  const summary = usage.rateLimitSummary();
  expect(summary.refreshing).toBe(false);
  expect(peak).toBe(2);
  expect([...reads.values()]).toEqual([1, 1, 1]);
  expect(usage.codexUsageFetcher).not.toHaveBeenCalled();
  expect(summary.limits.map(limit => limit.primary.usedPercent)).toEqual([42, 42, 25]);
  expect(summary.profiles.find(profile => profile.id === failed.id).refresh.status).toBe('failed');
  for (const account of [first, excluded, failed]) expect(fs.existsSync(path.join(pool.home(account.id), 'auth.json'))).toBe(false);
});

for (const remote of [false, true]) it(`shares unified quotas through ${remote ? 'Remote' : 'Dashboard'} without exposing credentials`, async () => {
  const { local, pool, usage, root, servers } = fixture();
  const account = add(pool, 'Unified', 'workspace', 'user'); login(local, 'default', 'workspace', 'user');
  const providers = { usageProvider: (_refresh, _selection, access) => usage.rateLimitSummary(access), usageProfileVisibility: (key, hidden, access) => usage.setProfileVisibility(key, hidden, access), accountPoolApi: (...args) => pool.api(...args) };
  const web = remote ? new RemoteDashboardService({ baseDir: root, ...providers })
    : new LocalDashboardService({ baseDir: root, title: 'Fixture', configName: 'local.json', defaultPort: 0, providers });
  servers.push(web); if (remote) web.config.server_port = 0;
  const { url } = await web.start();
  const summary = await fetch(`${url}/api/usage`).then(response => response.json());
  const managed = await fetch(`${url}/api/account-pool`).then(response => response.json());
  expect(summary.profiles.map(profile => profile.id)).toEqual(managed.accounts.map(item => item.id));
  expect(summary.limits[0].primary.usedPercent).toBe(managed.accounts[0].limits.rateLimitsByLimitId.codex.primary.usedPercent);
  expect(JSON.stringify(summary)).not.toMatch(/fixture-refresh-secret|access_token|id_token|workspace:user/);
  const response = await fetch(`${url}/api/usage/profile-visibility`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: `codex:${account.id}`, hidden: true }) });
  expect(response.status).toBe(200);
  expect((await response.json()).profiles[0].visible).toBe(false);
  if (remote) expect((await fetch(`${url}/api/usage`, { headers: { 'cf-connecting-ip': '203.0.113.10' } })).status).toBe(401);
  if (remote) {
    web.config.owner = 'owner'; web.access.approved = ['guest'];
    const headers = { 'cf-connecting-ip': '203.0.113.10', cookie: `multiagent_remote=${web.sign('guest')}` };
    const guest = await fetch(`${url}/api/usage`, { headers }).then(response => response.json());
    expect(guest.profiles).toEqual([]); expect(guest.limits).toEqual([]);
    for (const key of [`codex:${account.id}`, 'codex:default']) {
      const denied = await fetch(`${url}/api/usage/profile-visibility`, { method: 'POST', headers: { ...headers, origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ profileKey: key, hidden: false }) });
      expect(denied.status).toBe(403);
    }
    const owner = await fetch(`${url}/api/usage`, { headers: { ...headers, cookie: `multiagent_remote=${web.sign('owner')}` } }).then(response => response.json());
    expect(owner.profiles[0].id).toBe(account.id);
    pool.state.accounts = [];
    const removed = await fetch(`${url}/api/usage`, { headers }).then(response => response.json());
    expect(removed.profiles.some(profile => profile.id === account.id)).toBe(false);
  }
});
