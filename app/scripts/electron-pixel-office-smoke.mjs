import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), appRoot = path.resolve(import.meta.dirname, '..'), repo = path.dirname(appRoot);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!process.versions.electron) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-pixel-office-'));
  try {
    const { build } = await import('esbuild');
    let source = await fs.readFile(path.join(appRoot, 'scripts/fixtures/session-organization-renderer.tsx'), 'utf8');
    for (const [from, to] of [['Organization verification', 'RnDHub'], ['Other project', 'ProjectWitch'], ['name: "Root"', 'name: "RnDHub"'], ['name: "UI"', 'name: "SwarmLab"'], ['name: "Docs"', 'name: "ShaderSkinner"'], ['name: "Other"', 'name: "ProjectWitch"']]) source = source.replaceAll(from, to);
    await build({ stdin: { contents: source, loader: 'tsx', resolveDir: path.join(appRoot, 'scripts/fixtures') }, bundle: true, jsx: 'automatic',
      define: { 'import.meta.env': '{"BASE_URL":"./"}', '__MULTIAGENT_APP_VERSION__': '"fixture"' }, outfile: path.join(root, 'renderer.js') });
    await fs.cp(path.join(appRoot, 'public/pixel-agents'), path.join(root, 'pixel-agents'), { recursive: true });
    await fs.copyFile(path.join(appRoot, 'public/app-icon.png'), path.join(root, 'app-icon.png'));
    await fs.writeFile(path.join(root, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_PIXEL_OFFICE_FIXTURE: root }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [import.meta.filename], { cwd: appRoot, env, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill(), 60000);
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('acedia-pixel-office-'));
    await fs.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
  }
} else {
  const { app, BrowserWindow } = require('electron'), root = process.env.ACEDIA_PIXEL_OFFICE_FIXTURE;
  assert.ok(root && path.basename(root).startsWith('acedia-pixel-office-'));
  app.setPath('userData', path.join(root, 'profile')); app.disableHardwareAcceleration();
  app.on('window-all-closed', () => {});
  void (async () => {
    await app.whenReady();
    const win = new BrowserWindow({ width: 1300, height: 850, show: false, webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    const js = source => win.webContents.executeJavaScript(source);
    const until = async (predicate, label) => { for (let n = 0; n < 100; n++) { if (await predicate()) return; await wait(60); } throw Error('Pixel Office timeout: ' + label); };
    const click = async selector => { assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`), selector); await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await wait(150); };
    const output = path.join(repo, 'output/pixel-office'); await fs.mkdir(output, { recursive: true });
    try {
      await win.loadFile(path.join(root, 'index.html'));
      await until(() => js('!!document.querySelector(".organization-sidebar-slot")'), 'app ready');
      // Simulate authoritative host PTY data before lifecycle hooks. A stale
      // hook by itself must not turn a stopped session into an office worker.
      await js(`for(const id of ['docs','other'])window.organizationEvent('pty:data',{id,data:'fixture terminal ready\\r\\n'})`);
      await wait(150);
      await js(`window.organizationEvent('agent:hook-event',{id:'docs',event:'working',hook_event_name:'PreToolUse',tool_name:'Read',received_at:Date.now()});window.organizationEvent('agent:hook-event',{id:'other',event:'waiting',hook_event_name:'PermissionRequest',received_at:Date.now()})`);
      // Count native image assignments, not just network-cache hits. Rendering
      // a new state must not construct/reload an Image every animation frame.
      await js(`window.officeImages=[];window.officeDraws=new WeakMap();
        { const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(value){if(String(value).includes('pixel-agents/'))window.officeImages.push(value);source.set.call(this,value);}});
          const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){window.officeDraws.set(this.canvas,(window.officeDraws.get(this.canvas)||0)+1);return draw.apply(this,args)}; }true;`);
      await click('.organization-sidebar-slot button');
      await click('.project-board .org-header-actions button'); // Pixel Office.
      await until(() => js('document.querySelectorAll(".po-seat").length===4'), 'real sessions on board');
      assert.equal(await js('document.querySelector("[data-office-agent=docs]").dataset.officeState'), 'reading');
      assert.equal(await js('document.querySelector("[data-office-agent=other]").dataset.officeState'), 'waiting');
      assert.equal(await js('document.querySelector("[data-office-agent=root]").dataset.officeRole'), 'lead');
      assert.equal(await js('document.querySelector("[data-office-agent=docs]").dataset.officeRole'), 'member');
      assert.equal(await js('document.querySelector("[data-office-agent=other]").dataset.officeRole'), 'independent');
      assert.equal(await js('document.querySelector("[data-office-agent=root]").offsetTop<document.querySelector("[data-office-agent=docs]").offsetTop'), true);
      await click('.po-toolbar input[type=checkbox]');
      assert.equal(await js('!!document.querySelector("[data-office-agent=ui]")'), false);
      assert.equal(await js('document.querySelector("[data-office-agent=root]").dataset.officeRole'), 'lead');
      await click('.po-toolbar input[type=checkbox]');
      console.log('PIXEL_OFFICE_LEAD_ABOVE_REPORTS_AND_ROLES_SURVIVE_ACTIVE_FILTER_OK');
      await until(() => js('window.officeImages.length===18&&[...document.querySelectorAll(".po-room canvas")].every(c=>window.officeDraws.get(c)>0)'), 'decoded cached sprites');
      assert.equal(await js('!!document.querySelector(".po-asset-error")'), false);
      const calls = await js('window.organizationCalls.filter(c=>c.command==="spawn_pty").length');
      const view = await js('localStorage.getItem("multiagent.view.v1")');
      await click('[data-office-agent="ui"]');
      assert.equal(await js('document.querySelector(".po-inspector-title").textContent.includes("SwarmLab")'), true);
      assert.equal(await js('localStorage.getItem("multiagent.view.v1")'), view);
      assert.equal(await js('window.organizationCalls.filter(c=>c.command==="spawn_pty").length'), calls);
      console.log('PIXEL_OFFICE_BOARD_REAL_HIERARCHY_SELECT_NO_START_OR_NAVIGATION_OK');
      const imageCount = await js('window.officeImages.length');
      // Hook updates exercise the actual App reducer, while all CLI operations
      // remain the existing isolated fixture's mocks.
      await js(`for(let n=0;n<12;n++)window.organizationEvent('agent:hook-event',{id:'docs',event:n%2?'working':'done',hook_event_name:n%2?'PreToolUse':'Stop',tool_name:'Read',received_at:Date.now()})`);
      await wait(700);
      assert.equal(await js('document.querySelector("[data-office-agent=docs]").dataset.officeState'), 'reading');
      assert.equal(await js('window.officeImages.length'), imageCount);
      console.log('PIXEL_OFFICE_SHARED_IMAGE_CACHE_ACROSS_ANIMATION_AND_HOOK_UPDATES_OK');
      await wait(350); await win.webContents.capturePage().then(img => fs.writeFile(path.join(output, 'board.png'), img.toPNG()));
      await click('.po-header-actions button[title="Show in right sidebar"]');
      await until(() => js('!!document.querySelector(".files-shell .po-sidebar")'), 'docked office');
      assert.equal(await js('document.querySelectorAll(".po-sidebar .po-seat").length'), 3);
      assert.equal(await js('window.officeImages.length'), imageCount);
      const width = await js('document.querySelector(".po-sidebar").getBoundingClientRect().width');
      assert.ok(width >= 320);
      assert.equal(await js('[...document.querySelectorAll(".po-sidebar .po-seat")].every(el=>{const a=el.getBoundingClientRect(),b=el.closest(".po-room-stage").getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1})'), true);
      await until(() => js('[...document.querySelectorAll(".po-sidebar canvas")].every(c=>window.officeDraws.get(c)>0)'), 'sidebar painted');
      await wait(350); await win.webContents.capturePage().then(img => fs.writeFile(path.join(output, 'sidebar.png'), img.toPNG()));
      console.log('PIXEL_OFFICE_DOCKED_PROJECT_SCOPE_AND_NARROW_BOUNDS_OK');
      // Visibility and placement teardown must stop all scene painting.
      await js(`window.officeCanvases=[...document.querySelectorAll('.po-room canvas')];Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);
      await wait(100); const stopped = await js('window.officeCanvases.map(c=>window.officeDraws.get(c))');
      await wait(700); assert.deepEqual(await js('window.officeCanvases.map(c=>window.officeDraws.get(c))'), stopped);
      await js(`Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`);
      await until(() => js(`window.officeDraws.get(window.officeCanvases[0])>${stopped[0]}`), 'animation resumes');
      await click('.office-sidebar-tabs button[title="Source Control"]');
      const closed = await js('window.officeCanvases.map(c=>window.officeDraws.get(c))');
      await wait(600); assert.deepEqual(await js('window.officeCanvases.map(c=>window.officeDraws.get(c))'), closed);
      assert.equal(await js(`!!document.querySelector('.file-tree-tab-active[title="Source Control"]')`), true);
      await click('.file-tree-tab[title="Pixel Office"]');
      await click('[aria-label="Expand in Project Board"]');
      await until(() => js('!!document.querySelector(".po-board")&&!document.querySelector(".files-shell")'), 'expanded board');
      console.log('PIXEL_OFFICE_HIDDEN_PAUSE_UNMOUNT_CLEANUP_GIT_RETURN_EXPAND_OK');
      await click('.po-header-actions button'); // Back to Project Board.
      assert.equal(await js('!!document.querySelector(".project-board")'), true);
      console.log('PIXEL_OFFICE_APP_SMOKE_OK');
      win.destroy(); app.exit(0);
    } catch (error) {
      console.error(await js(`JSON.stringify(window.organizationCalls.filter(c=>c.command==='sync_monitor_state').at(-1)?.args?.agents)`));
      console.error(error); console.error(await js('document.body.innerText.slice(-3000)').catch(() => ''));
      win.destroy(); app.exit(1);
    }
  })();
}
