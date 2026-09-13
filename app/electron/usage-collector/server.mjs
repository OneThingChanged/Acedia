import http from 'node:http';
import { baselineCost, costTimeline, modelUsage, PRICE_BASIS } from './pricing.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { CAPABILITIES, hash, token, text, validateEvent } from './protocol.mjs';
import { validateDevice, validateIdentity, validateQuota } from './metadata.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
export function createUsageServer({ databasePath, adminToken, allowLocalAdmin = false, localTestNoLogin = false, clientPackagePath = null }) {
  const localAdmin = allowLocalAdmin && adminToken === 'admin';
  if (typeof adminToken !== 'string' || (adminToken.length < 24 && !localAdmin)) throw Error('Set a random admin token of at least 24 characters');
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,provider TEXT NOT NULL,kind TEXT NOT NULL,ownerId TEXT);
    CREATE TABLE IF NOT EXISTS enrollments(code TEXT PRIMARY KEY,employeeId TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,name TEXT NOT NULL,employeeId TEXT NOT NULL,token TEXT NOT NULL UNIQUE,revoked INTEGER NOT NULL DEFAULT 0,lastSeen INTEGER);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,employeeId TEXT NOT NULL,deviceId TEXT NOT NULL,accountId TEXT NOT NULL,provider TEXT NOT NULL,occurredAt INTEGER NOT NULL,total INTEGER NOT NULL,json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_time ON events(occurredAt);
    CREATE INDEX IF NOT EXISTS events_employee ON events(employeeId,occurredAt);`);
  db.exec(`CREATE TABLE IF NOT EXISTS device_metadata(deviceId TEXT PRIMARY KEY,json TEXT NOT NULL,updatedAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS account_reports(accountId TEXT NOT NULL,deviceId TEXT NOT NULL,json TEXT NOT NULL,updatedAt INTEGER NOT NULL,PRIMARY KEY(accountId,deviceId));
    CREATE TABLE IF NOT EXISTS refresh_requests(accountId TEXT PRIMARY KEY,requestedAt INTEGER NOT NULL);`);
  const accountColumns = new Set(db.prepare('PRAGMA table_info(accounts)').all().map(c => c.name));
  for (const column of ['loginEmail', 'providerIdentityId']) if (!accountColumns.has(column)) db.exec(`ALTER TABLE accounts ADD COLUMN ${column} TEXT`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS accounts_login_email ON accounts(provider,loginEmail) WHERE loginEmail IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_login_identity ON accounts(provider,providerIdentityId) WHERE providerIdentityId IS NOT NULL;`);
  const normalizeEmail = value => value == null || value === '' ? null : text(value, 'login email', 256).toLowerCase();
  const matchesLogin = (account, login) => Boolean(login && (account.providerIdentityId ? login.id === account.providerIdentityId : account.loginEmail && normalizeEmail(login.email) === account.loginEmail));
  function resolveAccount(mappedId, provider, login, permitted) {
    // Registering a real login on the server takes precedence over a client's display-name mapping.
    const registered = login && db.prepare('SELECT * FROM accounts WHERE provider=? AND (providerIdentityId=? OR loginEmail=?)').all(provider, login.id, normalizeEmail(login.email)).find(a => matchesLogin(a, login));
    if (registered) return permitted.some(a => a.id === registered.id) ? registered.id : null;
    const mapped = permitted.find(a => a.id === mappedId && a.provider === provider);
    return mapped && (!mapped.loginEmail && !mapped.providerIdentityId || matchesLogin(mapped, login)) ? mapped.id : null;
  }
  const localTestRequest = req => {
    if (!localTestNoLogin || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
    try {
      const origin = new URL('http://' + req.headers.host);
      return ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && Number(origin.port) === server.address()?.port && (!req.headers.origin || req.headers.origin === origin.origin) && !['cross-site', 'same-site'].includes(req.headers['sec-fetch-site']);
    } catch { return false; }
  };
  const auth = req => {
    if (!req.headers.authorization && localTestRequest(req)) return { admin: true };
    const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash(adminToken)))) return { admin: true };
    const device = db.prepare('SELECT id,employeeId FROM devices WHERE token=? AND revoked=0').get(hash(supplied));
    return device || null;
  };
  // Unbound legacy mappings remain reachable, but never count as company-shared logins.
  const accountList = identity => db.prepare(identity.admin ? 'SELECT * FROM accounts ORDER BY name' : 'SELECT * FROM accounts WHERE kind=\'shared\' OR ownerId=? ORDER BY name').all(...(identity.admin ? [] : [identity.employeeId])).map(a => ({ ...a, kind: a.kind === 'shared' && (a.loginEmail || a.providerIdentityId) ? 'shared' : 'personal' }));
  function summary(identity, url) {
    const from = Number(url.searchParams.get('from') || Date.now() - 30 * 86400000), to = Number(url.searchParams.get('to') || Date.now());
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > 366 * 86400000) throw Error('Invalid time range (maximum 366 days)');
    const rows = db.prepare(`SELECT employeeId,accountId,provider,COUNT(*) events,SUM(total) total FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'} GROUP BY employeeId,accountId,provider`).all(from, to, ...(identity.admin ? [] : [identity.employeeId]));
    const permitted = accountList(identity), allowed = new Set(permitted.map(a => a.id));
    // Account denominators contain totals only, never other employees' event or identity data.
    const accountTotals = db.prepare(`SELECT e.accountId,SUM(e.total) total FROM events e JOIN accounts a ON a.id=e.accountId WHERE e.occurredAt>=? AND e.occurredAt<=? ${identity.admin ? '' : "AND ((a.kind='shared' AND (a.loginEmail IS NOT NULL OR a.providerIdentityId IS NOT NULL)) OR a.ownerId=?)"} GROUP BY e.accountId`).all(from, to, ...(identity.admin ? [] : [identity.employeeId]));
    const reports = db.prepare(`SELECT r.* FROM account_reports r JOIN devices d ON d.id=r.deviceId WHERE d.revoked=0 ${identity.admin ? '' : 'AND d.employeeId=?'}`).all(...(identity.admin ? [] : [identity.employeeId])).filter(r => allowed.has(r.accountId)).map(r => ({ ...JSON.parse(r.json), deviceId: r.deviceId, receivedAt: r.updatedAt }));
    const usage = db.prepare(`SELECT deviceId,accountId,employeeId,provider,occurredAt,total,json FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'} ORDER BY occurredAt DESC LIMIT 500`).all(from, to, ...(identity.admin ? [] : [identity.employeeId]));
    const daily = db.prepare(`SELECT CAST(occurredAt/86400000 AS INTEGER)*86400000 day,accountId,SUM(total) total FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'} GROUP BY day,accountId ORDER BY day`).all(from, to, ...(identity.admin ? [] : [identity.employeeId]));
    const timeline = db.prepare(`SELECT CAST((occurredAt+32400000)/86400000 AS INTEGER)*86400000 day,accountId,employeeId,deviceId,COUNT(*) events,SUM(total) total FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'} GROUP BY day,accountId,employeeId,deviceId ORDER BY day`).all(from, to, ...(identity.admin ? [] : [identity.employeeId]));
    const modelBreakdown = modelUsage(db.prepare(`SELECT occurredAt,employeeId,accountId,provider,total,json FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'}`).iterate(from,to,...(identity.admin?[]:[identity.employeeId])));
    const costs = costTimeline(db.prepare(`SELECT accountId,employeeId,deviceId,occurredAt,json FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'}`).iterate(from, to, ...(identity.admin ? [] : [identity.employeeId])));
    const senders = db.prepare(`SELECT accountId,employeeId,deviceId,json_extract(json,'$.sender.windowsUser') windowsUser,json_extract(json,'$.sender.hostname') hostname,json_extract(json,'$.sender.localIps') ips,COUNT(*) events,SUM(total) total FROM events WHERE occurredAt>=? AND occurredAt<=? ${identity.admin ? '' : 'AND employeeId=?'} GROUP BY accountId,employeeId,deviceId,windowsUser,hostname,ips ORDER BY total DESC`).all(from, to, ...(identity.admin ? [] : [identity.employeeId])).map(({ ips, ...r }) => ({ ...r, localIps: ips ? JSON.parse(ips) : [] }));
    const skills = db.prepare(`SELECT e.employeeId,e.accountId,json_extract(s.value,'$.name') name,COUNT(DISTINCT json_extract(s.value,'$.id')) calls,MAX(json_extract(s.value,'$.occurredAt')) lastUsed FROM events e,json_each(e.json,'$.skills') s WHERE json_extract(s.value,'$.occurredAt')>=? AND json_extract(s.value,'$.occurredAt')<=? ${identity.admin ? '' : 'AND e.employeeId=?'} GROUP BY e.employeeId,e.accountId,name`).all(from,to,...(identity.admin ? [] : [identity.employeeId]));
    return { modelBreakdown, pricing: PRICE_BASIS, costs, from, to, rows, daily, timeline, skills, reports, senders, accountTotals, role: identity.admin ? 'admin' : 'employee', recent: usage.map(e => { const event = JSON.parse(e.json); return { baselineUsd: baselineCost(event), deviceId: e.deviceId, accountId: e.accountId, employeeId: e.employeeId, provider: e.provider, occurredAt: e.occurredAt, total: e.total, sessionId: event.sessionId ?? null, turnId: event.turnId ?? null, parentSessionId: event.parentSessionId ?? null, agentKind: event.agentKind ?? null, model: event.model ?? null, effort: event.effort ?? null, fast: event.fast ?? null, input: event.input ?? null, cacheRead: event.cacheRead ?? null, cacheWrite: event.cacheWrite ?? null, output: event.output ?? null, reasoning: event.reasoning ?? null, sender: event.sender || null, providerIdentity: event.providerIdentity || null }; }), total: rows.reduce((sum, r) => sum + r.total, 0), accounts: permitted,
      employees: db.prepare(identity.admin ? 'SELECT * FROM employees' : 'SELECT * FROM employees WHERE id=?').all(...(identity.admin ? [] : [identity.employeeId])),
      devices: db.prepare(`SELECT d.id,d.name,d.employeeId,d.lastSeen,d.revoked,m.json metadata,m.updatedAt metadataAt FROM devices d LEFT JOIN device_metadata m ON m.deviceId=d.id ${identity.admin ? '' : 'WHERE d.employeeId=?'}`).all(...(identity.admin ? [] : [identity.employeeId])).map(d => ({ ...d, metadata: d.metadata ? JSON.parse(d.metadata) : null })), refreshRequests: db.prepare('SELECT * FROM refresh_requests').all().filter(r => allowed.has(r.accountId)), capabilities: CAPABILITIES };
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/downloads/acedia-usage-client.zip') {
        if (!clientPackagePath || !fs.existsSync(clientPackagePath)) { send(404, { error: 'Client package unavailable; build the server distribution first' }); return; }
        res.setHeader('content-type', 'application/zip');
        res.setHeader('content-disposition', 'attachment; filename="acedia-usage-client.zip"');
        res.end(fs.readFileSync(clientPackagePath)); return;
      }
      if (req.method === 'GET' && ['/', '/dashboard.js', '/periods.mjs'].includes(url.pathname)) {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
        res.setHeader('content-type', url.pathname === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8');
        res.end(fs.readFileSync(path.join(directory, url.pathname === '/' ? 'dashboard.html' : url.pathname.slice(1)))); return;
      }
      if (req.method === 'GET' && url.pathname === '/health') { send(200, { service: 'acedia-usage', version: 1 }); return; }
      if (req.method === 'GET' && url.pathname === '/v1/access') { send(200, { localTestNoLogin: localTestRequest(req) }); return; }
      if (req.method === 'POST' && url.pathname === '/v1/enroll') {
        const body = await jsonBody(req), code = text(body.code, 'code'), name = text(body.name, 'device name');
        const enrollment = db.prepare('SELECT * FROM enrollments WHERE code=? AND expires>?').get(hash(code), Date.now());
        if (!enrollment) { send(401, { error: 'Enrollment code expired or invalid' }); return; }
        const deviceId = randomUUID(), secret = token();
        db.exec('BEGIN IMMEDIATE');
        try {
          if (!db.prepare('DELETE FROM enrollments WHERE code=?').run(hash(code)).changes) throw Error('Code already used');
          db.prepare('INSERT INTO devices VALUES(?,?,?,?,0,?)').run(deviceId, name, enrollment.employeeId, hash(secret), Date.now()); db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        send(200, { deviceId, token: secret, employee: db.prepare('SELECT * FROM employees WHERE id=?').get(enrollment.employeeId) }); return;
      }
      const identity = auth(req);
      if (!identity) { send(401, { error: 'Authentication required' }); return; }
      if (identity.id) db.prepare('UPDATE devices SET lastSeen=? WHERE id=?').run(Date.now(), identity.id);
      if (req.method === 'POST' && url.pathname === '/v1/accounts/resolve' && !identity.admin) {
        const body = await jsonBody(req), login = validateIdentity(body.identity);
        if (body.provider !== 'codex' || !login?.id) throw Error('Codex login identity required');
        let account = db.prepare('SELECT * FROM accounts WHERE provider=? AND (providerIdentityId=? OR loginEmail=?)').all('codex', login.id, normalizeEmail(login.email)).find(a => matchesLogin(a, login));
        if (account && account.kind !== 'shared' && account.ownerId !== identity.employeeId) throw Error('Account belongs to another employee');
        if (!account) {
          const id = randomUUID();
          db.prepare('INSERT INTO accounts(id,name,provider,kind,ownerId,loginEmail,providerIdentityId) VALUES(?,?,?,?,?,?,?)').run(id, login.email || 'Codex', 'codex', 'personal', identity.employeeId, normalizeEmail(login.email), login.id);
          account = db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
        }
        send(200, { account }); return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/accounts') { send(200, { accounts: accountList(identity) }); return; }
      if (req.method === 'GET' && url.pathname === '/v1/summary') { send(200, summary(identity, url)); return; }
      if (req.method === 'POST' && url.pathname === '/v1/refresh') {
        const body = await jsonBody(req), permitted = accountList(identity);
        const selected = body.accountId ? permitted.filter(a => a.id === body.accountId) : permitted;
        if (!selected.length) throw Error('No permitted account');
        const requestedAt = Date.now();
        for (const a of selected) db.prepare('INSERT INTO refresh_requests VALUES(?,?) ON CONFLICT(accountId) DO UPDATE SET requestedAt=excluded.requestedAt').run(a.id, requestedAt);
        send(200, { requestedAt, accounts: selected.length }); return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/heartbeat' && !identity.admin) {
        const body = await jsonBody(req), permitted = accountList(identity);
        const reportMappings = [];
        if (body.device) db.prepare('INSERT INTO device_metadata VALUES(?,?,?) ON CONFLICT(deviceId) DO UPDATE SET json=excluded.json,updatedAt=excluded.updatedAt').run(identity.id, JSON.stringify(validateDevice(body.device)), Date.now());
        if (body.accounts !== undefined && (!Array.isArray(body.accounts) || body.accounts.length > 32)) throw Error('Invalid reports');
        for (const report of body.accounts || []) {
          const login = validateIdentity(report.identity);
          const accountId = resolveAccount(text(report.accountId, 'account'), 'codex', login, permitted);
          if (!accountId) throw Error('Account login not registered or not assigned');
          reportMappings.push({ source: report.accountId, target: accountId });
          if (!['success', 'failed', 'timeout', 'login_required', 'cli_missing', 'unavailable', 'identity_changed'].includes(report.status)) throw Error('Invalid quota status');
          const value = { accountId, identity: validateIdentity(report.identity), quota: validateQuota(report.quota), status: report.status, checkedAt: report.checkedAt };
          if (!Number.isSafeInteger(value.checkedAt) || value.checkedAt < 0 || value.checkedAt > Date.now() + 300000) throw Error('Invalid report time');
          db.prepare('INSERT INTO account_reports VALUES(?,?,?,?) ON CONFLICT(accountId,deviceId) DO UPDATE SET json=excluded.json,updatedAt=excluded.updatedAt').run(accountId, identity.id, JSON.stringify(value), Date.now());
        }
        const refreshRequests = db.prepare('SELECT * FROM refresh_requests').all().filter(r => permitted.some(a => a.id === r.accountId));
        send(200, { ok: true, refreshRequests: refreshRequests.flatMap(r => [r, ...reportMappings.filter(m => m.target === r.accountId && m.source !== r.accountId).map(m => ({ ...r, accountId: m.source }))]) }); return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/events' && !identity.admin) {
        const body = await jsonBody(req);
        if (!Array.isArray(body.events) || body.events.length > 200) throw Error('At most 200 events per batch');
        const events = body.events.map(validateEvent), permitted = accountList(identity), accepted = [], rejected = [];
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const event of events) {
            const old = db.prepare('SELECT * FROM events WHERE id=?').get(event.id);
            const accountId = resolveAccount(event.accountId, event.provider, event.providerIdentity, permitted);
            // Legacy retries keep their original account even after it is bound to a login.
            const legacyRetry = old && !JSON.parse(old.json).providerIdentity && old.accountId === event.accountId && !event.providerIdentity && permitted.some(a => a.id === old.accountId);
            if (!accountId && !legacyRetry) { rejected.push({ id: event.id, reason: 'account_login_mismatch' }); continue; }
            const sameHistoricalMapping = old && old.accountId === event.accountId && permitted.some(a => a.id === old.accountId);
            event.accountId = sameHistoricalMapping ? old.accountId : accountId || old.accountId;
            // A copied transcript on another employee's machine cannot reassign history.
            if (old && (old.employeeId !== identity.employeeId || old.accountId !== event.accountId || old.provider !== event.provider)) { rejected.push({ id: event.id, reason: 'attribution_conflict' }); continue; }
            if (old) {
              const original = JSON.parse(old.json);
              if (original.providerIdentity?.id && event.providerIdentity?.id && original.providerIdentity.id !== event.providerIdentity.id) { rejected.push({ id: event.id, reason: 'attribution_conflict' }); continue; }
              event.sender = original.sender;
              event.providerIdentity = original.providerIdentity || null;
            }
            db.prepare(`INSERT INTO events VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET total=excluded.total,json=excluded.json WHERE excluded.total>=events.total`).run(event.id, identity.employeeId, identity.id, event.accountId, event.provider, event.occurredAt, event.total, JSON.stringify(event));
            accepted.push(event.id);
          }
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        send(200, { accepted, rejected }); return;
      }
      if (req.method === 'POST' && url.pathname.startsWith('/v1/admin/')) {
        if (!identity.admin) { send(403, { error: 'Administrator required' }); return; }
        const body = await jsonBody(req);
        if (url.pathname === '/v1/admin/employees') {
          const id = randomUUID(); db.prepare('INSERT INTO employees VALUES(?,?)').run(id, text(body.name, 'employee name')); send(200, { id }); return;
        }
        if (url.pathname === '/v1/admin/accounts') {
          const provider = text(body.provider, 'provider'), kind = text(body.kind || 'personal', 'kind');
          if (!['codex', 'claude'].includes(provider) || !['shared', 'personal'].includes(kind)) throw Error('Invalid account type');
          const ownerId = kind === 'personal' ? text(body.ownerId, 'owner') : null;
          if (ownerId && !db.prepare('SELECT id FROM employees WHERE id=?').get(ownerId)) throw Error('Unknown owner');
          const id = body.id ? text(body.id, 'account') : randomUUID(), name = text(body.name, 'account name');
          const existing = body.id && db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
          if (body.id && !existing) throw Error('Unknown account');
          if (existing && existing.provider !== provider) throw Error('Cannot change account provider');
          const loginEmail = normalizeEmail(body.loginEmail), providerIdentityId = body.providerIdentityId ? validateIdentity({ id: body.providerIdentityId }).id : null;
          if (loginEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) throw Error('Invalid login email');
          if (db.prepare('SELECT id FROM accounts WHERE provider=? AND id<>? AND (loginEmail=? OR providerIdentityId=?)').get(provider, id, loginEmail, providerIdentityId)) throw Error('This login is already registered');
          if (existing && kind === 'personal' && db.prepare('SELECT id FROM events WHERE accountId=? AND employeeId<>? LIMIT 1').get(id, ownerId)) throw Error('Other employees have used this account; keep it shared');
          if (existing && (loginEmail || providerIdentityId)) {
            const past = db.prepare("SELECT DISTINCT json_extract(json,'$.providerIdentity') login FROM events WHERE accountId=? AND json_extract(json,'$.providerIdentity.id') IS NOT NULL").all(id);
            if (past.some(r => !matchesLogin({ loginEmail, providerIdentityId }, JSON.parse(r.login)))) throw Error('Existing usage belongs to a different login');
          }
          db.prepare('INSERT INTO accounts(id,name,provider,kind,ownerId,loginEmail,providerIdentityId) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,ownerId=excluded.ownerId,loginEmail=excluded.loginEmail,providerIdentityId=excluded.providerIdentityId').run(id, name, provider, kind, ownerId, loginEmail, providerIdentityId);
          send(200, { id }); return;
        }
        if (url.pathname === '/v1/admin/enrollments') {
          const employeeId = text(body.employeeId, 'employee');
          if (!db.prepare('SELECT id FROM employees WHERE id=?').get(employeeId)) throw Error('Unknown employee');
          const code = token(), expires = Date.now() + 15 * 60000;
          db.prepare('INSERT INTO enrollments VALUES(?,?,?)').run(hash(code), employeeId, expires); send(200, { code, expires }); return;
        }
        if (url.pathname === '/v1/admin/revoke') { db.prepare('UPDATE devices SET revoked=1 WHERE id=?').run(text(body.id, 'device')); send(200, { ok: true }); return; }
      }
      // Stateless MCP transport. Read-only and scoped by the authenticated device.
      if (url.pathname === '/mcp' && req.method === 'POST') {
        const rpc = await jsonBody(req);
        const result = mcpResult(rpc, () => summary(identity, new URL('http://localhost/v1/summary')));
        if (rpc.id === undefined) { res.writeHead(202); res.end(); return; }
        send(200, { jsonrpc: '2.0', id: rpc.id, ...result }); return;
      }
      send(404, { error: 'Not found' });
    } catch (error) { send(400, { error: String(error.message).slice(0, 200) }); }
  });
  server.requestTimeout = 15000;
  if (localAdmin || localTestNoLogin) server.on('listening', () => { if (!['127.0.0.1', '::1'].includes(server.address()?.address)) { server.close(); server.emit('error', Error('Local test access requires a loopback listener')); } });
  server.headersTimeout = 10000;
  return { server, db, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => { db.close(); resolve(); }); }) };
}
export function mcpResult(rpc, getSummary) {
  if (rpc.method === 'initialize') return { result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'acedia-usage', version: '0.1.0' } } };
  if (rpc.method === 'ping') return { result: {} };
  if (rpc.method === 'tools/list') return { result: { tools: [{ name: 'usage_summary', description: 'Read collected Codex and Claude Code usage for the authenticated employee. Does not measure this chat or read conversation content.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }] } };
  if (rpc.method === 'tools/call' && rpc.params?.name === 'usage_summary') return { result: { content: [{ type: 'text', text: JSON.stringify(getSummary()) }] } };
  return { error: { code: -32601, message: 'Method not found' } };
}
async function jsonBody(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw Error('application/json required');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) throw Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
