import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { RemoteDashboardService } from './web-services.mjs';

it('lets only the authenticated owner browse external export folders and preview their images without widening deletion access', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-result-folder-'));
  const project = path.join(root, 'project');
  const results = path.join(root, 'SummerSix-20261007');
  await fs.mkdir(project); await fs.mkdir(results);
  await fs.mkdir(path.join(results, 'Viessa'));
  await fs.writeFile(path.join(results, 'preview.png'), Buffer.from([137, 80, 78, 71]));
  await fs.writeFile(path.join(results, 'export.fbx'), 'FBX');
  const service = new RemoteDashboardService({ baseDir: path.join(root, 'service') });
  service.config.server_port = 0; service.config.owner = 'owner';
  service.access.approved = ['guest'];
  service.syncView({ projects: [{ id: 'p1', folder: project }] });
  const { url } = await service.start();
  const headers = login => ({ cookie: `multiagent_remote=${service.sign(login)}`, 'cf-connecting-ip': '203.0.113.12' });
  const query = file => new URLSearchParams({ projectId: 'p1', path: file });
  try {
    const response = await fetch(`${url}/api/files/folder?${query(results)}`, { headers: headers('owner') });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ path: results, entries: [
      { name: 'Viessa', kind: 'folder' }, { name: 'export.fbx', kind: null }, { name: 'preview.png', kind: 'image' },
    ] });
    expect((await fetch(`${url}/api/files/image?${query(path.join(results, 'preview.png'))}`, { headers: headers('owner') })).status).toBe(200);
    expect((await fetch(`${url}/api/files/folder?${query(results)}`, { headers: headers('guest') })).status).toBe(403);
    expect((await fetch(`${url}/api/files/image?${query(path.join(results, 'preview.png'))}`, { headers: headers('guest') })).status).toBe(403);
    expect((await fetch(`${url}/api/files/folder?${query(results)}`, { headers: { 'cf-connecting-ip': '203.0.113.12' } })).status).toBe(401);
    expect((await fetch(`${url}/api/docs/file?${query(path.join(results, 'preview.png'))}`, { method: 'DELETE', headers: { ...headers('owner'), origin: url } })).ok).toBe(false);
    expect((await fetch(`${url}/api/files/folder?${query(path.join(root, 'missing'))}`, { headers: headers('owner') })).status).toBe(404);
  } finally { await service.stop(); await fs.rm(root, { recursive: true }); }
});
