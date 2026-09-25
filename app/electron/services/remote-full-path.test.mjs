import { it, expect } from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { serveRemoteDocumentApi } from './remote-documents.mjs';

it('opens full paths inside the Unreal workspace of a registered plugin', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-remote-full-'));
  const plugin = path.join(workspace, 'Plugins', 'Example');
  const saved = path.join(workspace, 'Saved', 'Reports');
  await fs.mkdir(plugin, { recursive: true });
  await fs.mkdir(saved, { recursive: true });
  await fs.writeFile(path.join(workspace, 'Example.uproject'), '{}');
  const image = path.join(saved, 'preview.png');
  const report = path.join(saved, 'report.json');
  await fs.writeFile(image, Buffer.from([137, 80, 78, 71]));
  await fs.writeFile(report, '{"ok":true}');
  const outside = path.join(os.tmpdir(), `acedia-remote-outside-${Date.now()}.json`);
  await fs.writeFile(outside, '{"private":true}');
  const server = http.createServer((req, res) => void serveRemoteDocumentApi(req, res, new URL(req.url, 'http://localhost'), {
    snapshot: () => ({ projects: [{ id: 'plugin', folder: plugin }] }), previews: new Map(),
  }).then(found => { if (!found) res.writeHead(404).end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = file => new URLSearchParams({ projectId: 'plugin', path: file });
  try {
    const picture = await fetch(`${base}/api/files/image?${query(image)}`);
    expect(picture.status).toBe(200);
    expect(picture.headers.get('content-type')).toBe('image/png');
    const json = await fetch(`${base}/api/docs/read?${query(report)}`);
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({ kind: 'text', content: '{"ok":true}' });
    const listed = await fetch(`${base}/api/docs?projectId=plugin`).then(response => response.json());
    expect(listed.documents).toEqual([]);
    expect((await fetch(`${base}/api/docs/read?${query(outside)}`)).status).toBe(403);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(workspace, { recursive: true, force: true }); await fs.rm(outside, { force: true });
  }
});
