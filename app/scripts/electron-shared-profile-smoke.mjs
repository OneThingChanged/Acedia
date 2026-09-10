import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { acquireSharedProfileLease, initializeSharedProfile } from '../electron/services/shared-profile.mjs';

const script = fileURLToPath(import.meta.url);
if (process.versions.electron) {
  const { app, BrowserWindow } = await import('electron');
  const [mode, base] = process.argv.slice(2);
  const root = path.join(base, 'shared');
  const lease = await acquireSharedProfileLease(root);
  if (!lease) { console.log('SECOND_CHANNEL_BLOCKED'); app.exit(0); process.exit(0); }
  initializeSharedProfile(root, []);
  app.setPath('userData', path.join(root, 'profile'));
  app.setPath('sessionData', path.join(root, 'profile'));
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await win.loadFile(path.join(base, mode === 'writer' ? 'exe' : 'store', 'index.html'));
  if (mode === 'writer') {
    await win.webContents.executeJavaScript(`localStorage.setItem('multiagent.projects.v1', '[{"id":"shared-project"}]'); localStorage.setItem('multiagent.appTheme.v1', 'light');`);
    if (process.platform === 'win32') {
      assert.throws(() => initializeSharedProfile(path.join(base, 'blocked-migration'), [
        { id: 'old', profile: path.join(root, 'profile'), local: path.join(root, 'local') },
      ]), /완전히 종료/);
      console.log('LIVE_PROFILE_MIGRATION_BLOCKED');
    }
    const stopTimer = setInterval(() => {
      if (!fs.existsSync(path.join(base, 'stop'))) return;
      clearInterval(stopTimer);
      win.webContents.session.flushStorageData();
      app.quit();
    }, 50);
    console.log('WRITER_READY');
  } else {
    assert.deepEqual(await win.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('multiagent.projects.v1'))`), [{ id: 'shared-project' }]);
    assert.equal(await win.webContents.executeJavaScript(`localStorage.getItem('multiagent.appTheme.v1')`), 'light');
    console.log('CROSS_CHANNEL_DATA_PASSED');
    app.quit();
  }
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-profile-smoke-'));
  const electron = createRequire(import.meta.url)('electron');
  const children = new Set();
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  for (const channel of ['exe','store']) {
    fs.mkdirSync(path.join(base, channel));
    fs.writeFileSync(path.join(base, channel, 'index.html'), '<!doctype html><title>Profile smoke</title>');
  }
  function launch(mode) {
    const child = spawn(electron, [script, mode, base], { env, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    children.add(child);
    let output = '';
    const ready = new Promise(resolve => child.stdout.on('data', data => { output += data; process.stdout.write(data); if (output.includes('WRITER_READY')) resolve(); }));
    child.stderr.on('data', data => { output += data; process.stderr.write(data); });
    const done = new Promise((resolve,reject) => {
      child.on('error', reject);
      child.on('exit', code => { children.delete(child); code === 0 ? resolve(output) : reject(new Error(output)); });
    });
    return {child,ready,done};
  }
  const timer = setTimeout(() => { for (const c of children) c.kill(); }, 30000);
  try {
    const first = launch('writer');
    await Promise.race([first.ready, first.done.then(() => { throw new Error('Writer exited before ready'); })]);
    assert.match(await launch('blocked').done, /SECOND_CHANNEL_BLOCKED/);
    fs.writeFileSync(path.join(base, 'stop'), 'stop');
    const output = await first.done;
    if (process.platform === 'win32') assert.match(output, /LIVE_PROFILE_MIGRATION_BLOCKED/);
    assert.match(await launch('reader').done, /CROSS_CHANNEL_DATA_PASSED/);
    console.log('Shared profile smoke passed: channel exclusion, offline migration guard, persisted projects and settings.');
  } finally {
    clearTimeout(timer);
    for (const c of children) c.kill();
    // Do not delete a still-owned profile after an abnormal termination.
    if (!children.size) fs.rmSync(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
