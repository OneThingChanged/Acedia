import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createUsageServer } from './server.mjs';
import { Collector } from './collector.mjs';
import { parseUsage } from './parser.mjs';
import { request, validateEvent, serverUrl, token, hash } from './protocol.mjs';
import { seal } from './credentials.mjs';
import { deviceMetadata, loginIdentity, validateDevice } from './metadata.mjs';

const cleanup = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-collector-test-'));
  cleanup.push(() => { if (path.dirname(root) !== fs.realpathSync(os.tmpdir()) && path.dirname(root) !== path.resolve(os.tmpdir())) throw Error('Unsafe fixture path'); fs.rmSync(root, { recursive: true, force: true }); });
  const credential = token(), service = createUsageServer({ databasePath: path.join(root, 'server.db'), adminToken: credential });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve)); cleanup.push(() => service.close());
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  const admin = (route, body) => request(origin, '/v1/' + route, { credential, body });
  const employee = await admin('admin/employees', { name: 'Employee A' });
  const other = await admin('admin/employees', { name: 'Employee B' });
  const codex = await admin('admin/accounts', { name: 'Shared Codex', provider: 'codex', kind: 'shared' });
  const claude = await admin('admin/accounts', { name: 'Shared Claude', provider: 'claude', kind: 'shared' });
  const privateAccount = await admin('admin/accounts', { name: 'Private', provider: 'claude', kind: 'personal', ownerId: other.id });
  const enrollment = await admin('admin/enrollments', { employeeId: employee.id });
  const collector = new Collector(path.join(root, 'client'), { seal: v => v, unseal: v => v }); cleanup.push(() => collector.stop());
  await collector.enroll(origin, enrollment.code, 'Fixture PC');
  const transcripts = path.join(root, 'transcripts'); fs.mkdirSync(transcripts);
  await collector.configure({ enabled: true, roots: [{ path: transcripts, provider: 'codex', accountId: codex.id }] });
  return { root, service, origin, admin, employee, other, codex, claude, privateAccount, collector, transcripts, enrollment };
}
const codexLog = (sessionId = 'test-session', total = 140) => [
  { type: 'session_meta', payload: { id: sessionId, cwd: 'PRIVATE_PATH' } },
  { type: 'turn_context', payload: { model: 'test-model' } },
  { type: 'event_msg', timestamp: new Date(Date.now()).toISOString(), payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, output_tokens: total - 100, cached_input_tokens: 20, reasoning_output_tokens: 10, total_tokens: total }, total_token_usage: { total_tokens: total } } }, secretPrompt: 'PRIVATE_PROMPT' },
];
const write = (file, items) => fs.writeFileSync(file, items.map(i => JSON.stringify(i)).join('\n') + '\n');
describe('central usage collector', () => {
  it('continues collecting after a large image transcript line', async () => {
    const f = await fixture();
    const items = codexLog();
    items.splice(1, 0, { type: 'response_item', payload: { type: 'message', content: 'x'.repeat(5 * 1024 * 1024) } });
    const file = path.join(f.transcripts, 'large.jsonl'); write(file, items);
    for (let i = 0; i < 3; i++) f.collector.scan(file, f.collector.config().roots[0]);
    expect(f.collector.db.prepare('SELECT COUNT(*) n FROM outbox').get().n).toBe(1);
    expect(f.collector.db.prepare('SELECT offset FROM sources').get().offset).toBe(fs.statSync(file).size);
  });
  it('aggregates full-period timelines beyond 500 events with Korean dates and employee scoping', async () => {
    const f = await fixture(), base = Date.parse('2026-01-01T14:59:59Z');
    const insert = f.service.db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)');
    for (let i = 0; i < 501; i++) insert.run(token(), f.employee.id, 'fixture-device', f.codex.id, 'codex', base + i * 1000, 2, '{}');
    insert.run(token(), f.other.id, 'other-device', f.codex.id, 'codex', base, 5, '{}');
    const route = '/v1/summary?from=' + (base - 1000) + '&to=' + (base + 600000);
    const summary = await f.admin(route.slice(4));
    expect(summary.recent).toHaveLength(500);
    expect(summary.recent[0]).toMatchObject({ input: null, cacheRead: null, output: null, reasoning: null });
    expect(summary.timeline.reduce((sum, row) => sum + row.total, 0)).toBe(1007);
    const own = await request(f.origin, route, { credential: f.collector.credential() });
    expect(own.timeline.every(row => row.employeeId === f.employee.id)).toBe(true);
    expect(own.timeline.reduce((sum, row) => sum + row.total, 0)).toBe(1002);
    expect(own.timeline.map(row => [new Date(row.day).toISOString().slice(0, 10), row.total])).toEqual([['2026-01-01', 2], ['2026-01-02', 1000]]);
  });

  it('allows no-login access only in explicit local test mode and preserves device scoping', async () => {
    const f = await fixture();
    expect((await fetch(f.origin + '/v1/summary')).status).toBe(401);
    const service = createUsageServer({ databasePath: path.join(f.root, 'local-test.db'), adminToken: token(), localTestNoLogin: true });
    await new Promise(r => service.server.listen(0, '127.0.0.1', r)); cleanup.push(() => service.close());
    const origin = `http://127.0.0.1:${service.server.address().port}`;
    expect((await request(origin, '/v1/access')).localTestNoLogin).toBe(true);
    expect((await request(origin, '/v1/summary')).role).toBe('admin');
    const employee = await request(origin, '/v1/admin/employees', { body: { name: 'Test employee' } });
    const code = await request(origin, '/v1/admin/enrollments', { body: { employeeId: employee.id } });
    const device = await request(origin, '/v1/enroll', { body: { code: code.code, name: 'Test PC' } });
    expect((await request(origin, '/v1/summary', { credential: device.token })).role).toBe('employee');
    expect((await fetch(origin + '/v1/summary', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401);
    expect((await fetch(origin + '/v1/summary', { headers: { origin: 'https://example.test' } })).status).toBe(401);
    expect((await fetch(origin + '/v1/summary', { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(401);
  });
  it('defaults unregistered accounts to personal and requires a registered shared login for shared classification', async () => {
    const f = await fixture();
    expect((await f.admin('accounts')).accounts.find(a => a.id === f.codex.id).kind).toBe('personal');
    const defaultAccount = await f.admin('admin/accounts', { name: 'Default personal', provider: 'codex', ownerId: f.employee.id });
    expect((await f.admin('accounts')).accounts.find(a => a.id === defaultAccount.id).kind).toBe('personal');
    await f.admin('admin/accounts', { id: f.codex.id, name: 'Explicit shared login', provider: 'codex', kind: 'shared', loginEmail: 'shared@company.test' });
    expect((await f.admin('accounts')).accounts.find(a => a.id === f.codex.id).kind).toBe('shared');
    expect((await f.collector.accounts()).find(a => a.id === f.codex.id).kind).toBe('shared');
  });
  it('uses the server login registry for shared usage and quotas across client mappings', async () => {
    const f = await fixture(), login = { id: hash('registered-login'), email: 'Team@Company.test' };
    const registered = await f.admin('admin/accounts', { name: 'Company team', provider: 'codex', kind: 'shared', loginEmail: ' team@company.test ', providerIdentityId: login.id });
    write(path.join(f.transcripts, 'registry.jsonl'), codexLog()); await f.collector.tick();
    const original = JSON.parse(f.collector.db.prepare('SELECT json FROM outbox').get().json);
    const event = { ...original, id: token(), providerIdentity: login };
    const result = await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [event] } });
    expect(result.accepted).toEqual([event.id]);
    expect((await f.admin('summary')).rows.find(r => r.accountId === registered.id).total).toBe(140);
    await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [event] } });
    expect((await f.admin('summary')).total).toBe(280);
    await f.admin('refresh', { accountId: registered.id });
    const heartbeat = await request(f.origin, '/v1/heartbeat', { credential: f.collector.credential(), body: { accounts: [{ accountId: f.codex.id, identity: login, status: 'success', quota: null, checkedAt: Date.now() }] } });
    expect(heartbeat.refreshRequests.some(r => r.accountId === f.codex.id)).toBe(true);
    expect((await f.admin('summary')).reports.find(r => r.identity?.id === login.id).accountId).toBe(registered.id);
    await expect(f.admin('admin/accounts', { name: 'Duplicate', provider: 'codex', kind: 'shared', loginEmail: login.email })).rejects.toThrow('already registered');
    const wrong = await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [{ ...event, id: token(), accountId: registered.id, providerIdentity: { ...login, id: hash('different') } }] } });
    expect(wrong.accepted).toEqual([]);
    const code = await f.admin('admin/enrollments', { employeeId: f.other.id });
    const other = await request(f.origin, '/v1/enroll', { body: { code: code.code, name: 'Other PC' } });
    await request(f.origin, '/v1/events', { credential: other.token, body: { events: [{ ...event, id: token() }] } });
    expect((await f.admin('summary')).rows.filter(r => r.accountId === registered.id)).toHaveLength(2);
    const scoped = await request(f.origin, '/v1/summary', { credential: other.token });
    expect(scoped.accountTotals.find(r => r.accountId === registered.id).total).toBe(280);
    expect(scoped.rows.find(r => r.accountId === registered.id).total).toBe(140);
    expect(scoped.employees.map(e => e.id)).toEqual([f.other.id]);
    expect(scoped.recent.every(r => r.employeeId === f.other.id)).toBe(true);
    expect((await f.admin('summary?from=1&to=2')).accountTotals).toEqual([]);
    await expect(f.admin('admin/accounts', { id: registered.id, name: 'Company team', provider: 'codex', kind: 'personal', ownerId: f.employee.id, loginEmail: login.email })).rejects.toThrow('Other employees');
  });
  it('matches email-only registrations but refuses other employees personal accounts', async () => {
    const f = await fixture();
    const account = await f.admin('admin/accounts', { name: 'Private Codex', provider: 'codex', kind: 'personal', ownerId: f.other.id, loginEmail: 'owner@company.test' });
    write(path.join(f.transcripts, 'private.jsonl'), codexLog()); await f.collector.tick();
    const original = JSON.parse(f.collector.db.prepare('SELECT json FROM outbox').get().json);
    const event = { ...original, id: token(), providerIdentity: { id: hash('private'), email: 'OWNER@company.test' } };
    const denied = await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [event] } });
    expect(denied.accepted).toEqual([]);
    const code = await f.admin('admin/enrollments', { employeeId: f.other.id });
    const other = await request(f.origin, '/v1/enroll', { body: { code: code.code, name: 'Owner PC' } });
    expect((await request(f.origin, '/v1/events', { credential: other.token, body: { events: [event] } })).accepted).toEqual([event.id]);
    expect((await f.admin('summary')).rows.find(r => r.accountId === account.id).total).toBe(140);
    await expect(request(f.origin, '/v1/admin/accounts', { credential: other.token, body: { id: account.id, kind: 'shared' } })).rejects.toThrow('Administrator');
  });
  it('preserves earlier event attribution when a server login is registered later', async () => {
    const f = await fixture(), login = { id: hash('later-registration'), email: 'later@company.test' };
    write(path.join(f.transcripts, 'old.jsonl'), codexLog()); await f.collector.tick();
    const original = JSON.parse(f.collector.db.prepare('SELECT json FROM outbox').get().json);
    const event = { ...original, id: token(), providerIdentity: login };
    await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [event] } });
    const registered = await f.admin('admin/accounts', { name: 'Later registered', provider: 'codex', kind: 'shared', loginEmail: login.email });
    const update = await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [{ ...event, total: 141 }, { ...event, id: token() }] } });
    expect(update.rejected).toEqual([]);
    const summary = await f.admin('summary');
    expect(summary.rows.find(r => r.accountId === registered.id).total).toBe(140);
    expect(summary.rows.find(r => r.accountId === f.codex.id).total).toBe(281);
    await expect(f.admin('admin/accounts', { id: f.codex.id, name: 'Wrong binding', provider: 'codex', kind: 'shared', loginEmail: 'someone-else@company.test' })).rejects.toThrow('different login');
  });
  it('allows the requested local admin key only with explicit local mode', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-local-admin-'));
    try {
      expect(() => createUsageServer({ databasePath: path.join(root, 'reject.db'), adminToken: 'admin' })).toThrow();
      const service = createUsageServer({ databasePath: path.join(root, 'server.db'), adminToken: 'admin', allowLocalAdmin: true });
      await new Promise(r => service.server.listen(0, '127.0.0.1', r));
      try { const origin = `http://127.0.0.1:${service.server.address().port}`; expect((await request(origin, '/v1/summary', { credential: 'admin' })).role).toBe('admin'); }
      finally { await service.close(); }
    } finally { if (path.dirname(root) !== path.resolve(os.tmpdir())) throw Error('Unsafe test directory'); fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('keeps Windows user/IP per event and exposes device metadata only within employee scope', async () => {
    const f = await fixture(); write(path.join(f.transcripts, 'sender.jsonl'), codexLog()); await f.collector.tick();
    const summary = await f.admin('summary');
    expect(summary.devices[0].metadata).toEqual(deviceMetadata());
    expect(summary.recent[0]).toMatchObject({ input: 80, cacheRead: 20, output: 30, reasoning: 10, total: 140 });
    expect(summary.recent[0].sender.windowsUser).toBe(deviceMetadata().windowsUser);
    expect(summary.recent[0].sender.localIps).toEqual(deviceMetadata().localIps);
    const original = JSON.parse(f.collector.db.prepare('SELECT json FROM outbox').get().json);
    await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: [{ ...original, total: 141, sender: { hostname: 'Later PC', windowsUser: 'Another user', localIps: ['192.168.1.99'] } }] } });
    expect((await f.admin('summary')).recent[0].sender).toEqual(original.sender);
    const code = await f.admin('admin/enrollments', { employeeId: f.other.id });
    const other = await request(f.origin, '/v1/enroll', { body: { code: code.code, name: 'Other' } });
    const isolated = await request(f.origin, '/v1/summary', { credential: other.token });
    expect(isolated.recent).toEqual([]); expect(isolated.senders).toEqual([]); expect(isolated.devices).toHaveLength(1); expect(isolated.devices[0].metadata).toBeNull();
    expect(() => validateDevice({ hostname: 'PC', windowsUser: 'USER', localIps: ['not-ip'] })).toThrow();
    expect(() => validateDevice({ ...deviceMetadata(), password: 'secret' })).toThrow();
  });
  it('aggregates historical Windows users across the full period beyond the recent-event limit', async () => {
    const f = await fixture(); write(path.join(f.transcripts, 'users.jsonl'), codexLog()); await f.collector.tick();
    const original = JSON.parse(f.collector.db.prepare('SELECT json FROM outbox').get().json);
    const sender = { hostname: 'PC-B', windowsUser: 'PC-B\\bob', localIps: ['192.168.1.20'] };
    const events = Array.from({ length: 501 }, (_, i) => ({ ...original, id: token(), sessionId: 'sender-' + i, sender }));
    const legacy = { ...original, id: token(), sessionId: 'legacy' }; delete legacy.sender;
    events.push(legacy);
    for (let i = 0; i < events.length; i += 200) await request(f.origin, '/v1/events', { credential: f.collector.credential(), body: { events: events.slice(i, i + 200) } });
    const summary = await f.admin('summary');
    expect(summary.recent).toHaveLength(500);
    expect(summary.senders).toHaveLength(3);
    expect(summary.senders.find(r => r.windowsUser === sender.windowsUser)).toMatchObject({ total: 501 * 140, events: 501, localIps: sender.localIps, hostname: sender.hostname });
    expect(summary.senders.find(r => r.windowsUser === null)).toMatchObject({ total: 140, localIps: [], hostname: null });
    expect(summary.senders.reduce((sum, r) => sum + r.total, 0)).toBe(summary.total);
    expect((await f.admin('summary?from=1&to=2')).senders).toEqual([]);
  });
  it('refreshes quota on demand, keeps stale values on failure, and blocks changed account mappings', async () => {
    const f = await fixture(), sessions = path.join(f.root, 'profile/sessions'); fs.mkdirSync(sessions, { recursive: true });
    const authPath = path.join(f.root, 'profile/auth.json');
    const login = user => fs.writeFileSync(authPath, JSON.stringify({ tokens: { account_id: 'account', id_token: 'header.' + Buffer.from(JSON.stringify({ sub: user, email: user + '@example.test' })).toString('base64url') + '.signature' } }));
    login('one');
    await f.collector.configure({ enabled: true, roots: [{ path: sessions, provider: 'codex', accountId: f.codex.id }] });
    let calls = 0, failed = false;
    f.collector.quotaFetcher = async root => { calls++; return { identity: loginIdentity(root.path), status: failed ? 'timeout' : 'success', quota: failed ? null : { primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 1900000000 }, secondary: null, plan: 'pro', updatedAt: Date.now() } }; };
    write(path.join(sessions, 'a.jsonl'), codexLog('account-bound'));
    await f.collector.tick(); await f.collector.tick(); expect(calls).toBe(1);
    let summary = await f.admin('summary'); expect(summary.reports[0].identity.email).toBe('one@example.test'); expect(summary.recent[0].providerIdentity.id).toBe(loginIdentity(sessions).id);
    failed = true; await request(f.origin, '/v1/refresh', { credential: f.collector.credential(), body: {} }); await f.collector.tick();
    summary = await f.admin('summary'); expect(calls).toBe(2); expect(summary.reports[0].status).toBe('timeout'); expect(summary.reports[0].quota.primary.usedPercent).toBe(25);
    login('two'); write(path.join(sessions, 'b.jsonl'), codexLog('must-not-attribute'));
    await request(f.origin, '/v1/refresh', { credential: f.collector.credential(), body: {} });
    await f.collector.tick(); summary = await f.admin('summary'); expect(summary.total).toBe(140); expect(f.collector.status().warnings.join(' ')).toContain('login changed');
    expect(summary.reports[0].status).toBe('identity_changed'); expect(summary.reports[0].identity.email).toBe('one@example.test');
  });
  it('continues collection after the MCP host exits and stops its watcher when paused', async () => {
    const f = await fixture();
    f.collector.save({ ...f.collector.config(), credential: seal(f.collector.config().credential) });
    const child = spawn(process.execPath, [fileURLToPath(new URL('./cli.mjs', import.meta.url)), 'mcp', '--home', f.collector.home], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { errors += data; });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error(errors))); });
    child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n');
    const until = async predicate => { const deadline = Date.now() + 15000; while (!await predicate()) { if (Date.now() > deadline) throw Error('Watcher timed out'); await new Promise(r => setTimeout(r, 100)); } };
    try {
      await exited; expect(output).toContain('serverInfo');
      // A final transcript flush can happen after the host and MCP both exit.
      write(path.join(f.transcripts, 'after-host-exit.jsonl'), codexLog('after-host-exit'));
      await until(async () => (await f.admin('summary')).total === 140 && f.collector.status().pending === 0);
      expect(f.collector.status().pending).toBe(0);
    } finally {
      f.collector.pause();
      await until(() => !f.collector.db.prepare('SELECT COUNT(*) n FROM watcher').get().n);
    }
  }, 25000);
  it('collects and acknowledges only usage fields; replay remains one event', async () => {
    const f = await fixture(), file = path.join(f.transcripts, 'rollout.jsonl'); write(file, codexLog());
    await f.collector.tick(); await f.collector.tick();
    const result = await f.admin('summary'); expect(result.total).toBe(140); expect(result.rows[0].employeeId).toBe(f.employee.id);
    expect(f.collector.status().pending).toBe(0); expect(f.collector.status()).not.toHaveProperty('credential');
    const raw = f.service.db.prepare('SELECT json FROM events').get().json;
    expect(raw).not.toMatch(/PRIVATE|cwd|secretPrompt/);
    const event = JSON.parse(raw); expect(event).toMatchObject({ input: 80, output: 30, reasoning: 10, cacheRead: 20, cacheWrite: null });
    f.collector.db.prepare('UPDATE outbox SET sent=0').run(); await f.collector.tick(); expect((await f.admin('summary')).total).toBe(140);
  });
  it('does not attribute old transcripts to a newly enrolled employee', async () => {
    const f = await fixture(), log = codexLog(); log[2].timestamp = '2020-01-01T00:00:00Z'; write(path.join(f.transcripts, 'old.jsonl'), log);
    await f.collector.tick(); expect((await f.admin('summary')).total).toBe(0);
  });
  it('preserves incomplete last lines until completed', async () => {
    const f = await fixture(), file = path.join(f.transcripts, 'partial.jsonl'), log = codexLog();
    write(file, log.slice(0, 2)); fs.appendFileSync(file, JSON.stringify(log[2]).slice(0, 45));
    await f.collector.tick(); expect(f.collector.status().events).toBe(0);
    fs.appendFileSync(file, JSON.stringify(log[2]).slice(45) + '\n'); await f.collector.tick(); expect((await f.admin('summary')).total).toBe(140);
  });
  it('retains offline batches and allows pause without contacting the server', async () => {
    const f = await fixture(); write(path.join(f.transcripts, 'offline.jsonl'), codexLog());
    const config = f.collector.config(); f.collector.save({ ...config, server: 'http://127.0.0.1:1' });
    await f.collector.tick(); expect(f.collector.status().pending).toBe(1); expect(f.collector.pause().enabled).toBe(false);
    f.collector.save(config); f.collector.nextAttempt = 0; await f.collector.tick(); expect(f.collector.status().pending).toBe(0);
  });
  it('rejects another employee personal account and overlapping source roots', async () => {
    const f = await fixture(); expect(await f.collector.accounts()).not.toContainEqual(expect.objectContaining({ id: f.privateAccount.id }));
    await expect(f.collector.configure({ enabled: true, roots: [{ path: f.transcripts, provider: 'claude', accountId: f.privateAccount.id }] })).rejects.toThrow('not assigned');
    await expect(f.collector.configure({ enabled: true, roots: [...f.collector.config().roots, ...f.collector.config().roots] })).rejects.toThrow('Overlapping');
  });
  it('isolates employee queries and invalidates revoked devices', async () => {
    const f = await fixture(); write(path.join(f.transcripts, 'one.jsonl'), codexLog()); await f.collector.tick();
    const code = await f.admin('admin/enrollments', { employeeId: f.other.id });
    const other = await request(f.origin, '/v1/enroll', { body: { code: code.code, name: 'Other PC' } });
    const own = await request(f.origin, '/v1/summary', { credential: other.token }); expect(own.total).toBe(0); expect(own.employees).toHaveLength(1);
    await expect(request(f.origin, '/v1/admin/employees', { credential: other.token, body: { name: 'forged' } })).rejects.toThrow('403');
    await f.admin('admin/revoke', { id: other.deviceId }); await expect(request(f.origin, '/v1/summary', { credential: other.token })).rejects.toThrow('401');
    await expect(request(f.origin, '/v1/enroll', { body: { code: code.code, name: 'Replay' } })).rejects.toThrow('401');
  });
  it('supports Claude cumulative message updates without double counting', async () => {
    const f = await fixture(); await f.collector.configure({ enabled: true, roots: [{ path: f.transcripts, provider: 'claude', accountId: f.claude.id }] });
    const item = output => ({ sessionId: 'claude-session', requestId: 'request-1', timestamp: new Date(Date.now()).toISOString(), message: { model: 'test-claude', content: 'PRIVATE', usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 30, cache_creation_input_tokens: 20 } } });
    const file = path.join(f.transcripts, 'claude.jsonl'); write(file, [item(5)]); await f.collector.tick();
    fs.appendFileSync(file, JSON.stringify(item(10)) + '\n'); await f.collector.tick(); const result = await f.admin('summary'); expect(result.total).toBe(70); expect(result.rows[0].events).toBe(1);
  });
  it('shares one SQLite lease across embedded and standalone instances', async () => {
    const f = await fixture(); write(path.join(f.transcripts, 'same.jsonl'), codexLog());
    const second = new Collector(f.collector.home, { seal: v => v, unseal: v => v }); cleanup.push(() => second.stop());
    await Promise.all([f.collector.tick(), second.tick()]); expect((await f.admin('summary')).total).toBe(140);
  });
  it('serves scoped MCP summaries and denies unknown methods', async () => {
    const f = await fixture(), credential = f.collector.credential();
    const response = await request(f.origin, '/mcp', { credential, body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'usage_summary', arguments: {} } } });
    expect(JSON.parse(response.result.content[0].text).employees).toHaveLength(1);
    const unknown = await request(f.origin, '/mcp', { credential, body: { jsonrpc: '2.0', id: 2, method: 'delete_everything' } }); expect(unknown.error.code).toBe(-32601);
  });
  it('attributes one shared account to two employees and rejects copied-event reassignment', async () => {
    const f = await fixture(); write(path.join(f.transcripts, 'one.jsonl'), codexLog()); await f.collector.tick();
    const enrollment = await f.admin('admin/enrollments', { employeeId: f.other.id });
    const other = await request(f.origin, '/v1/enroll', { body: { code: enrollment.code, name: 'Second PC' } });
    const first = JSON.parse(f.service.db.prepare('SELECT json FROM events').get().json);
    const ownEvent = { ...parseUsage(codexLog('second-session', 180)[2], { provider: 'codex', sessionId: 'second-session' }, 0), accountId: f.codex.id };
    const result = await request(f.origin, '/v1/events', { credential: other.token, body: { events: [first, ownEvent] } });
    expect(result.rejected).toEqual([{ id: first.id, reason: 'attribution_conflict' }]);
    const summary = await f.admin('summary'); expect(summary.total).toBe(320); expect(summary.rows).toHaveLength(2);
    expect(summary.rows.reduce((s, r) => s + r.total, 0)).toBe(summary.total);
  });
  it('reindexes a replaced transcript and deduplicates existing events', async () => {
    const f = await fixture(), file = path.join(f.transcripts, 'rewrite.jsonl'); write(file, codexLog()); await f.collector.tick();
    fs.unlinkSync(file); write(file, codexLog('different-session', 180)); await f.collector.tick();
    expect((await f.admin('summary')).total).toBe(320);
  });
  it('packages provider plugins without modifying the user host configuration', async () => {
    const f = await fixture();
    for (const provider of ['codex', 'claude']) {
      const target = path.join(f.root, provider), cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
      const result = spawnSync(process.execPath, [cli, 'install', '--provider', provider, '--target', target, '--home', f.collector.home], { encoding: 'utf8', windowsHide: true });
      expect(result.status, result.stderr).toBe(0);
      const config = JSON.parse(fs.readFileSync(path.join(target, '.mcp.json'), 'utf8')); expect(fs.existsSync(config.mcpServers.acedia_usage.args[0])).toBe(true);
      expect(config.mcpServers.acedia_usage).not.toHaveProperty('env');
    }
  });
});
describe('usage schema', () => {
  it('does not infer unavailable counts and retains a reported total', () => {
    const item = codexLog()[2]; delete item.payload.info.last_token_usage.cached_input_tokens;
    expect(parseUsage(item, { provider: 'codex', sessionId: 'one' }, 0)).toMatchObject({ input: null, cacheRead: null, total: 140 });
  });
  it('rejects plaintext remote URLs, secrets in payloads and invalid counts', () => {
    expect(() => serverUrl('http://example.com')).toThrow('HTTPS'); expect(() => serverUrl('https://user:password@example.com')).toThrow();
    const value = { ...parseUsage(codexLog()[2], { provider: 'codex', sessionId: 'one' }, 0), accountId: 'a' };
    expect(() => validateEvent({ ...value, prompt: 'secret' })).toThrow(); expect(() => validateEvent({ ...value, total: -1 })).toThrow();
  });
});
