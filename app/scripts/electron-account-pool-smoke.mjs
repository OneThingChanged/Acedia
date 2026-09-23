import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(createRequire(import.meta.url)('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
  process.exitCode = await new Promise(resolve => child.on('exit', resolve));
} else {
  const { app, BrowserWindow, safeStorage } = await import('electron');
  const { AccountPool } = await import('../electron/services/account-pool.mjs');
  const { RemoteDashboardService } = await import('../electron/services/web-services.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-pool-ui-'));
  app.setPath('userData', path.join(root, 'profile')); app.on('window-all-closed', () => {});
  const timer = setTimeout(() => { console.error('Account pool UI smoke timed out'); app.exit(2); }, 55000); const windows = [];
  let pool, web; let completeBrowser;
  void app.whenReady().then(async () => {
  try {
    pool = new AccountPool(path.join(root, 'pool'), { safeStorage, port: 0, rpcFactory: (_env, home) => {
      const rpc = new EventEmitter(); rpc.initialize = async () => rpc; rpc.close = () => {};
      rpc.call = async (method, params) => {
        if (method === 'account/login/start') {
          const complete = () => rpc.emit('notification', { method: 'account/login/completed', params: { loginId:'ui-login', success: true } });
          if (params.type === 'chatgpt') completeBrowser = complete; else setTimeout(complete, 800);
          if (params.type === 'chatgpt') return {type:'chatgpt',loginId:'ui-login',authUrl:'https://auth.openai.com/oauth/authorize?redirect_uri=http://localhost:1455/auth/callback'};
          return { type: 'chatgptDeviceCode', loginId:'ui-login', userCode: 'TEST-1234', verificationUrl: 'https://auth.openai.com/codex/device' };
        }
        if (method === 'account/rateLimits/read') return { rateLimits: { primary: { usedPercent: 32, resetsAt: Math.floor(Date.now()/1000)+3600 } } };
        const id = path.basename(home);
        const jwt = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.x';
        fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ tokens: { access_token: jwt, refresh_token: 'test-only', account_id: id } }));
        return { account: { type: 'chatgpt', email: 'fixture@example.invalid', planType: 'plus' } };
      }; return rpc;
    } });
    web = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), accountPoolApi: (...args) => pool.api(...args), stateProvider: () => ({ language: 'ko', agents: [] }) });
    web.config.server_port = 0; const { url } = await web.start();
    for (const width of [1280, 390]) {
      console.log('Account pool UI', width);
      const win = new BrowserWindow({ width, height: 900, show: false, webPreferences: { sandbox: true, backgroundThrottling: false } }); windows.push(win);
      const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
      await win.loadURL(url + '/?usage=1');
      console.log('Account pool shell loaded', width);
      const progressUrl = await win.webContents.executeJavaScript(`(async () => {
        const wait = async fn => { for (let i=0;i<150;i++) { if (fn()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Pool UI timeout: '+document.body.innerText); };
        await wait(() => document.querySelector('.pool-tabs button'));
        document.querySelectorAll('.pool-tabs button')[1].click();
        await wait(() => !document.querySelector('.pool-panel form').hidden && !document.querySelector('.pool-panel input').disabled);
        const form = document.querySelector('.pool-panel form'); form.querySelector('input').value = 'Fixture ${width}'; form.requestSubmit();
        const card = () => [...document.querySelectorAll('.pool-card')].find(c => c.querySelector('h3').textContent === 'Fixture ${width}');
        await wait(() => card() && !card().querySelector('button').disabled);
        const action = name => [...card().querySelectorAll('button')].find(b=>b.textContent===name);
        action('${width === 1280 ? '브라우저 로그인' : '기기 코드 로그인'}').click();
        await wait(() => card().querySelector('.pool-login'));
        if (${width === 390} && !card().querySelector('.pool-login').textContent.includes('TEST-1234')) throw new Error('Missing login code');
        if (${width === 1280} && (card().querySelector('.pool-login strong') || !new URL(card().querySelector('.pool-login a').href).searchParams.has('poolLogin'))) throw new Error('Invalid browser UI');
        return card().querySelector('.pool-login a').href;
      })()`);
      if (width === 1280) {
        const progress = new BrowserWindow({ width, height: 900, show: false, webPreferences: { sandbox: true, backgroundThrottling: false } }); windows.push(progress);
        await progress.loadURL(progressUrl);
        await progress.webContents.executeJavaScript(`(async () => {
          for (let i=0;i<150 && !document.querySelector('.pool-login a');i++) await new Promise(r=>setTimeout(r,50));
          const back = new URL(document.querySelector('.pool-return').href);
          if (back.origin !== location.origin || back.searchParams.get('accounts') !== '1' || back.searchParams.has('poolLogin')) throw new Error('Invalid Dashboard return link');
          if (!document.querySelector('.pool-login a').href.startsWith('https://auth.openai.com/')) throw new Error('Missing OAuth link');
        })()`);
        completeBrowser();
        for (let i=0;i<150 && new URL(progress.webContents.getURL()).searchParams.has('poolLogin');i++) await new Promise(r=>setTimeout(r,100));
        assert.equal(new URL(progress.webContents.getURL()).searchParams.get('accounts'), '1');
        assert.equal(new URL(progress.webContents.getURL()).searchParams.has('poolLogin'), false);
        progress.destroy();
      }
      await win.webContents.executeJavaScript(`(async () => {
        const wait = async fn => { for (let i=0;i<150;i++) { if (fn()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Pool completion timeout'); };
        const card = () => [...document.querySelectorAll('.pool-card')].find(c => c.querySelector('h3').textContent === 'Fixture ${width}');
        const action = name => [...card().querySelectorAll('button')].find(b=>b.textContent===name);
        await wait(() => card().textContent.includes('fixture@example.invalid') && !card().querySelector('.pool-login'));
        action('분산 참여').click();
        await wait(() => action('분산 제외') && !action('분산 제외').disabled);
        if (!document.querySelector('.pool-toolbar button').getAttribute('aria-pressed').includes('true')) document.querySelector('.pool-toolbar button').click();
        await wait(() => document.querySelector('.pool-toolbar button').getAttribute('aria-pressed') === 'true');
        if (document.documentElement.scrollWidth > window.innerWidth+2) throw new Error('Horizontal overflow');
        const grid = document.querySelector('.pool-list');
        const available = grid.getBoundingClientRect().width;
        const expected = available >= 992 ? 3 : available >= 656 ? 2 : 1;
        if (getComputedStyle(grid).gridTemplateColumns.split(' ').length !== expected) throw new Error('Incorrect account grid columns');
        const actions = [...card().querySelectorAll('button')];
        if (actions.some(b=>b.getBoundingClientRect().height < 44)) throw new Error('Small touch target');
      })()`);
      assert.equal(pool.state.enabled, true); assert.ok(pool.state.accounts.some(a => a.label === `Fixture ${width}` && a.enabled));
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const image = await win.webContents.capturePage();
      const output = fileURLToPath(new URL('../../.acedia/account-pool-ui/', import.meta.url)); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, `${width}.png`), image.toPNG());
      assert.deepEqual(errors, []); win.destroy();
    }
    assert.ok(!fs.readFileSync(pool.file, 'utf8').includes('test-only'));
    console.log('ACCOUNT_POOL_ELECTRON_DESKTOP_MOBILE_ENCRYPTION_OK');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    clearTimeout(timer); windows.forEach(w => { if (!w.isDestroyed()) w.destroy(); }); pool?.close(); await web?.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-pool-ui-')) throw new Error('Unexpected cleanup path');
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* Chromium can briefly retain its isolated profile at shutdown. */ }
    app.exit(process.exitCode || 0);
  }
  }).catch(error => { console.error(error); app.exit(1); });
}
