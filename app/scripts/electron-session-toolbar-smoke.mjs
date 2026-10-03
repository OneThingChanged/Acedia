import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  const directory = process.env.ACEDIA_TOOLBAR_FIXTURE;
  app.setPath('userData', path.join(directory, 'profile'));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show:false, width:900, height:550, webPreferences:{offscreen:true,backgroundThrottling:false} });
    try {
      await win.loadFile(path.join(directory, 'index.html'));
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
      await new Promise(r => setTimeout(r, 1000));
      const result = await win.webContents.executeJavaScript(`(async () => {
        const check=(v,m)=>{if(!v)throw Error(m)}, wait=()=>new Promise(r=>setTimeout(r,150));
        const buttons=[...document.querySelectorAll('.pane-session-toolbar .session-icon-button')];
        check(buttons.length===4,'Expected recover, bell, workers and view icons');
        check(buttons.every(b=>b.querySelector('svg')&&b.getAttribute('aria-label')&&!b.textContent.trim()),'Visible text or missing accessible name');
        buttons[1].click(); await wait(); check(buttons[1].getAttribute('aria-pressed')==='false','Mute did not update');
        buttons[1].focus(); await wait(); check(getComputedStyle(buttons[1],'::after').content.includes('alerts off'),'Keyboard tooltip missing '+JSON.stringify({focused:document.activeElement?.outerHTML,content:getComputedStyle(buttons[1],'::after').content,tooltip:buttons[1].dataset.tooltip,disabled:buttons[1].disabled}));
        buttons[0].click(); await wait(); check(document.querySelector('.session-recovery'),'Recovery confirmation missing'); buttons[0].click();
        buttons[3].click(); await wait(); check(document.querySelector('.chat-view'),'Chat view did not open');
        check(document.querySelector('.tab .status-question')||document.querySelector('.status-question'),'Question marker missing');
        return 'SESSION_TOOLBAR_ICONS_TOOLTIP_MUTE_AND_CHAT_OK';
      })()`);
      console.log(result);
      await fs.mkdir(path.resolve(root,'../output'),{recursive:true});
      for (const [theme,width] of [['soft',900],['light',390]]) {
        win.setContentSize(width,550); await win.webContents.executeJavaScript(`window.toolbarFixture.theme('${theme}')`); await new Promise(r=>setTimeout(r,200));
        const point = await win.webContents.executeJavaScript(`(() => { const r=document.querySelectorAll('.session-icon-button')[1].getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
        win.webContents.sendInputEvent({ type:'mouseMove', ...point }); await new Promise(r=>setTimeout(r,200));
        await fs.writeFile(path.resolve(root,`../output/session-toolbar-${theme}.png`),(await win.webContents.capturePage()).toPNG());
      }
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
} else {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-toolbar-'));
  try {
    const { build }=await import('esbuild');
    await build({entryPoints:[path.join(root,'scripts/fixtures/session-toolbar-renderer.tsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},outfile:path.join(directory,'renderer.js')});
    await fs.writeFile(path.join(directory,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;width:100%;height:100%}</style><div id="root"></div><script src="renderer.js"></script>');
    const env={...process.env,ACEDIA_TOOLBAR_FIXTURE:directory}; delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{env,stdio:'inherit',windowsHide:true});
    const timer=setTimeout(()=>child.kill(),30000);
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);}).finally(()=>clearTimeout(timer));
    if(code!==0) throw Error(`Toolbar smoke failed (${code})`);
  } finally { if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('acedia-toolbar-'))throw Error('Invalid cleanup');await fs.rm(directory,{recursive:true,maxRetries:5,retryDelay:150}); }
}
