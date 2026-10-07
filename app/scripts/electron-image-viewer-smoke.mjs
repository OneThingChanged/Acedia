import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, '..');
if (!process.versions.electron) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-image-viewer-'));
  try {
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(appRoot, 'scripts/fixtures/image-viewer-renderer.tsx')], bundle: true, jsx: 'automatic', define: { 'import.meta.env': '{}' }, outfile: path.join(directory, 'renderer.js') });
    await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;background:#0d1117;color:#c9d1d9}</style><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url), directory], { env, windowsHide: true, stdio: 'inherit' });
    const timeout = setTimeout(() => child.kill(), 60000);
    const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }).finally(() => clearTimeout(timeout));
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith('acedia-image-viewer-'));
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
} else {
  const { app, BrowserWindow } = require('electron');
  const directory = process.argv[2];
  app.setPath('userData', path.join(directory, 'profile'));
  app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  async function waitFor(win, expression) {
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(expression);
  }
  app.whenReady().then(async () => {
  try {
    for (const width of [1280, 640]) {
      const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
      await win.loadFile(path.join(directory, 'index.html'));
      await waitFor(win, "document.querySelectorAll('.chat-path-link').length===2");
      await win.webContents.executeJavaScript("document.querySelector('.chat-path-code').click()", true);
      await waitFor(win, "document.querySelector('.image-viewer-body img')?.naturalWidth===1600 && parseInt(document.querySelector('.image-viewer-fit').textContent)<100");
      const initial = await win.webContents.executeJavaScript("parseInt(document.querySelector('.image-viewer-fit').textContent)");
      await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"확대\"],[aria-label=\"Zoom in\"]').click()", true);
      await waitFor(win, `parseInt(document.querySelector('.image-viewer-fit').textContent)>${initial}`);
      const body = await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.image-viewer-body').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...body });
      win.webContents.sendInputEvent({ type: 'mouseMove', x: body.x + 75, y: body.y + 40 });
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: body.x + 75, y: body.y + 40 });
      await waitFor(win, "document.querySelector('.image-viewer-body img').style.transform.includes('75px, 40px')");
      const beforeWheel = await win.webContents.executeJavaScript("parseInt(document.querySelector('.image-viewer-fit').textContent)");
      await win.webContents.executeJavaScript("document.querySelector('.image-viewer-body').dispatchEvent(new WheelEvent('wheel',{deltaY:-120,clientX:300,clientY:300,bubbles:true,cancelable:true}))");
      await waitFor(win, `parseInt(document.querySelector('.image-viewer-fit').textContent)>${beforeWheel}`);
      await win.webContents.executeJavaScript("document.querySelector('[aria-label=\"이미지 복사\"],[aria-label=\"Copy image\"]').click()", true);
      await waitFor(win, "window.imageFixture.copies.length===1 && document.querySelector('.image-viewer-status')");
      assert(await win.webContents.executeJavaScript("window.imageFixture.copies[0].dataUrl.startsWith('data:image/png;base64,')"));
      await fs.mkdir(path.join(appRoot, '../output'), { recursive: true });
      await fs.writeFile(path.join(appRoot, `../output/image-viewer-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('.image-viewer-fit').click(); window.imageFixture.failCopy=true;document.querySelector('[aria-label=\"이미지 복사\"],[aria-label=\"Copy image\"]').click()", true);
      await waitFor(win, "document.querySelector('.image-viewer-status')?.textContent.match(/못했습니다|Could not/)");
      assert(await win.webContents.executeJavaScript("(()=>{const body=document.querySelector('.image-viewer-body').getBoundingClientRect();const image=document.querySelector('.image-viewer-body img').getBoundingClientRect();return image.width<=body.width && image.height<=body.height})()"), 'Fit reset must contain the whole image after status/path layout changes');
      assert(await win.webContents.executeJavaScript("document.querySelector('.image-viewer-body img').style.transform==='translate(0px, 0px) scale(1)'"));
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      await waitFor(win, "!document.querySelector('.image-viewer')");
      await win.webContents.executeJavaScript("document.querySelectorAll('.chat-path-link')[1].click()", true);
      await waitFor(win, "document.querySelector('.image-viewer-name')?.textContent==='preview.png'");
      assert(await win.webContents.executeJavaScript("window.imageFixture.opened.at(-1)==='K:/Exports/SummerSix-20261007/preview.png'"));
      win.destroy();
    }
    console.log('DESKTOP_CHAT_IMAGE_ZOOM_PAN_COPY_OK'); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  });
}
