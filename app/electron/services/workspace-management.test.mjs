import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceManagement } from './workspace-management.mjs';
import { HookService } from './hook-service.mjs';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-mcp-'));
  cleanups.push(() => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-workspace-mcp-')) throw new Error('Unexpected cleanup path');
    fs.rmSync(root, { recursive: true });
  });
  const catalog = { projects: [], agents: [], availableTools: [{ id: 'codex', label: 'Codex' }] };
  const active = new Set(['caller']);
  const create = vi.fn(async payload => {
    const id = 'session-' + create.mock.calls.length;
    if (payload.project) catalog.projects.push({ id: payload.projectId, ...payload.project });
    catalog.agents.push({ id, projectId: payload.projectId, name: payload.name, aiToolId: payload.aiToolId });
    active.add(id); return { id };
  });
  const service = new WorkspaceManagement({ catalog: () => catalog, create, isActive: id => active.has(id) });
  return { root, catalog, create, active, service, call: (action, body = {}) => service.handle({ agentId: 'caller', action, body }) };
}
it('registers a folder once, creates its first session and supports idempotent additional sessions', async () => {
  const f = fixture();
  const first = await f.call('create-project', { folder: f.root });
  expect(first).toMatchObject({ created: true, sessionId: 'session-1', active: true });
  expect(f.create.mock.calls[0][0]).toMatchObject({ project: { folder: fs.realpathSync(f.root) }, aiToolId: 'codex', dangerous: false, workspaceManaged: true });
  expect(await f.call('create-project', { folder: path.join(f.root, '.') })).toMatchObject({ created: false, projectId: first.projectId });
  const body = { projectId: first.projectId, name: 'Second', requestKey: 'second' };
  const [second, retried] = await Promise.all([f.call('create-session', body), f.call('create-session', body)]);
  expect(second).toMatchObject({ created: true, sessionId: 'session-2', active: true });
  expect(retried).toMatchObject({ created: false, sessionId: second.sessionId });
  expect(f.create).toHaveBeenCalledTimes(2);
  f.active.delete(second.sessionId);
  expect((await f.call('create-session', body)).active).toBe(false);
  await expect(f.call('create-session', { ...body, name: 'Different' })).rejects.toMatchObject({ statusCode: 409 });
  expect((await f.call('list')).sessions).toHaveLength(2);
});
it('rejects missing folders, relative paths, unsupported tools, stale callers and unsafe extra options', async () => {
  const f = fixture();
  for (const body of [{ folder: '.' }, { folder: path.join(f.root, 'missing') }, { folder: f.root, aiToolId: 'disabled' }, { folder: f.root, dangerous: true }, []]) {
    await expect(f.call('create-project', body)).rejects.toThrow();
  }
  await expect(f.call('create-session', { projectId: 'missing', requestKey: 'a' })).rejects.toMatchObject({ statusCode: 404 });
  f.active.clear(); await expect(f.call('list')).rejects.toMatchObject({ statusCode: 409 });
  expect(f.create).not.toHaveBeenCalled();
});
it('records the caller and parents a created session only within its own project', async () => {
  const f = fixture();
  f.catalog.projects.push({ id: 'own', name: 'Own', folder: f.root }, { id: 'other', name: 'Other', folder: f.root });
  f.catalog.agents.push({ id: 'caller', projectId: 'own', aiToolId: 'codex' });
  await f.call('create-session', { projectId: 'own', requestKey: 'child' });
  expect(f.create.mock.calls[0][0].sessionHierarchy).toEqual({ parentId: 'caller', createdById: 'caller', inheritFolder: true, inheritInstructions: true, inheritModel: true });
  await f.call('create-session', { projectId: 'other', requestKey: 'peer' });
  expect(f.create.mock.calls[1][0].sessionHierarchy).toEqual({ createdById: 'caller' });
});

it('retains a timeout result so a retry cannot create another session, and reports registered sessions whose launch failed', async () => {
  const f = fixture(); const first = await f.call('create-project', { folder: f.root });
  f.create.mockRejectedValueOnce(Object.assign(new Error('acknowledgement timeout'), { statusCode: 504 }));
  const body = { projectId: first.projectId, requestKey: 'uncertain' };
  await expect(f.call('create-session', body)).rejects.toMatchObject({ statusCode: 504 });
  await expect(f.call('create-session', body)).rejects.toMatchObject({ statusCode: 504 });
  expect(f.create).toHaveBeenCalledTimes(2);
  f.create.mockResolvedValueOnce({ id: 'inactive', startError: 'CLI unavailable' });
  expect(await f.call('create-session', { ...body, requestKey: 'launch-failed' })).toMatchObject({ created: true, active: false, startError: 'CLI unavailable' });
});
it('exposes authenticated workspace tools over the real stdio MCP bridge, rejecting browser origins and invalid bodies', async () => {
  const f = fixture();
  const hook = new HookService({ baseDir: path.join(f.root, 'hook'), workspaceProvider: request => f.service.handle(request) });
  await hook.start();
  cleanups.push(() => new Promise(resolve => { hook.server.closeAllConnections(); hook.server.close(resolve); }));
  const url = `http://127.0.0.1:${hook.port}/integration/v1/workspace/projects`;
  expect((await fetch(url)).status).toBe(401);
  const headers = { authorization: 'Bearer ' + hook.token, 'x-acedia-agent-id': 'caller', 'content-type': 'application/json' };
  expect((await fetch(url, { headers: { ...headers, origin: 'https://unrelated.invalid' } })).status).toBe(403);
  expect((await fetch(url, { method: 'POST', headers, body: '[]' })).status).toBe(400);
  const child = spawn(process.execPath, [path.resolve('electron/services/browser-mcp-server.mjs')], { windowsHide: true, env: { ...process.env,
    MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: 'caller' }, stdio: ['pipe', 'pipe', 'ignore'] });
  cleanups.push(() => { child.stdin.end(); child.kill(); });
  let nextId = 0, buffer = ''; const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk; let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      pending.get(message.id)?.(message.result); pending.delete(message.id);
    }
  });
  const rpc = (method, params = {}) => new Promise(resolve => { const id = ++nextId; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  await rpc('initialize');
  expect((await rpc('tools/list')).tools.map(t => t.name)).toEqual(expect.arrayContaining(['acedia_projects', 'acedia_project_create', 'acedia_session_create', 'browser_open']));
  const created = await rpc('tools/call', { name: 'acedia_project_create', arguments: { folder: f.root, name: 'Fixture' } });
  expect(created.structuredContent).toMatchObject({ created: true, active: true });
  const listed = await rpc('tools/call', { name: 'acedia_projects' });
  expect(listed.structuredContent.projects[0].name).toBe('Fixture');
});
