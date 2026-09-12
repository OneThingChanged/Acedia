import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.versions.electron){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'worker-ui-'));const {build}=await import('esbuild');
 await build({entryPoints:[path.join(root,'scripts/fixtures/subagent-monitor-renderer.tsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},outfile:path.join(dir,'renderer.js')});
 fs.writeFileSync(path.join(dir,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
 const env={...process.env,WORKER_UI_DIR:dir};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{env,windowsHide:true,stdio:'inherit'});const code=await new Promise(r=>child.on('exit',r));if(code)throw Error('Worker UI failed');
}else{
 const {app,BrowserWindow,ipcMain}=require('electron');app.setPath('userData',path.join(process.env.WORKER_UI_DIR,'profile'));
 app.whenReady().then(async()=>{let win;
 try{
 ipcMain.handle('subagent_list',()=>['a','b'].map(id=>({sessionId:id,name:'Worker '+id,path:id,updatedAt:Date.now()})));
 let calls=0;ipcMain.handle('read_chat_transcript',(_e,args)=>({blocks:[{role:'assistant',kind:'text',text:args.path+' live '+(++calls)}],truncated:false,missing:false}));
 win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});await win.loadFile(path.join(process.env.WORKER_UI_DIR,'index.html'));
 const run=s=>win.webContents.executeJavaScript(s);const delay=ms=>new Promise(r=>setTimeout(r,ms));await delay(700);
 if(!await run(`document.querySelector('.subagent-log').textContent.includes('a live')`))throw Error('Initial log missing');
 await run(`const s=document.querySelector('.subagent-monitor select');s.value='b';s.dispatchEvent(new Event('change',{bubbles:true}));`);await delay(400);
 if(!await run(`document.querySelector('.subagent-log').textContent.includes('b live')&&!document.querySelector('.subagent-log').textContent.includes('a live')`))throw Error('Worker switch stale');
 const before=calls;await delay(2200);if(calls<=before)throw Error('Polling stopped');
 fs.mkdirSync(path.join(root,'../.acedia/worker-monitor'),{recursive:true});fs.writeFileSync(path.join(root,'../.acedia/worker-monitor/panel.png'),(await win.webContents.capturePage()).toPNG());
 await run(`document.querySelector('.subagent-monitor header button').click()`);if(!await run(`document.body.dataset.closed==='true'`))throw Error('Close failed');
 console.log('SUBAGENT_MONITOR_UI_OK');win.destroy();app.exit(0);
 }catch(e){console.error(e);win?.destroy();app.exit(1);}
 });
}
