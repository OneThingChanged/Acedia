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
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const find = selector => { const node = document.querySelector(selector); check(node, "Missing " + selector); return node; };
  const click = async selector => { find(selector).click(); await wait(); };
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const node = name => [...document.querySelectorAll('.org-node')].find(node => node.querySelector('strong')?.textContent === name);
  const stored = () => JSON.parse(localStorage.getItem('multiagent.agents.v1'));
  const launches = () => window.organizationCalls.filter(call => call.command === 'spawn_pty');
  for (let n = 0; n < 40 && !document.querySelector('.organization-sidebar-slot'); n++) await wait();
  check(document.querySelector('.browser-hub-sidebar-slot'), 'Missing Browser hub: ' + JSON.stringify({ bridge: !!window.multiAgentElectron, organization: !!document.querySelector('.organization-sidebar-slot'), buttons: [...document.querySelectorAll('.sidebar button')].slice(0, 5).map(button => button.textContent), body: document.body.textContent.slice(0, 250) }));
  check(find('.browser-hub-sidebar-slot').nextElementSibling.classList.contains('organization-sidebar-slot'), 'Organization follows Browser hub');
  const before = launches().length;
  await click('.organization-sidebar-slot button');
  check(!document.querySelector('.files-shell'), 'Inspector replaces files in organization view');
  button('All sessions 4').click(); await wait();
  check(document.querySelectorAll('.org-node').length === 3, 'Actual project hierarchy loaded');
  check(launches().length === before, 'Opening organization did not launch sessions');
  node('UI').click(); await wait();
  await click('.org-header-actions .btn-primary');
  check(find('.new-session-parent').textContent.includes('UI'), 'Child dialog has selected parent');
  const name = find('.new-session-identity input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, 'New child');
  name.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  await click('.new-session-footer .btn-primary');
  check(!document.querySelector('.new-session-modal'), 'Child dialog closed');
  const child = stored().find(agent => agent.name === 'New child');
  check(child?.sessionHierarchy.parentId === 'ui', 'Child relation persisted');
  check(!child.sessionHierarchy.createdById, 'UI creation records the user as creator');
  check(document.querySelectorAll('.org-node').length === 4, 'New child appears in organization');
  check(launches().at(-1)?.args.id === child.id, 'Created child uses its own CLI session');
  check(launches().at(-1).args.cwd === 'C:/fixture/scope', 'Inherited folder applied to spawn');
  check(launches().at(-1).args.modelSettings.model === 'gpt-5.5', 'Inherited model applied to spawn');
  check(launches().at(-1).args.initCommand.includes('Root rules'), 'Inherited instructions applied to spawn');
  const started = launches().length;
  const parent = find('.org-inspector [aria-label="Parent session"]');
  parent.value = 'docs'; parent.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  await click('.org-save-section .btn-primary');
  check(stored().find(agent => agent.id === child.id).sessionHierarchy.parentId === 'docs', 'Moving parent persisted');
  const catalog = window.organizationCalls.filter(call => call.command === 'sync_monitor_state').at(-1)?.args;
  check(catalog?.agents.find(agent => agent.id === child.id)?.sessionHierarchy.parentId === 'docs', 'MCP catalog receives parent relationships');
  const inherit = [...document.querySelectorAll('.org-check')].find(label => label.textContent.includes("Use parent's working folder"));
  inherit.querySelector('input').click(); await wait();
  const folder = find('.org-inspector [aria-label="Working folder"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(folder, 'C:/custom-child');
  folder.dispatchEvent(new Event('input', { bubbles: true })); await wait();
  await click('.org-save-section .btn-primary');
  check(stored().find(agent => agent.id === child.id).sessionHierarchy.folderOverride === 'C:/custom-child', 'Explicit override persisted');
  window.organizationEvent('remote:session-model', { requestId: 'model-fixture', id: child.id, settings: { model: 'gpt-6-luna', effort: 'max' }, restart: false }); await wait();
  const updated = stored().find(agent => agent.id === child.id);
  check(updated.modelSettings.model === 'gpt-6-luna' && updated.sessionHierarchy.inheritModel === false, 'Explicit model edit disables inheritance');
  check(launches().length === started, 'Editing relationships does not restart a running child');
  node('Root').click(); await wait();
  check(find('.org-inspector [aria-label="Parent session"]').options.length === 1, 'Descendants cannot parent their ancestor');
  const collapse = find('.org-node-wrap .org-collapse'); collapse.click(); await wait();
  check(document.querySelectorAll('.org-node').length === 1, 'Collapsed descendants hidden');
  await click('.org-collapse');
  check(document.querySelectorAll('.org-node').length === 4, 'Descendants expanded');
  await click('.org-zoom [aria-label="Zoom in"]');
  await click('.org-zoom [aria-label="Fit organization"]');
  const overview = find('[aria-label="Organization project"]'); overview.value = 'all'; overview.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  check(document.querySelectorAll('.org-project-group').length === 2, 'Overview shows both projects');
  await click('.browser-hub-sidebar-slot button');
  check(!document.querySelector('.session-organization'), 'Browser navigation still works');
  await click('.organization-sidebar-slot button');
  check(!window.organizationCalls.some(call => call.command === 'kill_pty' || call.command === 'terminal_session_action'), 'Navigation and movement did not stop sessions');
  window.organizationEvent('remote:restart-session', { requestId: 'resume-fixture', id: 'ui' }); await wait();
  const resumed = stored().find(agent => agent.id === 'ui');
  check(resumed.folder === 'C:/fixture/scope' && resumed.sessionHierarchy.resumeContext.folder === 'C:/fixture', 'Launch saves actual cwd separately from transcript lookup folder');
  check(launches().at(-1).args.initCommand.includes('resume own-ui-chat'), 'Moved session resumes its own conversation');
  window.organizationEvent('remote:restart-session', { requestId: 'resume-again-fixture', id: 'ui' }); await wait();
  check(window.organizationCalls.filter(call => call.command === 'resolve_cli_session').at(-1)?.args.folder === 'C:/fixture', 'Subsequent launch retains original transcript lookup folder');
  return { childId: child.id, before, started };
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  const directory = process.env.ACEDIA_ORGANIZATION_SMOKE_DIRECTORY;
  app.setPath('userData', path.join(directory, 'profile'));
  app.whenReady().then(async () => {
    try {
      const win = new BrowserWindow({ show: false, width: 1600, height: 1000, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
      const errors = [];
      win.webContents.on('console-message', details => { if (details.level === 'error') { errors.push(details.message); console.error(details.message); } });
      await win.loadFile(path.join(directory, 'index.html'));
      const result = await win.webContents.executeJavaScript('(' + exercise.toString() + ')()');
      const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
      win.webContents.reload(); await loaded;
      console.log(await win.webContents.executeJavaScript(`(async () => {
        const wait=()=>new Promise(resolve=>setTimeout(resolve,200));
        for(let i=0;i<40&&!document.querySelector('.organization-sidebar-slot');i++)await wait();
        document.querySelector('.organization-sidebar-slot button').click();await wait();
        [...document.querySelectorAll('.org-view-switch button')].find(b=>b.textContent.includes('All sessions')).click();await wait();
        const child=[...document.querySelectorAll('.org-node')].find(node=>node.querySelector('strong')?.textContent==='New child');
        if(!child)throw Error('Created child lost on reload');child.click();await wait();
        if(document.querySelector('.org-inspector [aria-label="Working folder"]').value!=='C:/custom-child')throw Error('Folder override lost on reload');
        const catalog=JSON.parse(localStorage.getItem('multiagent.agents.v1'));const item=catalog.find(agent=>agent.id===${JSON.stringify(result.childId)});
        item.sessionHierarchy.parentId='root';localStorage.setItem('multiagent.agents.v1',JSON.stringify(catalog));window.dispatchEvent(new StorageEvent('storage',{key:'multiagent.agents.v1'}));await wait();
        if(document.querySelector('.org-inspector [aria-label="Parent session"]').value!=='root')throw Error('Peer hierarchy update not reflected');
        return 'ORGANIZATION_RELOAD_AND_PEER_SYNC_OK';
      })()`));
      for (const [width, height] of [[1600, 1000], [1280, 900], [800, 640]]) {
        win.setContentSize(width, height);
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(await win.webContents.executeJavaScript(`(() => {
          const org=document.querySelector('.session-organization'),top=document.querySelector('.app-topbar').getBoundingClientRect();
          if(document.documentElement.scrollWidth>innerWidth)throw Error('Page overflow '+innerWidth);
          if(Math.abs(org.getBoundingClientRect().top-top.bottom)>1)throw Error('Organization left workspace row');
          const head=document.querySelector('.org-header');if(head.scrollWidth>head.clientWidth+1)throw Error('Header overflow '+innerWidth);
          return 'ORGANIZATION_LAYOUT_OK '+innerWidth+'x'+innerHeight;
        })()`));
        if (width === 1600 && process.env.ACEDIA_ORGANIZATION_SCREENSHOT) await fs.writeFile(process.env.ACEDIA_ORGANIZATION_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      }
      if (errors.length) throw new Error('Renderer errors: ' + errors.join('\n'));
      console.log('ORGANIZATION_CREATE_MOVE_INHERITANCE_MODEL_OVERRIDE_RESUME_CYCLE_AND_NAVIGATION_OK');
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-session-organization-'));
  try {
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(root, 'scripts/fixtures/session-organization-renderer.tsx')], bundle: true, jsx: 'automatic', define: { 'import.meta.env': '{}', '__MULTIAGENT_APP_VERSION__': JSON.stringify('organization-smoke') }, outfile: path.join(directory, 'renderer.js') });
    await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script>window.addEventListener("error",event=>console.error(event.error?.stack || event.message,JSON.stringify(window.organizationCalls?.slice(-12))));</script><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_ORGANIZATION_SMOKE_DIRECTORY: directory }; delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Organization smoke timed out')); }, 60000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Organization smoke failed: ' + code)); });
    });
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('acedia-session-organization-')) throw new Error('Unexpected temporary directory');
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 150 });
  }
}
