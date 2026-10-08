import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LocalDashboardService, RemoteDashboardService } from "../electron/services/web-services.mjs";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const emptyZip = "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==";

async function waitFor(win, expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await delay(80);
  }
  throw Error(`Remote attachment UI timeout: ${expression}`);
}

async function exercise(BrowserWindow, directory, kind, width) {
  const submissions = [];
  const agent = { id: "attachment-fixture", name: "ZIP 첨부 확인", projectId: "p", aiToolId: "codex", status: "running",
    hook: { event: "done", received_at: Date.now() } };
  const view = { language: "ko", projects: [{ id: "p", name: "Attachment fixture", folder: directory }], agents: [agent] };
  const providers = { chatProvider: async () => ({ sessionId: "fixture", blocks: [], lifecycle: "idle", missing: false }),
    submitPty: async (id, message) => { submissions.push({ id, message }); return true; } };
  const baseDir = path.join(directory, `${kind}-${width}`);
  const web = kind === "Remote" ? new RemoteDashboardService({ baseDir, ...providers })
    : new LocalDashboardService({ baseDir, title: "Attachment fixture", defaultPort: 0, configName: "dashboard.json",
      stateProvider: () => ({ pwa: true, agents: [agent], view }), providers });
  if (kind === "Remote") { web.config.server_port = 0; web.syncView(view); web.syncAgents([agent]); }
  const { url } = await web.start();
  const win = new BrowserWindow({ width, height: 850, show: false, useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on("console-message", event => {
    if (event.level === "error" && !/Failed to load resource:.*status of 415\b/.test(event.message)) errors.push(event.message);
  });
  try {
    await win.loadURL(url + "/?agent=attachment-fixture&view=chat");
    await waitFor(win, "document.querySelector('#detailName')?.textContent.includes('ZIP 첨부 확인') && !document.querySelector('#attachmentButton').disabled");
    assert(await win.webContents.executeJavaScript("document.querySelector('#attachmentInput').accept.includes('.zip')"));
    await win.webContents.executeJavaScript(`(() => {
      window.attachmentUploads = [];
      const original = window.fetch.bind(window);
      window.fetch = async (url, options) => {
        const response = await original(url, options);
        if (url === '/api/attachment') {
          const body = JSON.parse(options.body);
          const result = await response.clone().json();
          window.attachmentUploads.push({ name: body.name, type: body.type,
            dataMime: body.data.slice(0, body.data.indexOf(';')), status: response.status, ...result });
        }
        return response;
      };
    })()`);
    // Select a real ZIP through Chromium's file input. Its uncompressed payload
    // is larger than the previous image and JSON request limits.
    win.webContents.debugger.attach("1.3");
    const { root } = await win.webContents.debugger.sendCommand("DOM.getDocument");
    const { nodeId } = await win.webContents.debugger.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: "#attachmentInput" });
    await win.webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: [path.join(directory, "자료 묶음.zip")] });
    await waitFor(win, "window.attachmentUploads.length === 1 && !document.querySelector('#sendButton').disabled");
    const large = await win.webContents.executeJavaScript("window.attachmentUploads[0]");
    assert.equal(large.status, 201); assert.equal(large.type, "application/zip");
    assert.equal(large.dataMime, "data:application/zip");
    assert(large.size > 8 * 1024 * 1024);
    assert(fs.readFileSync(large.path).equals(fs.readFileSync(path.join(directory, "자료 묶음.zip"))));
    // Drop an image alongside a Windows ZIP MIME variant, then paste a ZIP
    // whose browser MIME is empty. These use the actual composer event handlers.
    await win.webContents.executeJavaScript(`(() => {
      const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
      const dropped = new DataTransfer();
      dropped.items.add(new File([bytes(${JSON.stringify(emptyZip)})], '드롭 자료.zip', {type:'application/x-zip-compressed'}));
      dropped.items.add(new File([bytes(${JSON.stringify(png)})], '미리보기.png', {type:'image/png'}));
      document.querySelector('#composerForm').dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:dropped }));
      const clipboard = new DataTransfer();
      clipboard.items.add(new File([bytes(${JSON.stringify(emptyZip)})], '붙여넣기.zip', {type:''}));
      document.querySelector('#messageInput').dispatchEvent(new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData:clipboard }));
    })()`);
    await waitFor(win, "window.attachmentUploads.length === 4 && document.querySelectorAll('.composer-attachment').length === 4 && !document.querySelector('#sendButton').disabled && document.querySelector('.composer-attachment img')?.naturalWidth > 0");
    assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.composer-attachment-file').length"), 3);
    const uploaded = await win.webContents.executeJavaScript("window.attachmentUploads");
    assert(uploaded.every(file => file.status === 201));
    assert(uploaded.filter(file => file.name.endsWith('.zip')).every(file => file.type === 'application/zip' && file.dataMime === 'data:application/zip'));
    const layout = await win.webContents.executeJavaScript(`(() => {
      const composer = document.querySelector('#composerForm').getBoundingClientRect();
      return { visible: composer.top >= 0 && composer.bottom <= innerHeight + 1, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    })()`);
    assert(layout.visible && !layout.overflow, `${kind} ${width}px composer overflow`);
    fs.mkdirSync(path.resolve(appRoot, "../output"), { recursive: true });
    fs.writeFileSync(path.resolve(appRoot, `../output/remote-zip-${kind.toLowerCase()}-${width}.png`), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(() => {
      const transfer = new DataTransfer();transfer.items.add(new File(['ignored'], 'fifth.zip', {type:'application/zip'}));
      document.querySelector('#composerForm').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:transfer}));
    })()`);
    assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.composer-attachment').length"), 4);
    assert.equal(await win.webContents.executeJavaScript("window.attachmentUploads.length"), 4);
    // Removing a ZIP leaves the other files in the draft and releases one slot.
    await win.webContents.executeJavaScript("[...document.querySelectorAll('.composer-attachment-remove')].at(-1).click()");
    assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.composer-attachment').length"), 3);
    await win.webContents.executeJavaScript(`(() => {
      const invalid = new DataTransfer();invalid.items.add(new File(['MZ'], 'rejected.exe', {type:'application/octet-stream'}));
      document.querySelector('#composerForm').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:invalid}));
      const oversized = new DataTransfer();oversized.items.add(new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'large.zip', {type:'application/zip'}));
      document.querySelector('#composerForm').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:oversized}));
    })()`);
    assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.composer-attachment').length"), 3);
    assert.equal(await win.webContents.executeJavaScript("window.attachmentUploads.length"), 4);
    await win.webContents.executeJavaScript(`(() => {
      const invalid = new DataTransfer();invalid.items.add(new File(['not a ZIP'], 'spoof.zip', {type:'application/zip'}));
      document.querySelector('#composerForm').dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:invalid}));
    })()`);
    await waitFor(win, "window.attachmentUploads.length === 5 && !!document.querySelector('.composer-attachment.error')");
    assert.equal(await win.webContents.executeJavaScript("window.attachmentUploads.at(-1).status"), 415);
    await win.webContents.executeJavaScript("document.querySelector('.composer-attachment.error .composer-attachment-remove').click(); document.querySelector('#sendButton').click()");
    await waitFor(win, "document.querySelector('#composerAttachments').hidden");
    assert.equal(submissions.length, 1);
    const image = uploaded.find(file => file.type === "image/png");
    const zips = [large, uploaded.find(file => file.name === "드롭 자료.zip")];
    assert.deepEqual(submissions[0], { id: agent.id, message: `첨부 이미지:\n"${image.path}"\n\n첨부 파일:\n${zips.map(file => `"${file.path}"`).join("\n")}` });
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`REMOTE_ZIP_ATTACHMENT_OK ${kind} ${width}px (9MB ZIP, picker, drop, paste, MIME normalization, PNG preview, limits, spoof rejection, file-only submit)`);
  } finally { if (!win.isDestroyed()) win.destroy(); await web.stop(); }
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require("electron");
  const directory = process.argv[2];
  app.setPath("userData", path.join(directory, "profile"));
  app.disableHardwareAcceleration();
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
    try {
      for (const kind of ["Remote", "Dashboard"]) for (const width of [1024, 390]) await exercise(BrowserWindow, directory, kind, width);
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-remote-attachments-"));
  const env = { ...process.env, ACEDIA_REMOTE_ATTACHMENT_FIXTURE: directory }; delete env.ELECTRON_RUN_AS_NODE;
  try {
    fs.writeFileSync(path.join(directory, "content.txt"), Buffer.alloc(9 * 1024 * 1024, 65));
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Compress-Archive -LiteralPath (Join-Path $env:ACEDIA_REMOTE_ATTACHMENT_FIXTURE 'content.txt') -DestinationPath (Join-Path $env:ACEDIA_REMOTE_ATTACHMENT_FIXTURE '자료 묶음.zip') -CompressionLevel NoCompression"],
    { env, windowsHide: true, timeout: 20000, stdio: "pipe" });
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url), directory], { env, windowsHide: true, stdio: "inherit" });
    const timer = setTimeout(() => child.kill(), 90000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw Error(`Remote ZIP attachment smoke failed: ${code}`);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-remote-attachments-")) throw Error("Unexpected attachment smoke cleanup path");
    fs.rmSync(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
}
