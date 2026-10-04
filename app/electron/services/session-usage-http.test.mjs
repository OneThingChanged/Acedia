import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';

describe('session usage HTTP access', () => {
  it('serves local and approved Remote views, validates selectors and throttles explicit refresh', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-usage-http-'));
    const calls = [], provider = (refresh, selection) => { calls.push({ refresh, selection }); return { sessions: [], privateTestMarker: 'approved-only' }; };
    const local = new LocalDashboardService({ title: 'Fixture', defaultPort: 0, baseDir: path.join(root, 'local'), configName: 'config.json', providers: { usageSessionProvider: provider } });
    const remote = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), usageSessionProvider: provider }); remote.config.server_port = 0;
    try {
      for (const service of [local, remote]) {
        const status = await service.start();
        const endpoint = status.url + '/api/usage/sessions';
        expect((await fetch(endpoint + '?range=invalid')).status).toBe(400);
        expect((await fetch(endpoint + '?provider=invalid')).status).toBe(400);
        const response = await fetch(endpoint + '?range=week&provider=claude&refresh=1');
        expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
        expect((await response.json()).privateTestMarker).toBe('approved-only');
        await fetch(endpoint + '?refresh=1');
        expect(calls.at(-2)).toMatchObject({ refresh: true, selection: { range: 'week', provider: 'claude' } });
        expect(calls.at(-1).refresh).toBe(false);
      }
      remote.isDirectLocal = () => false; remote.sessionLogin = () => null;
      const denied = await fetch(remote.status().url + '/api/usage/sessions');
      expect(denied.status).toBe(401); expect(await denied.text()).not.toContain('approved-only');
    } finally {
      await local.stop(); await remote.stop();
      if (path.dirname(root) !== path.resolve(os.tmpdir())) throw new Error('Unexpected fixture directory');
      fs.rmSync(root, { recursive: true });
    }
  });
});
