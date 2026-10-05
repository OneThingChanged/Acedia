import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), appRoot = path.resolve(import.meta.dirname, '..');
if (!process.versions.electron) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-delivery-ui-'));
  try {
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(appRoot, 'scripts/fixtures/session-delivery-renderer.tsx')], bundle: true,
      define: { 'import.meta.env': '{}' }, jsx: 'automatic', outfile: path.join(directory, 'renderer.js') });
    await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body{background:#0d1117;color:#c9d1d9;margin:0}#root{margin:20px}</style><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_DELIVERY_UI_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [import.meta.filename], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 30000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('acedia-delivery-ui-'));
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  const { app, BrowserWindow } = require('electron'), directory = process.env.ACEDIA_DELIVERY_UI_DIR;
  app.setPath('userData', path.join(directory, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 280, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    const until = async expression => {
      for (let i = 0; i < 100; i++) { if (await win.webContents.executeJavaScript(expression)) return; await new Promise(resolve => setTimeout(resolve, 40)); }
      throw Error('Delivery UI timed out: ' + expression);
    };
    try {
      await win.loadFile(path.join(directory, 'index.html')); await until('!!window.deliveryFixture');
      await new Promise(resolve => setTimeout(resolve, 200));
      for (const width of [900, 390]) {
        win.setSize(width, 280);
        const base = { deliveryId: 'delivery-' + width, requestKey: 'draft', sourceId: 'caller', sourceName: 'ProjectWitch', targetId: 'target', targetName: '긴 이름의 UI 작업 세션', conversationId: 'conversation', status: 'sending', createdAt: Date.now(), updatedAt: Date.now() };
        const patch = value => win.webContents.executeJavaScript(`window.deliveryFixture.patch(${JSON.stringify(value)})`);
        await patch(base); await until("document.querySelector('.session-delivery-notice.sending')");
        await patch({ ...base, status: 'sent', sentAt: Date.now() });
        await until("document.querySelectorAll('.session-delivery-notice li.confirmed').length===1");
        await patch({ ...base, status: 'received', sentAt: Date.now(), receivedAt: Date.now() });
        await until("document.querySelectorAll('.session-delivery-notice li.confirmed').length===2");
        assert.ok(await win.webContents.executeJavaScript("document.querySelector('.session-delivery-notice').textContent.includes('시작 확인 중')"));
        await patch({ ...base, status: 'started', sentAt: Date.now(), receivedAt: Date.now(), startedAt: Date.now() });
        await until("document.querySelectorAll('.session-delivery-notice li.confirmed').length===3");
        await win.webContents.executeJavaScript("document.querySelector('.session-delivery-notice button').click()");
        await until("!document.querySelector('.session-delivery-notice')");
        await patch({ ...base, status: 'unconfirmed', sentAt: Date.now(), reason: 'receipt-not-confirmed' });
        await until("document.querySelector('.session-delivery-notice[role=alert]')?.textContent.includes('자동으로 다시 보내지')");
        assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'), true);
        await fs.mkdir(path.resolve(appRoot, '../output'), { recursive: true });
        await new Promise(resolve => setTimeout(resolve, 150));
        await fs.writeFile(path.resolve(appRoot, `../output/session-delivery-${width}.png`), (await win.webContents.capturePage()).toPNG());
      }
      console.log('SESSION_DELIVERY_DESKTOP_UI_STAGES_WARNING_DISMISS_AND_390PX_OK'); win.destroy(); app.exit(0);
    } catch (error) { console.error(error); win.destroy(); app.exit(1); }
  });
}
