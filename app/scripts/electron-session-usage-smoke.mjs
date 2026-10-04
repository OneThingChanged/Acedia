import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(import.meta.url), root = path.resolve(path.dirname(file), '..');
const require = createRequire(path.join(root, 'package.json'));

if (!process.versions.electron) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-session-usage-smoke-'));
  const env = { ...process.env, ACEDIA_SESSION_USAGE_SMOKE: directory }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [file], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const directory = process.env.ACEDIA_SESSION_USAGE_SMOKE;
  app.setPath('userData', path.join(directory, 'profile'));
  const { UsageService } = await import('../electron/services/usage-service.mjs');
  const { RemoteDashboardService } = await import('../electron/services/web-services.mjs');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let service, usage, win;
  const timer = setTimeout(() => { console.error('Session usage smoke timed out'); app.exit(1); }, 60_000);
  async function waitFor(expression) {
    for (let n = 0; n < 90; n++) { if (await win.webContents.executeJavaScript(expression)) return; await sleep(70); }
    throw new Error('Session usage condition failed: ' + expression);
  }
  app.whenReady().then(async () => {
    try {
      const projects = [{ id: 'p', name: 'Acedia', folder: directory }];
      const agents = [
        { id: 'parent', name: '세션 조직도 개선', projectId: 'p', folder: directory, aiToolId: 'codex', lastSessionId: 'parent-chat' },
        { id: 'ui', name: 'UI 구현', projectId: 'p', folder: directory, aiToolId: 'codex', lastSessionId: 'ui-chat', sessionHierarchy: { parentId: 'parent' } },
        { id: 'docs', name: '문서 정리', projectId: 'p', folder: directory, aiToolId: 'claude', lastSessionId: 'docs-chat', deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'parent' } },
        { id: 'fresh', name: '동작 검증', projectId: 'p', folder: directory, aiToolId: 'codex', lastSessionId: 'fresh-chat' },
      ];
      usage = new UsageService(path.join(directory, 'usage.db'), { scan: async () => [] }, { activeSessions: () => [{ id: 'parent' }, { id: 'ui' }] });
      usage.syncCatalog(projects, agents); usage.refreshRateLimits = async () => {};
      const insert = usage.db().prepare(`INSERT INTO usage_events (source_key,ts,agent_id,agent_name,session_id,project_id,project_name,tool,model,raw_kind,input_tokens,cache_read_tokens,output_tokens,reasoning_output_tokens,total_tokens,owner_kind)
        VALUES (?,?,?,?,?,'p','Acedia',?,?,?,100000,300000,10000,2000,412000,?)`);
      let sequence = 0;
      for (let back = 0; back < 7; back++) {
        const day = new Date(); day.setHours(1, 0, 0, 0); day.setDate(day.getDate() - back);
        for (const agent of agents.slice(0, 3)) insert.run('event-' + sequence++, day.getTime() / 1000,
          agent.id, agent.name, agent.lastSessionId, agent.aiToolId, agent.aiToolId === 'claude' ? 'claude-model' : back % 2 ? 'gpt-5.4' : 'gpt-5.5',
          agent.aiToolId === 'claude' ? 'claude_message_usage' : 'codex_token_count_v2', 'session');
      }
      insert.run('unlinked', Date.now() / 1000, 'legacy', 'Legacy', '<img src=x onerror=window.badUsage=1>', 'codex', 'unknown-model', 'old-format', null);
      let fail = false, calls = 0;
      service = new RemoteDashboardService({ baseDir: path.join(directory, 'service'),
        usageProvider: (refresh, selection) => usage.browserSummary(refresh, selection),
        usageSessionProvider: async (refresh, selection) => { calls++; if (fail) throw new Error('fixture failure');
          if (selection.range === 'week') await sleep(250); return usage.browserSessionUsage(refresh, selection); },
      });
      service.config.server_port = 0; service.syncAgents(agents); service.syncView({ language: 'ko', projects, agents });
      const status = await service.start();
      win = new BrowserWindow({ show: false, width: 1920, height: 1200, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
      const errors = [];
      win.webContents.on('console-message', (details, level, message) => { const text = details.message ?? message;
        if (details.level === 'error' || level === 3) errors.push(text); });
      await win.loadURL(status.url + '/?usage=1&sessions=1');
      await waitFor("document.querySelectorAll('.su-rows tr').length===5 && !document.querySelector('.su-refresh').disabled");
      assert(await win.webContents.executeJavaScript("document.querySelector('.su-cost-total').textContent.includes('2.02')"), 'Stored costs loaded');
      assert(await win.webContents.executeJavaScript("!window.badUsage && !document.querySelector('.su-rows img')"), 'Names remain text, not executable HTML');
      await win.webContents.executeJavaScript("const button=document.querySelector('.su-rows tr[data-session-id=\"agent:parent\"] .su-name');button.focus();button.click()");
      assert(await win.webContents.executeJavaScript("document.activeElement.closest('tr')?.dataset.sessionId==='agent:parent'"), 'Keyboard focus survived a detail render');
      await win.webContents.executeJavaScript("document.querySelector('.su-rows tr[data-session-id=\"agent:parent\"] .su-name').click(); window.ownUsageCost=document.querySelector('.su-cost-total').textContent; document.querySelector('[data-include-family=true]').click()");
      assert(await win.webContents.executeJavaScript("document.querySelector('.su-detail-note').textContent.includes('미산정') && document.querySelector('.su-cost-total').textContent===window.ownUsageCost"), 'Child details count unknown prices without changing totals');
      await win.webContents.executeJavaScript("document.querySelector('.su-search').value='UI 구현';document.querySelector('.su-search').dispatchEvent(new Event('input',{bubbles:true}))");
      assert(await win.webContents.executeJavaScript("document.querySelectorAll('.su-rows tr').length===2 && document.querySelector('.su-coverage').textContent==='100%' && document.querySelector('.su-cost-total').textContent.includes('1.01')"), 'Search retains parent context but only prices matching child');
      await win.webContents.executeJavaScript("document.querySelector('.su-search').value='';document.querySelector('.su-search').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-range=week]').click();document.querySelector('[data-range=month]').click()");
      await waitFor("!document.querySelector('.su-refresh').disabled && document.querySelector('[data-range=month]').getAttribute('aria-pressed')==='true'");
      await sleep(400);
      assert(await win.webContents.executeJavaScript("document.querySelector('.su-range-label').textContent.includes(new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-01')"), 'Late period response did not overwrite selection');
      await win.webContents.executeJavaScript("document.querySelector('[data-range=today]').click()");
      await waitFor("!document.querySelector('.su-refresh').disabled");
      const before = await win.webContents.executeJavaScript("document.querySelector('.su-token-total').textContent");
      fail = true; await win.webContents.executeJavaScript("document.querySelector('.su-refresh').click()");
      await waitFor("document.querySelector('.su-message').classList.contains('su-error') && !document.querySelector('.su-refresh').disabled");
      assert(await win.webContents.executeJavaScript("document.querySelector('.su-token-total').textContent") === before, 'Failure preserved the last stored totals');
      fail = false; await win.webContents.executeJavaScript("document.querySelector('.su-refresh').click()"); await waitFor("!document.querySelector('.su-message').classList.contains('su-error') && !document.querySelector('.su-refresh').disabled");
      const exportFile = path.join(directory, 'session-usage.csv');
      const downloaded = new Promise((resolve, reject) => { win.webContents.session.once('will-download', (_event, item) => { item.setSavePath(exportFile); item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error(state))); }); });
      await win.webContents.executeJavaScript("document.querySelector('.su-export').click()"); await downloaded;
      assert(fs.readFileSync(exportFile, 'utf8').includes('1.010000'), 'CSV retained unrounded costs');
      await win.webContents.executeJavaScript("document.querySelector('.su-pricing').click()"); assert(await win.webContents.executeJavaScript("document.querySelector('.su-dialog').open"), 'Pricing dialog opened');
      await win.webContents.executeJavaScript("document.querySelector('.su-dialog-close').click()");
      const artifact = path.resolve(root, '..', 'output', 'session-usage-smoke'); fs.mkdirSync(artifact, { recursive: true });
      const sizes = [];
      for (const [width, height] of [[1920, 1200], [1280, 1000], [390, 900]]) {
        win.setContentSize(width, height); await sleep(250);
        const geometry = await win.webContents.executeJavaScript(`({width:innerWidth,scroll:document.documentElement.scrollWidth,
          visible:document.querySelector('#sessionUsageView').getClientRects().length,table:document.querySelector('.su-table-scroll').getBoundingClientRect().width})`);
        assert(geometry.scroll <= width && geometry.visible && geometry.table > 0, 'Responsive session layout ' + JSON.stringify(geometry)); sizes.push(geometry);
        await fs.promises.writeFile(path.join(artifact, 'usage-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
        if (width === 390) {
          await win.webContents.executeJavaScript("document.querySelector('.su-list').scrollIntoView({block:'start'})"); await sleep(100);
          await fs.promises.writeFile(path.join(artifact, 'usage-390-table.png'), (await win.webContents.capturePage()).toPNG());
          await win.webContents.executeJavaScript("document.querySelector('.su-inspector').scrollIntoView({block:'start'})"); await sleep(100);
          await fs.promises.writeFile(path.join(artifact, 'usage-390-detail.png'), (await win.webContents.capturePage()).toPNG());
        }
      }
      await win.webContents.executeJavaScript("[...document.querySelectorAll('.pool-tabs button')].find(b=>b.textContent==='사용량').click()");
      assert(await win.webContents.executeJavaScript("document.querySelector('#sessionUsageView').hidden && !document.querySelector('#usageView').classList.contains('pool-mode')"), 'Existing usage view restored');
      const stopped = calls; await sleep(1300); assert(calls === stopped, 'Session polling stopped after leaving the tab');
      assert(!errors.some(error => !String(error).includes('fixture failure')), 'Renderer errors: ' + errors.join('; '));
      console.log('SESSION_USAGE_SMOKE_OK ' + JSON.stringify({ sizes, csv: true, ownership: true, staleResponses: true, failurePreservation: true, stoppedPolling: true }));
      await service.stop(); usage.close(); clearTimeout(timer); app.exit(0);
    } catch (error) { console.error(error.stack); clearTimeout(timer); try { await service?.stop(); usage?.close(); } catch {} app.exit(1); }
  });
}
