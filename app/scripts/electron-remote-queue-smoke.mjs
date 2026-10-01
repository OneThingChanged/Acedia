import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalDashboardService, RemoteDashboardService } from '../electron/services/web-services.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-remote-queue-'));
const screenshots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.acedia/remote-queue-ui');
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
const services = [], windows = [];
const submissions = [], activations = [];
let agents, exitCode = 0;
const assert = (value, message) => { if (!value) throw new Error(message); };
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const timer = setTimeout(() => { console.error('Remote queue smoke timed out'); app.exit(1); }, 90_000);
const snapshot = () => ({ language: 'en', agents, view: {
  language: 'en', projects: [{ id: 'p1', name: 'Queue fixture', folder: root }], agents, groups: [],
} });
const providers = {
  chatProvider: async (id) => ({ sessionId: id, lifecycle: 'idle', blocks: [
    { sequence: 1, role: 'assistant', kind: 'text', text: 'Isolated queue fixture' },
  ] }),
  restartSession: async (id) => {
    activations.push(id);
    Object.assign(agents.find(agent => agent.id === id), { status: 'starting', runtimeStatus: 'starting' });
    return { ok: true };
  },
  submitPty: async (id, message) => {
    submissions.push({ id, message });
    if (id === 'failed') return false;
    if (id === 'unknown') throw new Error('Fixture outcome unknown');
    Object.assign(agents.find(agent => agent.id === id), { status: 'working', hook: { event: 'working' } });
    return true;
  },
  usageProvider: async () => ({ limits: [], profiles: [] }),
};

async function waitFor(win, expression) {
  for (let i = 0; i < 70; i++) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await pause(70);
  }
  throw new Error(`Queue condition failed: ${expression}`);
}
async function select(win, id) {
  await win.webContents.executeJavaScript(`document.querySelector('.session-row[data-agent-id="${id}"]').click()`);
  await waitFor(win, `document.querySelector('#detailName').textContent==='${id}'`);
}
async function send(win, message) {
  await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#messageInput');
    input.value = ${JSON.stringify(message)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#composerForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor(win, "document.querySelector('#messageInput').value===''");
}
async function state(win, id, status, runtimeStatus = 'running', hook = { event: status }) {
  Object.assign(agents.find(agent => agent.id === id), { status, runtimeStatus, hook });
  await win.webContents.executeJavaScript("document.querySelector('#refreshButton').click()");
  const display = ['starting', 'recovering'].includes(runtimeStatus) ? runtimeStatus : status === 'waiting' ? 'attention' : status;
  await waitFor(win, `document.querySelector('.session-row[data-agent-id="${id}"]').dataset.status==='${display}'`);
}
const retry = "document.querySelector('#composerQueue .composer-queue-retry')";
const queued = "!document.querySelector('#composerQueue').hidden";
const sent = (id) => submissions.filter(item => item.id === id);
async function advance(win) {
  await win.webContents.executeJavaScript('window.queueClockOffset += 31_000');
  await pause(700);
}
async function capture(win, name) {
  await waitFor(win, "document.querySelector('#toast').hidden");
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 220))))');
  fs.writeFileSync(path.join(screenshots, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}

void app.whenReady().then(async () => {
  try {
    fs.mkdirSync(screenshots, { recursive: true });
    const remote = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), stateProvider: snapshot, ...providers });
    remote.config.server_port = 0;
    const dashboard = new LocalDashboardService({ title: 'Queue fixture', defaultPort: 0, configName: 'dashboard.json',
      baseDir: path.join(root, 'dashboard'), stateProvider: snapshot, providers });
    services.push(remote, dashboard);
    for (const [name, service] of [['remote', remote], ['dashboard', dashboard]]) {
      const { url } = await service.start();
      for (const width of [1280, 375]) {
        console.log('Remote queue', name, width);
        submissions.length = 0; activations.length = 0;
        agents = ['long', 'late', 'question', 'fifo', 'failed', 'unknown', 'legacy'].map(id => ({
          id, name: id, projectId: 'p1', aiToolId: width === 375 ? 'claude' : 'codex', status: 'offline', runtimeStatus: 'idle',
        }));
        const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: {
          sandbox: true, contextIsolation: true, backgroundThrottling: false,
        } });
        windows.push(win);
        const errors = [];
        win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
        await win.loadURL(`${url}/?agent=long`);
        await waitFor(win, "document.querySelector('#detailName').textContent==='long'");
        await win.webContents.executeJavaScript(`(() => {
          window.queueClockOffset = 0;
          const originalNow = Date.now.bind(Date);
          Date.now = () => originalNow() + window.queueClockOffset;
          document.querySelector('#sessionMode [data-mode=chat]').click();
        })()`);

        await send(win, 'after long turn');
        await waitFor(win, queued);
        await state(win, 'long', 'working');
        await advance(win);
        assert(!await win.webContents.executeJavaScript(retry), 'A live long-running turn was treated as activation timeout');
        assert(sent('long').length === 0, 'Queued text was injected into a running turn');
        await state(win, 'long', 'done');
        await waitFor(win, `!(${queued})`);
        assert(sent('long').length === 1, 'Completed long turn did not release its queued message exactly once');

        await select(win, 'late');
        await send(win, 'after late activation');
        await advance(win);
        await waitFor(win, retry);
        await waitFor(win, "document.querySelector('#detailName').textContent==='late' && document.querySelector('#composerQueue').textContent.includes('Session startup is delayed')");
        await capture(win, `${name}-${width}-startup-delay`);
        assert(sent('late').length === 0, 'A timed-out inactive session received input');
        await state(win, 'late', 'done', 'starting');
        assert(await win.webContents.executeJavaScript(retry), 'Stale Done metadata incorrectly cleared a startup timeout');
        await state(win, 'late', 'starting', 'running');
        assert(await win.webContents.executeJavaScript(retry), 'Starting work status incorrectly cleared a startup timeout');
        await state(win, 'late', 'working');
        await waitFor(win, `!(${retry})`);
        assert(sent('late').length === 0, 'Late activation submitted during a running turn');
        await state(win, 'late', 'done');
        await waitFor(win, `!(${queued})`);
        assert(sent('late').length === 1 && activations.filter(id => id === 'late').length === 1,
          'Late recovery required reactivation or duplicated a message');

        await select(win, 'question');
        await send(win, 'after answer');
        await state(win, 'question', 'waiting');
        await advance(win);
        assert(!await win.webContents.executeJavaScript(retry) && sent('question').length === 0,
          'A live question expired or received a queued instruction');
        await state(win, 'question', 'done');
        await waitFor(win, `!(${queued})`);
        assert(sent('question').length === 1, 'Resolved question did not release its queue');

        await select(win, 'legacy');
        await send(win, 'without runtime metadata');
        await state(win, 'legacy', 'working', null);
        await advance(win);
        assert(!await win.webContents.executeJavaScript(retry), 'Legacy running status did not finish activation');
        await state(win, 'legacy', 'done', null);
        await waitFor(win, `!(${queued})`);
        assert(sent('legacy').length === 1, 'Legacy status queue did not resume');

        await select(win, 'fifo');
        await state(win, 'fifo', 'working');
        await send(win, 'first in order'); await send(win, 'second in order');
        await select(win, 'long');
        await state(win, 'fifo', 'done');
        for (let i = 0; i < 60 && sent('fifo').length < 1; i++) await pause(70);
        await state(win, 'fifo', 'working');
        await pause(1400);
        assert(sent('fifo').length === 1, 'Queue ignored session isolation or busy state');
        await state(win, 'fifo', 'done');
        for (let i = 0; i < 60 && sent('fifo').length < 2; i++) await pause(70);
        assert(sent('fifo').map(item => item.message).join('|') === 'first in order|second in order', 'Queue lost FIFO order');

        for (const id of ['failed', 'unknown']) {
          await select(win, id);
          await state(win, id, 'working');
          await send(win, `${id} must remain paused`);
          await state(win, id, 'done');
          await waitFor(win, retry);
          await state(win, id, 'working'); await state(win, id, 'done');
          await pause(700);
          assert(sent(id).length === 1 && await win.webContents.executeJavaScript(queued),
            'Activation recovery automatically retried a failed or unknown submission');
        }
        assert(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'), 'Queue overflowed the viewport');
        if (width < 800) {
          win.setSize(844, 480);
          await pause(200);
          assert(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'), 'Queue overflowed in landscape');
          await capture(win, `${name}-844-uncertain`);
        }
        assert(errors.length === 0, `Renderer errors: ${errors.join('; ')}`);
        win.destroy();
      }
    }
    console.log('REMOTE_DASHBOARD_QUEUE_OK long-turn late-activation question fifo session-isolation legacy-state failed-unknown-paused desktop mobile codex claude');
  } catch (error) { console.error(error); exitCode = 1; }
  finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    for (const service of services) await service.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-remote-queue-')) throw new Error('Unexpected cleanup path');
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Isolated Chromium profile may briefly be held. */ }
    app.exit(exitCode);
  }
});
