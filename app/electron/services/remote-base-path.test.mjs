import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteDashboardService, TunnelService } from './web-services.mjs';
import { parseRemoteAddress, remotePath } from '../shared/remote-address.mjs';
import { tunnelConfigurationIssue } from '../shared/tunnel-config.mjs';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function fixture(address = 'agent.example.com/acedia') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-mount-'));
  cleanup.push(() => { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-mount-')) throw Error('Unexpected fixture'); fs.rmSync(root, { recursive: true }); });
  const sent = [], service = new RemoteDashboardService({ baseDir: root, inputStatus: async () => ({ ready: true }), submitPty: async (id, message) => { sent.push({ id, message }); return true; } });
  await service.setConfig({ public_hostname: address, owner: 'fixture', client_id: 'fake-client', server_port: 0 });
  const status = await service.start(); cleanup.push(() => service.stop());
  const origin = new URL(status.url).origin, cookie = `${service.cookieName()}=${service.sign('fixture')}`;
  const headers = { 'cf-connecting-ip': '203.0.113.5', cookie };
  return { root, service, status, origin, headers, sent };
}
describe('Remote mounted at a full public address', () => {
  it('accepts host/path and HTTPS URLs, preserving path case and canonicalizing the trailing slash', () => {
    for (const input of ['agent.example.com/acedia', 'https://agent.example.com/acedia/']) {
      expect(parseRemoteAddress(input)).toEqual({ origin: 'https://agent.example.com', hostname: 'agent.example.com', basePath: '/acedia/', url: 'https://agent.example.com/acedia/' });
    }
    expect(parseRemoteAddress('Agent.Example.com/Acedia').basePath).toBe('/Acedia/');
    expect(parseRemoteAddress('agent.example.com').basePath).toBe('/');
    for (const input of ['https://u:p@host/acedia', 'https://host/a/../b', 'host/a%2fb', 'host/a?x=1', 'host/a#b', 'http://host/a', 'host//a', 'host/a\\b', 'host/' + 'a'.repeat(1024) + '!']) {
      expect(() => parseRemoteAddress(input)).toThrow();
      expect(tunnelConfigurationIssue({ owner: 'fixture', client_id: 'fake', public_hostname: input })).toBe('address');
    }
    expect(remotePath('/api/state', '/api/')).toBe('/api/api/state');
  });
  it('serves scoped HTML, JavaScript, manifest and worker without claiming sibling routes', async () => {
    const f = await fixture();
    const bare = await fetch(f.status.url + '?agent=one', { redirect: 'manual' });
    expect(bare.status).toBe(308); expect(bare.headers.get('location')).toBe('/acedia/?agent=one');
    const page = await fetch(f.status.url + '/', { headers: f.headers }); expect(page.status).toBe(200);
    const html = await page.text(); expect(html).toContain('src="/acedia/pwa/app.js"'); expect(html).toContain('href="/acedia/manifest.webmanifest"');
    for (const asset of ['pwa/app.js', 'pwa/base-path.js', 'pwa/requests.js', 'pwa/styles.css']) expect((await fetch(`${f.status.url}/${asset}`, { headers: f.headers })).status).toBe(200);
    const manifest = await (await fetch(f.status.url + '/manifest.webmanifest', { headers: f.headers })).json();
    expect(manifest).toMatchObject({ id: '/acedia/', scope: '/acedia/', start_url: '/acedia/?source=pwa' });
    expect(manifest.icons.every(i => i.src.startsWith('/acedia/'))).toBe(true);
    const worker = await fetch(f.status.url + '/sw.js', { headers: f.headers }); expect(worker.headers.get('service-worker-allowed')).toBe('/acedia/');
    for (const route of ['/api/state', '/dashboard/api/state', '/acedia-other/api/state']) expect((await fetch(f.origin + route, { headers: f.headers })).status).toBe(404);
    const login = await fetch(f.status.url + '/', { headers: { 'cf-connecting-ip': '203.0.113.5' }, redirect: 'manual' });
    expect(login.headers.get('location')).toBe('/acedia/login');
    expect((await fetch(f.status.url + '/pwa/base-path.js', { headers: { 'cf-connecting-ip': '203.0.113.5' } })).status).toBe(200);
  });
  it('keeps OAuth callback, session cookie, logout and CSRF checks inside the mount', async () => {
    const f = await fixture('https://agent.example.com/acedia');
    await f.service.setConfig({ client_secret: 'fake-secret' });
    f.service.fetchImpl = async url => new Response(JSON.stringify(String(url).includes('access_token') ? { access_token: 'fake-access' } : { login: 'fixture' }), { headers: { 'content-type': 'application/json' } });
    const login = await fetch(f.status.url + '/auth/github', { redirect: 'manual' });
    const github = new URL(login.headers.get('location'));
    expect(github.searchParams.get('redirect_uri')).toBe('https://agent.example.com/acedia/auth/github/callback');
    const callback = await fetch(`${f.status.url}/auth/github/callback?code=fake&state=${github.searchParams.get('state')}`, { redirect: 'manual' });
    expect(callback.status).toBe(302); expect(callback.headers.get('location')).toBe('/acedia/');
    const cookie = callback.headers.get('set-cookie'); expect(cookie).toContain('Path=/acedia/'); expect(cookie).toContain('; Secure');
    expect((await fetch(f.status.url + '/api/state', { headers: { 'cf-connecting-ip': '203.0.113.5', cookie: cookie.split(';')[0] } })).status).toBe(200);
    expect((await fetch(f.status.url + '/api/state', { headers: { 'cf-connecting-ip': '203.0.113.5', cookie: 'multiagent_remote=' + f.service.sign('fixture') } })).status).toBe(401);
    const logout = options => fetch(f.status.url + '/auth/logout', { method: 'POST', headers: { ...f.headers, origin: 'https://agent.example.com', ...options } });
    expect((await logout({ origin: 'https://unrelated.example.com' })).status).toBe(403);
    expect((await logout()).headers.get('set-cookie')).toContain('Path=/acedia/; Max-Age=0');
  });
  it('only canonicalizes its own mount and leaves the domain root and sibling services unclaimed', async () => {
    for (const mount of ['/acedia', '/dddd', '/tools/acedia']) {
      const f = await fixture('agent.example.com' + mount);
      for (const method of ['GET', 'HEAD']) {
        for (const headers of [f.headers, { 'cf-connecting-ip': '203.0.113.5' }]) {
          for (const route of ['/', '/?source=root', '/hub/', '/music/', mount + '-other/']) {
            const response = await fetch(f.origin + route, { method, headers, redirect: 'manual' });
            expect(response.status).toBe(404); expect(response.headers.get('location')).toBeNull();
          }
          const canonical = await fetch(f.origin + mount + '?agent=one', { method, headers, redirect: 'manual' });
          expect(canonical.status).toBe(308); expect(canonical.headers.get('location')).toBe(mount + '/?agent=one');
        }
      }
      const login = await fetch(f.origin + mount + '/', { headers: { 'cf-connecting-ip': '203.0.113.5' }, redirect: 'manual' });
      expect(login.status).toBe(302); expect(login.headers.get('location')).toBe(mount + '/login');
    }
  });
  it('routes authenticated APIs and original document previews with nested mounts and reserved path names', async () => {
    for (const mount of ['/dddd', '/tools/acedia', '/api']) {
      const f = await fixture('agent.example.com' + mount);
      fs.writeFileSync(path.join(f.root, 'report.html'), '<html><img src="/image.png"><link href="/style.css"></html>'); fs.writeFileSync(path.join(f.root, 'image.png'), 'image');
      fs.writeFileSync(path.join(f.root, 'style.css'), 'body{background:url(/image.png)}');
      f.service.syncView({ projects: [{ id: 'p', name: 'Fixture', folder: f.root }] });
      const preview = await fetch(f.status.url + '/api/docs/preview?projectId=p&path=report.html&format=json', { headers: f.headers }); expect(preview.status).toBe(200);
      const value = await preview.json(); expect(value.url.startsWith(mount + '/preview/')).toBe(true);
      const page = await fetch(f.origin + value.url); expect(page.status).toBe(200);
      const imageUrl = (await page.text()).match(/src="([^"]+)"/)[1]; expect(imageUrl.startsWith(mount + '/preview/')).toBe(true);
      expect(await (await fetch(f.origin + imageUrl)).text()).toBe('image');
      const css = await (await fetch(f.origin + imageUrl.replace('image.png', 'style.css'))).text(); expect(css).toContain(`url(${imageUrl})`);
      const ready = await fetch(f.status.url + '/api/session/input-status?id=worker', { headers: f.headers }); expect((await ready.json()).ready).toBe(true);
    }
  });
  it('streams terminal events through the mounted API without caching or changing the PTY', async () => {
    const f = await fixture();
    f.service.terminalSnapshot = () => ({ data: 'fixture-output' });
    f.service.subscribeTerminal = () => null; // Finite stream: reset followed by exit.
    const response = await fetch(f.status.url + '/api/stream?id=fixture', { headers: f.headers });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('fixture-output'); expect(f.sent).toEqual([]);
  });
  it('keeps hosted HTML assets and redirects under the same service path', async () => {
    const f = await fixture(), upstream = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html><head></head><img src="/asset.png"></html>'); });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve)); cleanup.push(() => new Promise(resolve => upstream.close(resolve)));
    const response = await fetch(f.status.url + '/api/hosting', { method: 'POST', headers: { ...f.headers, origin: f.origin, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'open-url', name: 'Page', url: `http://127.0.0.1:${upstream.address().port}/docs/index.html` }) });
    expect(response.status).toBe(200); const preview = await response.json(); expect(preview.url).toMatch(/^\/acedia\/hosting-preview\//);
    const page = await fetch(f.origin + preview.url); expect(page.status).toBe(200); expect(await page.text()).toContain('src="/acedia/hosting-preview/');
  });
  it('rejects malformed address changes atomically and keeps the root deployment working', async () => {
    const f = await fixture('agent.example.com'), previous = { ...f.service.config };
    await expect(f.service.setConfig({ public_hostname: 'https://host/acedia?bad=1' })).rejects.toThrow(); expect(f.service.config).toEqual(previous);
    expect((await fetch(f.status.url + '/', { headers: f.headers })).status).toBe(200);
    expect(f.service.githubOAuthRedirectUri()).toBe('https://agent.example.com/auth/github/callback');
    expect(f.service.cookieFor('fixture', {})).toContain('multiagent_remote=');
  });
  it('reports the complete public address while quick-tunnel origins keep the mount path in the browser URL', async () => {
    for (const named of [true, false]) {
      let args;
      const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), killed: false, kill() { this.killed = true; } });
      const service = new TunnelService({ baseDir: 'unused-fixture', getConfig: () => ({ owner: 'fixture', client_id: 'fake', tunnel_token: named ? 'fake-token' : '', public_hostname: 'https://agent.example.com/acedia', server_port: 18800 }),
        getLocalUrl: () => 'http://127.0.0.1:18800/acedia', spawnImpl: (_file, value) => { args = value; queueMicrotask(() => child.stderr.write(named ? 'Registered tunnel connection' : 'https://sample.trycloudflare.com')); return child; } });
      service.ensureExecutable = async () => 'fake-cloudflared';
      try {
        expect((await service.start()).publicUrl).toBe(named ? 'https://agent.example.com/acedia/' : 'https://sample.trycloudflare.com/acedia/');
        if (!named) expect(args[args.indexOf('--url') + 1]).toBe('http://127.0.0.1:18800');
      } finally { await service.stop(); }
    }
  });
});
