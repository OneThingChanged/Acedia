import fs from 'node:fs';
import { accountLoginError, browserLoginUrl } from './account-login.mjs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { AccountPoolRpc } from './account-pool-rpc.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); };
const stats = () => ({ requests: 0, failures: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
const atomic = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 }); fs.renameSync(file + '.tmp', file); };
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);

export class AccountPool {
  constructor(root, { safeStorage, command, rpcFactory, fetchImpl = fetch, port = 3020, upstream = 'https://chatgpt.com/backend-api/codex', now = Date.now } = {}) {
    this.root = root; this.file = path.join(root, 'pool.json'); this.safeStorage = safeStorage;
    this.command = command; this.rpcFactory = rpcFactory || ((env, home) => new AccountPoolRpc(command(), env, home));
    this.fetch = fetchImpl; this.port = port; this.upstream = upstream; this.now = now;
    this.state = { enabled: false, accounts: [], sessions: {}, recent: [] }; this.jobs = new Map(); this.locks = new Map(); this.active = new Map();
    this.server = null; this.starting = null; this.closed = false; this.controllers = new Set();
    try {
      if (fs.statSync(this.file).size > 8 * 1024 * 1024) throw new Error();
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (typeof this.state.enabled !== 'boolean' || !Array.isArray(this.state.accounts) || this.state.accounts.length > 50
        || !this.state.sessions || typeof this.state.sessions !== 'object' || Array.isArray(this.state.sessions) || !Array.isArray(this.state.recent)
        || this.state.accounts.some(a => !validId(a?.id) || typeof a.label !== 'string' || typeof a.enabled !== 'boolean' || !a.stats)
        || Object.entries(this.state.sessions).some(([id, s]) => !id || ['__proto__', 'constructor', 'prototype'].includes(id) || !s || (s.accountId !== null && !validId(s.accountId)))) throw new Error();
    }
    catch (error) { if (error.code !== 'ENOENT') this.loadError = '계정 저장소를 읽을 수 없습니다. 기존 데이터를 복구하세요.'; }
  }
  guard() { if (this.loadError) throw fail(this.loadError, 503); if (this.closed) throw fail('계정 서비스가 종료 중입니다.', 503); }
  persist() {
    this.guard();
    try { atomic(this.file, this.state); }
    catch { this.loadError = '계정 저장소에 기록하지 못했습니다. 저장 공간을 확인한 뒤 다시 시작하세요.'; throw fail(this.loadError, 503); }
  }
  account(id) { this.guard(); const item = this.state.accounts.find(a => a.id === id); if (!item) throw fail('계정을 찾을 수 없습니다.', 404); return item; }
  home(id) { this.account(id); return path.join(this.root, 'homes', id); }
  seal(value) {
    if (!this.safeStorage?.isEncryptionAvailable()) throw fail('운영체제 자격 증명 암호화를 사용할 수 없습니다.', 503);
    return this.safeStorage.encryptString(value).toString('base64');
  }
  unseal(value) {
    if (!this.safeStorage?.isEncryptionAvailable()) throw fail('운영체제 자격 증명 암호화를 사용할 수 없습니다.', 503);
    try { return this.safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { throw fail('저장된 인증 정보를 열 수 없습니다. 다시 로그인하세요.', 503); }
  }
  snapshot(admin = true) {
    this.guard();
    if (!admin) return { canManage: false, enabled: this.state.enabled, accounts: [], sessions: [], recent: [] };
    return { canManage: true, enabled: this.state.enabled, running: Boolean(this.server?.listening),
      accounts: this.state.accounts.map(a => ({ id: a.id, label: a.label, email: a.email || null, plan: a.plan || null,
        enabled: a.enabled, state: this.jobs.has(a.id) ? 'login_pending' : a.status, error: a.loginError || null, limits: a.limits || null,
        limitsAt: a.limitsAt || null, cooldownUntil: a.cooldownUntil || null, stats: a.stats, active: this.active.get(a.id) || 0,
        login: this.jobs.get(a.id)?.public || null })),
      sessions: Object.entries(this.state.sessions).slice(-100).map(([id, s]) => ({ id, accountId: s.accountId, lastUsed: s.lastUsed })),
      recent: this.state.recent.slice(-50).reverse() };
  }
  create(label) {
    this.guard();
    if (typeof label !== 'string' || !label.trim() || label.length > 80) throw fail('계정 이름은 1~80자로 입력하세요.');
    if (this.state.accounts.length >= 50) throw fail('최대 50개 계정을 등록할 수 있습니다.');
    // Fail before changing the registry if encryption is unavailable.
    this.seal('storage-check');
    const a = { id: randomUUID(), label: label.trim(), enabled: false, status: 'login_required', stats: stats() };
    this.state.accounts.push(a); this.persist(); return a.id;
  }
  update(id, enabled, label) {
    const a = this.account(id);
    if (typeof enabled !== 'boolean') throw fail('분산 참여 여부가 필요합니다.');
    if (label !== undefined && (typeof label !== 'string' || !label.trim() || label.length > 80)) throw fail('계정 이름은 1~80자로 입력하세요.');
    if (enabled && (!a.auth || a.status !== 'ready')) throw fail('로그인을 완료한 계정만 활성화할 수 있습니다.');
    a.enabled = enabled; if (label !== undefined) a.label = label.trim(); this.persist();
  }
  remove(id) {
    this.account(id);
    if (this.jobs.has(id) || this.locks.has(id) || this.active.get(id)) throw fail('진행 중인 로그인·요청이 끝난 뒤 제거하세요.', 409);
    // Remove only this service-owned credential file if an interrupted operation left one behind.
    fs.rmSync(path.join(this.home(id), 'auth.json'), { force: true });
    // Retain session ownership tombstones: an old conversation must never migrate silently.
    this.state.accounts = this.state.accounts.filter(a => a.id !== id); this.persist();
  }
  async exclusive(id, task) {
    if (this.jobs.has(id)) throw fail('로그인을 완료하거나 취소하세요.', 409);
    const previous = this.locks.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(task); this.locks.set(id, next);
    try { return await next; } finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }
  prepareHome(a) {
    const home = this.home(a.id); fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    const file = path.join(home, 'auth.json');
    // Recover a refreshed credential left by an interrupted account operation before restoring the vault.
    if (fs.existsSync(file)) this.capture(a);
    if (a.auth) fs.writeFileSync(file, this.unseal(a.auth), { mode: 0o600 });
    fs.writeFileSync(path.join(home, 'config.toml'), 'cli_auth_credentials_store = "file"\n', { mode: 0o600 });
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|CODEX_HOME)$/i.test(key)) delete env[key];
    env.CODEX_HOME = home;
    return { home, env };
  }
  capture(a) {
    const file = path.join(this.home(a.id), 'auth.json');
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).size > 256 * 1024) throw fail('인증 파일 크기가 올바르지 않습니다.');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    if (!data.tokens?.access_token || !data.tokens?.refresh_token || !data.tokens?.account_id) throw fail('ChatGPT 계정 로그인이 필요합니다.');
    a.auth = this.seal(raw); this.persist(); fs.unlinkSync(file);
  }
  async connect(a) {
    const { home, env } = this.prepareHome(a);
    const rpc = this.rpcFactory(env, home);
    try { await rpc.initialize(); return rpc; } catch (error) { rpc.close(); this.capture(a); throw error; }
  }
  identity(a, data) {
    if (data?.account?.type !== 'chatgpt') throw fail('ChatGPT 계정 로그인이 필요합니다.');
    const auth = JSON.parse(fs.readFileSync(path.join(this.home(a.id), 'auth.json'), 'utf8'));
    const accountId = auth.tokens?.account_id;
    if (!accountId) throw fail('계정 식별 정보를 확인할 수 없습니다.');
    let subject = '';
    try { subject = JSON.parse(Buffer.from(auth.tokens.id_token.split('.')[1], 'base64url').toString()).sub || ''; } catch {}
    const identity = subject ? `${accountId}:${subject}` : accountId;
    if (this.state.accounts.some(other => other.id !== a.id && other.identity === identity)) throw fail('이미 등록한 계정입니다. 기존 항목을 사용하세요.', 409);
    if (a.identity && a.identity !== identity) throw fail('다른 계정입니다. 새 계정으로 등록하세요.', 409);
    a.identity = identity; a.email = data.account.email || null; a.plan = data.account.planType || null;
    a.status = 'ready'; a.cooldownUntil = null;
  }
  async beginLogin(id, method = 'browser') {
    if (!['browser', 'device'].includes(method)) throw fail('지원하지 않는 로그인 방식입니다.');
    const a = this.account(id);
    if (this.jobs.size || this.locks.has(id) || this.active.get(id)) throw fail('진행 중인 로그인·계정 요청을 먼저 완료하세요.', 409);
    const job = { public: null, rpc: null, timer: null, finished: false, oldAuth: a.auth }; this.jobs.set(id, job);
    a.status = 'login_required'; a.loginError = null; a.enabled = false; this.persist();
    const finish = async (success, error) => {
      if (job.finished) return; job.finished = true; clearTimeout(job.timer);
      if (!success) a.loginError = error?.status ? error.message : accountLoginError(error);
      try {
        if (success) {
          this.identity(a, await job.rpc.call('account/read', { refreshToken: false }));
          try { a.limits = await job.rpc.call('account/rateLimits/read'); a.limitsAt = this.now(); } catch { /* Login remains valid when quota lookup is unavailable. */ }
        }
        if (success) { job.rpc.close(); this.capture(a); }
      } catch (error) { a.status = 'login_failed'; a.loginError = error.status ? error.message : '로그인을 확인하지 못했습니다. 다시 시도하세요.'; }
      finally {
        job.rpc?.close();
        // A failed/different-account login cannot replace the previously registered identity.
        if (!success || a.status !== 'ready') { a.auth = job.oldAuth; a.status = 'login_failed'; }
        try { const file = path.join(this.home(id), 'auth.json'); if (fs.existsSync(file)) fs.unlinkSync(file); }
        catch { this.loadError = '임시 인증 파일을 정리하지 못했습니다. 저장 공간을 확인하세요.'; }
        this.jobs.delete(id);
        try { this.persist(); } catch { this.loadError = '계정 인증 정보를 저장하지 못했습니다. 저장 공간을 확인하세요.'; }
      }
    };
    job.finish = finish;
    try {
      job.rpc = await this.connect(a);
      job.rpc.on('notification', message => {
        if (message.method !== 'account/login/completed') return;
        if (!job.loginId) { job.completion = message.params; return; }
        if (message.params?.loginId === job.loginId) void finish(message.params.success === true, message.params.error);
      });
      job.rpc.on('closed', () => { if (!job.finished) void finish(false); });
      const result = await job.rpc.call('account/login/start', { type: method === 'browser' ? 'chatgpt' : 'chatgptDeviceCode' });
      if (job.finished) throw fail('로그인이 종료되었습니다. 다시 시작하세요.');
      if (typeof result.loginId !== 'string' || !result.loginId) throw fail('로그인 응답을 확인할 수 없습니다. Codex CLI를 업데이트하세요.');
      job.loginId = result.loginId;
      if (method === 'browser') {
        if (result.type !== 'chatgpt') throw fail('브라우저 로그인 응답을 확인할 수 없습니다.');
        job.public = { method, url: browserLoginUrl(result.authUrl), expiresAt: this.now() + 10 * 60_000 };
      } else {
        if (result.type !== 'chatgptDeviceCode' || result.verificationUrl !== 'https://auth.openai.com/codex/device' || !/^[A-Z0-9-]{4,32}$/i.test(result.userCode)) throw fail('로그인 응답을 확인할 수 없습니다. Codex CLI를 업데이트하세요.');
        job.public = { method, url: result.verificationUrl, code: result.userCode, expiresAt: this.now() + 10 * 60_000 };
      }
      job.timer = setTimeout(() => void finish(false, 'timeout'), 10 * 60_000); job.timer.unref?.();
      if (job.completion?.loginId === job.loginId) await finish(job.completion.success === true, job.completion.error);
      return job.public;
    } catch (error) { await finish(false, error); throw error; }
  }
  async cancelLogin(id) {
    this.account(id); const job = this.jobs.get(id);
    if (!job) return;
    try { if (job.loginId) await job.rpc.call('account/login/cancel', { loginId: job.loginId }, 5000); }
    finally { await job.finish(false, 'cancelled'); }
  }
  async credentials(id, force = false, limits = false) {
    return this.exclusive(id, async () => {
      const a = this.account(id);
      if (!a.auth) throw fail('계정 로그인이 필요합니다.', 401);
      const saved = JSON.parse(this.unseal(a.auth));
      let expires = 0;
      try { expires = JSON.parse(Buffer.from(saved.tokens.access_token.split('.')[1], 'base64url').toString()).exp * 1000; } catch {}
      if (!force && !limits && expires > this.now() + 120000) return saved.tokens;
      const rpc = await this.connect(a);
      try {
        try { this.identity(a, await rpc.call('account/read', { refreshToken: force || expires <= this.now() + 120000 })); }
        catch (error) { a.status = 'login_required'; throw error; }
        if (limits) { a.limits = await rpc.call('account/rateLimits/read'); a.limitsAt = this.now(); }
      } finally { rpc.close(); this.capture(a); this.persist(); }
      return JSON.parse(this.unseal(a.auth)).tokens;
    });
  }
  quotaBlocked(a) {
    const bucket = a.limits?.rateLimitsByLimitId?.codex || a.limits?.rateLimits;
    return (a.cooldownUntil || 0) > this.now()
      || [bucket?.primary, bucket?.secondary].some(w => w?.usedPercent >= 100 && (!w.resetsAt || w.resetsAt * 1000 > this.now()));
  }
  eligible(a) {
    return a.enabled && a.status === 'ready' && Boolean(a.auth) && !this.jobs.has(a.id) && !this.quotaBlocked(a);
  }
  choose(sessionId) {
    const session = this.state.sessions[sessionId];
    if (session.accountId) {
      const a = this.account(session.accountId);
      if (!this.eligible(a)) throw fail('이 대화의 계정을 사용할 수 없습니다. 계정 상태를 확인하거나 새 세션을 만드세요.', 503);
      return a;
    }
    const candidates = this.state.accounts.filter(a => this.eligible(a));
    const assigned = id => Object.values(this.state.sessions).filter(s => s.accountId === id).length;
    candidates.sort((a, b) => (this.active.get(a.id) || 0) - (this.active.get(b.id) || 0) || assigned(a.id) - assigned(b.id) || a.stats.requests - b.stats.requests);
    if (!candidates.length) throw fail('사용 가능한 분산 계정이 없습니다.', 503);
    session.accountId = candidates[0].id; this.persist(); return candidates[0];
  }
  token(id) {
    if (!this.state.secret) { this.state.secret = this.seal(randomBytes(32).toString('base64')); this.persist(); }
    const payload = Buffer.from(id).toString('base64url');
    return payload + '.' + createHmac('sha256', this.unseal(this.state.secret)).update(payload).digest('base64url');
  }
  authenticate(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (token.length > 1024 || !this.state.secret) return null;
    const [payload] = token.split('.');
    let id; try { id = Buffer.from(payload, 'base64url').toString(); } catch { return null; }
    if (!Object.hasOwn(this.state.sessions, id)) return null;
    const expected = this.token(id);
    return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ? id : null;
  }
  async start() {
    this.guard(); if (this.server?.listening) return; if (this.starting) return this.starting;
    this.starting = (async () => {
      const server = http.createServer((req, res) => void this.proxy(req, res));
      server.headersTimeout = 15000; server.requestTimeout = 60000;
      server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n'));
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.port, '127.0.0.1', resolve); });
      this.server = server;
    })();
    try { await this.starting; } catch { throw fail('분산 요청 서버를 시작하지 못했습니다. 포트 사용 상태를 확인하세요.', 503); } finally { this.starting = null; }
  }
  async setEnabled(enabled) {
    this.guard(); if (typeof enabled !== 'boolean') throw fail('분산 사용 여부가 필요합니다.');
    if (enabled) { if (!this.state.accounts.some(a => this.eligible(a))) throw fail('로그인 후 분산에 참여할 계정을 활성화하세요.'); await this.start(); }
    this.state.enabled = enabled; this.persist();
  }
  async launch(id) {
    this.guard(); if (!this.state.enabled) return null;
    if (typeof id !== 'string' || !id || id.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(id)) throw fail('세션 식별자가 올바르지 않습니다.');
    await this.start();
    if (!Object.hasOwn(this.state.sessions, id)) this.state.sessions[id] = { accountId: null, lastUsed: this.now() };
    const assigned = this.state.sessions[id].accountId;
    if (assigned) {
      const previous = this.state.accounts.find(a => a.id === assigned);
      // Move exhausted assignments only at CLI restart, never mid-response.
      // Paused, removed and login-required accounts retain their ownership.
      if (previous && this.quotaBlocked(previous)) {
        const replacement = this.state.accounts.find(a => a.id !== assigned && this.eligible(a));
        if (replacement) this.state.sessions[id].accountId = replacement.id;
      }
    }
    this.persist();
    const config = { model_provider: 'acedia_pool', 'model_providers.acedia_pool.name': 'Acedia Accounts',
      'model_providers.acedia_pool.base_url': `http://127.0.0.1:${this.server.address().port}/provider`,
      'model_providers.acedia_pool.wire_api': 'responses', 'model_providers.acedia_pool.env_key': 'ACEDIA_ACCOUNT_POOL_KEY',
      'model_providers.acedia_pool.requires_openai_auth': false, 'model_providers.acedia_pool.supports_websockets': false };
    return { env: { ACEDIA_ACCOUNT_POOL_KEY: this.token(id) }, args: Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]) };
  }
  async proxy(req, res) {
    let a, sessionId, record;
    const controller = new AbortController(); this.controllers.add(controller);
    res.on('close', () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), 15 * 60_000); timeout.unref?.();
    try {
      this.guard();
      if (req.headers.origin || req.headers['sec-fetch-site'] === 'cross-site') throw fail('브라우저 직접 요청은 허용하지 않습니다.', 403);
      sessionId = this.authenticate(req); if (!sessionId) throw fail('인증이 필요합니다.', 401);
      if (!this.state.enabled) throw fail('계정 분산이 꺼져 있습니다.', 503);
      const url = new URL(req.url, 'http://127.0.0.1');
      const endpoint = url.pathname.slice('/provider'.length);
      if (!url.pathname.startsWith('/provider/') || !((req.method === 'POST' && ['/responses', '/responses/compact'].includes(endpoint)) || (req.method === 'GET' && endpoint === '/models'))) throw fail('지원하지 않는 요청입니다.', 404);
      let body;
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 32 * 1024 * 1024) throw fail('요청 크기가 너무 큽니다.', 413); chunks.push(chunk); }
        body = Buffer.concat(chunks);
        try { const data = JSON.parse(body); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); } catch { throw fail('JSON 요청이 필요합니다.'); }
      }
      a = this.choose(sessionId); this.active.set(a.id, (this.active.get(a.id) || 0) + 1);
      this.state.sessions[sessionId].lastUsed = this.now();
      record = { at: this.now(), sessionId, accountId: a.id, status: 'running', inputTokens: 0, outputTokens: 0 };
      const tokens = await this.credentials(a.id);
      const headers = { authorization: `Bearer ${tokens.access_token}`, 'chatgpt-account-id': tokens.account_id, 'content-type': 'application/json', accept: 'text/event-stream, application/json', originator: 'codex_cli_rs' };
      for (const key of ['openai-beta', 'version', 'session_id', 'conversation_id', 'x-codex-turn-state', 'x-codex-turn-metadata', 'user-agent']) if (typeof req.headers[key] === 'string') headers[key] = req.headers[key];
      const send = () => this.fetch(this.upstream + endpoint + url.search, { method: req.method, headers, body, signal: controller.signal, redirect: 'manual' });
      let upstream = await send();
      if (upstream.status === 401) {
        // Retry only an explicit authentication rejection, on the same account, before sending any response bytes.
        await upstream.body?.cancel();
        const refreshed = await this.credentials(a.id, true);
        headers.authorization = `Bearer ${refreshed.access_token}`;
        upstream = await send();
      }
      record.httpStatus = upstream.status;
      if (!upstream.ok) {
        await upstream.body?.cancel();
        if ([401, 403].includes(upstream.status)) a.status = 'login_required';
        if (upstream.status === 429) { const retry = Number(upstream.headers.get('retry-after')); a.cooldownUntil = this.now() + Math.min(3600, Math.max(30, Number.isFinite(retry) ? retry : 60)) * 1000; }
        throw fail(`계정 요청이 실패했습니다 (HTTP ${upstream.status}). 계정 상태를 확인하세요.`, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
      }
      const contentType = upstream.headers.get('content-type') || 'application/json';
      const responseHeaders = { 'content-type': contentType, 'cache-control': 'no-store', 'x-accel-buffering': 'no' };
      for (const key of ['x-codex-turn-state', 'x-request-id']) if (upstream.headers.get(key)) responseHeaders[key] = upstream.headers.get(key);
      res.writeHead(upstream.status, responseHeaders);
      const decoder = new StringDecoder('utf8'); let tail = '', observed = false, completed = false;
      const inspect = text => {
        let data; try { data = JSON.parse(text); } catch { return; }
        if (data.type === 'response.failed' || data.type === 'error' || data.type === 'response.incomplete') record.status = 'failed';
        if (data.type === 'response.completed' || (!data.type && data.usage)) completed = true;
        const usage = data.response?.usage || data.usage;
        if (usage && (!data.type || ['response.completed', 'response.failed', 'response.incomplete'].includes(data.type)) && !observed) { observed = true; record.inputTokens = count(usage.input_tokens); record.outputTokens = count(usage.output_tokens); record.cachedTokens = count(usage.input_tokens_details?.cached_tokens); }
      };
      if (upstream.body) for await (const chunk of upstream.body) {
        tail += decoder.write(Buffer.from(chunk));
        if (contentType.includes('text/event-stream')) {
          let newline; while ((newline = tail.indexOf('\n')) >= 0) { const line = tail.slice(0, newline).trim(); tail = tail.slice(newline + 1); if (line.startsWith('data:')) inspect(line.slice(5).trim()); }
        }
        if (tail.length > 2 * 1024 * 1024) tail = '';
        if (!res.write(chunk)) await new Promise((resolve, reject) => {
          const cleanup = () => { res.off('drain', drained); res.off('close', closed); };
          const drained = () => { cleanup(); resolve(); }; const closed = () => { cleanup(); reject(new Error('closed')); };
          res.once('drain', drained); res.once('close', closed);
          if (res.destroyed) closed();
        });
      }
      tail += decoder.end(); if (tail) inspect(tail.startsWith('data:') ? tail.slice(5).trim() : tail);
      if (record.status !== 'failed') record.status = contentType.includes('text/event-stream') && !completed ? 'failed' : 'completed';
      res.end();
    } catch (error) {
      if (record) record.status = controller.signal.aborted ? 'cancelled' : 'failed';
      if (!res.headersSent && !res.destroyed) json(res, error.status || 502, { error: { message: error.status ? error.message : '분산 요청 연결에 실패했습니다.', type: 'acedia_pool_error' } });
      else if (!res.destroyed) res.destroy();
    } finally {
      clearTimeout(timeout); this.controllers.delete(controller);
      if (a) this.active.set(a.id, Math.max(0, (this.active.get(a.id) || 1) - 1));
      if (a && record) {
        a.stats.requests++; if (record.status !== 'completed') a.stats.failures++;
        a.stats.inputTokens += record.inputTokens; a.stats.outputTokens += record.outputTokens; a.stats.cachedTokens += record.cachedTokens || 0;
        this.state.recent.push(record); this.state.recent = this.state.recent.slice(-200);
        try { this.persist(); } catch { this.loadError = '계정 사용 기록을 저장하지 못했습니다. 저장 공간을 확인하세요.'; }
      }
    }
  }
  async api(req, res, url, { readJson, allowed, admin = true, local = false }) {
    if (url.pathname !== '/api/account-pool') return false;
    try {
      if (!admin) { if (req.method !== 'GET') throw fail('계정 관리 권한이 필요합니다.', 403); json(res, 200, this.snapshot(false)); return true; }
      if (req.method === 'GET') { json(res, 200, { ...this.snapshot(), defaultLoginMethod: local ? 'browser' : 'device' }); return true; }
      if (req.method !== 'POST') throw fail('지원하지 않는 요청입니다.', 405);
      if (!allowed()) throw fail('다른 사이트의 요청은 허용하지 않습니다.', 403);
      if (!String(req.headers['content-type']).startsWith('application/json')) throw fail('JSON 요청이 필요합니다.', 415);
      const b = await readJson(req);
      switch (b.action) {
        case 'create': this.create(b.label); break;
        case 'login': await this.beginLogin(b.id, b.method ?? (local ? 'browser' : 'device')); break;
        case 'cancel': await this.cancelLogin(b.id); break;
        case 'update': this.update(b.id, b.enabled, b.label); break;
        case 'remove': this.remove(b.id); break;
        case 'refresh': await this.credentials(b.id, false, true); break;
        case 'configure': await this.setEnabled(b.enabled); break;
        default: throw fail('지원하지 않는 작업입니다.');
      }
      json(res, 200, { ...this.snapshot(), defaultLoginMethod: local ? 'browser' : 'device' });
    } catch (error) { if (!res.headersSent) json(res, error.status || 400, { error: error.status ? error.message : '계정 작업에 실패했습니다. Codex CLI와 저장 공간을 확인하세요.' }); }
    return true;
  }
  close() {
    for (const job of this.jobs.values()) void job.finish(false);
    for (const controller of this.controllers) controller.abort();
    this.server?.closeAllConnections(); this.server?.close();
  }
}
