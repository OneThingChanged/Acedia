import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { inspect } from 'node:util';
import { RemoteDashboardService, LocalDashboardService } from '../electron/services/web-services.mjs';

const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-portrait-video-'));
  try {
    const env = { ...process.env, ACEDIA_PORTRAIT_VIDEO_FIXTURE: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 90000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, 'Portrait video smoke failed');
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('acedia-portrait-video-')) throw new Error('Invalid cleanup path');
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 150 });
  }
} else {
const { app, BrowserWindow } = require('electron');
const directory = process.env.ACEDIA_PORTRAIT_VIDEO_FIXTURE;
assert(directory, 'Missing isolated video fixture');
app.setPath('userData', path.join(directory, 'profile'));
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const timer = setTimeout(() => { console.error('Portrait video UI timed out'); app.exit(1); }, 90000);
const evaluate = (win, code) => win.webContents.executeJavaScript(code);
async function wait(win, code) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(win, code)) return;
    await pause(60);
  }
  throw new Error(`Video UI condition failed: ${code}`);
}
const makeWindow = (width, height) => new BrowserWindow({ show: false, width, height,
  webPreferences: { offscreen: true, backgroundThrottling: false } });

// Run after Electron is ready without blocking its readiness on module evaluation.
void app.whenReady().then(async () => {
  let win, service, exitCode = 0, stage = 'generate media';
  try {
    win = makeWindow(600, 800);
    await win.loadURL('about:blank');
    // Generate real tall and wide media in Chromium; no external encoder,
    // credentials, user project files or native window activation are needed.
    for (const [name, width, height] of [['portrait', 240, 960], ['landscape', 640, 360]]) {
      const bytes = await evaluate(win, `(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = ${width}; canvas.height = ${height};
        const context = canvas.getContext('2d');
        context.fillStyle = '#12374a'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#63e6d1'; context.fillRect(20, 20, canvas.width - 40, 20);
        context.fillStyle = '#e2ecf5'; context.fillRect(20, canvas.height - 40, canvas.width - 40, 20);
        const stream = canvas.captureStream(10), chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        const stopped = new Promise(resolve => { recorder.onstop = resolve; });
        recorder.ondataavailable = event => chunks.push(event.data);
        recorder.start();
        for (let frame = 0; frame < 8; frame++) {
          context.fillStyle = frame % 2 ? '#d5e9ef' : '#36718a';
          context.fillRect(20, 60, canvas.width - 40, 30);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        recorder.stop();
        await stopped; stream.getTracks().forEach(track => track.stop());
        return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
      })()`);
      await fs.writeFile(path.join(directory, `${name}.webm`), Buffer.from(bytes));
    }
    win.destroy(); win = null;
    const agent = { id: 'portrait-test', projectId: 'p', folder: directory, name: 'Video layout', aiToolId: 'claude', status: 'running' };
    const view = { language: 'en', projects: [{ id: 'p', name: 'Video layout', folder: directory }], agents: [agent] };
    const providers = { chatProvider: async () => ({ sessionId: 'portrait-fixture', lifecycle: 'idle',
      blocks: [{ sequence: 1, role: 'assistant', kind: 'text', text: '[Portrait](portrait.webm) · [Landscape](landscape.webm)' }], artifacts: [] }) };
    const output = path.resolve(import.meta.dirname, '../../output/portrait-video');
    await fs.mkdir(output, { recursive: true });
    for (const channel of ['remote', 'dashboard']) {
      service = channel === 'remote'
        ? new RemoteDashboardService({ baseDir: path.join(directory, channel), ...providers })
        : new LocalDashboardService({ baseDir: path.join(directory, channel), title: 'Video', defaultPort: 0, configName: 'dashboard.json', providers });
      if (channel === 'remote') { service.config.server_port = 0; service.syncView(view); service.syncAgents([agent]); }
      else { service.config.enabled = true; service.config.serverPort = 0; service.sync({ view, agents: [agent] }); }
      const status = await service.start();
      for (const [width, height] of [[1440, 1400], [1100, 850], [390, 850], [850, 390], [820, 1180]]) {
        stage = `${channel} ${width}x${height} load`;
        win = makeWindow(width, height);
        await win.loadURL(`${status.url}/?agent=${agent.id}`);
        await wait(win, "!!document.querySelector('[data-chat-file-path=\"portrait.webm\"]')");
        for (const name of ['portrait', 'landscape']) {
          stage = `${channel} ${width}x${height} ${name} playback`;
          await evaluate(win, `document.querySelector('[data-chat-file-path="${name}.webm"]').click()`);
          await wait(win, `(() => { const video = document.querySelector('#filePreviewVideo'); return !video.hidden && video.currentSrc.includes('${name}.webm') && video.readyState >= 2; })()`);
          await evaluate(win, "document.querySelector('#filePreviewVideo').play().catch(error => { throw new Error(error.name + ': ' + error.message); })");
          await wait(win, "document.querySelector('#filePreviewVideo').currentTime > 0");
          await evaluate(win, "document.querySelector('#filePreviewVideo').pause()");
          const layout = await evaluate(win, `(() => {
            const video = document.querySelector('#filePreviewVideo'), rect = video.getBoundingClientRect();
            const body = video.parentElement.getBoundingClientRect();
            return { controls: video.controls, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
              inside: rect.left >= body.left - 1 && rect.top >= body.top - 1 && rect.right <= body.right + 1
                && rect.bottom <= body.bottom + 1 && rect.bottom <= innerHeight,
              bottomReceivesInput: document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 12) === video,
              videoBottom: rect.bottom, bodyBottom: body.bottom };
          })()`);
          await fs.writeFile(path.join(output, `${channel}-${width}x${height}-${name}.png`), (await win.webContents.capturePage()).toPNG());
          assert(layout.controls && layout.inside && layout.bottomReceivesInput, `${channel} ${width}x${height} ${name}: ${JSON.stringify(layout)}`);
          assert.equal(layout.videoHeight > layout.videoWidth, name === 'portrait');
          await evaluate(win, "document.querySelector('#filePreviewClose').click()");
          assert.equal(await evaluate(win, "document.querySelector('#filePreviewVideo').hasAttribute('src')"), false);
          console.log('VIDEO_CONTROLS_IN_VIEW_OK', JSON.stringify({ channel, width, height, name, ...layout }));
        }
        win.destroy(); win = null;
      }
      await service.stop(); service = null;
    }
  } catch (error) { console.error(stage, error?.stack || inspect(error, { showHidden: true, depth: 3 })); exitCode = 1; }
  finally {
    clearTimeout(timer); win?.destroy(); await service?.stop();
    app.exit(exitCode);
  }
});
}
