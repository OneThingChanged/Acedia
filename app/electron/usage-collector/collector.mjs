import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { parseUsage } from './parser.mjs';
import { CAPABILITIES, hash, request, serverUrl, text, validateEvent } from './protocol.mjs';
import { seal, unseal } from './credentials.mjs';
import { deviceMetadata, loginIdentity } from './metadata.mjs';
import { fetchAccountQuota } from './quota.mjs';

export const defaultCollectorHome = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'AcediaUsage');
export class Collector {
  constructor(home = defaultCollectorHome(), options = {}) {
    this.home = home; this.owner = randomUUID(); this.seal = options.seal || seal; this.unseal = options.unseal || unseal;
    this.quotaFetcher = options.quotaFetcher || fetchAccountQuota;
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(home, 'collector.db'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(path TEXT PRIMARY KEY, offset INTEGER NOT NULL, context TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, json TEXT NOT NULL, revision TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS status(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);`);
    this.timer = null; this.running = null; this.nextAttempt = 0; this.failures = 0; this.scanCursor = 0;
    this.db.exec('CREATE TABLE IF NOT EXISTS local_account_reports(accountId TEXT PRIMARY KEY,json TEXT NOT NULL)');
  }
  config() { return JSON.parse(this.db.prepare('SELECT json FROM config WHERE id=1').get()?.json || '{"enabled":false,"roots":[]}'); }
  save(config) { this.db.prepare('INSERT INTO config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(config)); }
  credential() {
    const encrypted = this.config().credential || '';
    if (encrypted !== this.encrypted) { this.secret = encrypted ? this.unseal(encrypted) : ''; this.encrypted = encrypted; }
    return this.secret || '';
  }
  status() {
    const { credential, ...config } = this.config();
    return { ...config, enrolled: Boolean(credential), pending: this.db.prepare('SELECT COUNT(*) n FROM outbox WHERE sent=0').get().n,
      events: this.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,
      ...JSON.parse(this.db.prepare('SELECT json FROM status WHERE id=1').get()?.json || '{}'), capabilities: CAPABILITIES };
  }
  async enroll(origin, code, name) {
    if (this.config().credential) throw Error('Already enrolled. Use another collector profile for another employee.');
    const server = serverUrl(origin);
    const result = await request(server, '/v1/enroll', { body: { code: text(code, 'enrollment code'), name: text(name, 'device name') } });
    this.save({ server, credential: this.seal(result.token), employee: result.employee, deviceId: result.deviceId, enabled: false, roots: [], enrolledAt: Date.now() });
    return this.status();
  }
  async accounts() {
    const c = this.config();
    if (!c.credential) return [];
    return (await request(c.server, '/v1/accounts', { credential: this.credential() })).accounts;
  }
  pause() { const c = this.config(); this.save({ ...c, enabled: false }); return this.status(); }
  async configure({ enabled, roots }) {
    const c = this.config();
    if (!c.credential) throw Error('Enroll this device first');
    if (typeof enabled !== 'boolean' || !Array.isArray(roots) || roots.length > 32) throw Error('Invalid collector settings');
    const accounts = await this.accounts(), seen = new Set();
    const normalized = roots.map(root => {
      if (!['codex', 'claude'].includes(root.provider) || !path.isAbsolute(root.path)) throw Error('Select a Codex/Claude absolute transcript folder');
      const directory = fs.realpathSync(root.path);
      if (!fs.statSync(directory).isDirectory()) throw Error('Transcript folder required');
      const canonical = process.platform === 'win32' ? directory.toLowerCase() : directory;
      if ([...seen].some(p => canonical === p || canonical.startsWith(p + path.sep) || p.startsWith(canonical + path.sep))) throw Error('Overlapping transcript folders are not allowed');
      seen.add(canonical);
      const account = accounts.find(a => a.id === root.accountId && a.provider === root.provider);
      if (!account) throw Error('Account is not assigned to this employee');
      const old = c.roots.find(r => r.path === directory && r.provider === root.provider && r.accountId === root.accountId);
      const identity = root.provider === 'codex' ? loginIdentity(directory) : null;
      return { path: directory, provider: root.provider, accountId: root.accountId, since: old?.since ?? Date.now(), providerIdentity: identity, identitySince: old?.providerIdentity?.id === identity?.id ? old?.identitySince ?? Date.now() : Date.now() };
    });
    const bound = new Map();
    for (const root of normalized) if (root.providerIdentity) {
      if (bound.has(root.accountId) && bound.get(root.accountId) !== root.providerIdentity.id) throw Error('Different logins cannot share one server account mapping');
      bound.set(root.accountId, root.providerIdentity.id);
    }
    this.save({ ...c, enabled, roots: normalized });
    return this.status();
  }
  // Hooks only trigger a scan. They cannot supply arbitrary transcripts or identity.
  start() { if (!this.timer) { const run = () => void this.tick().catch(() => {}); this.timer = setInterval(run, 30000); this.timer.unref?.(); run(); } }
  async stop() { clearInterval(this.timer); this.timer = null; await this.running; this.db.close(); }
  tick() {
    if (this.running) return this.running;
    this.running = this.perform().finally(() => { this.running = null; });
    return this.running;
  }
  async perform() {
    const c = this.config();
    if (!c.enabled || !c.credential || Date.now() < this.nextAttempt) return this.status();
    const locked = this.db.prepare(`INSERT INTO lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE lease.expires<?`).run(this.owner, Date.now() + 60000, Date.now());
    if (!locked.changes) return this.status();
    try {
      const warnings = [], files = [];
      for (const root of c.roots) {
        const current = root.provider === 'codex' ? loginIdentity(root.path) : null;
        if (root.providerIdentity && current?.id !== root.providerIdentity.id) { warnings.push('Account login changed or disappeared; confirm the folder mapping before collecting new records'); continue; }
        try { walk(root.path, file => { if (fs.statSync(file).mtimeMs >= root.since - 1000) files.push({ root, file }); }, 0); }
        catch { warnings.push('A configured transcript folder could not be read'); }
      }
      const deadline = Date.now() + 12000;
      for (let i = 0; i < Math.min(files.length, 64) && Date.now() < deadline; i++) {
        const { root, file } = files[(this.scanCursor + i) % files.length];
        try { this.scan(file, root); } catch { warnings.push('A transcript could not be indexed; source cursor was preserved'); }
      }
      this.scanCursor = files.length ? (this.scanCursor + 64) % files.length : 0;
      // Configuration may change while waiting for the network; never send a paused batch.
      if (!this.config().enabled) return this.status();
      const ids = this.config().roots.map(root => root.accountId);
      const rows = ids.length ? this.db.prepare(`SELECT * FROM outbox WHERE sent=0 AND json_extract(json,'$.accountId') IN (${ids.map(() => '?').join(',')}) ORDER BY rowid LIMIT 200`).all(...ids) : [];
      if (rows.length) {
        const result = await request(c.server, '/v1/events', { credential: this.credential(), body: { events: rows.map(r => JSON.parse(r.json)) } });
        const accepted = new Set(result.accepted || []);
        for (const row of rows) if (accepted.has(row.id)) this.db.prepare('UPDATE outbox SET sent=1 WHERE id=? AND revision=?').run(row.id, row.revision);
        if (result.rejected?.length) warnings.push(`${result.rejected.length} events rejected; retained for review`);
      }
      const reports = this.db.prepare('SELECT json FROM local_account_reports').all().map(r => JSON.parse(r.json)).filter(r => ids.includes(r.accountId));
      const heartbeat = await request(c.server, '/v1/heartbeat', { credential: this.credential(), body: { device: deviceMetadata(), accounts: reports } });
      const due = c.roots.find(root => {
        if (root.provider !== 'codex') return false;
        const last = reports.find(r => r.accountId === root.accountId);
        return !last || Date.now() - last.checkedAt > 300000 || (heartbeat.refreshRequests || []).some(r => r.accountId === root.accountId && r.requestedAt > last.checkedAt);
      });
      if (due) {
        const result = await this.quotaFetcher(due);
        const previous = reports.find(r => r.accountId === due.accountId);
        const changed = due.providerIdentity && result.identity?.id !== due.providerIdentity.id;
        const identity = changed ? due.providerIdentity : result.identity;
        const report = { accountId: due.accountId, identity, quota: (!changed && result.quota) || (identity?.id && identity.id === previous?.identity?.id ? previous.quota : null), status: changed ? 'identity_changed' : result.status, checkedAt: Date.now() };
        this.db.prepare('INSERT INTO local_account_reports VALUES(?,?) ON CONFLICT(accountId) DO UPDATE SET json=excluded.json').run(due.accountId, JSON.stringify(report));
        if (this.config().enabled) await request(c.server, '/v1/heartbeat', { credential: this.credential(), body: { device: deviceMetadata(), accounts: [report] } });
      }
      this.failures = 0; this.nextAttempt = 0;
      this.setStatus({ lastSuccess: Date.now(), error: null, warnings: [...new Set(warnings)] });
    } catch (error) {
      this.nextAttempt = Date.now() + Math.min(300000, 10000 * 2 ** Math.min(this.failures++, 5));
      this.setStatus({ lastSuccess: this.status().lastSuccess || null, error: String(error.message).slice(0, 250), retryAt: this.nextAttempt });
    } finally { this.db.prepare('DELETE FROM lease WHERE owner=?').run(this.owner); }
    return this.status();
  }
  setStatus(status) { this.db.prepare('INSERT INTO status VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(status)); }
  scan(file, root) {
    const key = hash(file + ':' + root.since), previous = this.db.prepare('SELECT * FROM sources WHERE path=?').get(key);
    const stat = fs.statSync(file), size = stat.size, identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    const prior = previous ? JSON.parse(previous.context) : null;
    const rewritten = prior && (prior.fileIdentity !== identity || (size <= previous.offset && stat.mtimeMs !== prior.modified));
    let offset = previous && prior?.metadataVersion === 1 && !rewritten && previous.offset <= size ? previous.offset : 0;
    let state = offset ? prior : { provider: root.provider };
    state.metadataVersion = 1; state.fileIdentity = identity; state.modified = stat.mtimeMs;
    const fd = fs.openSync(file, 'r');
    let buffer = Buffer.alloc(Math.min(4 * 1024 * 1024, size - offset));
    let length = 0, end = -1;
    try {
      // Image/tool payloads may occupy one large JSONL line. Grow only when a
      // complete line does not fit, so metadata after that line remains readable.
      while (true) {
        length = fs.readSync(fd, buffer, 0, buffer.length, offset);
        end = buffer.subarray(0, length).lastIndexOf(10);
        if (end >= 0 || length < buffer.length || buffer.length >= size - offset) break;
        if (buffer.length >= 64 * 1024 * 1024) throw Error('Transcript line exceeds 64 MiB');
        buffer = Buffer.alloc(Math.min(buffer.length * 2, 64 * 1024 * 1024, size - offset));
      }
    } finally { fs.closeSync(fd); }
    if (end < 0) return;
    const lines = buffer.subarray(0, end + 1).toString('utf8').split('\n');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const line of lines.slice(0, -1)) {
        if (line.trim()) {
          const item = JSON.parse(line), event = parseUsage(item, state, offset);
          if (event && event.occurredAt >= root.since) {
            const previousEvent = this.db.prepare('SELECT json FROM outbox WHERE id=?').get(event.id);
            const priorEvent = previousEvent ? JSON.parse(previousEvent.json) : null;
            const data = validateEvent({ ...event, skills: (event.skills || []).filter(s => s.occurredAt >= Math.max(root.since, root.identitySince || root.since)), accountId: root.accountId,
              sender: priorEvent ? priorEvent.sender : deviceMetadata(),
              providerIdentity: priorEvent ? priorEvent.providerIdentity || null : event.occurredAt >= (root.identitySince || Infinity) ? root.providerIdentity || null : null,
            }), json = JSON.stringify(data), revision = hash(json);
            this.db.prepare(`INSERT INTO outbox VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET json=excluded.json,revision=excluded.revision,sent=0
              WHERE outbox.revision<>excluded.revision AND json_extract(excluded.json,'$.total')>=json_extract(outbox.json,'$.total')`).run(data.id, json, revision);
          }
        }
        offset += Buffer.byteLength(line) + 1;
      }
      this.db.prepare('INSERT INTO sources VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET offset=excluded.offset,context=excluded.context').run(key, offset, JSON.stringify(state));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
function walk(directory, accept, depth) {
  if (depth > 12) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, accept, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) accept(file);
  }
}
