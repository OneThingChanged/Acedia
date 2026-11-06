import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';
const resources = [];
afterEach(async () => { for (const { root, service } of resources.splice(0)) {
  await service.stop();
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-input-status-')) throw Error('Unexpected fixture path');
  fs.rmSync(root, { recursive: true });
} });
describe.each(['dashboard', 'remote'])('%s queue preflight API', kind => {
  it('reports actual composer readiness through authenticated reads without submitting or altering a draft', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-input-status-'));
    let ready = false;
    const inputStatus = vi.fn(async ({ id, sessionId }) => ({ id, conversationId: sessionId, active: true, supported: true, ready, reason: ready ? 'ready' : 'composer-not-ready' }));
    const submitPty = vi.fn();
    const providers = { inputStatus, submitPty };
    const service = kind === 'remote' ? new RemoteDashboardService({ baseDir: root, ...providers })
      : new LocalDashboardService({ baseDir: root, configName: 'fixture.json', title: 'Queue', defaultPort: 0, providers });
    if (kind === 'remote') { service.config.server_port = 0; service.config.owner = 'owner'; service.isDirectLocal = () => false; }
    resources.push({ root, service }); const { url } = await service.start();
    const headers = kind === 'remote' ? { cookie: `multiagent_remote=${service.sign('owner')}` } : {};
    const get = suffix => fetch(url + '/api/session/input-status' + suffix, { headers });
    const waiting = await get('?id=a&sessionId=original'); expect(waiting.status).toBe(200);
    expect(waiting.headers.get('cache-control')).toBe('no-store');
    expect(await waiting.json()).toMatchObject({ id: 'a', conversationId: 'original', ready: false });
    ready = true; expect(await (await get('?id=a&sessionId=original')).json()).toMatchObject({ ready: true });
    expect(inputStatus).toHaveBeenCalledWith({ id: 'a', sessionId: 'original' });
    expect((await get('?id=')).status).toBe(400); expect((await get('?id=a&sessionId=' + 'x'.repeat(257))).status).toBe(400);
    if (kind === 'remote') expect((await fetch(url + '/api/session/input-status?id=a')).status).toBe(401);
    inputStatus.mockRejectedValueOnce(Error('private details')); const failed = await get('?id=a'); expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private details'); expect(submitPty).not.toHaveBeenCalled();
  });
});
