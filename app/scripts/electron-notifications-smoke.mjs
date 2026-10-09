import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { NativeNotifications } from '../electron/services/native-notifications.mjs';

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(appRoot, '../output/notification-native-smoke');

if (process.versions.electron) {
  const { app, BrowserWindow, Notification } = require('electron');
  app.disableHardwareAcceleration();
  app.setName('Acedia');
  app.setPath('userData', process.env.ACEDIA_NOTIFICATION_SMOKE_PROFILE);
  if (process.platform === 'win32') app.setAppUserModelId('com.jintae.multiagent.electron');
  app.whenReady().then(async () => { let win; try {
    win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const flashes = [];
    const flashFrame = win.flashFrame.bind(win);
    win.flashFrame = enabled => { flashes.push(enabled); flashFrame(enabled); };
    const main = await fs.readFile(path.join(appRoot, 'electron/main.mjs'), 'utf8');
    const windowHandler = main.match(/ipcMain\.handle\("multiagent:window",[\s\S]*?\n}\);/)?.[0];
    const focusHandler = main.match(/  win\.on\("focus",[\s\S]*?\n  }\);/)?.[0];
    assert.ok(windowHandler && focusHandler, 'Actual main-process attention handlers');
    let handler;
    vm.runInNewContext(windowHandler, { ipcMain: { handle: (_name, fn) => { handler = fn; } }, assertTrustedSender() {}, eventSenderWindow: () => win });
    vm.runInNewContext(focusHandler, { win, workspaceWindowId: 'notification-smoke', rememberWorkspaceWindowId() {} });
    await handler({}, 'requestUserAttention', true);
    assert.deepEqual(flashes, [true]);
    win.emit('focus');
    assert.deepEqual(flashes, [true, false]);
    const isFocused = win.isFocused.bind(win);
    win.isFocused = () => true;
    await handler({}, 'requestUserAttention', true);
    assert.deepEqual(flashes, [true, false, false]);
    win.isFocused = isFocused;
    console.log('NATIVE_TASKBAR_IPC_OK actual main handlers, native flash API, focus clear, focused guard; window remained hidden');
    assert.ok(Notification.isSupported(), 'Native notifications supported');
    const notifications = new NativeNotifications({ Notification, icon: path.join(appRoot, 'public/app-icon.png') });
    await notifications.show({ title: 'Acedia', body: '작업 완료 알림 표시 검사입니다.', silent: true });
    console.log('NATIVE_NOTIFICATION_OS_SHOW_OK silent Windows notification show event received');
    for (const notification of notifications.active) notification.close();
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(1);
  } });
} else {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const env = { ...process.env, ACEDIA_NOTIFICATION_SMOKE_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { cwd: appRoot, env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(Error('Native notification smoke timed out')); }, 20000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Native notification smoke failed: '+code)); });
  });
}
