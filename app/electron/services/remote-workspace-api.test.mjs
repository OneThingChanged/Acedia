import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';
import { SessionModelDefaults } from './session-model-defaults.mjs';

const roots = [], services = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.stop()));
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-workspace-api-')) throw Error('Invalid test cleanup path');
    fs.rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
});
describe.each(['remote', 'dashboard'])('%s workspace API', kind => {
  it('shares task summaries and revisioned controls, enforcing origin, JSON size and session membership', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-api-')); roots.push(root);
    const calls = [], providers = { tasks: async request => { calls.push(request); return { revision: 3, runs: [], request }; } };
    const stateProvider = () => ({ agents: [{ id: 'a' }] });
    const service = kind === 'remote' ? new RemoteDashboardService({ baseDir: root, stateProvider, ...providers })
      : new LocalDashboardService({ baseDir: root, configName: 'tasks.json', title: 'Fixture', defaultPort: 0, stateProvider, providers });
    if (kind === 'remote') service.config.server_port = 0;
    services.push(service); const { url } = await service.start();
    const post = (body, origin = url, type = 'application/json') => fetch(url + '/api/tasks', { method: 'POST', headers: { origin, 'content-type': type }, body: JSON.stringify(body) });
    expect((await fetch(url + '/api/tasks?offset=20').then(r => r.json())).request).toEqual({ action: 'list', body: { offset: 20 } });
    expect((await fetch(url + '/api/tasks?runId=r&revision=3').then(r => r.json())).request).toEqual({ action: 'get', body: { runId: 'r', revision: 3 } });
    expect((await post({ action: 'pause', body: { runId: 'r' } }, 'https://attacker.invalid')).status).toBe(403);
    expect((await post({ action: 'plan', body: { ownerId: 'foreign' } })).status).toBe(404);
    expect((await post({ action: 'pause', body: { runId: 'r' } }, url, 'text/plain')).status).toBe(415);
    expect((await post({ action: 'plan', body: { ownerId: 'a', request: 'x'.repeat(17000) } })).status).toBe(413);
    expect((await post({ action: 'pause', body: { runId: 'r' } })).status).toBe(200);
    expect((await fetch(url + '/pwa/task-flow.js')).status).toBe(200);
    expect((await fetch(url + '/pwa/task-flow.css')).status).toBe(200);
    expect(calls).toHaveLength(3);
    if (kind === 'remote') expect((await fetch(url + '/api/tasks', { headers: { 'cf-connecting-ip': '203.0.113.4' } })).status).toBe(401);
  });
  it('forwards paging cursors and fetches work details only for validated authenticated requests', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-api-')); roots.push(root);
    const pages = [], details = [];
    const providers = {
      chatProvider: async (id, options) => { pages.push({ id, options }); return { blocks: [], pageMode: 'delta' }; },
      chatDetails: async (id, options) => { details.push({ id, options }); return { blocks: [{ sequence: 10, output: 'full detail' }] }; },
    };
    const stateProvider = () => ({ agents: [{ id: 'a' }], view: { agents: [{ id: 'a' }] } });
    const service = kind === 'remote'
      ? new RemoteDashboardService({ baseDir: root, stateProvider, ...providers })
      : new LocalDashboardService({ baseDir: root, configName: 'dashboard.json', title: 'Test', defaultPort: 0, stateProvider, providers });
    if (kind === 'remote') service.config.server_port = 0;
    services.push(service); const { url } = await service.start();
    const get = query => fetch(`${url}/api/chat?id=a&${query}`);
    expect((await get('turns=5&after=10&conversation=c')).status).toBe(200);
    expect((await get('turns=5&before=10&conversation=c')).status).toBe(200);
    expect(pages).toEqual([
      { id: 'a', options: { beforeSequence: null, limit: 400, turnLimit: 5, afterSequence: 10, conversationId: 'c' } },
      { id: 'a', options: { beforeSequence: 10, limit: 400, turnLimit: 5, conversationId: 'c' } },
    ]);
    for (const query of ['turns=21', 'turns=0', 'after=-1', 'before=1&after=2', 'conversation=']) {
      expect((await get(query)).status).toBe(400);
    }
    expect(pages).toHaveLength(2);
    const body = { id: 'a', sessionId: 's', conversationId: 'c', sequences: [10, 11] };
    const post = (payload, headers = {}) => fetch(`${url}/api/chat/details`, { method: 'POST',
      headers: { origin: url, 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
    expect(await post(body).then(response => response.json())).toEqual({ blocks: [{ sequence: 10, output: 'full detail' }] });
    expect((await post(body, { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ ...body, id: 'unknown' })).status).toBe(404);
    for (const patch of [{ sessionId: '' }, { conversationId: '' }, { sequences: [] }, { sequences: [0] }, { sequences: ['10'] }, { sequences: Array(21).fill(10) }]) {
      expect((await post({ ...body, ...patch })).status).toBe(400);
    }
    expect((await fetch(`${url}/api/chat/details`)).status).toBe(405);
    expect(details).toEqual([{ id: 'a', options: { sessionId: 's', conversationId: 'c', sequences: [10, 11] } }]);
  });
  it('binds image reads to a known session and validates mutations without executing rejected requests', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-api-')); roots.push(root);
    const calls = [], defaults = new SessionModelDefaults(path.join(root, 'defaults.json'));
    const models = [{ model: 'gpt-6.1-sol', efforts: [{ effort: 'xhigh' }] }];
    const providers = {
      chatImages: async (id, sequence) => { calls.push(['images', id, sequence]); return sequence === 1 ? [{ dataUrl: 'data:image/png;base64,YQ==' }] : []; },
      closeSession: async id => { calls.push(['close', id]); return true; },
      submitPty: async (id, message, options) => { calls.push(['submit', id, message, options]); return true; },
      modelDefaults: { read: async provider => ({ ...defaults.get(provider), models }), save: async body => defaults.save(body.provider, body.settings, body.revision, models) },
    };
    const stateProvider = () => ({ agents: [{ id: 'a' }], view: { agents: [{ id: 'b' }] } });
    const service = kind === 'remote'
      ? new RemoteDashboardService({ baseDir: root, stateProvider, ...providers })
      : new LocalDashboardService({ baseDir: root, configName: 'dashboard.json', title: 'Test', defaultPort: 0, stateProvider, providers });
    if (kind === 'remote') service.config.server_port = 0;
    services.push(service); const { url } = await service.start();
    const post = (route, body, extra = {}) => fetch(`${url}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url, ...extra }, body: JSON.stringify(body) });
    expect(await fetch(`${url}/api/chat/images?id=a&sequence=1`).then(response => response.json())).toEqual({ images: [{ dataUrl: 'data:image/png;base64,YQ==' }] });
    expect((await fetch(`${url}/api/chat/images?id=unknown&sequence=1`)).status).toBe(404);
    expect((await fetch(`${url}/api/chat/images?id=a&sequence=-1`)).status).toBe(400);
    expect((await post('/api/chat/images', { id: 'a' })).status).toBe(405);
    expect((await post('/api/session/close', { id: 'a' }, { origin: 'https://attacker.invalid', 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post('/api/session/close', { id: 'unknown' })).status).toBe(404);
    expect((await fetch(`${url}/api/session/close`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body: '{' })).status).toBe(400);
    expect((await post('/api/session/defaults', { provider: 'codex', settings: { model: 'x'.repeat(17000) }, revision: 0 })).status).toBe(413);
    expect((await post('/api/session/close', { id: 'b' })).status).toBe(200);
    const initial = await fetch(`${url}/api/session/defaults?provider=codex`).then(response => response.json());
    expect(initial.settings).toEqual({ model: 'gpt-6.1-sol', effort: 'xhigh', serviceTier: 'default' });
    expect((await post('/api/session/defaults', { provider: 'codex', settings: [], revision: 0 })).status).toBe(400);
    expect((await post('/api/session/defaults', { provider: 'codex', settings: { model: 'gpt-6.1-sol', serviceTier: 'fast' }, revision: 0 }, { 'content-type': 'text/plain' })).status).toBe(415);
    const result = await post('/api/session/defaults', { provider: 'codex', settings: { model: 'gpt-6.1-sol', serviceTier: 'fast' }, revision: 0 });
    expect(result.status).toBe(200); expect((await result.json()).revision).toBe(1);
    expect(defaults.get('codex').settings.serviceTier).toBe('fast');
    expect((await post('/api/session/submit', { id: 'a', message: 'follow up', steering: 'yes' })).status).toBe(400);
    expect((await post('/api/session/submit', { id: 'a', message: 'follow up', sessionId: 12 })).status).toBe(400);
    expect((await post('/api/session/submit', { id: 'a', message: 'follow up', steering: true, sessionId: 'thread-a' })).status).toBe(200);
    expect(calls).toEqual([['images', 'a', 1], ['close', 'b'], ['submit', 'a', 'follow up', { steering: true, sessionId: 'thread-a' }]]);
  });
});
it('requires Remote authentication before exposing images, defaults or close', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-api-')); roots.push(root);
  const service = new RemoteDashboardService({ baseDir: root, stateProvider: () => ({ agents: [{ id: 'a' }] }), chatImages: () => { throw Error('Unauthenticated provider call'); } });
  service.config.server_port = 0; services.push(service); const { url } = await service.start();
  for (const route of ['/api/chat/images?id=a&sequence=1', '/api/chat/details', '/api/session/defaults?provider=codex', '/api/session/close']) {
    const response = await fetch(`${url}${route}`, { ...(route.endsWith('close') || route.endsWith('details') ? { method: 'POST', body: '{"id":"a"}', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.4' } } : { headers: { 'cf-connecting-ip': '203.0.113.4' } }) });
    expect(response.status).toBe(401);
  }
});
