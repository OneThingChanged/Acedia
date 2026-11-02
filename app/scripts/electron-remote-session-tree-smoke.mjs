import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { RemoteDashboardService, LocalDashboardService } from '../electron/services/web-services.mjs';

const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-session-tree-'));
  try {
    const env = { ...process.env, ACEDIA_SESSION_TREE_FIXTURE: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 90000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, 'Remote session tree smoke failed');
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('acedia-session-tree-')) throw new Error('Invalid cleanup path');
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 150 });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  const directory = process.env.ACEDIA_SESSION_TREE_FIXTURE;
  assert(directory, 'Missing isolated tree fixture');
  app.setPath('userData', path.join(directory, 'profile')); app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const evaluate = (win, code) => win.webContents.executeJavaScript(code);
  async function wait(win, code) {
    for (let n = 0; n < 120; n++) { if (await evaluate(win, code)) return; await pause(60); }
    throw new Error(`Tree UI condition failed: ${code}`);
  }
  const row = id => `document.querySelector('.session-row[data-agent-id="${id}"]')`;
  const toggle = id => `${row(id)}?.querySelector('.session-family-toggle')`;
  const fixture = () => [
    { id: 'manager', name: 'RnDHub', deferredStart: true, resumeEligible: true },
    { id: 'middle', name: 'VFXProject', deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'manager' } },
    { id: 'active', name: 'GlowRibbon', status: 'running', runtimeStatus: 'running', sessionHierarchy: { parentId: 'middle' } },
    { id: 'sleep', name: 'Sleeping Child', deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'manager' } },
    { id: 'stopped', name: 'Stopped Child', status: 'exited', runtimeStatus: 'exited', sessionHierarchy: { parentId: 'manager' } },
    { id: 'archived', name: 'Archived Session', sidebarArchived: true, status: 'running', runtimeStatus: 'running' },
    { id: 'other', name: 'Other Team', projectId: 'q', status: 'running', runtimeStatus: 'running', sessionHierarchy: { parentId: 'manager' } },
  ].map(agent => ({ projectId: 'p', folder: directory, aiToolId: 'codex', status: 'idle', ...agent }));
  void app.whenReady().then(async () => {
    let win, service, exitCode = 0;
    const errors = [];
    try {
      const projects = [{ id: 'p', name: 'RnDHub', folder: directory }, { id: 'q', name: 'Other', folder: directory }];
      const providers = { chatProvider: async id => ({ sessionId: `fixture-${id}`, lifecycle: 'idle', blocks: [{ sequence: 1, role: 'assistant', kind: 'text', text: 'Session tree fixture.' }], artifacts: [] }) };
      const output = path.resolve(import.meta.dirname, '../../output/remote-session-tree'); await fs.mkdir(output, { recursive: true });
      for (const channel of ['remote', 'dashboard']) {
        service = channel === 'remote'
          ? new RemoteDashboardService({ baseDir: path.join(directory, channel), ...providers })
          : new LocalDashboardService({ baseDir: path.join(directory, channel), title: 'Session tree', defaultPort: 0, configName: 'dashboard.json', providers });
        const sync = agents => {
          const view = { language: 'en', projects, agents };
          if (channel === 'remote') { service.config.server_port = 0; service.syncView(view); service.syncAgents(agents); }
          else { service.config.enabled = true; service.config.serverPort = 0; service.sync({ view, agents }); }
        };
        sync(fixture()); const status = await service.start();
        for (const width of [1100, 390, 820]) {
          const agents = fixture(); sync(agents);
          win = new BrowserWindow({ show: false, width, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false } });
          win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
          await win.loadURL(`${status.url}/?agent=active`);
          await wait(win, `${row('active')}?.dataset.parentId === 'middle'`);
          assert.equal(await evaluate(win, `${row('active')}.dataset.depth`), '2');
          assert.equal(await evaluate(win, `${row('other')}.dataset.parentId || null`), null);
          assert.equal(await evaluate(win, `!!${row('archived')}`), false);
          await evaluate(win, `(() => {
            const pane = document.querySelector('#navigationPane');
            if (pane.getBoundingClientRect().right <= 0) document.querySelector('#sidebarToggle').click();
            pane.scrollTop += document.querySelector('#sessionList').getBoundingClientRect().top - pane.getBoundingClientRect().top - 160;
          })()`);
          await pause(200);
          await fs.writeFile(path.join(output, `${channel}-${width}.png`), (await win.webContents.capturePage()).toPNG());
          await evaluate(win, `${row('other')}.querySelector('.session-select').click()`);
          await evaluate(win, `${toggle('manager')}.click()`);
          await wait(win, `${toggle('manager')}?.getAttribute('aria-expanded') === 'false' && !${row('active')}`);
          await win.loadURL(win.webContents.getURL()); await wait(win, `${toggle('manager')}?.getAttribute('aria-expanded') === 'false'`);
          await evaluate(win, "document.querySelector('#searchInput').value='GlowRibbon';document.querySelector('#searchInput').dispatchEvent(new Event('input'))");
          await wait(win, `${row('active')}?.dataset.depth === '2' && !${row('sleep')} && !${row('other')}`);
          await evaluate(win, "document.querySelector('#searchInput').value='';document.querySelector('#searchInput').dispatchEvent(new Event('input'))");
          await wait(win, `${toggle('manager')}?.getAttribute('aria-expanded') === 'false'`);
          await evaluate(win, `${toggle('manager')}.click();document.querySelector('#filters [data-filter=active]').click()`);
          await wait(win, `!!${row('active')} && !!${row('manager')} && !${row('sleep')} && !${row('stopped')}`);
          agents[0].sidebarShowInactiveChildren = true; sync(agents);
          await evaluate(win, "document.querySelector('#refreshButton').click()");
          await wait(win, `!!${row('sleep')} && !!${row('stopped')}`);
          agents[2].sessionHierarchy = { parentId: 'manager', createdById: 'middle' }; sync(agents);
          await evaluate(win, "document.querySelector('#refreshButton').click()");
          await wait(win, `${row('active')}?.dataset.parentId === 'manager' && ${row('active')}?.dataset.depth === '1'`);
          await evaluate(win, "document.querySelector('#searchInput').value='Sleeping Child';document.querySelector('#searchInput').dispatchEvent(new Event('input'))");
          await wait(win, `!!${row('sleep')} && !!${row('manager')} && !${row('active')}`);
          await evaluate(win, "document.querySelector('#searchInput').value='';document.querySelector('#searchInput').dispatchEvent(new Event('input'));document.querySelector('#filters [data-filter=all]').click()");
          await wait(win, `!!${row('active')}`);
          await evaluate(win, "if(document.querySelector('#navigationPane').getBoundingClientRect().right <= 0)document.querySelector('#sidebarToggle').click()");
          await pause(200);
          assert(await evaluate(win, "document.documentElement.scrollWidth <= innerWidth + 1"), `${channel} ${width}: horizontal overflow`);
          await fs.writeFile(path.join(output, `${channel}-${width}-reparented.png`), (await win.webContents.capturePage()).toPNG());
          console.log('REMOTE_SESSION_FAMILIES_UI_OK', JSON.stringify({ channel, width, nesting: true, collapsePersistence: true, search: true, activeAncestors: true, inactiveChoice: true, reparent: true }));
          win.destroy(); win = null;
        }
        await service.stop(); service = null;
      }
      assert.deepEqual(errors, [], 'Renderer errors');
    } catch (error) { console.error(error?.stack || String(error)); exitCode = 1; }
    finally { win?.destroy(); await service?.stop(); app.exit(exitCode); }
  });
}
