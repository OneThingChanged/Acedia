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
  let pool, web; let completeBrowser; let currentLanguage = 'ko';
  const quotaReads = new Map(), quotaFailures = new Set();
  void app.whenReady().then(async () => {
  try {
    pool = new AccountPool(path.join(root, 'pool'), { safeStorage, port: 0,
      transcriptUsageForPeriods: periods => periods.length ? { events: 1, inputTokens: 1200, outputTokens: 300, cachedTokens: 800 } : null,
      rpcFactory: (_env, home) => {
      const rpc = new EventEmitter(); rpc.initialize = async () => rpc; rpc.close = () => {};
      rpc.call = async (method, params) => {
        if (method === 'account/login/start') {
          const complete = () => rpc.emit('notification', { method: 'account/login/completed', params: { loginId:'ui-login', success: true } });
          if (params.type === 'chatgpt') completeBrowser = complete; else setTimeout(complete, 800);
          if (params.type === 'chatgpt') return {type:'chatgpt',loginId:'ui-login',authUrl:'https://auth.openai.com/oauth/authorize?redirect_uri=http://localhost:1455/auth/callback'};
          return { type: 'chatgptDeviceCode', loginId:'ui-login', userCode: 'TEST-1234', verificationUrl: 'https://auth.openai.com/codex/device' };
        }
        if (method === 'account/rateLimits/read') {
          const id = path.basename(home); quotaReads.set(id, (quotaReads.get(id) || 0) + 1);
          await new Promise(resolve => setTimeout(resolve, 150));
          if (quotaFailures.has(id)) throw new Error('fixture quota failure');
          return { rateLimits: { primary: { usedPercent: quotaReads.get(id) > 1 ? 20 : 32, resetsAt: Math.floor(Date.now()/1000)+3600 } } };
        }
        const id = path.basename(home);
        const jwt = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.x';
        fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ tokens: { access_token: jwt, refresh_token: 'test-only', account_id: id } }));
        return { account: { type: 'chatgpt', email: 'fixture@example.invalid', planType: 'plus' } };
      }; return rpc;
    } });
    web = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), accountPoolApi: (...args) => pool.api(...args), stateProvider: () => ({ language: currentLanguage, agents: [] }) });
    web.config.server_port = 0; const { url } = await web.start();
    for (const width of [1280, 390]) {
      currentLanguage = 'ko'; web.syncView({ ...web.view, language: currentLanguage });
      console.log('Account pool UI', width);
      const win = new BrowserWindow({ width, height: 900, show: false, webPreferences: { sandbox: true, backgroundThrottling: false } }); windows.push(win);
      const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
      await win.loadURL(url + '/?usage=1');
      console.log('Account pool shell loaded', width);
      const progressUrl = await win.webContents.executeJavaScript(`(async () => {
        window.open = () => { window.authPopup = { opener: window, closed: false, location: { replace: url => { window.openedAuthUrl = url; } }, close: () => {} }; return window.authPopup; };
        const wait = async fn => { for (let i=0;i<150;i++) { if (fn()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Pool UI timeout: '+document.body.innerText); };
        await wait(() => document.querySelector('.pool-tabs button'));
        document.querySelector('.pool-tabs [data-usage-view="accounts"]').click();
        await wait(() => !document.querySelector('.pool-panel form').hidden && !document.querySelector('.pool-panel input').disabled);
        const form = document.querySelector('.pool-panel form'); form.querySelector('input').value = 'Fixture ${width}'; form.requestSubmit();
        const card = () => [...document.querySelectorAll('.pool-card')].find(c => c.querySelector('h3').textContent === 'Fixture ${width}');
        await wait(() => card() && !card().querySelector('button').disabled);
        const action = name => [...card().querySelectorAll('button')].find(b=>b.textContent===name);
        action('${width === 1280 ? '브라우저 로그인' : '기기 코드 로그인'}').click();
        await wait(() => card().querySelector('.pool-login'));
        if (${width === 390} && !card().querySelector('.pool-login').textContent.includes('TEST-1234')) throw new Error('Missing login code');
        if (${width === 1280} && (card().querySelector('.pool-login strong') || !card().querySelector('.pool-login a').href.startsWith('https://auth.openai.com/'))) throw new Error('Invalid browser UI');
        if (window.openedAuthUrl !== card().querySelector('.pool-login a').href || window.authPopup.opener !== null) throw new Error('Authentication tab not opened safely');
        if (card().querySelector('.pool-login input').value !== window.openedAuthUrl) throw new Error('Missing selectable URL');
        const snapshot = await fetch('/api/account-pool').then(r => r.json());
        const id = snapshot.accounts.find(a => a.label === 'Fixture ${width}').id;
        return location.origin + '/?usage=1&accounts=1&poolLogin=' + id;
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
        const wait = async fn => { for (let i=0;i<150;i++) { if (fn()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Pool completion timeout: ' + document.querySelector('.pool-panel').innerText); };
        const card = () => [...document.querySelectorAll('.pool-card')].find(c => c.querySelector('h3').textContent === 'Fixture ${width}');
        const action = name => [...card().querySelectorAll('button')].find(b=>b.textContent===name);
        await wait(() => card().textContent.includes('fixture@example.invalid') && !card().querySelector('.pool-login'));
        action('분산 참여').click();
        await wait(() => action('분산 제외') && !action('분산 제외').disabled);
        if (!document.querySelector('.pool-toolbar button').getAttribute('aria-pressed').includes('true')) document.querySelector('.pool-toolbar button').click();
        await wait(() => document.querySelector('.pool-toolbar button').getAttribute('aria-pressed') === 'true');
        await wait(() => document.querySelector('.pool-routing-summary').dataset.state === 'ready');
        if (!document.querySelector('.pool-routing-heading').textContent.includes('요청 대기')) throw new Error('Enabled routing was not clearly labeled as idle');
        if (!card().querySelector('.pool-account-badge.participating')) throw new Error('Missing account participation badge');
        if (document.documentElement.scrollWidth > window.innerWidth+2) throw new Error('Horizontal overflow');
        const grid = document.querySelector('.pool-list');
        const available = grid.getBoundingClientRect().width;
        const expected = available >= 992 ? 3 : available >= 656 ? 2 : 1;
        if (getComputedStyle(grid).gridTemplateColumns.split(' ').length !== expected) throw new Error('Incorrect account grid columns');
        const actions = [...card().querySelectorAll('button')];
        if (actions.some(b=>b.getBoundingClientRect().height < 44)) throw new Error('Small touch target');
      })()`);
      assert.equal(pool.state.enabled, true); assert.ok(pool.state.accounts.some(a => a.label === `Fixture ${width}` && a.enabled));
      const account = pool.state.accounts.find(a => a.label === `Fixture ${width}`);
      const sessionId = `fixture-${width}`; await pool.launch(sessionId, account.id);
      Object.assign(account.stats, { requests: 4, cancelled: 1, legacyDisconnected: 80, unmeasuredRequests: 3 });
      const base = Date.now();
      pool.state.recent = [
        { at: base, sessionId, accountId: account.id, operation: 'generation', status: 'cancelled', usageReported: false, inputTokens: 0, outputTokens: 0 },
        { at: base + 1, sessionId, accountId: account.id, operation: 'generation', status: 'cancelled', completionObserved: false, usageReported: false, inputTokens: 0, outputTokens: 0 },
        { at: base + 2, sessionId, accountId: account.id, operation: 'generation', status: 'completed', completionObserved: true, usageReported: false, inputTokens: 0, outputTokens: 0 },
        { at: base + 3, sessionId, accountId: account.id, operation: 'generation', status: 'completed', completionObserved: true, usageReported: true, inputTokens: 12, outputTokens: 3 },
      ];
      const failedAccount = width === 390 ? pool.state.accounts.find(a => a.id !== account.id) : null;
      const preservedAt = failedAccount?.limitsAt;
      if (failedAccount) { quotaFailures.add(failedAccount.id); pool.update(failedAccount.id, false); }
      pool.persist();
      const readsBefore = new Map(quotaReads);
      await win.webContents.executeJavaScript(`(async () => {
        document.querySelectorAll('.pool-toolbar button')[1].click();
        for (let i=0;i<150 && !document.querySelector('.pool-records').textContent.includes('Fixture ${width}');i++) await new Promise(r=>setTimeout(r,50));
        const rows = [...document.querySelectorAll('.pool-records p')].map(row=>row.textContent);
        if (rows.length !== 4 || !rows[0].includes('완료 · 15 토큰')) throw new Error('Missing completed measured request');
        if (!rows[1].includes('완료 · 요청별 토큰 정보 없음')) throw new Error('Missing completed unmeasured request');
        if (!rows[2].includes('완료 전 연결 종료') || !rows[3].includes('연결 종료 (완료 여부 미확인)')) throw new Error('Incorrect cancellation labels');
        const card = [...document.querySelectorAll('.pool-card')].find(c=>c.querySelector('h3').textContent==='Fixture ${width}');
        if (!card.textContent.includes('기존 연결 종료 80건') || !card.textContent.includes('대화 기록 입력 토큰 1,200')) throw new Error('Missing legacy or transcript usage');
        if (!document.querySelector('.pool-records-hint').textContent.includes('위 계정 카드')) throw new Error('Missing usage explanation');
        if ([...document.querySelectorAll('.pool-card button')].some(button=>button.textContent==='한도 새로고침')) throw new Error('Individual quota refresh still present');
        if (getComputedStyle(document.querySelector('#refreshUsageButton')).display !== 'none') throw new Error('Duplicate header refresh still visible');
        for (let i=0;i<150 && !document.querySelector('.pool-refresh-status').textContent.includes('목록 갱신 완료');i++) await new Promise(r=>setTimeout(r,50));
        if (!document.querySelector('.pool-refresh-status').textContent.includes('실패 ${width === 390 ? 1 : 0}')) throw new Error('Missing bulk refresh result');
        if (document.querySelectorAll('.pool-toolbar button')[1].disabled) throw new Error('Refresh list remains disabled after completion');
        if (${width === 390} && !document.querySelector('.pool-list').textContent.includes('이전 조회값을 유지합니다')) throw new Error('Missing partial failure explanation');
        if (document.documentElement.scrollWidth > window.innerWidth+2) throw new Error('Request history horizontal overflow');
      })()`);
      for (const a of pool.state.accounts) assert.equal(quotaReads.get(a.id), (readsBefore.get(a.id) || 0) + 1);
      assert.equal(pool.quotaRefresh.succeeded, 1);
      assert.equal(pool.account(account.id).limits.rateLimits.primary.usedPercent, 20);
      if (failedAccount) assert.equal(failedAccount.limitsAt, preservedAt);
      pool.active.set(account.id, 1);
      await win.webContents.executeJavaScript(`(async () => {
        const toggle = document.querySelector('.pool-toolbar button');
        const wait = async state => { for (let i=0;i<150;i++) { if (document.querySelector('.pool-routing-summary').dataset.state === state && !toggle.disabled) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Routing state did not become ' + state); };
        toggle.click(); await wait('off'); toggle.click(); await wait('working');
        if (!document.querySelector('.pool-account-badge.working')) throw new Error('Missing actual processing badge');
        document.querySelector('.pool-routing-summary').scrollIntoView({block:'start'});
      })()`);
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const image = await win.webContents.capturePage();
      const output = fileURLToPath(new URL('../../.acedia/account-pool-ui/', import.meta.url)); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, `${width}.png`), image.toPNG());
      await win.webContents.executeJavaScript(`(async () => {
        document.querySelector('.pool-records-hint').scrollIntoView({ block: 'center' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      fs.writeFileSync(path.join(output, `${width}-requests.png`), (await win.webContents.capturePage()).toPNG());
      pool.active.set(account.id, 0);
      currentLanguage = 'en'; web.syncView({ ...web.view, language: currentLanguage });
      await win.webContents.executeJavaScript(`(async () => {
        for (let i=0;i<150 && document.documentElement.lang!=='en';i++) await new Promise(r=>setTimeout(r,50));
        if (document.documentElement.lang !== 'en') throw new Error('English source language did not synchronize');
        document.querySelectorAll('.pool-toolbar button')[1].click();
        for (let i=0;i<150 && !document.querySelector('.pool-records').textContent.includes('No per-request token data');i++) await new Promise(r=>setTimeout(r,50));
        const text = document.querySelector('.pool-records').textContent;
        if (!text.includes('Disconnected (completion unknown)') || !text.includes('Disconnected before completion') || !text.includes('15 tokens')) throw new Error('Missing English request labels');
        for (let i=0;i<150 && !document.querySelector('.pool-refresh-status').textContent.includes('Refresh complete');i++) await new Promise(r=>setTimeout(r,50));
        if (!document.querySelector('.pool-refresh-status').textContent.includes('${width === 390 ? 1 : 0} failed')) throw new Error('Missing English refresh result');
      })()`);
      assert.deepEqual(errors, []); win.destroy();
    }
    assert.ok(!fs.readFileSync(pool.file, 'utf8').includes('test-only'));
    console.log('ACCOUNT_POOL_ELECTRON_DESKTOP_MOBILE_ENCRYPTION_OK');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    clearTimeout(timer); windows.forEach(w => { if (!w.isDestroyed()) w.destroy(); }); pool?.close(); await web?.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-pool-ui-')) throw new Error('Unexpected cleanup path');
    try { fs.rmSync(root, { recursive: true, maxRetries: 10, retryDelay: 200 }); } catch { /* Chromium can briefly retain its isolated profile at shutdown. */ }
    app.exit(process.exitCode || 0);
  }
  }).catch(error => { console.error(error); app.exit(1); });
}
