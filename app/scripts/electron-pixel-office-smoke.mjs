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
    const timer = setTimeout(() => child.kill(), 90000);
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
    const win = new BrowserWindow({ width: 1600, height: 960, show: false, webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    const js = source => win.webContents.executeJavaScript(source);
    const until = async (predicate, label) => { for (let n = 0; n < 100; n++) { if (await predicate()) return; await wait(60); } throw Error('Pixel Office timeout: ' + label); };
    const click = async selector => { assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`), selector); await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await wait(150); };
    const output = process.env.ACEDIA_PIXEL_OFFICE_ARTIFACTS || path.join(repo, 'output/pixel-office-shared-floor'); await fs.mkdir(output, { recursive: true });
    try {
      await win.loadFile(path.join(root, 'index.html'), { query: { 'shared-office': '1' } });
      await until(() => js('!!document.querySelector(".organization-sidebar-slot")'), 'app ready');
      await js(`for(const id of ['docs','other',...Array.from({length:14},(_,n)=>'dept-'+n+'-2')])window.organizationEvent('pty:data',{id,data:'fixture terminal ready\\r\\n'})`);
      await wait(150);
      await js(`window.organizationEvent('agent:hook-event',{id:'docs',event:'working',hook_event_name:'PreToolUse',tool_name:'Read',received_at:Date.now()});window.organizationEvent('agent:hook-event',{id:'other',event:'waiting',hook_event_name:'PermissionRequest',received_at:Date.now()});for(let n=0;n<14;n++)window.organizationEvent('agent:hook-event',{id:'dept-'+n+'-2',event:n%2?'working':'done',hook_event_name:n%2?'PreToolUse':'Stop',tool_name:'Write',received_at:Date.now()})`);
      await js(`window.officeImages=[];window.officeFrames=new WeakMap();window.officeDraws=new WeakMap();
        { const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(value){if(String(value).includes('pixel-agents/'))window.officeImages.push(value);source.set.call(this,value);}});
          const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){window.officeFrames.set(this.canvas,(window.officeFrames.get(this.canvas)||0)+1);return clear.apply(this,args)};
          const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){window.officeDraws.set(this.canvas,(window.officeDraws.get(this.canvas)||0)+1);return draw.apply(this,args)}; }true;`);
      await click('.organization-sidebar-slot button'); await click('.project-board .org-header-actions button');
      await until(() => js('document.querySelectorAll(".po-seat").length===117'), '117 real synthetic employees');
      await until(() => js('window.officeImages.length===18&&window.officeFrames.get(document.querySelector(".po-map-viewport canvas"))>0'), 'cached assets and painted scene');
      assert.equal(await js('document.querySelectorAll(".po-map-viewport canvas").length'), 1);
      assert.equal(await js('document.querySelectorAll("[data-office-project]").length'), 16);
      assert.equal(await js('!!document.querySelector(".po-room,.po-asset-error")'), false);
      const geometry = async () => js(`(()=>{const v=document.querySelector('.po-map-viewport'),c=v.querySelector('canvas'),b=v.getBoundingClientRect(),r=c.getBoundingClientRect(),z=Number(v.dataset.officeZoom),x=Number(v.dataset.officeX),y=Number(v.dataset.officeY);const seats=[...v.querySelectorAll('.po-seat')];return {canvasBounds:Math.abs(b.left-r.left)<1&&Math.abs(b.top-r.top)<1&&Math.abs(b.width-r.width)<1&&Math.abs(b.height-r.height)<1,bounded:c.width<=b.width*2+2&&c.height<=b.height*2+2,fit:seats.every(e=>{const a=e.getBoundingClientRect();return a.left>=b.left-1&&a.top>=b.top-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1}),transform:seats.every(e=>{const a=e.getBoundingClientRect();return Math.abs(a.left-b.left-x-e.offsetLeft*z)<1&&Math.abs(a.top-b.top-y-e.offsetTop*z)<1&&Math.abs(a.width-124*z)<1}),overlap:seats.some((e,i)=>{const a=e.getBoundingClientRect();return seats.slice(i+1).some(other=>{const d=other.getBoundingClientRect();return a.left<d.right-.1&&d.left<a.right-.1&&a.top<d.bottom-.1&&d.top<a.bottom-.1})}),hit:seats.every(e=>{const a=e.getBoundingClientRect();if(a.left<b.left||a.top<b.top||a.right>b.right||a.bottom>b.bottom)return true;return document.elementFromPoint(a.left+a.width/2,a.top+a.height/2)?.closest('.po-seat')===e}),width:b.width,height:b.height,zoom:z};})()`);
      const fit = await geometry(); assert.equal(fit.canvasBounds, true); assert.equal(fit.bounded, true); assert.equal(fit.fit, true); assert.equal(fit.transform, true); assert.equal(fit.overlap, false); assert.equal(fit.hit, true);
      await fs.writeFile(path.join(output, 'geometry-1600.json'), JSON.stringify(fit, null, 2));
      assert.equal(await js('document.querySelector("[data-office-agent=docs]").dataset.officeState'), 'reading');
      assert.equal(await js('document.querySelector("[data-office-agent=other]").dataset.officeState'), 'waiting');
      for (const [id, role] of [['root','lead'],['ui','manager'],['intern','member'],['dept-0-0','lead'],['dept-0-1','manager'],['dept-0-2','member'],['other','independent']]) assert.equal(await js(`document.querySelector('[data-office-agent="${id}"]').dataset.officeRole`), role);
      assert.equal(await js('document.querySelector("[data-office-agent=intern]").dataset.officeState'), 'sleeping');
      await click('.po-toolbar input[type=checkbox]');
      assert.equal(await js('document.querySelector("[data-office-agent=root]").dataset.officeRole'), 'lead');
      await click('.po-toolbar input[type=checkbox]'); await click('[data-office-fit]');
      const capture = async filename => { await wait(300); await win.webContents.capturePage().then(img => fs.writeFile(path.join(output, filename), img.toPNG())); };
      await capture('board-1600.png');
      win.setSize(1280, 900); await wait(250); await click('[data-office-fit]');
      const medium = await geometry(); assert.equal(medium.fit, true); assert.equal(medium.overlap, false); assert.equal(medium.canvasBounds, true);
      await capture('board-1280.png');
      console.log('PIXEL_OFFICE_SHARED_16_DEPARTMENTS_117_EMPLOYEES_FIT_NO_OVERLAP_BOUNDED_CANVAS_OK');
      const calls = await js('window.organizationCalls.filter(c=>c.command==="spawn_pty").length'), view = await js('localStorage.getItem("multiagent.view.v1")');
      await click('.po-departments button'); await click('[data-office-readable]');
      await click('[data-office-agent="ui"]');
      assert.equal(await js('document.querySelector(".po-inspector-title").textContent.includes("SwarmLab")'), true);
      assert.equal(await js('localStorage.getItem("multiagent.view.v1")'), view); assert.equal(await js('window.organizationCalls.filter(c=>c.command==="spawn_pty").length'), calls);
      await click('.po-departments button'); await capture('board-readable.png');
      // Native wheel events must preserve the world point beneath the pointer.
      const anchor = await js(`(()=>{const v=document.querySelector('.po-map-viewport'),b=v.getBoundingClientRect();return {x:Math.round(b.left+b.width*.6),y:Math.round(b.top+b.height*.6)}})()`);
      const point = () => js(`(()=>{const v=document.querySelector('.po-map-viewport'),b=v.getBoundingClientRect(),z=Number(v.dataset.officeZoom);return {x:(${anchor.x}-b.left-Number(v.dataset.officeX))/z,y:(${anchor.y}-b.top-Number(v.dataset.officeY))/z}})()`);
      const before = await point(); win.webContents.sendInputEvent({type:'mouseWheel',x:anchor.x,y:anchor.y,deltaY:100,deltaX:0}); await wait(200); const after = await point();
      assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1);
      assert.equal((await geometry()).transform, true);
      await js(`{const v=document.querySelector('.po-map-viewport');v.focus();v.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));}true`); await wait(100);
      const panBefore = await js('Number(document.querySelector(".po-map-viewport").dataset.officeX)');
      win.webContents.sendInputEvent({type:'mouseDown',x:anchor.x,y:anchor.y,button:'middle',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:anchor.x+50,y:anchor.y+25,button:'middle'});win.webContents.sendInputEvent({type:'mouseUp',x:anchor.x+50,y:anchor.y+25,button:'middle',clickCount:1});await wait(150);
      assert.ok(Math.abs(await js('Number(document.querySelector(".po-map-viewport").dataset.officeX)')-panBefore)>10);
      win.webContents.focus();
      // Hidden offscreen windows do not receive OS focus; dispatch the normal
      // bubbling focusin event after assigning activeElement to exercise the
      // same React keyboard-focus handler without showing a real window.
      await js(`{const e=document.querySelector('[data-office-agent="dept-13-7"]');e.focus();e.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}true`); await wait(150);
      assert.equal(await js(`(()=>{const e=document.querySelector('[data-office-agent="dept-13-7"]'),a=e.getBoundingClientRect(),b=e.closest('.po-map-viewport').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1})()`), true);
      assert.equal((await geometry()).hit, true);
      assert.equal((await geometry()).canvasBounds, true); assert.equal((await geometry()).transform, true);
      assert.equal(await js(`(()=>{const v=document.querySelector('.po-map-viewport');return v.scrollLeft===0&&v.scrollTop===0})()`), true);
      console.log('PIXEL_OFFICE_ZOOM_ANCHOR_POINTER_KEYBOARD_PAN_OFFSCREEN_FOCUS_HIT_TARGETS_OK');
      const imageCount = await js('window.officeImages.length');
      await js(`for(let n=0;n<12;n++)window.organizationEvent('agent:hook-event',{id:'docs',event:n%2?'working':'done',hook_event_name:n%2?'PreToolUse':'Stop',tool_name:'Read',received_at:Date.now()})`); await wait(350);
      assert.equal(await js('document.querySelector("[data-office-agent=docs]").dataset.officeState'), 'reading'); assert.equal(await js('window.officeImages.length'), imageCount);
      await click('.po-header-actions button[title="Show in right sidebar"]'); await until(() => js('!!document.querySelector(".files-shell .po-sidebar")'), 'docked');
      assert.equal(await js('document.querySelectorAll(".po-sidebar .po-seat").length'), 45);
      assert.equal(await js('document.querySelector(".po-sidebar .po-toolbar select").value'), 'all');
      assert.equal(await js('!!document.querySelector(".po-sidebar .po-toolbar input[type=checkbox]")'), false);
      await click('[data-session-filter="active"]');
      await until(()=>js('document.querySelectorAll(".sidebar-recents [data-sidebar-agent-id]").length===45'),'left Active family projection');
      const leftActive = await js(`[...new Set([...document.querySelectorAll('.sidebar-recents [data-sidebar-agent-id]')].map(e=>e.dataset.sidebarAgentId))].sort()`);
      const dockIds = () => js(`[...document.querySelectorAll('.po-sidebar [data-office-agent]')].map(e=>e.dataset.officeAgent).sort()`);
      assert.deepEqual(await dockIds(), leftActive);
      await fs.writeFile(path.join(output,'active-comparison.json'),JSON.stringify({leftActive,office:await dockIds()},null,2));
      assert.equal(await js('!!document.querySelector(".po-sidebar [data-office-agent=root]")'),true);
      assert.equal(await js('!!document.querySelector(".po-sidebar [data-office-agent=ui],.po-sidebar [data-office-agent=intern]")'),false);
      await click('[data-office-fit]'); const narrow = await geometry(); assert.ok(narrow.width>=300&&narrow.width<=400); assert.equal(narrow.fit,true); assert.equal(narrow.overlap,false); assert.equal(narrow.bounded,true);
      await capture('sidebar-active-all.png');
      await js(`{const s=document.querySelector('.po-toolbar select');s.value='follow';s.dispatchEvent(new Event('change',{bubbles:true}));}true`);await wait(200);await click('[data-office-fit]');
      assert.deepEqual(await dockIds(),['docs','root']);await capture('sidebar-active-follow.png');
      await js(`{const s=document.querySelector('.po-toolbar select');s.value='all';s.dispatchEvent(new Event('change',{bubbles:true}));}true`);await wait(200);await click('[data-office-fit]');
      assert.equal(await js('document.querySelectorAll(".po-sidebar .po-seat").length'),45);assert.equal((await geometry()).fit,true);
      await js(`{const input=document.querySelector('.po-toolbar>input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Sleeping intern');input.dispatchEvent(new Event('input',{bubbles:true}));}true`);
      await until(()=>js('document.querySelectorAll(".po-sidebar .po-seat").length===0'),'search cannot reveal inactive child');
      assert.deepEqual(await dockIds(),[]);
      await js(`{const input=document.querySelector('.po-toolbar>input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'ShaderSkinner');input.dispatchEvent(new Event('input',{bubbles:true}));}true`);
      await until(()=>js('document.querySelectorAll(".po-sidebar .po-seat").length===2'),'search retains required parent');
      assert.deepEqual(await dockIds(),['docs','root']);
      await js(`{const input=document.querySelector('.po-toolbar>input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));window.organizationEvent('pty:exit',{id:'dept-0-2'});}true`);
      await until(()=>js('document.querySelectorAll(".po-sidebar .po-seat").length===42'),'inactive branch removed');
      assert.equal(await js('!!document.querySelector("[data-office-agent=dept-0-0],[data-office-agent=dept-0-1],[data-office-agent=dept-0-2]")'),false);
      await js(`window.organizationEvent('pty:data',{id:'dept-0-3',data:'fixture terminal activated\\r\\n'});true`);
      await until(()=>js('document.querySelectorAll(".po-sidebar .po-seat").length===45'),'new active child restores required ancestors');
      const updatedActive=leftActive.filter(id=>id!=='dept-0-2').concat('dept-0-3').sort();
      await until(async()=>JSON.stringify(await js(`Array.from(document.querySelectorAll('.sidebar-recents [data-sidebar-agent-id]'),e=>e.dataset.sidebarAgentId).sort()`))===JSON.stringify(updatedActive),'left active list updates');
      assert.deepEqual(await dockIds(),updatedActive);
      console.log('PIXEL_OFFICE_DOCK_ACTIVE_MATCHES_LEFT_WITH_ANCESTORS_NO_INACTIVE_CHILDREN_SEARCH_AND_LIFECYCLE_OK');
      await click('[data-office-readable]');
      await js(`{const e=document.querySelector('[data-office-agent="docs"]');e.focus();e.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));}true`);await wait(150);
      const target = await js(`(()=>{const e=document.querySelector('[data-office-agent="docs"]'),a=e.getBoundingClientRect();return{x:Math.round(a.left+a.width/2),y:Math.round(a.top+a.height/2),hit:document.elementFromPoint(a.left+a.width/2,a.top+a.height/2)?.closest('.po-seat')===e}})()`);assert.equal(target.hit,true);
      win.webContents.sendInputEvent({type:'mouseDown',x:target.x,y:target.y,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:target.x,y:target.y,button:'left',clickCount:1});await wait(150);
      assert.equal(await js('document.querySelector(".po-inspector-title").textContent.includes("ShaderSkinner")'),true);
      assert.equal(await js('Number(document.querySelector(".po-map-viewport").dataset.officeZoom)'),1);
      assert.equal((await geometry()).transform,true);assert.equal((await geometry()).canvasBounds,true);await capture('sidebar-readable.png');
      await click('.po-inspector-actions button:last-child');
      assert.equal(await js('!!document.querySelector(".session-note-overlay")'),true);
      await click('.session-note-overlay [aria-label="Close note"]');
      assert.equal(await js('window.organizationCalls.filter(c=>c.command==="spawn_pty").length'),calls);
      win.setSize(1280,680);await wait(200);await click('[data-office-fit]');
      assert.equal(await js(`(()=>{const office=document.querySelector('.pixel-office').getBoundingClientRect(),footer=document.querySelector('.po-footer').getBoundingClientRect(),v=document.querySelector('.po-map-viewport').getBoundingClientRect();return footer.bottom<=office.bottom+1&&v.height>=80})()`),true);
      await capture('sidebar-short-height.png');win.setSize(1280,900);await wait(200);
      console.log('PIXEL_OFFICE_DOCKED_SHARED_FLOOR_ALL_AND_FOLLOW_SCOPE_NO_IMPLICIT_START_OK');
      // Timers, cache, reduced motion, hidden pause and unmount cleanup.
      await js(`window.officeCanvas=document.querySelector('.po-map-viewport canvas');true`);
      let frames=await js('window.officeFrames.get(window.officeCanvas)');await wait(1100);let elapsedFrames=await js('window.officeFrames.get(window.officeCanvas)')-frames;assert.ok(elapsedFrames>=3&&elapsedFrames<=5);
      await win.webContents.executeJavaScript(`window.officeReduced=matchMedia('(prefers-reduced-motion: reduce)');true`);await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(100);
      frames=await js('window.officeFrames.get(window.officeCanvas)');await wait(1200);elapsedFrames=await js('window.officeFrames.get(window.officeCanvas)')-frames;assert.ok(elapsedFrames>=1&&elapsedFrames<=2);win.webContents.debugger.detach();
      await js(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);await wait(100);const stopped=await js('window.officeFrames.get(window.officeCanvas)');await wait(700);assert.equal(await js('window.officeFrames.get(window.officeCanvas)'),stopped);
      await js(`Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))`);await until(()=>js(`window.officeFrames.get(window.officeCanvas)>${stopped}`),'resume');
      await click('.office-sidebar-tabs button[title="Source Control"]');const closed=await js('window.officeFrames.get(window.officeCanvas)');await wait(600);assert.equal(await js('window.officeFrames.get(window.officeCanvas)'),closed);
      await click('.file-tree-tab[title="Pixel Office"]');await click('[aria-label="Expand in Project Board"]');await until(()=>js('!!document.querySelector(".po-board")&&!document.querySelector(".files-shell")'),'expanded');
      assert.equal(await js('document.querySelectorAll(".po-board .po-seat").length'),117);
      assert.equal(await js('!!document.querySelector(".po-board [data-office-agent=intern]")'),true);
      assert.equal(await js('window.officeImages.length'),imageCount);
      await click('.po-header-actions button');assert.equal(await js('!!document.querySelector(".project-board")'),true);
      await click('.project-board .org-header-actions button');await until(()=>js('!!document.querySelector(".po-board .po-open")'),'selected inspector after back');
      await click('.po-open');await until(()=>js('!document.querySelector(".po-board")'),'explicit open conversation');
      console.log('PIXEL_OFFICE_IMAGE_CACHE_4FPS_REDUCED_MOTION_HIDDEN_PAUSE_CLEANUP_EXPAND_OK');
      console.log('PIXEL_OFFICE_APP_SHARED_FLOOR_SMOKE_OK');
      win.destroy(); app.exit(0);
    } catch (error) {
      await win.webContents.capturePage().then(img => fs.writeFile(path.join(output, 'failure.png'), img.toPNG())).catch(() => {});
      console.error(error); console.error(await js('document.body.innerText.slice(-3000)').catch(() => ''));
      win.destroy(); app.exit(1);
    }
  })();
}
