import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalDashboardService, RemoteDashboardService } from '../electron/services/web-services.mjs';
import { projectSessionRuntime } from '../electron/shared/session-state.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-session-filters-'));
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const services = [], windows = [], mutations = [];
let exitCode = 0, language = 'en', sessions;
const assert = (value, message) => { if (!value) throw new Error(message); };
const timer = setTimeout(() => { console.error('Session filter smoke timed out'); app.exit(1); }, 90000);
const fixture = () => [
  ...['running', 'working', 'waiting', 'blocked', 'done'].map(status => ({ id: status, status, runtimeStatus: 'running', live: true, projectId: 'active' })),
  ...['starting', 'recovering'].map(status => ({ id: status, status, runtimeStatus: status, live: false, projectId: 'active' })),
  ...['restored', 'suspended'].map(id => ({ id, status: 'idle', runtimeStatus: 'idle', deferredStart: true, resumeEligible: true, live: false, projectId: 'sleep' })),
  { id: 'never', status: 'idle', runtimeStatus: 'idle', deferredStart: true, resumeEligible: false, live: false, projectId: 'offline' },
  { id: 'deactivated', status: 'idle', runtimeStatus: 'idle', resumeEligible: false, live: false, projectId: 'offline' },
  ...['exited', 'unreachable'].map(status => ({ id: status, status, runtimeStatus: status, live: false, projectId: 'offline' })),
].map(session => ({ ...session, name: `Fixture ${session.id}`, aiToolId: 'codex', folder: path.join(root, session.projectId) }));
const view = () => ({ language, agents: sessions, projects: [
  { id: 'active', name: 'Active project', folder: path.join(root, 'active') },
  { id: 'sleep', name: 'Sleeping project', folder: path.join(root, 'sleep') },
  { id: 'offline', name: 'Offline project', folder: path.join(root, 'offline') },
] });
const snapshot = () => ({ remote: true, pwa: true, language, view: view(), agents: sessions.map(session => ({
  ...session, ...projectSessionRuntime(session, session.live), status: session.live ? session.status : 'offline',
  hook: session.live && ['working', 'waiting', 'done'].includes(session.status) ? { event: session.status } : null,
})) });
const usageProvider = () => ({ updatedAt: Date.now(), tokens: { totalTokens: 0 }, limits: [], profiles: [] });
const restartSession = id => { mutations.push(id); return true; };
async function waitFor(win, expression) {
  for (let i = 0; i < 75; i++) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(`Filter condition failed: ${expression}`);
}
async function click(win, filter) {
  await win.webContents.executeJavaScript(`document.querySelector('#filters [data-filter="${filter}"]').click()`);
}
const rowCount = "document.querySelectorAll('#sessionList .session-row').length";
const counts = "[...document.querySelectorAll('#filters .session-filter-count')].map(node=>Number(node.textContent)).join(',')";

void app.whenReady().then(async () => {
  try {
    for (const id of ['active', 'sleep', 'offline']) fs.mkdirSync(path.join(root, id));
    const remote = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), stateProvider: snapshot, usageProvider, restartSession });
    remote.config.server_port = 0;
    const dashboard = new LocalDashboardService({ title: 'Fixture Dashboard', defaultPort: 0, configName: 'dashboard.json', baseDir: path.join(root, 'dashboard'), stateProvider: snapshot, providers: { usageProvider, restartSession } });
    services.push(remote, dashboard);
    for (const [name, service] of [['remote', remote], ['dashboard', dashboard]]) {
      const { url } = await service.start();
      for (const width of [1280, 375]) {
        console.log('Session filters', name, width);
        sessions = fixture(); language = 'en';
        const win = new BrowserWindow({ width, height: 1000, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
        windows.push(win);
        const errors = [];
        win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
        await win.loadURL(url + '/?usage=1&filter=all');
        await waitFor(win, `${counts}==='13,7,2' && ${rowCount}===13`);
        assert(await win.webContents.executeJavaScript("[...document.querySelectorAll('#filters .session-filter-label')].map(node=>node.textContent).join(',')==='All,Active,Sleeping'"), 'Wrong filter labels');
        assert(await win.webContents.executeJavaScript("document.querySelectorAll('#filters button').length===3"), 'Old status buttons remain');
        if (width < 800) await win.webContents.executeJavaScript("if(document.querySelector('#sidebarToggle').getAttribute('aria-expanded')!=='true')document.querySelector('#sidebarToggle').click()");
        await click(win, 'active');
        await waitFor(win, `${rowCount}===7`);
        assert(await win.webContents.executeJavaScript("[...document.querySelectorAll('#sessionList .project-label')].map(node=>node.textContent).join(',')==='Active project'"), 'Active includes unrelated projects');
        assert(await win.webContents.executeJavaScript("['starting','recovering','working','waiting','blocked','done'].every(id=>document.querySelector('#sessionList [data-agent-id='+id+']'))"), 'Active lost initialization or work states');
        await click(win, 'sleeping');
        await waitFor(win, `${rowCount}===2`);
        assert(await win.webContents.executeJavaScript("[...document.querySelectorAll('#sessionList .session-row')].every(row=>row.dataset.status==='sleeping' && row.textContent.includes('Sleeping'))"), 'Sleeping labels missing');
        assert(await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.status-dot.sleeping')).animationName==='none' && getComputedStyle(document.querySelector('.status-dot.sleeping')).backgroundColor==='rgb(91, 188, 255)'"), 'Sleeping dot is not steady blue');
        assert(await win.webContents.executeJavaScript("[...document.querySelectorAll('#filters button')].every(button=>button.getBoundingClientRect().height>=44) && document.documentElement.scrollWidth<=innerWidth"), 'Filter touch targets or layout invalid');
        const output = fileURLToPath(new URL('../../.acedia/remote-session-filter-ui/', import.meta.url));
        fs.mkdirSync(output, { recursive: true });
        await win.webContents.executeJavaScript("document.querySelector('#filters').scrollIntoView({block:'center'})");
        await win.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,220))))");
        if (width < 800) assert(await win.webContents.executeJavaScript("document.querySelector('#sidebarToggle').getAttribute('aria-expanded')==='true' && document.querySelector('#navigationPane').getBoundingClientRect().left>=0"), 'Mobile drawer closed during filtering');
        fs.writeFileSync(path.join(output, `${name}-${width}.png`), (await win.webContents.capturePage()).toPNG());
        await win.webContents.executeJavaScript("const search=document.querySelector('#searchInput');search.value='Active project';search.dispatchEvent(new Event('input',{bubbles:true}))");
        await waitFor(win, `${rowCount}===0`);
        assert(await win.webContents.executeJavaScript(`${counts}==='13,7,2' && !document.querySelector('#resetSessionFilter').hidden`), 'Search changed global counts or lost reset');
        await win.webContents.executeJavaScript("document.querySelector('#resetSessionFilter').click()");
        await waitFor(win, `${rowCount}===13`);
        assert(await win.webContents.executeJavaScript("document.querySelector('#searchInput').value==='' && document.activeElement.dataset.filter==='all'"), 'Reset lost search or keyboard focus');
        await win.webContents.executeJavaScript("document.querySelector('#filters [data-filter=active]').focus()");
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
        await waitFor(win, `${rowCount}===7 && document.querySelector('#filters [data-filter=active]').getAttribute('aria-pressed')==='true'`);
        await click(win, 'sleeping');
        await win.loadURL(url + '/?usage=1');
        await waitFor(win, `${rowCount}===2 && document.querySelector('#filters [data-filter=sleeping]').getAttribute('aria-pressed')==='true'`);
        assert(await win.webContents.executeJavaScript("new URL(location.href).searchParams.get('filter')==='sleeping'"), 'Saved filter did not survive reopening');
        await win.loadURL(url + '/?usage=1&filter=recovering');
        await waitFor(win, `${rowCount}===7 && new URL(location.href).searchParams.get('filter')==='active'`);
        await click(win, 'sleeping');
        await click(win, 'active');
        await win.webContents.executeJavaScript('history.back()');
        await waitFor(win, `${rowCount}===2 && document.querySelector('#filters [data-filter=sleeping]').getAttribute('aria-pressed')==='true'`);
        const started = sessions.find(session => session.id === 'restored');
        Object.assign(started, { deferredStart: false, runtimeStatus: 'running', status: 'running', live: true });
        await waitFor(win, `${rowCount}===1 && ${counts}==='13,8,1'`);
        const suspended = sessions.find(session => session.id === 'working');
        Object.assign(suspended, { deferredStart: true, resumeEligible: true, runtimeStatus: 'idle', status: 'idle', live: false });
        await waitFor(win, `${rowCount}===2 && ${counts}==='13,7,2'`);
        language = 'ko';
        await waitFor(win, "document.documentElement.lang==='ko' && document.querySelector('#filters [data-filter=active] .session-filter-label').textContent==='Active'");
        if (width < 800) {
          win.setSize(844, 480);
          await win.webContents.executeJavaScript("new Promise(resolve=>setTimeout(resolve,150))");
          assert(await win.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth"), 'Landscape layout overflows');
        }
        assert(mutations.length === 0, 'Filtering activated a session');
        assert(errors.length === 0, `Renderer errors: ${errors.join('; ')}`);
        win.destroy();
      }
    }
    console.log('REMOTE_DASHBOARD_SESSION_FILTERS_OK labels counts classification search persistence legacy-links history keyboard transitions desktop phone landscape');
  } catch (error) { console.error(error); exitCode = 1; }
  finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    for (const service of services) await service.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-session-filters-')) throw new Error('Unexpected cleanup path');
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chromium can briefly retain its isolated profile. */ }
    app.exit(exitCode);
  }
});
