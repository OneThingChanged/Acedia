import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";

const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-remote-html-ui-"));
  let code = 1;
  try {
    code = await new Promise((resolve, reject) => {
      const child = spawn(require("electron"), [fileURLToPath(import.meta.url), fixtureRoot], { env, windowsHide: true, stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", code => resolve(code ?? 1));
    });
  } finally {
    if (path.dirname(fixtureRoot) !== path.resolve(os.tmpdir()) || !path.basename(fixtureRoot).startsWith("acedia-remote-html-ui-")) {
      throw new Error("Unexpected fixture cleanup path");
    }
    fs.rmSync(fixtureRoot, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
  process.exit(code);
}
const { app, BrowserWindow, nativeImage } = require("electron");
const root = process.argv[2];
assert(root && path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("acedia-remote-html-ui-"), "Run this smoke with Node");
app.setPath("userData", path.join(root, "profile"));
app.on("window-all-closed", () => {});
const windows = [];
const preferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false };
const largeName = "roadmap.html";
const overName = "roadmap-over-limit.html";
let service;
let exitCode = 0;
const timer = setTimeout(() => { console.error("Remote HTML smoke timed out"); app.exit(1); }, 120_000);

async function waitFor(win, expression) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!win.isDestroyed() && await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`UI condition failed: ${expression}`);
}

async function createRemoteWindow(url, width, height, native = false) {
  const win = new BrowserWindow({ width, height, show: false, webPreferences: preferences });
  windows.push(win);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await win.loadURL(`${url}/?agent=a1`);
  await waitFor(win, "document.querySelector('#detailName')?.textContent.includes('HTML session')");
  await win.webContents.executeJavaScript(`
    window.__previewRequests=[];
    window.__nativePreviewUrls=[];
    window.__holdPreviewIssue=false;
    window.__MULTIAGENT_NATIVE_EXTERNAL_PREVIEW__=${native};
    ${native ? `window.ReactNativeWebView={postMessage(raw){const message=JSON.parse(raw);if(message.type==='multiagent:open-external-preview') window.__nativePreviewUrls.push(message.url);}};` : ""}
    const originalFetch=window.fetch.bind(window);
    window.fetch=async (input,options) => {
      if(String(input).startsWith('/api/docs/preview?')) {
        window.__previewRequests.push(String(input));
        if(window.__holdPreviewIssue) await new Promise(resolve => {window.__releasePreviewIssue=resolve;});
        else await new Promise(resolve => setTimeout(resolve,800));
      }
      return originalFetch(input,options);
    };
    document.querySelector('#sessionMode [data-mode=chat]').click();
  `);
  await waitFor(win, `document.querySelector('.chat-file-link[data-chat-file-path="${largeName}"]')`);
  return win;
}

const clickFile = (name) => `document.querySelector('.chat-file-link[data-chat-file-path="${name}"]').click()`;

async function verifyPreview(win) {
  await waitFor(win, "document.title==='Roadmap ready' && document.querySelector('#fixtureImage')?.naturalWidth===1");
  const result = await win.webContents.executeJavaScript(`(() => {
    document.querySelector('#check').click();
    let storageBlocked=false;
    try { localStorage.setItem('preview-fixture','x'); } catch { storageBlocked=true; }
    return { heading:document.querySelector('h1').textContent, button:document.querySelector('#check').textContent,
      color:getComputedStyle(document.querySelector('h1')).color,
      storageBlocked, opener:window.opener===null, node:typeof require, bridge:typeof window.multiAgentElectron };
  })()`);
  assert.deepEqual(result, { heading: "로드맵", button: "Clicked", color: "rgb(80, 223, 208)", storageBlocked: true, opener: true, node: "undefined", bridge: "undefined" });
}

async function saveOversizedDownload(win, expected) {
  const target = path.join(root, `download-${windows.length}.html`);
  await new Promise((resolve, reject) => {
    const session = win.webContents.session;
    const cleanup = () => { clearTimeout(timeout); session.off("will-download", listener); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Oversized HTML download did not complete")); }, 15000);
    const listener = (_event, item, contents) => {
      if (contents !== win.webContents) return;
      session.off("will-download", listener);
      try {
        assert.equal(item.getFilename(), overName);
        item.setSavePath(target);
        item.once("done", (_event, state) => { cleanup(); state === "completed" ? resolve() : reject(new Error(`Download ${state}`)); });
      } catch (error) { cleanup(); reject(error); }
    };
    session.on("will-download", listener);
    void win.webContents.executeJavaScript("document.querySelector('#filePreviewDownload').click()", true).catch(error => { cleanup(); reject(error); });
  });
  assert(fs.readFileSync(target).equals(expected), "Oversized HTML source bytes changed");
}

async function capturePreview(win, filename) {
  // Let the hidden offscreen compositor paint the newly opened dialog.
  await new Promise(resolve => setTimeout(resolve, 200));
  const layout = await win.webContents.executeJavaScript(`(() => {
    const rect=document.querySelector('.file-preview-dialog').getBoundingClientRect();
    const header=document.querySelector('.file-preview-head').getBoundingClientRect();
    return {viewportWidth:innerWidth,viewportHeight:innerHeight,top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,headerTop:header.top};
  })()`);
  assert(layout.top>=0 && layout.bottom<=layout.viewportHeight+1 && layout.left>=0 && layout.right<=layout.viewportWidth+1,
    `Preview dialog clipped: ${JSON.stringify(layout)}`);
  fs.writeFileSync(filename, (await win.webContents.capturePage()).toPNG());
}

void app.whenReady().then(async () => {
  try {
    const project = path.join(root, "project");
    const docs = path.join(project, "docs");
    fs.mkdirSync(docs, { recursive: true });
    const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lhDAZQAAAABJRU5ErkJggg==";
    const results = path.join(root, 'SummerSix-20261007');
    fs.mkdirSync(path.join(results, 'Viessa'), { recursive: true });
    const previewBitmap = Buffer.alloc(1600 * 1000 * 4);
    for (let index = 0; index < previewBitmap.length; index += 4) { previewBitmap[index] = 80; previewBitmap[index + 1] = 170; previewBitmap[index + 2] = 50 + Math.floor(index / 4 / 1600) % 150; previewBitmap[index + 3] = 255; }
    fs.writeFileSync(path.join(results, 'Six_Outfits_Render.png'), nativeImage.createFromBitmap(previewBitmap, { width:1600, height:1000 }).toPNG());
    fs.writeFileSync(path.join(results, 'export.fbx'), 'fixture FBX');
    const source = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<link rel="stylesheet" href="/assets/roadmap.css"></head><body><h1>로드맵</h1>'
      + `<img id="fixtureImage" src="data:image/png;base64,${image}"><button id="check" onclick="this.textContent='Clicked'">Check</button>`
      + '<!--' + "embedded document fixture ".repeat(340_000) + '--><script src="roadmap.js"></script></body></html>';
    assert(Buffer.byteLength(source) > 8 * 1024 * 1024);
    fs.writeFileSync(path.join(docs, largeName), source);
    fs.writeFileSync(path.join(docs, "roadmap.js"), "document.title='Roadmap ready';");
    fs.mkdirSync(path.join(project, "assets"));
    fs.writeFileSync(path.join(project, "assets", "roadmap.css"), "body{font-family:system-ui;padding:20px}h1{color:#50dfd0}");
    const oversized = Buffer.alloc(32 * 1024 * 1024 + 1, 32);
    fs.writeFileSync(path.join(docs, overName), oversized);
    service = new RemoteDashboardService({ baseDir: path.join(root, "service"), chatProvider: async () => ({
      sessionId: "fixture", blocks: [{ sequence: 1, role: "assistant", kind: "text", text: `[결과 폴더](${results.replaceAll('\\', '/')})\n\n\`${largeName}\`\n\n\`${overName}\`` }],
    }) });
    service.config.server_port = 0;
    service.syncView({ language: "ko", projects: [{ id: "p1", name: "Roadmap fixture", folder: project }],
      agents: [{ id: "a1", projectId: "p1", folder: docs, aiToolId: "codex" }] });
    service.syncAgents([{ id: "a1", name: "HTML session", projectId: "p1", tool: "codex", status: "done" }]);
    const { url } = await service.start();
    const output = path.resolve("../output");
    fs.mkdirSync(output, { recursive: true });

    for (const [width, height] of [[375, 812], [844, 375], [1280, 850]]) {
      const win = await createRemoteWindow(url, width, height, true);
      await win.webContents.executeJavaScript("document.querySelector('[data-chat-file-kind=folder]').click()", true);
      await waitFor(win, "document.querySelector('.chat-folder-list')?.textContent.includes('Six_Outfits_Render.png')");
      assert(await win.webContents.executeJavaScript("document.querySelector('.chat-folder-list').textContent.includes('export.fbx')"));
      await capturePreview(win, path.join(output, `remote-result-folder-${width}.png`));
      await win.webContents.executeJavaScript("[...document.querySelectorAll('.chat-folder-list button')].find(b=>b.textContent.includes('Viessa')).click()", true);
      await waitFor(win, "document.querySelector('#filePreviewMessage').textContent.includes('폴더가 비어')");
      await win.webContents.executeJavaScript("document.querySelector('[data-folder-back]').click()", true);
      await waitFor(win, "document.querySelector('.chat-folder-list')?.textContent.includes('Six_Outfits_Render.png')");
      await win.webContents.executeJavaScript("[...document.querySelectorAll('.chat-folder-list button')].find(b=>b.textContent.includes('Six_Outfits_Render.png')).click()", true);
      await waitFor(win, "!document.querySelector('#filePreviewImageWrap').hidden && document.querySelector('#filePreviewImage').naturalWidth>0");
      await new Promise(resolve => setTimeout(resolve, 200));
      const initialScale = await win.webContents.executeJavaScript("Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)");
      assert(initialScale > 0 && initialScale < 1);
      await win.webContents.executeJavaScript("document.querySelector('[data-image-zoom=in]').click()", true);
      await waitFor(win, `Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)>${initialScale}`);
      await win.webContents.executeJavaScript("document.querySelector('[data-image-zoom=out]').click()", true);
      assert(Math.abs(await win.webContents.executeJavaScript("Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)") - initialScale) < 0.001);
      const point = await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('#filePreviewImageWrap').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
      await win.webContents.executeJavaScript(`document.querySelector('#filePreviewImageWrap').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:${point.x},clientY:${point.y},cancelable:true}))`);
      await waitFor(win, `Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)>${initialScale}`);
      const beforePan = await win.webContents.executeJavaScript("Number(document.querySelector('#filePreviewImageWrap').dataset.imagePanX)");
      win.webContents.sendInputEvent({ type:'mouseDown', button:'left', clickCount:1, ...point });
      win.webContents.sendInputEvent({ type:'mouseMove', x:point.x+60, y:point.y+30 });
      win.webContents.sendInputEvent({ type:'mouseUp', button:'left', clickCount:1, x:point.x+60, y:point.y+30 });
      await waitFor(win, `Math.abs(Number(document.querySelector('#filePreviewImageWrap').dataset.imagePanX)-(${beforePan})-60)<0.01`);
      const beforePinch = await win.webContents.executeJavaScript("Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)");
      win.webContents.debugger.attach('1.3');
      try {
        const touchPoints = distance => [{ x:point.x-distance, y:point.y, id:1 }, { x:point.x+distance, y:point.y, id:2 }];
        await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:touchPoints(25) });
        await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:touchPoints(65) });
        await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
      } finally { win.webContents.debugger.detach(); }
      await waitFor(win, `Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)>${beforePinch}`);
      await capturePreview(win, path.join(output, `remote-image-zoom-${width}.png`));
      await win.webContents.executeJavaScript("document.querySelector('[data-image-zoom=fit]').click()", true);
      await waitFor(win, "Number(document.querySelector('#filePreviewImageWrap').dataset.imagePanX)===0");
      assert(Math.abs(await win.webContents.executeJavaScript("Number(document.querySelector('#filePreviewImageWrap').dataset.imageScale)") - initialScale) < 0.001);
      await win.webContents.executeJavaScript("document.querySelector('#filePreviewClose').click()", true);
      assert(await win.webContents.executeJavaScript("document.querySelector('#filePreviewImageTools').hidden"));
      await win.webContents.executeJavaScript(`window.__holdPreviewIssue=true; ${clickFile(largeName)}`, true);
      await waitFor(win, "document.querySelector('#filePreviewMessage').getAttribute('aria-busy')==='true'");
      assert(await win.webContents.executeJavaScript("!document.querySelector('#filePreviewOverlay').hidden && getComputedStyle(document.querySelector('#filePreviewMessage'),'::before').content==='\"\"'"), "HTML loading indicator missing");
      await capturePreview(win, path.join(output, `remote-html-loading-${width}.png`));
      await win.webContents.executeJavaScript("window.__holdPreviewIssue=false; window.__releasePreviewIssue()");
      await waitFor(win, "window.__nativePreviewUrls.length===1 && document.querySelector('#filePreviewOverlay').hidden");
      const previewUrl = await win.webContents.executeJavaScript("window.__nativePreviewUrls[0]");
      assert.equal(new URL(previewUrl).origin, url);
      assert.match(new URL(previewUrl).pathname, /^\/preview\/[A-Za-z0-9_-]{43}\/docs\/roadmap\.html$/);
      assert(await win.webContents.executeJavaScript("window.__previewRequests[0].includes('agentId=a1') && window.__previewRequests[0].includes('format=json')"));
      const preview = new BrowserWindow({ width, height, show: false, webPreferences: preferences });
      windows.push(preview);
      await preview.loadURL(previewUrl);
      await verifyPreview(preview);
      preview.destroy();

      await win.webContents.executeJavaScript(clickFile(overName), true);
      await waitFor(win, "document.querySelector('#filePreviewMessage').textContent.includes('32MiB') && document.querySelector('#filePreviewMessage').getAttribute('aria-busy')==='false'");
      assert(await win.webContents.executeJavaScript(`(() => {
        const header=document.querySelector('.file-preview-head'), button=document.querySelector('#filePreviewDownload');
        return !button.hidden && !button.disabled && button.getBoundingClientRect().height>=44 && header.scrollWidth<=header.clientWidth
          && document.querySelector('#filePreviewTitle').textContent==='${overName}' && document.querySelector('#filePreviewOpen').hidden;
      })()`), `Oversized download layout failed at ${width}px`);
      await capturePreview(win, path.join(output, `remote-html-oversized-${width}.png`));
      await saveOversizedDownload(win, oversized);
      assert(await win.webContents.executeJavaScript("window.__nativePreviewUrls.length===1 && !document.querySelector('#filePreviewOverlay').hidden && !document.querySelector('#filePreviewDownload').disabled"));

      await win.webContents.executeJavaScript(`document.querySelector('#filePreviewClose').click(); ${clickFile(largeName)}; document.querySelector('#filePreviewClose').click()`, true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert(await win.webContents.executeJavaScript("window.__nativePreviewUrls.length===1 && document.querySelector('#filePreviewOverlay').hidden"), "Cancelled preview opened later");
      console.log(`Remote HTML ${width}x${height}: loading, native bridge, 8MiB interactive preview, sandbox, oversized download and cancellation passed`);
      win.destroy();
    }

    const browser = await createRemoteWindow(url, 1280, 850);
    await browser.webContents.executeJavaScript(clickFile(largeName), true);
    await waitFor(browser, "!document.querySelector('#filePreviewOpen').hidden");
    assert(await browser.webContents.executeJavaScript("document.querySelector('#filePreviewMessage').getAttribute('aria-busy')==='false' && document.querySelector('#filePreviewOpen').rel==='noopener noreferrer'"), "Blocked popup had no safe fallback");
    browser.webContents.setWindowOpenHandler(() => ({ action: "allow", overrideBrowserWindowOptions: { show: false, webPreferences: preferences } }));
    const linkPopup = new Promise(resolve => browser.webContents.once("did-create-window", win => { windows.push(win); resolve(win); }));
    await browser.webContents.executeJavaScript("document.querySelector('#filePreviewOpen').click()", true);
    const fallback = await linkPopup;
    await verifyPreview(fallback);
    fallback.destroy();

    const openedPopup = new Promise(resolve => browser.webContents.once("did-create-window", win => { windows.push(win); resolve(win); }));
    await browser.webContents.executeJavaScript(clickFile(largeName), true);
    const popup = await openedPopup;
    await waitFor(popup, "document.body.textContent.includes('HTML을 불러오는 중')");
    await verifyPreview(popup);
    assert(await browser.webContents.executeJavaScript("document.querySelector('#filePreviewOverlay').hidden"), "Successful popup left loading blocked");
    assert.equal(popup.isVisible(), false);
    popup.destroy();
    browser.destroy();
    console.log("ACEDIA_REMOTE_LARGE_HTML_SMOKE_OK");
  } catch (error) { console.error(error.stack || error); exitCode = 1; }
  finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await service?.stop();
    app.exit(exitCode);
  }
});
