import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { UsageService } from '../electron/services/usage-service.mjs';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.versions.electron) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-agy-ui-'));
  const { build } = await import('esbuild');
  await build({ entryPoints: [path.join(root, 'scripts/fixtures/antigravity-usage-renderer.tsx')], bundle: true,
    jsx: 'automatic', define: { 'import.meta.env': '{}' }, outfile: path.join(directory, 'renderer.js') });
  fs.writeFileSync(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
  const env = { ...process.env, ACEDIA_AGY_SMOKE: directory }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill(), 30000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(timer); if (code !== 0) throw Error(`Antigravity UI smoke failed: ${code}`);
} else {
  const { app, BrowserWindow, ipcMain } = require('electron');
  const directory = process.env.ACEDIA_AGY_SMOKE;
  app.setPath('userData', path.join(directory, 'profile'));
  app.whenReady().then(async () => {
  const quota = path.join(directory, 'quota.json');
  const { sanitizeQuota } = require('../electron/services/antigravity-statusline.cjs');
  fs.writeFileSync(quota, JSON.stringify(sanitizeQuota({ plan_tier: 'Pro', quota: {
    '3p-5h': { remaining_fraction: 1 }, 'gemini-5h': { remaining_fraction: 0.48 },
    'gemini-weekly': { remaining_fraction: 0.91, reset_time: '2026-10-01T00:00:00Z' },
  } })));
  const service = new UsageService(path.join(directory, 'usage.db'), {}, { antigravityQuotaFile: quota });
  ipcMain.handle('usage_rate_limits_get', () => service.rateLimitSummary());
  const win = new BrowserWindow({ show: false, width: 1050, height: 750,
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(directory, 'index.html'));
    await win.webContents.executeJavaScript(`(async () => {
      const wait = () => new Promise(r => setTimeout(r, 100));
      for(let i=0;i<50 && !document.querySelector('.usage-status-limit');i++) await wait();
      const bar=document.querySelector('.usage-status-provider');
      if (!bar?.textContent.includes('Antigravity') || !bar.textContent.includes('48%') || !bar.textContent.includes('91%')) throw Error('Missing Gemini quotas in bar: '+bar?.textContent);
      bar.click(); await wait();
      if (!document.body.textContent.includes('3p') || !document.body.textContent.includes('Gemini')) throw Error('Missing quota details');
    })()`);
    console.log('ANTIGRAVITY_QUOTA_STATUSBAR_UI_OK');
    if (process.env.ACEDIA_AGY_SCREENSHOT) fs.writeFileSync(process.env.ACEDIA_AGY_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    service.close(); app.exit(0);
  } catch (error) { console.error(error); service.close(); app.exit(1); }
  });
}
