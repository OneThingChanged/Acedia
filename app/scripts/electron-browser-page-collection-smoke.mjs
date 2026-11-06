import http from 'node:http';
import fs from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { collectBrowserPage, captureBrowserAsset, readBrowserCollection } from '../electron/services/browser-page-collection.mjs';
import { applyBrowserCompatibility } from '../electron/services/browser-compatibility.mjs';

const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' });
  const watchdog = setTimeout(() => child.kill(), 100000);
  child.once('error', error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
  child.once('exit', code => { clearTimeout(watchdog); process.exitCode = code === 0 ? 0 : 1; });
} else {
const { app, BrowserWindow } = require('electron');
const root = mkdtempSync(path.join(os.tmpdir(), 'acedia-browser-collection-smoke-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('Browser collection smoke timed out'); app.exit(1); }, 90000);
let win, server;
void app.whenReady().then(async () => {
console.log('BROWSER_COLLECTION_FIXTURE_START');
try {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const fixture = `<meta charset="utf-8"><title>Rendered article fixture</title><style>body{margin:0}header{height:160px}article{width:700px;margin:auto}img{display:block;width:400px;height:300px}p{margin:90px 0}</style><header>Private navigation, excluded from article text<img src="/avatar.gif"></header><article class="Post-RichText"><h1>한글 中文 본문</h1><p>Rendered paragraph</p><img src="/first.gif"><p>Second section</p><img data-src="/lazy.gif" loading="lazy"><p>Last section</p><img src="/last.gif"><figure><img class="ztext-gif" data-actualtype="gif" data-original="/animated_b.png" src="/animated_b.png"><figcaption>원본 GIF 설명</figcaption></figure><div><pre><code>preview code</code></pre><button onclick="this.previousElementSibling.firstChild.textContent='full expanded code';this.remove()">展开代码</button></div><table><tr><td>표 내용</td></tr></table><ol><li>첫째</li></ol><a href="/reference">원문 링크</a><script>new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting&&e.target.dataset.src){e.target.src=e.target.dataset.src;delete e.target.dataset.src}})).observe(document.querySelector('[data-src]'))</script></article>`;
  let gifAuthenticated = false;
  server = http.createServer((request, response) => {
    if (request.url === '/animated.gif') {
      gifAuthenticated = Boolean(request.headers.cookie?.includes('fixture-session=present') && request.headers.referer?.startsWith('http://127.0.0.1:'));
      response.writeHead(gifAuthenticated ? 200 : 403, { 'content-type': 'image/gif' }).end(gif);
    } else if (request.url.endsWith('.png')) response.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64'));
    else if (request.url.endsWith('.gif')) response.writeHead(200, { 'content-type': 'image/gif' }).end(gif);
    else response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'fixture-session=present; HttpOnly; SameSite=Lax; Path=/' }).end(fixture);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ show: false, width: 1200, height: 800, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  await win.loadURL(`http://127.0.0.1:${server.address().port}`);
  await win.webContents.executeJavaScript('window.scrollTo(0,180)');
  console.log('BROWSER_COLLECTION_FIXTURE_LOADED');
  const directory = path.join(root, 'captures');
  const result = await collectBrowserPage(win.webContents, { expandCode: true }, { directory });
  assert.equal(win.isVisible(), false); assert.equal(win.isFocused(), false);
  assert.equal(result.complete, true, JSON.stringify({ warnings: result.warnings, images: result.images.map(image => ({ src: image.src, originalGif: image.originalGif, status: image.status, error: image.error })), gifAuthenticated }));
  assert.equal(result.imageCount, 4); assert.ok(result.text.includes('한글 中文 본문'));
  assert.equal(result.expandedCode, 1); assert.equal(result.remainingCodeExpanders, 0);
  assert.equal(result.structure.table, 1); assert.equal(result.structure.ol, 1); assert.equal(result.structure.code, 1);
  assert.equal(gifAuthenticated, true, 'Original GIF must use browser cookies and referrer');
  assert.ok((await fs.readFile(result.originalHtml.path, 'utf8')).includes('<code>preview code</code>'));
  assert.ok((await fs.readFile(result.expandedHtml.path, 'utf8')).includes('<code>full expanded code</code>'));
  assert.ok(!result.text.includes('Private navigation')); assert.ok(!result.text.includes('IntersectionObserver'));
  assert.equal(await win.webContents.executeJavaScript('scrollY'), 180);
  for (const image of result.images) {
    assert.equal(image.file.mime, 'image/gif');
    assert.equal(image.file.sha256, createHash('sha256').update(gif).digest('hex'));
    assert.deepEqual(await fs.readFile(image.file.path), gif);
  }
  assert.ok((await fs.stat(result.html.path)).size > 0); assert.ok((await fs.stat(result.archive.path)).size > 0);
  assert.ok(result.screenshot?.bytes > 0);
  const pageTwo = await readBrowserCollection({ collectionId: result.id, imageOffset: 3, maxImages: 1 }, { directory });
  assert.equal(pageTwo.images.length, 1); assert.equal(pageTwo.images[0].index, 3);
  const asset = await captureBrowserAsset(win.webContents, { url: result.images[3].originalGif }, { directory });
  assert.equal(asset.file.sha256, result.images[3].file.sha256);
  await assert.rejects(captureBrowserAsset(win.webContents, { url: 'https://example.com/unreferenced.gif' }, { directory }), /not referenced/);
  const summary = { ok: true, mode: 'hidden native Electron browser', focused: win.isFocused(), shown: win.isVisible(),
    imageCount: result.imageCount, originalImageBytes: true, originalGif: true, browserCookieReferrer: true,
    codeExpanded: true, structurePreserved: true, pagedWithoutRecapture: true, lazyLoaded: true, scrollRestored: true, complete: result.complete };
  if (process.argv.includes('--live-zhihu')) {
    const url = 'https://zhuanlan.zhihu.com/p/1993816774026736429';
    try {
      applyBrowserCompatibility(win.webContents, true, app.getName());
      const loading = win.loadURL(url).catch(() => {});
      await Promise.race([loading, new Promise(resolve => setTimeout(resolve, 4000))]);
      if (win.webContents.isLoading()) { win.webContents.stop(); await new Promise(resolve => setTimeout(resolve, 300)); }
      const output = fileURLToPath(new URL('../../output/browser-collection-zhihu/', import.meta.url));
      const live = await collectBrowserPage(win.webContents, { maxImages: 8 }, { directory: output });
      summary.live = { url: live.url, title: live.title, complete: live.complete, textLength: live.text.length,
        imageCount: live.imageCount, preserved: live.images.filter(image => image.preserved).length,
        warnings: live.warnings, manifestPath: live.manifestPath, screenshotPath: live.screenshot?.path };
    } catch (error) { summary.live = { ok: false, error: error.message }; }
  }
  console.log('BROWSER_PAGE_COLLECTION_OK ' + JSON.stringify(summary));
} finally {
  clearTimeout(timeout); win?.destroy(); server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-browser-collection-smoke-')) throw new Error('Invalid fixture directory');
  await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}
app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
}
