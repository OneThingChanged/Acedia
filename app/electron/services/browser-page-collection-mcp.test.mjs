import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { HookService } from './hook-service.mjs';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

it('exposes collection tools over real stdio MCP and authenticated HTTP with bounded metadata and useful failures', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-page-mcp-'));
  cleanups.push(async () => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-page-mcp-')) throw new Error('Invalid fixture');
    await fs.rm(root, { recursive: true });
  });
  const requests = [], browserProvider = vi.fn(async request => {
    requests.push(request);
    if (request.body.url?.includes('denied')) return { ok: false, httpStatus: 422, error: 'Image URL is not referenced by this rendered page' };
    return { ok: true, complete: false, warnings: ['images_incomplete'], title: '한글·中文', id: 'collection-fixture', imageCount: 2, images: [{ index: request.body.imageOffset || 0 }] };
  });
  const hook = new HookService({ baseDir: root, browserProvider });
  await hook.start();
  cleanups.push(() => new Promise(resolve => { hook.server.closeAllConnections(); hook.server.close(resolve); }));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./browser-mcp-server.mjs', import.meta.url))], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env, MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: 'page-agent' },
  });
  cleanups.push(() => { child.stdin.end(); child.kill(); });
  let buffer = '', next = 0; const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk; let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const row = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      pending.get(row.id)?.(row.result); pending.delete(row.id);
    }
  });
  const rpc = (method, params = {}) => new Promise(resolve => {
    const id = ++next; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await rpc('initialize');
  const names = (await rpc('tools/list')).tools.map(tool => tool.name);
  expect(names).toEqual(expect.arrayContaining(['browser_collect_page', 'browser_capture_asset', 'browser_collection_get']));
  for (const [name, action, extra] of [
    ['browser_collect_page', 'collect-page', { expandCode: true, selector: '.Post-RichText', maxImages: 1 }],
    ['browser_capture_asset', 'capture-asset', { url: 'https://example.com/한글.gif' }],
    ['browser_collection_get', 'collection-get', { collectionId: 'collection-fixture', imageOffset: 1 }],
  ]) {
    const result = await rpc('tools/call', { name, arguments: { tabId: 'rendered-tab', ...extra } });
    expect(result.isError).not.toBe(true); expect(result.structuredContent.title).toBe('한글·中文');
    expect(requests.at(-1)).toEqual({ agentId: 'page-agent', action, body: { tabId: 'rendered-tab', ...extra } });
  }
  const base = `http://127.0.0.1:${hook.port}/integration/v1/browser/page-agent/collect-page`;
  expect((await fetch(base, { method: 'POST', body: '{}' })).status).toBe(401);
  expect((await fetch(base, { method: 'POST', headers: { authorization: 'Bearer ' + hook.token, origin: 'https://elsewhere.invalid' }, body: '{}' })).status).toBe(403);
  const failed = await rpc('tools/call', { name: 'browser_capture_asset', arguments: { tabId: 'rendered-tab', url: 'https://example.com/denied.gif' } });
  expect(failed.isError).toBe(true); expect(failed.content[0].text).toContain('not referenced');
}, 15000);
