import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ProviderAccounts } from '../electron/services/provider-accounts.mjs';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { CodexUsageAccounts } from '../electron/services/codex-usage-accounts.mjs';
import { UsageService } from '../electron/services/usage-service.mjs';
import { LocalDashboardService, RemoteDashboardService } from '../electron/services/web-services.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const contract = require('../electron/ipc-contract.cjs');
const check = (value, message) => { if (!value) throw new Error(message); };
if (process.versions.electron) {
  const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
  const directory = process.env.ACEDIA_UNIFIED_USAGE_FIXTURE;
  app.setPath('userData', path.join(directory, 'profile'));
  app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
  const windows = [], services = [], errors = [];
  let pool, usage, openedUrl;
  const until = async (win, expression) => {
    for (let n = 0; n < 100; n++) {
      if (await win.webContents.executeJavaScript(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error(`Usage UI condition failed: ${expression}`);
  };
  const makeWindow = (width, desktop = false) => {
    const win = new BrowserWindow({ show: false, width, height: 850, webPreferences: {
      offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true,
      ...(desktop ? { preload: path.join(root, 'electron/preload.cjs'), additionalArguments: [
        `--multiagent-invoke-commands=${contract.INVOKE_COMMANDS.join(',')}`,
        `--multiagent-delivered-events=${contract.DELIVERED_EVENTS.join(',')}`,
      ] } : {}),
    } });
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    windows.push(win); return win;
  };
  void app.whenReady().then(async () => {
    let exitCode = 0;
    try {
      const local = new ProviderAccounts(directory, 'codex', { baseEnv: { CODEX_HOME: path.join(directory, 'default') } });
      const quota = percent => ({ rateLimits: { planType: 'plus', primary: { usedPercent: percent, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 } } });
      pool = new AccountPool(path.join(directory, 'pool'), { safeStorage, rpcFactory: (_env, home) => ({
        initialize: async () => {}, close: () => {}, call: async method => {
          if (method === 'account/read') return { account: { type: 'chatgpt', planType: 'plus' } };
          check(method === 'account/rateLimits/read', 'Unexpected fixture RPC');
          await new Promise(resolve => setTimeout(resolve, 150));
          return pool.account(path.basename(home)).limits;
        },
      }) });
      for (const [label, percent] of [['Work', 29], ['Personal', 1]]) {
        const account = pool.account(pool.create(label));
        const tokens = { account_id: label, refresh_token: 'fixture-only',
          access_token: `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.x`,
          id_token: `x.${Buffer.from(JSON.stringify({ sub: 'user' })).toString('base64url')}.x` };
        Object.assign(account, { auth: pool.seal(JSON.stringify({ tokens })), identity: `${label}:user`, status: 'ready', enabled: label === 'Work', limits: quota(percent), limitsAt: Date.now() });
        if (label === 'Personal') { await fs.mkdir(local.home()); await fs.writeFile(path.join(local.home(), 'auth.json'), JSON.stringify({ tokens })); }
      }
      pool.persist();
      const [work, personal] = pool.state.accounts;
      usage = new UsageService(path.join(directory, 'usage.db'), { scan: async () => [] });
      usage.codexUsageAccounts = new CodexUsageAccounts(local, pool);
      usage.accountProfiles = () => []; usage.claudeAccounts = () => [];
      usage.codexUsageFetcher = async () => { throw new Error('Duplicate local quota helper'); };
      const providers = { usageProvider: (...args) => usage.browserSummary(...args), usageProfileVisibility: (...args) => usage.setProfileVisibility(...args), accountPoolApi: (...args) => pool.api(...args) };
      const dashboard = new LocalDashboardService({ baseDir: directory, title: 'Fixture', configName: 'dashboard.json', defaultPort: 0, providers });
      const remote = new RemoteDashboardService({ baseDir: path.join(directory, 'remote'), ...providers }); remote.config.server_port = 0;
      services.push(dashboard, remote);
      const { url } = await dashboard.start();
      dashboard.sync({ language: 'ko', agents: [], view: { language: 'ko', agents: [] } });
      remote.syncView({ language: 'ko', agents: [] }); await remote.start();
      ipcMain.handle('multiagent:invoke', (_event, command, rawArgs) => {
        const args = contract.assertInvokeRequest(command, rawArgs);
        if (command === 'usage_rate_limits_get') return usage.getRateLimits(args.refresh);
        if (command === 'usage_profile_visibility_set') return usage.setProfileVisibility(args.profileKey, args.hidden);
        if (command === 'start_monitor_server') return dashboard.start();
        if (command === 'open_external_url') { openedUrl = args.url; return; }
        throw new Error(`Unexpected fixture command: ${command}`);
      });
      const desktop = makeWindow(1100, true);
      await desktop.loadFile(path.join(directory, 'index.html'));
      await until(desktop, "document.querySelector('.usage-status-provider')?.textContent.includes('Personal') && !document.querySelector('.usage-status-refresh')?.disabled");
      check(await desktop.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('multiagent.statusBar.v1')).selectedAccounts[0] === 'codex:${personal.id}'`), 'Legacy selection was not persisted');
      await desktop.webContents.executeJavaScript("document.querySelector('.usage-status-provider').click()");
      await until(desktop, "document.querySelectorAll('.usage-account-card').length === 2");
      check(await desktop.webContents.executeJavaScript("document.querySelectorAll('.usage-account-routing[data-routing=excluded]').length === 1 && !document.querySelector('.properties-dialog')?.textContent.includes('Default')"), 'Excluded account missing or duplicate Default');
      await desktop.webContents.executeJavaScript(`document.querySelector('input[value="codex:${work.id}"]').click()`);
      await until(desktop, "document.querySelectorAll('.usage-status-provider').length === 2");
      await desktop.webContents.executeJavaScript("document.querySelector('.usage-manage-accounts').click()");
      for (let n = 0; n < 30 && !openedUrl; n++) await new Promise(resolve => setTimeout(resolve, 80));
      check(openedUrl === `${url}/?usage=1&accounts=1`, 'Management button opened a different account surface');
      const output = path.resolve(root, '../output'); await fs.mkdir(output, { recursive: true });
      await fs.writeFile(path.join(output, 'unified-usage-desktop.png'), (await desktop.webContents.capturePage()).toPNG());
      for (const [server, width, name] of [[dashboard, 1100, 'dashboard'], [remote, 390, 'remote']]) {
        const win = makeWindow(width);
        await win.loadURL(`${server.status().url}/?usage=1&accounts=1`);
        await until(win, "document.querySelectorAll('.pool-card').length === 2");
        await win.webContents.executeJavaScript("document.querySelectorAll('.pool-tabs button')[0].click()");
        await until(win, "document.querySelector('.pool-panel').hidden && document.querySelectorAll('.usage-provider-card').length === 2");
        check(await win.webContents.executeJavaScript("document.querySelector('#usageProviderGrid').textContent.includes('Work') && document.querySelector('#usageProviderGrid').textContent.includes('Personal') && !!document.querySelector('[data-routing=excluded]')"), 'Usage list differs from routing list');
        check(await win.webContents.executeJavaScript("document.documentElement.scrollWidth <= innerWidth + 1"), 'Usage layout overflow');
        await win.webContents.executeJavaScript("document.querySelector('#usageProviderGrid').scrollIntoView()");
        await new Promise(resolve => setTimeout(resolve, 250));
        await fs.writeFile(path.join(output, `unified-usage-${name}.png`), (await win.webContents.capturePage()).toPNG());
        if (server === dashboard) {
          await win.webContents.executeJavaScript(`fetch('/api/account-pool', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update', id: '${personal.id}', label: 'Personal renamed', enabled: false }) })`);
          await desktop.webContents.executeJavaScript("window.dispatchEvent(new Event('focus'))");
          await until(desktop, "document.querySelector('.usage-status-bar').textContent.includes('Personal renamed')");
        }
      }
      check(errors.length === 0, `Renderer errors: ${errors.join('; ')}`);
      console.log('UNIFIED_USAGE_DESKTOP_DASHBOARD_REMOTE_SELECTION_RENAME_AND_MANAGEMENT_OK');
    } catch (error) { console.error(error); exitCode = 1; }
    finally {
      for (const win of windows) if (!win.isDestroyed()) win.destroy();
      await Promise.all(services.map(service => service.stop())); pool?.close(); await pool?.refreshing; usage?.close(); app.exit(exitCode);
    }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-unified-usage-ui-'));
  try {
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(root, 'scripts/fixtures/unified-usage-renderer.tsx')], bundle: true, jsx: 'automatic', define: { 'import.meta.env': '{}' }, outfile: path.join(directory, 'renderer.js') });
    await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;width:100%;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_UNIFIED_USAGE_FIXTURE: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 60000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error(`Unified usage smoke failed (${code})`);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('acedia-unified-usage-ui-')) throw new Error('Invalid cleanup path');
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 150 });
  }
}
