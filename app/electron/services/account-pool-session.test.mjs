import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPoolSession, codexServerConfigArgs, codexThreadOverrides, codexRemoteTuiArgs, codexProfileConfig } from './account-pool-session.mjs';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const packet = (socket, value) => socket.send(JSON.stringify(value));
const waitOpen = socket => new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
function clientRpc(socket) {
  let id = 0; const pending = new Map(); const notifications = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (!message.method && pending.has(message.id)) {
      const resolve = pending.get(message.id); pending.delete(message.id); resolve(message);
    } else notifications.push(message);
  });
  return { notifications, call: (method, params = {}) => new Promise(resolve => {
    const next = ++id; pending.set(next, resolve); packet(socket, { id: next, method, params });
  }) };
}
async function fixture(overrides = {}) {
  const seen = [], replies = [], authenticated = [];
  const backend = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => backend.once('listening', resolve));
  const address = `ws://127.0.0.1:${backend.address().port}`;
  let auth, spawnOptions, child, validHash, available = true;
  backend.on('connection', (socket, req) => {
    authenticated.push(createHash('sha256').update(req.headers.authorization.slice(7)).digest('hex') === validHash);
    socket.on('message', raw => {
      const message = JSON.parse(raw); seen.push(message);
      if (message.id == null) return;
      if (!message.method) { replies.push(message); return; }
      if (message.method === 'account/login/start') auth = message.params;
      const result = message.method === 'account/read'
        ? { account: { type: 'chatgpt', planType: 'pro' }, requiresOpenaiAuth: true, workspaceRouting: { chatgptAccountId: auth.chatgptAccountId, backendOrigin: 'https://chatgpt.com' } }
        : { accepted: true };
      packet(socket, { id: message.id, result });
    });
  });
  const runtime = new AccountPoolSession({
    command: (args, env) => { validHash = args.at(-1); return { file: 'codex-fixture', args: ['app-server', ...args] }; },
    env: { CODEX_HOME: 'existing-home', OPENAI_API_KEY: 'must-not-inherit', openai_base_url: 'must-not-inherit', MULTIAGENT_AGENT_ID: 'session-a' },
    cwd: 'project', configArgs: ['--config', 'features.image_generation=true'], providerUrl: 'http://127.0.0.1:3020/native-provider/lease',
    getAuth: vi.fn(async () => ({ accessToken: 'private-a', chatgptAccountId: 'account-a', chatgptPlanType: 'pro' })),
    ensureAvailable: () => { if (!available) throw Object.assign(new Error('account unavailable'), { status: 503 }); },
    spawnProcess: (_file, _args, options) => {
      spawnOptions = options;
      child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: 0 });
      queueMicrotask(() => child.stderr.write(`codex app-server\n  listening on: ${address}\n`));
      return child;
    }, ...overrides,
  });
  const gateway = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise(resolve => gateway.once('listening', resolve));
  gateway.on('connection', socket => void runtime.attach(socket));
  cleanups.push(async () => {
    runtime.close();
    for (const socket of gateway.clients) socket.terminate();
    for (const socket of backend.clients) socket.terminate();
    await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => backend.close(resolve))]);
  });
  await runtime.start();
  const client = new WebSocket(`ws://127.0.0.1:${gateway.address().port}`);
  const rpc = clientRpc(client); await waitOpen(client);
  cleanups.push(() => client.terminate());
  return { runtime, client, rpc, seen, replies, backend, authenticated, spawnOptions, child, unavailable: () => { available = false; } };
}

describe('native routed Codex sessions', () => {
  it('uses one externally owned account in memory while retaining home, hooks and native configuration', async () => {
    const f = await fixture();
    expect(f.runtime.workspaceOrigin).toBe('https://chatgpt.com');
    expect(f.spawnOptions).toMatchObject({ windowsHide: true, cwd: 'project', env: { CODEX_HOME: 'existing-home', MULTIAGENT_AGENT_ID: 'session-a' } });
    expect(f.spawnOptions.env.OPENAI_API_KEY).toBeUndefined();
    expect(f.spawnOptions.env.openai_base_url).toBeUndefined();
    expect(f.seen.find(m => m.method === 'account/login/start').params).toEqual({ type: 'chatgptAuthTokens', accessToken: 'private-a', chatgptAccountId: 'account-a', chatgptPlanType: 'pro' });
    expect(f.authenticated.every(Boolean)).toBe(true);
    await f.rpc.call('initialize');
    expect(JSON.stringify(f.rpc.notifications)).not.toContain('private-a');
  });
  it('only the host answers a broadcast token refresh and keeps native question/reply messages intact', async () => {
    const f = await fixture(); await f.rpc.call('initialize');
    for (const socket of f.backend.clients) packet(socket, { id: 500, method: 'account/chatgptAuthTokens/refresh', params: { reason: 'unauthorized', previousAccountId: 'account-a' } });
    await vi.waitFor(() => expect(f.replies).toHaveLength(1));
    expect(f.runtime.getAuth).toHaveBeenLastCalledWith(true, 'account-a');
    expect(f.replies[0]).toMatchObject({ id: 500, result: { accessToken: 'private-a', chatgptAccountId: 'account-a' } });
    expect(f.rpc.notifications.some(m => m.method === 'account/chatgptAuthTokens/refresh')).toBe(false);
    const question = { id: 501, method: 'item/tool/requestUserInput', params: { questions: [{ id: 'q1', question: 'Pick', options: [] }] } };
    for (const socket of f.backend.clients) packet(socket, question);
    await vi.waitFor(() => expect(f.rpc.notifications).toContainEqual(question));
    packet(f.client, { id: 501, result: { answers: { q1: { answers: ['yes'] } } } });
    await vi.waitFor(() => expect(f.replies.some(m => m.id === 501)).toBe(true));
  });
  it('resumes legacy provider threads using native authentication and prevents TUI account replacement', async () => {
    const f = await fixture();
    await f.rpc.call('thread/resume', { threadId: 'saved-thread', modelProvider: 'acedia_pool', cwd: 'project', config: { model_reasoning_effort: 'high', cli_auth_credentials_store: 'file' } });
    expect(f.seen.at(-1).params).toMatchObject({ threadId: 'saved-thread', modelProvider: 'openai', cwd: 'project', config: { model_reasoning_effort: 'high', cli_auth_credentials_store: 'ephemeral', openai_base_url: f.runtime.providerUrl } });
    const logins = f.seen.filter(m => m.method === 'account/login/start').length;
    expect((await f.rpc.call('account/login/start', { type: 'apiKey', apiKey: 'wrong' })).error.message).toContain('Acedia');
    expect((await f.rpc.call('account/logout')).error).toBeDefined();
    expect(f.seen.filter(m => m.method === 'account/login/start')).toHaveLength(logins);
  });
  it('rejects a new turn and token refresh after the bound account becomes unavailable', async () => {
    const f = await fixture(); await f.rpc.call('initialize'); f.unavailable();
    expect((await f.rpc.call('turn/start', { threadId: 'saved-thread', input: [] })).error.message).toBe('account unavailable');
    for (const socket of f.backend.clients) packet(socket, { id: 502, method: 'account/chatgptAuthTokens/refresh', params: { previousAccountId: 'account-a' } });
    await vi.waitFor(() => expect(f.replies).toHaveLength(1));
    expect(f.replies[0].error).toBeDefined();
    expect(f.runtime.getAuth).toHaveBeenCalledTimes(1);
    expect(f.seen.some(m => m.method === 'turn/start')).toBe(false);
  });
  it('closes both clients and pending requests on native process exit', async () => {
    const f = await fixture();
    const closed = new Promise(resolve => f.client.once('close', resolve));
    const pending = f.runtime.call('ignored', {}); const rejected = expect(pending).rejects.toThrow('종료');
    f.child.emit('exit', 1); await closed; await rejected;
    expect(f.runtime.closed).toBe(true); expect(f.runtime.pending.size).toBe(0);
    expect(f.runtime.publicToken).toBe('');
  });
  it('separates startup configuration from terminal and permission flags', () => {
    expect(codexServerConfigArgs(['--model', 'gpt-6-astra', '--sandbox', 'workspace-write', '--profile', 'work', '--enable', 'image_generation', '-c', 'features.apps=true', '--search', '--no-alt-screen']))
      .toEqual(['-c', 'model="gpt-6-astra"', '--enable', 'image_generation', '-c', 'features.apps=true', '-c', 'web_search="live"']);
  });
  it('loads named profiles in memory, merges CLI overrides and does not leak MCP secrets into process arguments', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-profile-test-'));
    cleanups.push(() => fs.rmSync(root, { recursive: true }));
    fs.writeFileSync(path.join(root, 'work.config.toml'), 'model="profile-model"\n[mcp_servers.fixture.env]\nPRIVATE_VALUE="fixture-secret"\n[features]\nimage_generation=false\n');
    const args = ['--profile', 'work', '--enable', 'image_generation', '-m', 'cli-model'];
    expect(await codexProfileConfig(args, { CODEX_HOME: root })).toEqual({ model: 'cli-model', 'mcp_servers.fixture.env.PRIVATE_VALUE': 'fixture-secret', 'features.image_generation': true });
    expect(JSON.stringify(codexServerConfigArgs(args))).not.toMatch(/work|fixture-secret/);
    await expect(codexProfileConfig(['--profile', '../work'], { CODEX_HOME: root })).rejects.toThrow('프로필');
    await expect(codexProfileConfig(['--profile', 'missing'], { CODEX_HOME: root })).rejects.toThrow('프로필');
  });
  it('applies explicit permissions through native thread RPCs when the remote TUI cannot override them on resume', async () => {
    const args = ['resume', 'saved-id', '--model', 'model-new', '--sandbox=workspace-write', '--ask-for-approval', 'on-request', '--no-alt-screen'];
    expect(codexRemoteTuiArgs(args)).toEqual(['resume', 'saved-id', '--model', 'model-new', '--no-alt-screen']);
    expect(codexThreadOverrides(args)).toEqual({ model: 'model-new', sandbox: 'workspace-write', approvalPolicy: 'on-request' });
    const f = await fixture({ configArgs: args });
    await f.rpc.call('thread/resume', { threadId: 'saved-id', sandbox: 'danger-full-access' });
    expect(f.seen.at(-1).params).toMatchObject({ threadId: 'saved-id', model: 'model-new', sandbox: 'workspace-write', approvalPolicy: 'on-request' });
  });
});
