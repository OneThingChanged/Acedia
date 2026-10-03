import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
import { parse as parseToml } from 'smol-toml';
import { terminateWindowsProcessTree } from './process-tree.mjs';

const failure = message => Object.assign(new Error(message), { status: 503 });
const REFRESH = 'account/chatgptAuthTokens/refresh';
const AUTH_MUTATIONS = new Set(['account/login/start', 'account/login/cancel', 'account/logout']);
const THREAD_STARTS = new Set(['thread/start', 'thread/resume', 'thread/fork']);
const send = (socket, message) => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const data = JSON.stringify(message);
  if (socket.bufferedAmount + Buffer.byteLength(data) > 32 * 1024 * 1024) { socket.close(1009); return; }
  socket.send(data);
};

const permissionValues = new Map([['-s', 'sandbox'], ['--sandbox', 'sandbox'], ['-a', 'approvalPolicy'], ['--ask-for-approval', 'approvalPolicy']]);
export function codexThreadOverrides(args = []) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    const key = permissionValues.get(flag) || (['-m', '--model'].includes(flag) ? 'model' : null);
    if (key) result[key] = inline ?? args[++i];
    else if (['--dangerously-bypass-approvals-and-sandbox', '--yolo'].includes(flag)) Object.assign(result, { sandbox: 'danger-full-access', approvalPolicy: 'never' });
    else if (flag === '--approve-for-me') Object.assign(result, { sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' });
  }
  return result;
}
export function codexRemoteTuiArgs(args = []) {
  if (!args.includes('resume')) return args;
  return args.filter((arg, index) => {
    if (permissionValues.has(args[index - 1])) return false;
    const flag = arg.split('=')[0];
    return !permissionValues.has(flag) && !['--dangerously-bypass-approvals-and-sandbox', '--yolo', '--approve-for-me'].includes(flag);
  });
}

// Only startup configuration belongs on app-server. TUI-only options (sandbox,
// approvals, attachments, resume, etc.) are carried by its native thread RPCs.
export function codexServerConfigArgs(args = []) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['-c', '--config', '--enable', '--disable'].includes(arg) && i + 1 < args.length) result.push(arg, args[++i]);
    else if (/^--(?:config|enable|disable)=/.test(arg)) result.push(arg);
    else if (arg === '--search') result.push('-c', 'web_search="live"');
    else if (['-m', '--model'].includes(arg) && i + 1 < args.length) {
      result.push('-c', `model=${JSON.stringify(args[++i])}`);
    }
  }
  return result;
}

// CLI 0.160 named profiles are <name>.config.toml overlays. app-server has no
// --profile flag; apply the overlay through thread RPCs without copying a home
// or putting profile values (which may include MCP secrets) on a command line.
export async function codexProfileConfig(args, env) {
  let name;
  for (let i = 0; i < args.length; i++) {
    if (['-p', '--profile'].includes(args[i])) name = args[++i];
    else if (args[i].startsWith('--profile=')) name = args[i].slice(10);
  }
  if (!name) return {};
  if (/[\\/\x00-\x1f]/.test(name) || name === '.' || name === '..') throw failure('Codex 프로필 이름이 올바르지 않습니다.');
  const file = path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), name + '.config.toml');
  const config = Object.create(null);
  try {
    if ((await fs.stat(file)).size > 1024 * 1024) throw new Error();
    const flatten = (object, prefix = '') => {
      for (const [key, value] of Object.entries(object)) {
        const segment = /^[a-zA-Z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
        const qualified = prefix ? prefix + '.' + segment : segment;
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) flatten(value, qualified);
        else config[qualified] = value;
      }
    };
    flatten(parseToml(await fs.readFile(file, 'utf8')));
  } catch { throw failure('선택한 Codex 프로필 파일을 읽을 수 없습니다. CODEX_HOME의 프로필 설정을 확인하세요.'); }
  // Explicit launch overrides have higher precedence than the named profile.
  const startup = codexServerConfigArgs(args);
  for (let i = 0; i < startup.length; i++) {
    const [flag, inline] = startup[i].split(/=(.*)/s);
    const value = inline ?? startup[++i];
    if (flag === '--enable' || flag === '--disable') { config['features.' + value] = flag === '--enable'; continue; }
    const equals = value.indexOf('=');
    if (equals < 0) continue;
    const key = value.slice(0, equals).trim(), raw = value.slice(equals + 1).trim();
    try { config[key] = parseToml('value=' + raw).value; } catch { config[key] = raw; }
  }
  return config;
}

/** A private native Codex app-server; ChatGPT credentials exist only in memory.
 * The TUI connects through Acedia so only the host answers credential refreshes.
 * Native tool execution, permissions, plugins, and MCP remain owned by Codex.
 */
export class AccountPoolSession extends EventEmitter {
  constructor({ command, env, cwd, configArgs = [], providerUrl, getAuth, ensureAvailable,
    spawnProcess = spawn, startTimeout = 20000, requestTimeout = 20000 }) {
    super();
    Object.assign(this, { command, env, cwd, configArgs, providerUrl, getAuth, ensureAvailable, spawnProcess, startTimeout, requestTimeout });
    this.publicToken = randomBytes(32).toString('base64url');
    this.privateToken = randomBytes(32).toString('base64url');
    this.pending = new Map(); this.sequence = 0; this.sockets = new Set(); this.closed = false;
    this.threadOverrides = codexThreadOverrides(configArgs);
    this.config = { model_provider: 'openai', openai_base_url: providerUrl, cli_auth_credentials_store: 'ephemeral' };
  }
  async start() {
    try {
      const env = { ...this.env };
      this.profileConfig = await codexProfileConfig(this.configArgs, env);
      if (this.closed) throw failure('세션 시작이 취소되었습니다.');
      for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|OPENAI_BASE_URL|ACEDIA_ACCOUNT_POOL_KEY|ACEDIA_CODEX_REMOTE_TOKEN)$/i.test(key)) delete env[key];
      const args = [...codexServerConfigArgs(this.configArgs),
        ...Object.entries(this.config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]),
        '--listen', 'ws://127.0.0.1:0', '--ws-auth', 'capability-token',
        '--ws-token-sha256', createHash('sha256').update(this.privateToken).digest('hex')];
      const command = this.command(args, env);
      this.child = this.spawnProcess(command.file, command.args, { env, cwd: this.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const address = await new Promise((resolve, reject) => {
        let tail = '';
        const timer = setTimeout(() => finish(failure('Codex 세션 서버를 시작하지 못했습니다. Codex CLI를 업데이트한 뒤 다시 시작하세요.')), this.startTimeout);
        const finish = (error, value) => {
          clearTimeout(timer); this.child.off('error', failed); this.child.off('exit', failed);
          this.child.stdout.off('data', read); this.child.stderr.off('data', read);
          error ? reject(error) : resolve(value);
        };
        const failed = () => finish(failure('Codex 세션 서버를 시작하지 못했습니다. Codex CLI 0.160.0 이상이 필요합니다.'));
        const read = chunk => {
          // Startup logs never leave this parser. They may contain private paths.
          tail = (tail + chunk).slice(-8192);
          const match = tail.match(/listening on:\s*(ws:\/\/127\.0\.0\.1:([1-9]\d{0,4}))/);
          if (match && Number(match[2]) <= 65535) finish(null, match[1]);
        };
        this.child.on('error', failed); this.child.on('exit', failed);
        this.child.stdout.on('data', read); this.child.stderr.on('data', read);
      });
      if (this.closed) throw failure('세션 시작이 취소되었습니다.');
      this.address = address;
      this.child.stdout.resume(); this.child.stderr.resume();
      this.child.on('error', () => this.close()); this.child.on('exit', () => this.close());
      this.control = await this.connect();
      this.control.on('message', raw => this.receive(raw));
      this.control.on('close', () => this.close());
      await this.call('initialize', { clientInfo: { name: 'acedia_codex_session', title: 'Acedia', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      send(this.control, { method: 'initialized' });
      const auth = await this.getAuth(false);
      await this.call('account/login/start', { type: 'chatgptAuthTokens', ...auth });
      const account = await this.call('account/read', { refreshToken: false });
      if (account.account?.type !== 'chatgpt' || account.requiresOpenaiAuth !== true
        || (account.workspaceRouting && account.workspaceRouting.chatgptAccountId !== auth.chatgptAccountId)) {
        throw failure('분산 계정의 Codex 인증을 확인하지 못했습니다. 다시 로그인하세요.');
      }
      this.workspaceOrigin = account.workspaceRouting?.backendOrigin;
      return this;
    } catch (error) { this.close(); throw error.status ? error : failure('분산 계정으로 Codex 도구를 연결하지 못했습니다. 계정 로그인과 Codex CLI 버전을 확인하세요.'); }
  }
  async connect() {
    if (this.closed) throw failure('Codex 세션이 종료되었습니다.');
    const socket = new WebSocket(this.address, { headers: { authorization: `Bearer ${this.privateToken}` }, maxPayload: 32 * 1024 * 1024, handshakeTimeout: this.startTimeout });
    this.sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => this.sockets.delete(socket));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); socket.once('close', () => reject(failure('Codex 세션 연결이 종료되었습니다.'))); });
    if (this.closed) { socket.terminate(); throw failure('Codex 세션이 종료되었습니다.'); }
    return socket;
  }
  receive(raw) {
    let message; try { message = JSON.parse(raw); } catch { return this.close(); }
    if (message.id != null && !message.method) {
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(failure('분산 계정의 Codex 인증 요청을 완료하지 못했습니다.'));
      else pending.resolve(message.result);
    } else if (message.method === REFRESH && message.id != null) {
      void this.refresh(message);
    }
  }
  async refresh(message) {
    try {
      this.ensureAvailable();
      const result = await this.getAuth(true, message.params?.previousAccountId);
      if (!this.closed) send(this.control, { id: message.id, result });
    } catch {
      send(this.control, { id: message.id, error: { code: -32000, message: '분산 계정 인증을 갱신하지 못했습니다. Acedia 계정 상태를 확인하세요.' } });
    }
  }
  call(method, params) {
    if (this.closed) return Promise.reject(failure('Codex 세션이 종료되었습니다.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(failure('Codex 계정 연결 시간이 초과되었습니다.')); }, this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer });
      send(this.control, { id, method, params });
    });
  }
  async attach(client) {
    this.sockets.add(client); client.on('error', () => {});
    let upstream;
    const queue = []; let queuedBytes = 0;
    const relay = raw => {
      let message;
      try {
        message = JSON.parse(raw);
        if (AUTH_MUTATIONS.has(message.method)) throw failure('이 세션의 계정은 Acedia 계정 관리에서 변경하세요.');
        if (THREAD_STARTS.has(message.method) || message.method === 'turn/start' || message.method === 'turn/steer') this.ensureAvailable();
        if (THREAD_STARTS.has(message.method)) {
          message.params = { ...message.params, ...this.threadOverrides, modelProvider: 'openai', config: { ...this.profileConfig, ...message.params?.config, ...this.config } };
        }
        if (upstream) send(upstream, message);
        else {
          queuedBytes += raw.length;
          if (queuedBytes > 32 * 1024 * 1024) return client.close(1009);
          queue.push(message);
        }
      } catch (error) {
        if (message?.id != null) send(client, { id: message.id, error: { code: -32000, message: error.status ? error.message : 'Codex 요청을 처리하지 못했습니다.' } });
        else client.close(1008);
      }
    };
    client.on('message', relay);
    client.on('close', () => { this.sockets.delete(client); upstream?.terminate(); });
    try {
      upstream = await this.connect();
      if (client.readyState !== WebSocket.OPEN) { upstream.terminate(); return; }
      upstream.on('close', () => client.close(1011));
      upstream.on('message', raw => {
        let message; try { message = JSON.parse(raw); } catch { return client.close(1011); }
        // Codex broadcasts this server request. Let only the host answer it;
        // the stock TUI cannot refresh externally owned ChatGPT credentials.
        if (message.method === REFRESH) return;
        send(client, message);
      });
      for (const message of queue) send(upstream, message);
    } catch { client.close(1011); }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(failure('Codex 세션이 종료되었습니다.')); }
    this.pending.clear();
    for (const socket of this.sockets) socket.terminate(); this.sockets.clear();
    if (this.child?.pid && this.child.exitCode == null) {
      try { if (process.platform !== 'win32' || !terminateWindowsProcessTree(this.child.pid)) this.child.kill(); } catch {}
    }
    this.publicToken = ''; this.privateToken = '';
    this.emit('closed');
  }
}
