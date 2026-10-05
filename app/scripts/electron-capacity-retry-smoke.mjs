import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { RemoteDashboardService } from '../electron/services/web-services.mjs';
const require = createRequire(import.meta.url), appRoot = path.resolve(import.meta.dirname, '..');
if (!process.versions.electron) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-capacity-ui-'));
  try {
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(appRoot, 'scripts/fixtures/capacity-retry-renderer.tsx')], bundle: true,
      define: { 'import.meta.env': '{}' }, jsx: 'automatic', outfile: path.join(directory, 'renderer.js') });
    await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body{background:#0d1117;color:#c9d1d9;margin:0}#root{margin:30px}</style><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_CAPACITY_UI_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [import.meta.filename], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 45000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('acedia-capacity-ui-'));
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  const directory = process.env.ACEDIA_CAPACITY_UI_DIR;
  app.setPath('userData', path.join(directory, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 900, height: 230, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error('Capacity UI timed out: ' + expression);
  };
  try {
    await win.loadFile(path.join(directory, 'index.html')); await waitFor('!!window.capacityFixture');
    await new Promise(resolve => setTimeout(resolve, 200));
    for (const width of [900, 390]) {
      win.setSize(width, 230);
      const base = { id: 'fixture', sessionId: 'session-one', status: 'scheduled', attempt: 0, maxAttempts: 3, at: Date.now(), nextRetryAt: Date.now() + 30000 };
      const patch = value => win.webContents.executeJavaScript(`window.capacityFixture.patch(${JSON.stringify(value)})`);
      await patch(base); await waitFor("document.querySelector('.capacity-retry-notice.scheduled')?.textContent.includes('1/3')");
      assert.equal(await win.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"), true);
      await win.webContents.executeJavaScript("document.querySelector('.capacity-retry-notice button').click()");
      await waitFor("!document.querySelector('.capacity-retry-notice')");
      await patch({ ...base, status: 'retrying', attempt: 1 }); await waitFor("document.querySelector('.capacity-retry-notice.retrying')?.textContent.includes('1/3')");
      await patch({ ...base, status: 'failed', attempt: 3, reason: 'exhausted' });
      await waitFor("document.querySelector('[role=alert]')?.textContent.includes('3')");
      assert.equal(await win.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"), true);
      await fs.mkdir(path.resolve(appRoot, '../output'), { recursive: true });
      await new Promise(resolve => setTimeout(resolve, 300));
      await fs.writeFile(path.resolve(appRoot, `../output/capacity-retry-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    console.log('CAPACITY_RETRY_DESKTOP_UI_COUNTDOWN_CANCEL_FAILURE_OK'); win.destroy();
    const agent = { id: 'fixture', name: 'Capacity fixture', aiToolId: 'codex', projectId: 'p', status: 'working', hook: { event: 'working' } };
    const base = { id: 'fixture', sessionId: 'session-one', status: 'scheduled', attempt: 0, maxAttempts: 3, at: Date.now(), nextRetryAt: Date.now() + 120000 };
    const web = new RemoteDashboardService({ baseDir: path.join(directory, 'remote'),
      chatProvider: async () => ({ blocks: [{ sequence: 1, role: 'user', kind: 'text', text: 'Local capacity fixture' }], lifecycle: 'working', sessionId: 'session-one' }),
      cancelSession: () => { agent.capacityRetry = { ...base, status: 'cancelled' }; agent.status = 'idle'; agent.hook = { event: 'cancelled' }; sync(); return true; } });
    const sync = () => web.syncAgents([{ ...agent }]);
    web.config.server_port = 0;
    web.syncView({ language: 'ko', projects: [{ id: 'p', name: 'Fixture', folder: directory }], agents: [{ id: 'fixture', projectId: 'p' }] });
    sync(); const server = await web.start();
    try {
      for (const width of [900, 390]) {
        agent.status = 'working'; agent.hook = { event: 'working' }; agent.capacityRetry = { ...base }; sync();
        const remote = new BrowserWindow({ width, height: 700, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
        const until = async expression => {
          for (let i = 0; i < 150; i++) { if (await remote.webContents.executeJavaScript(expression)) return; await new Promise(resolve => setTimeout(resolve, 80)); }
          throw new Error('Remote capacity UI timed out: ' + expression);
        };
        try {
          await remote.loadURL(`${server.url}/?agent=fixture&view=chat`);
          await until("document.querySelector('#chatView .capacity-retry-notice')?.textContent.includes('1/3')");
          agent.capacityRetry = { ...base, attempt: 1 }; sync();
          await until("document.querySelector('#chatView .capacity-retry-notice')?.textContent.includes('2/3')");
          await remote.webContents.executeJavaScript("document.querySelector('#chatView .capacity-retry-notice button').click()");
          await until("!document.querySelector('#chatView .capacity-retry-notice')");
          agent.capacityRetry = { ...base, status: 'failed', attempt: 3, reason: 'exhausted' }; agent.status = 'blocked'; agent.hook = { event: 'blocked' }; sync();
          await until("document.querySelector('#chatView .capacity-retry-notice[role=alert]')?.textContent.includes('3/3')");
          assert.equal(await remote.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth+1'), true);
          console.log(`CAPACITY_RETRY_REMOTE_UI_COUNT_UPDATE_CANCEL_FAILURE_OK ${width}px`);
        } finally { remote.destroy(); }
      }
    } finally { await web.stop(); }
    app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
  });
}
