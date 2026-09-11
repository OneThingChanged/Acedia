import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exercise() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 150));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const find = selector => { const el = document.querySelector(selector); check(el, "Missing " + selector); return el; };
  const click = async selector => { find(selector).click(); await wait(); };
  const category = async name => { const el=[...document.querySelectorAll('.app-settings-nav-item')].find(el=>el.textContent.trim()===name);check(el,'Missing settings category '+name);el.click();await wait(); };
  const rect = selector => find(selector).getBoundingClientRect();
  const geometry = enabled => {
    const top = rect('.app-topbar'), body = rect('.terminal-area');
    check(top.x === 0 && top.y === 0 && top.width === innerWidth && top.height === 36, 'Top bar left its full-width top row: '+JSON.stringify(top));
    check(body.y === top.bottom && body.width >= 180, 'Workspace width/position collapsed');
    check(Math.abs(body.bottom - (innerHeight - (enabled ? 28 : 0))) <= 1, 'Workspace did not fill available height');
    check(Boolean(document.querySelector('.usage-status-bar')) === enabled, 'Status visibility mismatch');
    const sidebar = find('.sidebar');
    if (getComputedStyle(sidebar).display !== 'none') check(rect('.sidebar').x === 0 && rect('.sidebar').y === 36, 'Sidebar moved');
    if (document.querySelector('.files-shell')) check(rect('.files-shell').y === 36 && Math.abs(rect('.files-shell').right-innerWidth)<=1, 'File panel moved');
    check(document.documentElement.scrollWidth === innerWidth, 'Horizontal overflow');
    return {width:body.width,height:body.height};
  };
  for(let n=0;n<40&&!document.querySelector('.app-topbar');n++) await wait();
  await wait();
  const stateBefore = localStorage.getItem('multiagent.agents.v1');
  const paneBefore = document.querySelector('.terminal-area');
  const leavesBefore = [...document.querySelectorAll('.terminal-area [data-pane-leaf-id]')];
  check(leavesBefore.length === 2, 'Expected two restored split panes');
  const initial = localStorage.getItem('multiagent.showUsageBar.v1') !== '0';
  const shown = geometry(initial);
  await click('.app-topbar [title="Settings"]');
  await category('Status bar');
  const toggle = '[aria-label="Show status bar"]';
  if (find(toggle).checked) await click(toggle);
  const hidden = geometry(false);
  if(initial) check(hidden.width === shown.width && hidden.height === shown.height+28, 'Hiding bar changed horizontal layout');
  await click('.app-settings-back');
  check(!document.querySelector('.app-settings-screen'), 'Settings did not close');
  geometry(false);
  await click('[aria-label="Toggle left sidebar"]'); geometry(false);
  await click('[aria-label="Toggle left sidebar"]'); geometry(false);
  await click('[aria-label="Toggle right file sidebar"]'); geometry(false);
  await click('[aria-label="Toggle right file sidebar"]'); geometry(false);
  await click('.app-topbar [title="Settings"]');
  await category('Agents');
  await click('[role="tab"]');
  await click('[data-setting-id="agents.common.usage"] input');
  geometry(true);
  await category('Status bar');
  await click(toggle); geometry(false);
  check(localStorage.getItem('multiagent.showUsageBar.v1') === '0', 'Hidden state not saved');
  check(document.querySelector('.terminal-area') === paneBefore && localStorage.getItem('multiagent.agents.v1') === stateBefore, 'Toggle remounted workspace or changed sessions');
  check([...document.querySelectorAll('.terminal-area [data-pane-leaf-id]')].every((el,index)=>el===leavesBefore[index]), 'Toggle replaced split panes');
  check(!window.layoutCalls.some(call => ['kill_pty','spawn_pty'].includes(call.command)), 'Layout toggles changed terminal processes');
  await click('.app-settings-back');
  return 'WORKSPACE_STATUS_TOGGLE_LAYOUT_OK '+innerWidth+'x'+innerHeight;
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  const directory=process.env.ACEDIA_LAYOUT_SMOKE_DIRECTORY;
  app.setPath('userData',path.join(directory,'profile'));
  app.whenReady().then(async()=>{try {
    const win=new BrowserWindow({show:false,width:1202,height:801,webPreferences:{offscreen:true,backgroundThrottling:false}});
    win.webContents.on('console-message',details=>{if(details.level==='error')console.error(details.message);});
    await win.loadFile(path.join(directory,'index.html'));
    for(const [width,height] of [[1202,801],[800,640],[1920,1080]]) {
      win.setContentSize(width,height);
      console.log(await win.webContents.executeJavaScript('('+exercise.toString()+')()'));
      if(width===1202 && process.env.ACEDIA_LAYOUT_SCREENSHOT) await fs.writeFile(process.env.ACEDIA_LAYOUT_SCREENSHOT,(await win.webContents.capturePage()).toPNG());
      const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
      win.webContents.reload();await loaded;
    }
    console.log('WORKSPACE_HIDDEN_STATUS_RELOAD_OK');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}});
} else {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-workspace-layout-'));
  try {
    const {build}=await import('esbuild');
    await build({entryPoints:[path.join(root,'scripts/fixtures/workspace-layout-renderer.tsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}','__MULTIAGENT_APP_VERSION__':JSON.stringify('layout-smoke')},outfile:path.join(directory,'renderer.js')});
    await fs.writeFile(path.join(directory,'index.html'),'<link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
    const env={...process.env,ACEDIA_LAYOUT_SMOKE_DIRECTORY:directory};delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve,reject)=>{
      const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{cwd:root,env,stdio:'inherit',windowsHide:true});
      const timeout=setTimeout(()=>{child.kill();reject(Error('Workspace layout smoke timed out'));},60000);
      child.once('error',error=>{clearTimeout(timeout);reject(error);});
      child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('Workspace layout smoke failed: '+code));});
    });
  } finally {
    if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('acedia-workspace-layout-')) throw Error('Unsafe temporary directory');
    await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
}
