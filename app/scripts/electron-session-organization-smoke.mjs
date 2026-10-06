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
  const click = async selector => { const el = find(selector); if (el.click) el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(); };
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
  const initialScope=find('[aria-label="Organization project"]');initialScope.value='project';initialScope.dispatchEvent(new Event('change',{bubbles:true}));await wait();
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
  await click('[data-project-card="project"] .pb-card-header');
  const projectParent = find('[aria-label="Parent project"]'); projectParent.value = 'other-project'; projectParent.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  await click('.pb-inspector .org-save-section .btn-primary');
  check(JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p => p.id === 'project').hierarchy.parentId === 'other-project', 'Project parent not saved');
  await click('[data-project-card="other-project"] .pb-card-header');
  check(find('[aria-label="Parent project"]').options.length === 1, 'Project cycle prevention missing');
  const addRef = [...document.querySelectorAll('.pb-inspector .pb-text-button')].find(b => b.textContent.includes('Add')); addRef.click(); await wait();
  const target = find('[aria-label="Connection target"]'); target.value = 'project'; target.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  await click('.pb-modal .btn-primary');
  check(JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p => p.id === 'other-project').hierarchy.references[0].projectId === 'project', 'Cross-folder project reference not saved');
  check(document.querySelectorAll('.pb-edge').length === 2, 'Parent and reference edges missing');
  await click('.pb-edge.reference .pb-edge-hit');
  check(find('.pb-edge-detail').textContent.includes('Selected connection'), 'Edge inspector missing');
  [...document.querySelectorAll('.pb-edge-detail button')].find(b => b.textContent.includes('Disconnect')).click(); await wait();
  check(document.querySelectorAll('.pb-edge.reference').length === 0, 'Reference edge was not disconnected');
  await click('[aria-label="Undo"]');
  check(document.querySelectorAll('.pb-edge.reference').length === 1, 'Reference undo failed');
  await click('[aria-label="Redo"]');
  check(document.querySelectorAll('.pb-edge.reference').length === 0, 'Reference redo failed');
  await click('[aria-label="Undo"]');
  await click('[data-project-card="project"] .pb-sessions .org-overview-row');
  check(find('.org-inspector').textContent.includes('Parent session'), 'Existing session inspector unavailable from project board');
  check(launches().length === started, 'Project board edits restarted sessions');
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

async function exerciseProjectBoard(win) {
  const js = code => win.webContents.executeJavaScript(code);
  const pause = () => new Promise(resolve => setTimeout(resolve, 200));
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  await js(`(() => { const s=document.querySelector('[aria-label="Organization project"]');s.value='all';s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await pause();
  const rect = selector => js(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
  const drag = async (from, to) => {
    win.webContents.sendInputEvent({ type:'mouseMove',x:Math.round(from.x),y:Math.round(from.y) });
    win.webContents.sendInputEvent({ type:'mouseDown',button:'left',clickCount:1,x:Math.round(from.x),y:Math.round(from.y) }); await pause();
    win.webContents.sendInputEvent({ type:'mouseMove',x:Math.round(to.x),y:Math.round(to.y) }); await pause();
    win.webContents.sendInputEvent({ type:'mouseUp',button:'left',clickCount:1,x:Math.round(to.x),y:Math.round(to.y) }); await pause();
  };
  const header=await rect('[data-project-card="project"] .pb-card-header');
  await drag({x:header.x+80,y:header.y+15},{x:header.x+176,y:header.y+63});
  const saved=await js(`JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p=>p.id==='project').boardPosition`);
  assert(saved?.x>0 && saved?.y>0,'Real mouse drag did not save the card position');
  await js(`document.querySelector('[aria-label="Undo"]').click()`); await pause();
  assert(await js(`JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p=>p.id==='project').boardPosition.x===0`),'Card drag undo failed');
  await js(`document.querySelector('[aria-label="Redo"]').click()`); await pause();
  assert(await js(`JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p=>p.id==='project').boardPosition.x===${saved.x}`),'Card drag redo failed');
  const board=await rect('.pb-viewport'),before=await js(`document.querySelector('.pb-world').style.transform`);
  await drag({x:board.x+80,y:board.y+board.height-100},{x:board.x+160,y:board.y+board.height-70});
  assert(await js(`document.querySelector('.pb-world').style.transform`)!==before,'Real mouse board pan failed');
  const beforeZoom=await js(`document.querySelector('.org-zoom').textContent`);
  win.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(board.x+board.width/2),y:Math.round(board.y+board.height/2),deltaY:-120,deltaX:0});await pause();
  assert(await js(`document.querySelector('.org-zoom').textContent`)!==beforeZoom,'Wheel zoom failed');
  const mini=await rect('.pb-minimap'),beforeMini=await js(`document.querySelector('.pb-world').style.transform`);
  await drag({x:mini.x+20,y:mini.y+20},{x:mini.x+50,y:mini.y+35});
  assert(await js(`document.querySelector('.pb-world').style.transform`)!==beforeMini,'Minimap drag failed');
  await js(`document.querySelector('[aria-label="Fit board"]').click()`);await pause();
  const port=await rect('[data-project-card="project"] [data-port="reference"]'),target=await rect('[data-project-card="other-project"] .pb-card-header');
  await drag({x:port.x+port.width/2,y:port.y+port.height/2},{x:target.x+60,y:target.y+20});
  assert(await js(`!!document.querySelector('.pb-modal')`),'Port drag did not open the connection form');
  await js(`document.querySelector('.pb-modal .btn-primary').click()`);await pause();
  assert(await js(`JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p=>p.id==='project').hierarchy.references[0].projectId==='other-project'`),'Port connection not persisted');
  await fs.mkdir(path.resolve(root,'../output'),{recursive:true});
  await fs.writeFile(path.resolve(root,'../output/project-relationship-board-native.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PROJECT_BOARD_NATIVE_DRAG_PAN_WHEEL_PORT_UNDO_REDO_OK');
}

async function exerciseFolderBoard(win) {
  const js = code => win.webContents.executeJavaScript(code);
  await js(`(async () => {
    const wait=()=>new Promise(resolve=>setTimeout(resolve,200));
    const check=(condition,message)=>{if(!condition)throw Error(message)};
    const scope=document.querySelector('[aria-label="Organization project"]');scope.value='all';scope.dispatchEvent(new Event('change',{bubbles:true}));await wait();
    const projects=JSON.parse(localStorage.getItem('multiagent.projects.v1')),agents=JSON.parse(localStorage.getItem('multiagent.agents.v1'));
    window.folderBoardOriginal={projects,agents,launches:window.organizationCalls.filter(c=>c.command==='spawn_pty').length};
    const fixtures=[
      {id:'folder-root',name:'Shared workspace',folder:'C:/BoardFixture',boardPosition:{x:700,y:700}},
      {id:'folder-middle',name:'Dormant middle folder',folder:'C:/BoardFixture/Game'},
      {id:'folder-leaf',name:'Plugin project',folder:'C:/BoardFixture/Game/Plugins/Plugin',boardPosition:{x:0,y:0}},
      {id:'folder-sibling',name:'Tools project',folder:'C:/BoardFixture/Tools'},
      {id:'folder-empty',name:'No process project',folder:'C:/EmptyFixture'}
    ].map(p=>({...p,createdAt:2}));
    localStorage.setItem('multiagent.projects.v1',JSON.stringify([...projects,...fixtures]));
    localStorage.setItem('multiagent.agents.v1',JSON.stringify([...agents,...fixtures.map(p=>({id:p.id+'-agent',projectId:p.id,name:p.name+' session',folder:p.folder,aiToolId:'codex',createdAt:2}))]));
    window.dispatchEvent(new StorageEvent('storage',{key:'multiagent.projects.v1'}));await wait();
    for(const id of ['folder-root','folder-leaf','folder-sibling'])window.organizationEvent('pty:data',{id:id+'-agent',data:'',sequence:1});
    await wait();
    [...document.querySelectorAll('.org-view-switch button')].find(b=>b.textContent.includes('Active sessions')).click();await wait();
    check(!document.querySelector('[data-project-card="folder-empty"]'),'Active view retained project without process');
    check(!document.querySelector('[data-project-card="folder-middle"]'),'Active view retained inactive folder ancestor');
    for(const id of ['folder-root','folder-leaf','folder-sibling'])check(document.querySelector('[data-project-card="'+id+'"]'),'Live project missing '+id);
    check(document.querySelector('[data-project-card="folder-leaf"]').dataset.folderParent==='folder-root','Nearest visible folder ancestor missing');
    check(document.querySelector('.pb-edge.folder[data-from="folder-root"][data-to="folder-leaf"]'),'Automatic folder edge missing');
    check(document.querySelector('.pb-minimap').querySelectorAll('rect').length===document.querySelectorAll('[data-project-card]').length+1,'Minimap retained hidden projects');
    check(![...document.querySelector('[aria-label="Organization project"]').options].some(o=>o.value==='folder-empty'),'Active project selector retained inactive project');
    document.querySelector('.pb-arrange').click();await wait();
    const root=document.querySelector('[data-project-card="folder-root"]'),leaf=document.querySelector('[data-project-card="folder-leaf"]');
    check(parseFloat(leaf.style.top)>parseFloat(root.style.top)+parseFloat(root.style.height),'Hierarchy arrangement did not put child below parent');
    const arranged=JSON.parse(localStorage.getItem('multiagent.projects.v1'));
    check(arranged.find(p=>p.id==='folder-root').boardPosition.y===0,'Hierarchy arrangement not persisted');
    check(arranged.filter(p=>p.id.startsWith('folder-')).every(p=>!p.hierarchy),'Automatic folder edges changed launch settings');
    document.querySelector('[aria-label="Undo"]').click();await wait();
    check(JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p=>p.id==='folder-root').boardPosition.y===700,'Hierarchy arrangement undo failed');
    document.querySelector('[aria-label="Redo"]').click();await wait();
    check(JSON.parse(localStorage.getItem('multiagent.projects.v1')).find(p=>p.id==='folder-root').boardPosition.y===0,'Hierarchy arrangement redo failed');
    document.querySelector('.pb-edge.folder[data-to="folder-leaf"] .pb-edge-hit').dispatchEvent(new MouseEvent('click',{bubbles:true}));await wait();
    check(document.querySelector('.pb-folder-detail').textContent.includes('Dormant middle folder'),'Registered folder parent inspector missing');
    check(document.querySelector('.pb-edge-detail').textContent.includes('Shared workspace'),'Visible folder connection inspector missing');
    check(![...document.querySelectorAll('.pb-edge-detail button')].some(b=>b.textContent.includes('Disconnect')),'Physical folder relation incorrectly offered unlink');
    check(document.querySelector('.pb-legend').textContent.includes('AGENTS.md'),'Folder legend missing');
  })()`);
  for (const width of [1280, 800]) {
    win.setContentSize(width, 900);
    await new Promise(resolve => setTimeout(resolve, 200));
    const layout = await js(`(() => { const header=document.querySelector('.org-header'),toolbar=document.querySelector('.org-toolbar');return {width:innerWidth,page:document.documentElement.scrollWidth,header:[header.scrollWidth,header.clientWidth],toolbar:[toolbar.scrollWidth,toolbar.clientWidth]}; })()`);
    if (layout.page > width || layout.header[0] > layout.header[1] + 1 || layout.toolbar[0] > layout.toolbar[1] + 1) {
      await fs.writeFile(path.resolve(root,'../output/project-board-overflow-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
      throw Error('Project board overflow '+JSON.stringify(layout));
    }
  }
  win.setContentSize(1600, 1000); await new Promise(resolve => setTimeout(resolve, 200));
  await fs.writeFile(path.resolve(root,'../output/project-board-folder-active.png'),(await win.webContents.capturePage()).toPNG());
  const port = await js(`(() => { const r=document.querySelector('[data-project-card="folder-leaf"] [data-port="reference"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
  win.webContents.sendInputEvent({type:'mouseMove',...port});
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...port});
  await new Promise(resolve => setTimeout(resolve, 200));
  await js(`if(!document.querySelector('.pb-wire'))throw Error('Wire gesture not started');window.organizationEvent('pty:exit',{id:'folder-leaf-agent'});`);
  await new Promise(resolve => setTimeout(resolve, 200));
  await js(`if(document.querySelector('.pb-wire')||document.querySelector('[data-project-card="folder-leaf"]'))throw Error('Exited project retained wire gesture');`);
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...port});
  await js(`(async () => {
    const wait=()=>new Promise(resolve=>setTimeout(resolve,200));
    const check=(condition,message)=>{if(!condition)throw Error(message)};
    window.organizationEvent('pty:exit',{id:'folder-leaf-agent'});await wait();
    check(!document.querySelector('[data-project-card="folder-leaf"]'),'Exited project remained visible');
    check(!document.querySelector('.pb-edge[data-to="folder-leaf"]'),'Exited project retained edge');
    window.organizationEvent('pty:exit',{id:'folder-root-agent'});await wait();
    check(!document.querySelector('[data-project-card="folder-root"]'),'Inactive root remained visible for a live child');
    check(document.querySelector('[data-project-card="folder-sibling"]'),'Live child disappeared with inactive root');
    check(!document.querySelector('.pb-edge.folder[data-to="folder-sibling"]'),'Hidden ancestor retained folder connection');
    [...document.querySelectorAll('.org-view-switch button')].find(b=>b.textContent.includes('All sessions')).click();await wait();
    check(document.querySelector('[data-project-card="folder-middle"]'),'All view did not restore dormant projects');
    check(document.querySelector('.pb-edge.folder[data-from="folder-middle"][data-to="folder-leaf"]'),'All view did not restore nearest actual ancestor');
    [...document.querySelectorAll('.org-view-switch button')].find(b=>b.textContent.includes('Active sessions')).click();await wait();
    for(const agent of JSON.parse(localStorage.getItem('multiagent.agents.v1')))window.organizationEvent('pty:exit',{id:agent.id});
    await wait();
    check(document.querySelectorAll('[data-project-card]').length===0,'Empty Active view retained projects');
    check(document.querySelectorAll('.pb-edge').length===0,'Empty Active view retained edges');
    check(!document.querySelector('.pb-minimap'),'Empty Active view retained minimap');
    check(document.querySelector('.org-empty').textContent.includes('No projects have active sessions'),'Empty Active state missing');
    check(document.querySelector('.pb-arrange').disabled,'Empty Active view allowed layout save');
    document.querySelector('.org-empty button').click();await wait();
    check(document.querySelector('[data-project-card="folder-empty"]'),'Show all sessions did not recover projects');
    check(window.organizationCalls.filter(c=>c.command==='spawn_pty').length===window.folderBoardOriginal.launches,'Board filtering or arrangement started sessions');
    localStorage.setItem('multiagent.projects.v1',JSON.stringify(window.folderBoardOriginal.projects));
    localStorage.setItem('multiagent.agents.v1',JSON.stringify(window.folderBoardOriginal.agents));
    window.dispatchEvent(new StorageEvent('storage',{key:'multiagent.projects.v1'}));await wait();
  })()`);
  console.log('PROJECT_BOARD_ACTIVE_PROCESS_FILTER_FOLDER_TREE_ARRANGE_UNDO_EXIT_AND_EMPTY_OK');
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
      await exerciseProjectBoard(win);
      await exerciseFolderBoard(win);
      const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
      win.webContents.reload(); await loaded;
      console.log(await win.webContents.executeJavaScript(`(async () => {
        const wait=()=>new Promise(resolve=>setTimeout(resolve,200));
        for(let i=0;i<40&&!document.querySelector('.organization-sidebar-slot');i++)await wait();
        document.querySelector('.organization-sidebar-slot button').click();await wait();
        const scope=document.querySelector('[aria-label="Organization project"]');scope.value='project';scope.dispatchEvent(new Event('change',{bubbles:true}));await wait();
        [...document.querySelectorAll('.org-view-switch button')].find(b=>b.textContent.includes('All sessions')).click();await wait();
        const child=[...document.querySelectorAll('.org-node')].find(node=>node.querySelector('strong')?.textContent==='New child');
        if(!child)throw Error('Created child lost on reload');child.click();await wait();
        if(document.querySelector('.org-inspector [aria-label="Working folder"]').value!=='C:/custom-child')throw Error('Folder override lost on reload');
        const catalog=JSON.parse(localStorage.getItem('multiagent.agents.v1'));const item=catalog.find(agent=>agent.id===${JSON.stringify(result.childId)});
        item.sessionHierarchy.parentId='root';localStorage.setItem('multiagent.agents.v1',JSON.stringify(catalog));window.dispatchEvent(new StorageEvent('storage',{key:'multiagent.agents.v1'}));await wait();
        if(document.querySelector('.org-inspector [aria-label="Parent session"]').value!=='root')throw Error('Peer hierarchy update not reflected');
        const projects=JSON.parse(localStorage.getItem('multiagent.projects.v1'));
        if(!projects.find(p=>p.id==='project').boardPosition?.x)throw Error('Board position lost on reload');
        if(projects.find(p=>p.id==='project').hierarchy.references[0].projectId!=='other-project')throw Error('Project reference lost on reload');
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
    await fs.writeFile(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script>window.addEventListener("error",event=>console.error(event.error?.stack || event.message,JSON.stringify(window.organizationCalls?.slice(-12).map(call=>call.command))));</script><script src="renderer.js"></script>');
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
