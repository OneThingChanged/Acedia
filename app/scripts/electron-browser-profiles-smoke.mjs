import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { browserPreferences } from '../electron/services/browser-preferences.mjs';
import { browserProfile, BrowserTabStore, restoreBrowserTabs } from '../electron/services/browser-profiles.mjs';
const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-browser-profiles-'));
  try {
    for (const phase of ['seed', 'reload']) await new Promise((resolve, reject) => {
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(require('electron'), [fileURLToPath(import.meta.url), directory, phase], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const timeout = setTimeout(() => { child.kill(); reject(Error('Browser profile smoke timed out')); }, 25000);
      child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
      child.on('error', reject); child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error('Browser profile smoke failed: ' + code)); });
    });
  } finally { if (path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('acedia-browser-profiles-')) fs.rmSync(directory, { recursive: true, force: true }); }
} else {
  const { app, BrowserWindow, WebContentsView, session } = await import('electron');
  const [directory, phase] = process.argv.slice(-2);
  app.setPath('userData', directory); app.on('window-all-closed', () => {});
  void app.whenReady().then(async () => {
  const server = http.createServer((_req, res) => res.end('<title>Profile fixture</title><p>Restored</p>'));
  const portFile = path.join(directory, 'fixture-port');
  await new Promise(resolve => server.listen(phase === 'seed' ? 0 : Number(fs.readFileSync(portFile)), '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  fs.writeFileSync(portFile, String(server.address().port));
  const preferences = browserPreferences(directory), tabs = new BrowserTabStore(directory);
  const profileId = '10000000-0000-4000-8000-000000000001';
  let settings = preferences.get();
  const window = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true });
  const views = [];
  let status = 0;
  try {
    if (phase === 'seed') {
      settings = preferences.set({ profiles: [...settings.profiles, { id: profileId, label: 'Work' }], defaultProfile: profileId, restoreTabs: true }, settings.revision);
      for (const [id, value] of [['multiagent-browser', 'legacy'], [profileId, 'work']]) {
        const profile = session.fromPartition(browserProfile(settings, id).partition);
        await profile.cookies.set({ url, name: 'login-fixture', value, expirationDate: Date.now() / 1000 + 3600 });
        await profile.cookies.flushStore();
      }
      tabs.save([{ id: '20000000-0000-4000-8000-000000000001', profileId: 'multiagent-browser', url }, { id: '20000000-0000-4000-8000-000000000002', profileId, url }]);
      console.log('BROWSER_PROFILE_SEED_OK');
    } else {
      await restoreBrowserTabs(settings, tabs, async tab => {
        const view = new WebContentsView({ webPreferences: { partition: browserProfile(settings, tab.profileId).partition, sandbox: true } });
        views.push(view); window.contentView.addChildView(view); view.setVisible(false);
        await view.webContents.loadURL(tab.url);
        const cookies = await view.webContents.session.cookies.get({ url });
        assert.equal(cookies.find(c => c.name === 'login-fixture').value, tab.profileId === profileId ? 'work' : 'legacy');
        assert.equal(await view.webContents.executeJavaScript('document.title'), 'Profile fixture');
      });
      assert.equal(views.length, 2); assert.equal(window.isVisible(), false);
      console.log('BROWSER_PROFILE_COOKIE_ISOLATION_AND_RESTART_OK');
    }
  } catch (error) { console.error(error); status = 1; }
  finally { for (const view of views) view.webContents.close(); window.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); app.exit(status); }
  }).catch(error => { console.error(error); app.exit(1); });
}
