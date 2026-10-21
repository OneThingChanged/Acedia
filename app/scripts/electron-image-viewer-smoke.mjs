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
  const { app, BrowserWindow, nativeImage } = require('electron');
  const directory = process.argv[2];
  app.setPath('userData', path.join(directory, 'profile'));
  app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  async function waitFor(win, expression) {
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const debug = await win.webContents.executeJavaScript("({text:document.body.innerText.slice(-1200),panes:[...document.querySelectorAll('.pane-slot,.pane-body,.term-host')].map(e=>({class:e.className,width:e.clientWidth,height:e.clientHeight})),clicks:window.imageFixture?.clicks?.slice(-5)})");
    throw new Error(expression + '\n' + JSON.stringify(debug));
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
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      await waitFor(win, "!document.querySelector('.image-viewer')");
      await win.webContents.executeJavaScript('window.imageFixture.failCopy=false;window.imageFixture.reveals=[];window.imageFixture.copies=[]');
      const ctrlClick = selector => win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}))`, true);
      const contextMenu = selector => win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-2,clientY:innerHeight-2}))`, true);
      const menuAction = index => win.webContents.executeJavaScript(`document.querySelectorAll('.image-context-menu button')[${index}].click()`, true);
      for (const selector of ['.chat-path-code', '.chat-path-link:not(.chat-path-code)', '.chat-image-open', '.chat-artifact']) {
        const count = await win.webContents.executeJavaScript('window.imageFixture.reveals.length');
        await ctrlClick(selector);
        await waitFor(win, `window.imageFixture.reveals.length===${count + 1}`);
        assert(await win.webContents.executeJavaScript("!document.querySelector('.image-viewer')"), 'Ctrl+click must reveal without opening a viewer');
      }
      await contextMenu('.chat-image-open');
      await waitFor(win, "document.querySelector('.image-context-menu')");
      assert(await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.image-context-menu').getBoundingClientRect();return r.right<=innerWidth && r.bottom<=innerHeight && r.left>=0 && r.top>=0})()"), 'Image menu must fit near the viewport corner');
      await menuAction(0);
      await waitFor(win, "window.imageFixture.copies.length===1 && !document.querySelector('.image-context-menu')");
      await win.webContents.executeJavaScript("document.querySelector('.chat-image-open').click()", true);
      await waitFor(win, "document.querySelector('.image-viewer-body img')?.naturalWidth===1600");
      await contextMenu('.image-viewer-body');
      await waitFor(win, "document.querySelector('.image-context-menu')");
      assert(await win.webContents.executeJavaScript("Number(getComputedStyle(document.querySelector('.image-context-menu')).zIndex) > Number(getComputedStyle(document.querySelector('.image-viewer-backdrop')).zIndex)"), 'Image context menu must be above the viewer');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      await waitFor(win, "!document.querySelector('.image-context-menu') && document.querySelector('.image-viewer')");
      await contextMenu('.image-viewer-body');
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await fs.writeFile(path.join(appRoot, `../output/image-context-menu-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await menuAction(0);
      await waitFor(win, "window.imageFixture.copies.length===2 && !document.querySelector('.image-context-menu')");
      const reveals = await win.webContents.executeJavaScript('window.imageFixture.reveals.length');
      await ctrlClick('.image-viewer-body');
      await waitFor(win, `window.imageFixture.reveals.length===${reveals + 1}`);
      assert(await win.webContents.executeJavaScript("document.querySelector('.image-viewer-body img').style.transform==='translate(0px, 0px) scale(1)'"), 'Ctrl+click must not pan the image');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      await waitFor(win, "!document.querySelector('.image-viewer')");
      await contextMenu('#data-only-image .chat-image-open');
      await waitFor(win, "document.querySelector('.image-context-menu')");
      assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('.image-context-menu button').length"), 2, 'Memory-only images must not offer a nonexistent file location');
      await menuAction(0);
      await waitFor(win, "window.imageFixture.copies.length===3 && !document.querySelector('.image-context-menu')");
      await contextMenu('.chat-artifact');
      await menuAction(0);
      await waitFor(win, "window.imageFixture.copies.length===4 && !document.querySelector('.image-context-menu')");
      assert.deepEqual(nativeImage.createFromDataURL(await win.webContents.executeJavaScript('window.imageFixture.copies.at(-1).dataUrl')).getSize(), { width: 1600, height: 1000 }, 'Copy must preserve original pixels rather than the preview size');
      const beforeMenuReveal = await win.webContents.executeJavaScript('window.imageFixture.reveals.length');
      await contextMenu('.chat-image-open');
      await menuAction(2);
      await waitFor(win, `window.imageFixture.reveals.length===${beforeMenuReveal + 1} && !document.querySelector('.image-context-menu')`);
      await contextMenu('.chat-image-open');
      await win.webContents.executeJavaScript('window.imageFixture.failCopy=true');
      await menuAction(0);
      await waitFor(win, "document.querySelector('.image-context-menu [role=alert]')");
      assert.equal(await win.webContents.executeJavaScript('window.imageFixture.copies.length'), 4, 'A failed copy must not report success');
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      await waitFor(win, "!document.querySelector('.image-context-menu')");
      await win.webContents.executeJavaScript("window.imageFixture.failCopy=false;window.imageFixture.mode('terminal')");
      await waitFor(win, "window.imageFixture.terminalReady() && document.querySelector('.xterm-screen')");
      const terminalClick = async (point, modifiers = [], button = 'left') => {
        win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
        await new Promise(resolve => setTimeout(resolve, 80));
        win.webContents.sendInputEvent({ type: 'mouseDown', button, clickCount: 1, modifiers, ...point });
        win.webContents.sendInputEvent({ type: 'mouseUp', button, clickCount: 1, modifiers, ...point });
      };
      for (const output of ['output/preview.png', 'file:///C:/Images/raincoat%20kitten%23one.png', '\x1b]8;;file:///C:/Images/generated.png\x1b\\generated image\x1b]8;;\x1b\\']) {
        await win.webContents.executeJavaScript(`window.imageFixture.seedTerminal(${JSON.stringify(output)})`);
        const point = await win.webContents.executeJavaScript('window.imageFixture.terminalPoint(0,4)');
        const before = await win.webContents.executeJavaScript('window.imageFixture.reveals.length');
        await terminalClick(point, ['control']);
        await waitFor(win, `window.imageFixture.reveals.length===${before + 1}`);
        assert(await win.webContents.executeJavaScript("!document.querySelector('.image-viewer')"));
        await terminalClick(point);
        await waitFor(win, "document.querySelector('.image-viewer-body img')?.naturalWidth===1600");
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
        await waitFor(win, "!document.querySelector('.image-viewer')");
        await terminalClick(point, [], 'right');
        await waitFor(win, "document.querySelector('.image-context-menu')");
        const copied = await win.webContents.executeJavaScript('window.imageFixture.copies.length');
        await menuAction(0);
        await waitFor(win, `window.imageFixture.copies.length===${copied + 1} && !document.querySelector('.image-context-menu')`);
      }
      await win.webContents.executeJavaScript("window.imageFixture.setTerminalPaste(true);window.imageFixture.seedTerminal('output/preview.png')");
      await terminalClick(await win.webContents.executeJavaScript('window.imageFixture.terminalPoint(0,4)'), [], 'right');
      await waitFor(win, "document.querySelector('.image-context-menu')");
      assert.equal(await win.webContents.executeJavaScript('window.imageFixture.pasteReads'), 0, 'Image menu must not paste into the CLI');
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
      await waitFor(win, "!document.querySelector('.image-context-menu')");
      await terminalClick(await win.webContents.executeJavaScript('window.imageFixture.terminalPoint(2,4)'), [], 'right');
      await waitFor(win, "window.imageFixture.pasteReads===1");
      assert(await win.webContents.executeJavaScript("!document.querySelector('.image-context-menu') && !document.querySelector('.ctx-menu')"), 'Plain-terminal right-click paste must remain available');
      await win.webContents.executeJavaScript('window.imageFixture.setTerminalPaste(false)');
      console.log('IMAGE_CONTEXT_COPY_CTRL_REVEAL_CHAT_AND_TERMINAL_OK ' + width);
      win.destroy();
    }
    console.log('DESKTOP_CHAT_IMAGE_ZOOM_PAN_COPY_OK'); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
  });
}
