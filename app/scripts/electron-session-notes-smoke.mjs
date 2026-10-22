import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const appRoot=path.resolve(import.meta.dirname,'..');
const output=path.resolve(appRoot,'../output/session-notes-validation');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(win,condition) {
  for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(condition))return;await pause(70);}
  throw Error('Note UI timed out: '+condition);
}
async function edit(win,selector,value) {
  await win.webContents.executeJavaScript(`(() => {const editor=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,${JSON.stringify(value)});editor.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}

if(process.versions.electron) {
  const {app,BrowserWindow,ipcMain}=await import('electron');
  const {SessionNotes}=await import('../electron/services/session-notes.mjs');
  const {LocalDashboardService,RemoteDashboardService}=await import('../electron/services/web-services.mjs');
  const {assertInvokeRequest}=require('../electron/ipc-contract.cjs');
  const directory=process.env.ACEDIA_NOTES_SMOKE_DIRECTORY;
  app.disableHardwareAcceleration();app.setPath('userData',path.join(directory,'profile'));app.on('window-all-closed',()=>{});
  const windows=[],services=[];let notes;
  app.whenReady().then(async()=>{
    try {
      await fs.mkdir(output,{recursive:true});notes=new SessionNotes(path.join(directory,'notes'));
      ipcMain.handle('note-fixture',(_event,{command,args})=>{
        assertInvokeRequest(command,args);
        assert(['ux','image','routing','shader','files','archived'].includes(args.id));
        return command==='session_notes_get'?notes.read(args.id):notes.save(args);
      });
      const desktop=async()=>{
        const win=new BrowserWindow({width:1360,height:920,show:false,webPreferences:{offscreen:true,contextIsolation:true,sandbox:false,backgroundThrottling:false,preload:path.join(directory,'preload.cjs')}});
        windows.push(win);await win.loadFile(path.join(directory,'index.html'));await until(win,"!!document.querySelector('.sidebar-workspace')");return win;
      };
      const first=await desktop(),run=code=>first.webContents.executeJavaScript(code);
      await until(first,"!!document.querySelector('[data-pane-active-agent-id=ux] .session-note-toggle')");
      await run("document.querySelector('[data-pane-active-agent-id=ux] .session-note-toggle').click()");
      await until(first,"!document.querySelector('.session-note-editor').disabled && document.activeElement===document.querySelector('.session-note-editor')");
      await edit(first,'.session-note-editor','데스크톱 개인 메모\n다음에 셰이더 비교');
      await until(first,"document.querySelector('.session-note-save').classList.contains('saved')");
      assert.equal(notes.read('ux').text,'데스크톱 개인 메모\n다음에 셰이더 비교');
      await fs.writeFile(path.join(output,'desktop-split.png'),(await first.webContents.capturePage()).toPNG());
      const second=await desktop();
      await second.webContents.executeJavaScript("document.querySelector('[data-pane-active-agent-id=ux] .session-note-toggle').click()");
      await until(second,"document.querySelector('.session-note-editor')?.value.includes('데스크톱 개인 메모')");
      await edit(first,'.session-note-editor','다른 창에서 먼저 저장한 내용');await until(first,"document.querySelector('.session-note-save').classList.contains('saved')");
      await edit(second,'.session-note-editor','충돌해도 보관할 내 초안');await until(second,"!!document.querySelector('.session-note-conflict')");
      assert.equal(notes.read('ux').text,'다른 창에서 먼저 저장한 내용');
      assert.equal(await second.webContents.executeJavaScript("document.querySelector('.session-note-editor').value"),'충돌해도 보관할 내 초안');
      await fs.writeFile(path.join(output,'desktop-conflict.png'),(await second.webContents.capturePage()).toPNG());
      await second.webContents.executeJavaScript("[...document.querySelectorAll('.session-note-conflict button')].find(button=>button.textContent.includes('내 메모')).click()");
      await until(second,"!document.querySelector('.session-note-conflict')");assert.equal(notes.read('ux').text,'충돌해도 보관할 내 초안');
      const before=await run("({active:document.querySelector('.pane-active').dataset.paneActiveAgentId,spawns:window.layoutCalls.filter(call=>call.command==='spawn_pty').length})");
      await run("document.querySelector('.sidebar-recents [data-sidebar-agent-id=routing]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:140,clientY:420}));");
      await until(first,"!!document.querySelector('[data-session-action=note]')");await run("document.querySelector('[data-session-action=note]').click()");
      await until(first,"document.querySelector('.session-note-owner strong')?.textContent==='분산 요청 상태 표시'");
      await edit(first,'.session-note-editor','꺼진 세션에 남긴 메모');await until(first,"document.querySelector('.session-note-save').classList.contains('saved')");
      const after=await run("({active:document.querySelector('.pane-active').dataset.paneActiveAgentId,spawns:window.layoutCalls.filter(call=>call.command==='spawn_pty').length})");
      assert.deepEqual(after,before,'Opening an offline note selected or started a session');assert.equal(notes.read('routing').text,'꺼진 세션에 남긴 메모');
      await run("document.querySelector('.session-note-head [aria-label=\"메모 복사\"]').click()");
      await until(first,"window.layoutCalls.some(call=>call.command==='clipboard_write_text'&&call.args.text==='꺼진 세션에 남긴 메모')");
      await run("document.querySelector('.session-note-head [aria-label=\"메모 닫기\"]').click();document.querySelector('[data-pane-active-agent-id=ux] .session-standby button').click()");
      await until(first,"!document.querySelector('[data-pane-active-agent-id=ux] .session-standby')");
      await run("document.querySelector('[data-pane-active-agent-id=ux] [aria-label=\"대화(채팅) 뷰로 전환\"]').click()");
      await until(first,"!!document.querySelector('[data-pane-active-agent-id=ux] .chat-view')");
      await run("document.querySelector('[data-pane-active-agent-id=ux] .session-note-toggle').click()");
      await until(first,"!!document.querySelector('.session-note-editor') && !document.querySelector('.session-note-editor').disabled");
      await edit(first,'.session-note-editor','채팅에서 작성하고 터미널에서도 유지');await until(first,"document.querySelector('.session-note-save').classList.contains('saved')");
      await run("document.querySelector('[data-pane-active-agent-id=ux] [aria-label=\"터미널 뷰로 전환\"]').click()");
      await until(first,"!document.querySelector('[data-pane-active-agent-id=ux] .chat-view')");
      assert.equal(await run("document.querySelector('.session-note-editor').value"),'채팅에서 작성하고 터미널에서도 유지');
      console.log('SESSION_NOTES_DESKTOP_OK split panes; exact autosave; conflict preserves drafts; offline menu without selection/start; copy');

      const agents=[{id:'ux',name:'Work session',projectId:'p',aiToolId:'codex',status:'idle',runtimeStatus:'running',live:true,lastSessionId:'fixture-thread'},
        {id:'routing',name:'Offline session',projectId:'p',aiToolId:'qwen',status:'offline',runtimeStatus:'idle',live:false}];
      const state=()=>({language:'en',pwa:true,remote:true,agents,view:{language:'en',agents,projects:[{id:'p',name:'Note fixture',folder:directory}],groups:[]}});
      const providers={sessionNotes:{read:id=>notes.read(id),save:args=>notes.save(args)},usageProvider:()=>({limits:[],profiles:[]}),chatProvider:async()=>({tool:'codex',sessionId:'fixture-thread',lifecycle:'idle',blocks:[{sequence:1,role:'assistant',kind:'text',text:'A conversation without note contents.'}]}),restartSession:()=>{throw Error('A note must never start a session')}};
      for(const kind of ['remote','dashboard']){
        const service=kind==='remote'?new RemoteDashboardService({baseDir:path.join(directory,kind),stateProvider:state,...providers}):new LocalDashboardService({baseDir:path.join(directory,kind),defaultPort:0,title:'Notes fixture',configName:'dashboard.json',stateProvider:state,providers});
        if(kind==='remote')service.config.server_port=0;services.push(service);const {url}=await service.start();
        const win=new BrowserWindow({width:1280,height:940,show:false,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,backgroundThrottling:false}});windows.push(win);
        const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'&&!event.message.includes('favicon'))errors.push(event.message)});
        await win.loadURL(url+'/?session=ux&filter=all');await until(win,"!!document.querySelector('#sessionNoteButton') && !document.querySelector('#sessionView').hidden");
        const expected=notes.read('ux').text;
        await win.webContents.executeJavaScript("document.querySelector('#sessionNoteButton').click()");
        await until(win,`document.querySelector('.remote-note-editor').value===${JSON.stringify(expected)}`);
        await edit(win,'.remote-note-editor',`${kind}에서 바꾼 메모`);await until(win,"document.querySelector('.remote-note-status').dataset.state==='saved'");
        assert.equal(notes.read('ux').text,`${kind}에서 바꾼 메모`);
        await fs.writeFile(path.join(output,kind+'-desktop.png'),(await win.webContents.capturePage()).toPNG());
        await win.webContents.executeJavaScript("document.querySelector('#sessionList [data-agent-id=routing]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:160,clientY:400}));document.querySelector('#sessionContextMenu [data-session-action=note]').click()");
        await until(win,"document.querySelector('.remote-note-editor').value==='꺼진 세션에 남긴 메모'");
        assert.equal(await win.webContents.executeJavaScript("document.querySelector('#detailName').textContent"),'Work session');
        await win.webContents.executeJavaScript("document.querySelector('.remote-note-head button:last-child').click();document.querySelector('#sessionNoteButton').click()");
        await until(win,`document.querySelector('.remote-note-editor').value===${JSON.stringify(`${kind}에서 바꾼 메모`)}`);
        for(const width of [390,320]){
          win.setContentSize(width,920);await pause(150);
          const geometry=await win.webContents.executeJavaScript("({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,editor:document.querySelector('.remote-note-editor').getBoundingClientRect().width})");
          assert(geometry.scroll<=geometry.width+1 && geometry.editor>180,`${kind} overflow at ${width}: ${JSON.stringify(geometry)}`);
          await fs.writeFile(path.join(output,`${kind}-${width}.png`),(await win.webContents.capturePage()).toPNG());
        }
        await win.reload();await until(win,"!document.querySelector('#sessionView').hidden");await win.webContents.executeJavaScript("document.querySelector('#sessionNoteButton').click()");
        await until(win,`document.querySelector('.remote-note-editor').value===${JSON.stringify(`${kind}에서 바꾼 메모`)}`);
        assert(!errors.length,errors.join('\n'));
        console.log(`SESSION_NOTES_${kind.toUpperCase()}_OK host persistence; Desktop shared note; reload; widths 1280/390/320`);
      }
      await fs.writeFile(path.join(output,'passed.json'),JSON.stringify({desktop:true,remote:true,dashboard:true,completedAt:new Date().toISOString()},null,2));
      for(const win of windows)if(!win.isDestroyed())win.destroy();await Promise.all(services.map(service=>service.stop()));notes.close();app.exit(0);
    }catch(error){console.error(error);for(const [index,win]of windows.entries())if(!win.isDestroyed())await fs.writeFile(path.join(output,`failure-${index}.png`),(await win.webContents.capturePage()).toPNG());app.exit(1);}
  });
} else {
  const {build}=await import('esbuild');const directory=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-notes-ui-'));
  try {
    await build({entryPoints:[path.join(appRoot,'scripts/fixtures/session-notes-renderer.tsx')],bundle:true,define:{'import.meta.env':'{}','__MULTIAGENT_APP_VERSION__':JSON.stringify('notes-smoke')},jsx:'automatic',outfile:path.join(directory,'renderer.js')});
    await fs.writeFile(path.join(directory,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}</style><div id="root"></div><script src="renderer.js"></script>');
    await fs.copyFile(path.join(appRoot,'public/app-icon.png'),path.join(directory,'app-icon.png'));
    await fs.writeFile(path.join(directory,'preload.cjs'),"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('noteFixtureHost',{invoke:(command,args)=>ipcRenderer.invoke('note-fixture',{command,args})});");
    const env={...process.env,ACEDIA_NOTES_SMOKE_DIRECTORY:directory};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{env,stdio:'inherit',windowsHide:true});
    const timeout=setTimeout(()=>child.kill(),100000);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)}).finally(()=>clearTimeout(timeout));
    assert.equal(code,0,'Session note UI smoke failed');
  }finally {
    if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('acedia-notes-ui-'))throw Error('Unexpected cleanup path');
    await fs.rm(directory,{recursive:true,maxRetries:5,retryDelay:200});
  }
}
