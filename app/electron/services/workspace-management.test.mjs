import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceManagement } from './workspace-management.mjs';
import { HookService } from './hook-service.mjs';
import { SessionLaunchSettings } from './session-launch-settings.mjs';
import { SessionRelocation } from './session-relocation.mjs';
import { SessionStart } from './session-start.mjs';
import { SessionRegistry } from './session-registry.mjs';

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
    if (payload.start !== false) active.add(id); return { id };
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
it('creates standby projects and children in an explicit folder under a chosen same-project parent', async () => {
  const f = fixture();
  const project = await f.call('create-project', { folder: f.root, start: false });
  expect(project.active).toBe(false);
  const folder = path.join(f.root, 'PCGLab'); fs.mkdirSync(folder);
  const body = { projectId: project.projectId, parentSessionId: project.sessionId, folder, name: 'PCGLab', start: false, requestKey: 'standby' };
  const child = await f.call('create-session', body);
  expect(child).toMatchObject({ active: false, created: true });
  expect(f.create.mock.lastCall[0]).toMatchObject({ start: false, sessionHierarchy: { parentId: project.sessionId, createdById: 'caller', inheritFolder: false, folderOverride: fs.realpathSync(folder) } });
  expect(await f.call('create-session', body)).toMatchObject({ sessionId: child.sessionId, created: false, active: false });
  await expect(f.call('create-session', { ...body, start: true })).rejects.toMatchObject({ statusCode: 409 });
  await f.call('create-session', { ...body, parentSessionId: null, requestKey: 'independent' });
  expect(f.create.mock.lastCall[0].sessionHierarchy.parentId).toBeUndefined();
  expect(f.create.mock.lastCall[0].sessionHierarchy.createdById).toBe('caller');
});
it('rejects invalid start/parent/folder options without creating or launching a child', async () => {
  const f = fixture(); const first = await f.call('create-project', { folder: f.root });
  f.catalog.projects.push({ id: 'other', folder: f.root });
  f.catalog.agents.push({ id: 'outside', projectId: 'other', aiToolId: 'codex' });
  for (const extra of [{ start: 'false' }, { start: null }, { parentSessionId: false }, { parentSessionId: '' }, { parentSessionId: 'missing' }, { parentSessionId: 'outside' }, { folder: '.' }, { folder: path.join(f.root, 'missing') }, { folder: null }]) {
    await expect(f.call('create-session', { projectId: first.projectId, requestKey: 'invalid', ...extra })).rejects.toThrow();
  }
  expect(f.create).toHaveBeenCalledTimes(1);
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
  const exposed = (await rpc('tools/list')).tools;
  expect(exposed.map(t => t.name)).toEqual(expect.arrayContaining(['acedia_projects', 'acedia_project_create', 'acedia_session_create', 'acedia_session_settings', 'acedia_session_start', 'acedia_session_stop', 'acedia_sessions_organize', 'acedia_sessions_relocate', 'acedia_session_send', 'acedia_session_delivery', 'browser_open']));
  expect(exposed.find(t => t.name === 'acedia_session_create').inputSchema.properties).toMatchObject({ start: { type: 'boolean' }, folder: { type: 'string' }, parentSessionId: { type: ['string', 'null'] } });
  const created = await rpc('tools/call', { name: 'acedia_project_create', arguments: { folder: f.root, name: 'Fixture' } });
  expect(created.structuredContent).toMatchObject({ created: true, active: true });
  const listed = await rpc('tools/call', { name: 'acedia_projects' });
  expect(listed.structuredContent.projects[0].name).toBe('Fixture');
  for (const action of ['send', 'delivery', 'session-settings', 'relocate-sessions', 'start', 'stop', 'organize-sessions']) {
    const endpoint = `http://127.0.0.1:${hook.port}/integration/v1/workspace/${action}`;
    expect((await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
    expect((await fetch(endpoint, { method: 'POST', headers: { ...headers, origin: 'https://unrelated.invalid' }, body: '{}' })).status).toBe(403);
    expect((await fetch(endpoint, { method: 'POST', headers: { ...headers, 'x-acedia-agent-id': 'inactive' }, body: '{}' })).status).toBe(409);
    expect((await fetch(endpoint, { method: 'POST', headers, body: '{}' })).status).toBe(503);
  }
  const target = f.catalog.agents[0]; target.dangerous = false; f.active.delete(target.id);
  const registry = new SessionRegistry({ catalog: () => f.catalog, active: id => f.active.has(id),
    dispatch: payload => { queueMicrotask(() => void registry.complete({ ...payload, ok: true })); return true; },
    verifySaved: async (operation, body) => {
      if (operation === 'stop') { f.active.delete(body.sessionId); return { sessionId: body.sessionId, active: false }; }
      for (const change of body.changes) { const a = f.catalog.agents.find(a => a.id === change.sessionId); if (change.name) a.name = change.name; }
      return { sessions: body.changes };
    } });
  cleanups.push(() => registry.close()); f.service.registry = registry;
  const renamed = await rpc('tools/call', { name: 'acedia_sessions_organize', arguments: { changes: [{ sessionId: target.id, name: 'Coordinator', expectedName: target.name }] } });
  expect(renamed.structuredContent).toMatchObject({ saved: true, sessions: [{ sessionId: target.id, name: 'Coordinator' }] });
  expect((await rpc('tools/call', { name: 'acedia_session_stop', arguments: { sessionId: target.id } })).structuredContent).toMatchObject({ saved: true, active: false });
  expect((await rpc('tools/call', { name: 'acedia_session_stop', arguments: { sessionId: 'caller' } })).isError).toBe(true);
  const settings = new SessionLaunchSettings({ agentFor: id => f.catalog.agents.find(item => item.id === id), active: id => f.active.has(id),
    dispatch: payload => { queueMicrotask(() => void settings.complete({ ...payload, ok: true })); return true; },
    verifySaved: async payload => { target.dangerous = payload.dangerous; } });
  cleanups.push(() => settings.close()); f.service.sessionSettings = settings;
  const read = await rpc('tools/call', { name: 'acedia_session_settings', arguments: { sessionId: target.id } });
  expect(read.structuredContent).toMatchObject({ dangerous: false, active: false });
  const saved = await rpc('tools/call', { name: 'acedia_session_settings', arguments: { sessionId: target.id, dangerous: true, expectedDangerous: false } });
  expect(saved.structuredContent).toMatchObject({ dangerous: true, saved: true, active: false, appliesOn: 'next_start' });
  expect((await rpc('tools/call', { name: 'acedia_projects' })).structuredContent.sessions[0].dangerous).toBe(true);
  const endpoint = `http://127.0.0.1:${hook.port}/integration/v1/workspace/session-settings`;
  expect((await fetch(endpoint, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
  expect((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ sessionId: target.id, dangerous: 'true' }) })).status).toBe(400);
  expect((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ sessionId: 'missing' }) })).status).toBe(404);
  target.folder = f.root;
  const destination = path.join(f.root, 'RnDHub'); fs.mkdirSync(destination);
  f.catalog.projects.push({ id: 'rnd', name: 'RnDHub', folder: destination });
  const relocation = new SessionRelocation({ catalog: () => f.catalog, active: id => f.active.has(id),
    dispatch: payload => { queueMicrotask(() => void relocation.complete({ ...payload, ok: true })); return true; },
    verifySaved: async moves => { for (const move of moves) Object.assign(f.catalog.agents.find(a => a.id === move.sessionId), { folder: move.folder, projectId: move.projectId }); } });
  f.service.relocation = relocation; cleanups.push(() => relocation.close());
  const body = { moves: [{ sessionId: target.id, expectedProjectId: target.projectId, expectedFolder: target.folder, projectId: 'rnd', folder: destination }] };
  const moved = await rpc('tools/call', { name: 'acedia_sessions_relocate', arguments: body });
  expect(moved.structuredContent).toMatchObject({ saved: true, active: false, moves: [{ sessionId: target.id, projectId: 'rnd', folder: fs.realpathSync(destination) }] });
  expect((await rpc('tools/call', { name: 'acedia_projects' })).structuredContent.sessions[0]).toMatchObject({ projectId: 'rnd', folder: fs.realpathSync(destination), dangerous: true });
  const activate = vi.fn(async id => { const alreadyActive = f.active.has(id); f.active.add(id); return { active: true, restarted: !alreadyActive }; });
  f.service.sessionStart = new SessionStart({ agentFor: id => f.catalog.agents.find(a => a.id === id), activate });
  const start = () => rpc('tools/call', { name: 'acedia_session_start', arguments: { sessionId: target.id } });
  expect((await start()).structuredContent).toMatchObject({ sessionId: target.id, active: true, started: true, background: true });
  expect((await start()).structuredContent).toMatchObject({ started: false, active: true });
  expect(activate).toHaveBeenCalledTimes(2);
  expect((await rpc('tools/call', { name: 'acedia_projects' })).structuredContent.sessions[0]).toMatchObject({ active: true, dangerous: true, projectId: 'rnd' });
  expect(f.catalog.agents).toHaveLength(1);
  const startEndpoint = `http://127.0.0.1:${hook.port}/integration/v1/workspace/start`;
  expect((await fetch(startEndpoint, { method: 'POST', headers, body: JSON.stringify({ sessionId: 'missing' }) })).status).toBe(404);
  expect((await fetch(startEndpoint, { method: 'POST', headers, body: JSON.stringify({ sessionId: target.id, focus: true }) })).status).toBe(400);
  expect((await rpc('tools/call', { name: 'acedia_session_start', arguments: { sessionId: 'missing' } })).isError).toBe(true);
});
