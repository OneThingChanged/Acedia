import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (!process.versions.electron) {
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(createRequire(import.meta.url)('electron'),[fileURLToPath(import.meta.url)],{env,windowsHide:true,stdio:'inherit'});
 process.exitCode=await new Promise(r=>child.on('exit',r));
} else {
 const {app,BrowserWindow}=await import('electron');
 const {RemoteDashboardService}=await import('../electron/services/web-services.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-hosting-ui-'));app.setPath('userData',path.join(root,'profile'));
 app.on('window-all-closed',()=>{});
 const timer=setTimeout(()=>app.exit(2),40000);
 void app.whenReady().then(async()=>{ let service,upstream;const windows=[];
 try {
  let assets=0;
  upstream=http.createServer((req,res)=>{
   if(req.url.endsWith('.svg')){assets++;res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>');return;}
   res.setHeader('content-type','text/html');res.end('<html><head><title>Hosted fixture</title></head><body><h1>Hosting fixture</h1><img src="assets/icon.svg"><script>let isolated=false;try{parent.document.body}catch(e){isolated=true}parent.postMessage({hostingFixture:true,isolated},"*")</script></body></html>');
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  service=new RemoteDashboardService({baseDir:root});service.config.server_port=0;const status=await service.start();
  for(const width of [1280,390]){
   const win=new BrowserWindow({width,height:850,show:false,webPreferences:{sandbox:true,backgroundThrottling:false}});windows.push(win); win.webContents.on('console-message',event=>console.log('UI:',event.message));
   console.log('Loading Hosting',width); await win.loadURL(status.url+'/?hosting=1'); console.log('Loaded shell');
   await win.webContents.executeJavaScript(`(async()=>{
    const wait=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error('Hosting UI timeout: '+document.body.innerText)};
    await wait(()=>document.querySelector('#hostingView form input')&&!document.querySelector('#hostingView form input').disabled);
    await wait(()=>!document.querySelector('#hostingView').hidden&&!document.querySelector('#hostingView form input').disabled);
    window.addEventListener('message',e=>{if(e.data?.hostingFixture)window.hostedResult=e.data;});
    const form=document.querySelector('#hostingView form');const inputs=form.querySelectorAll('input');inputs[0].value='Fixture ${width}';inputs[1].value='http://127.0.0.1:${upstream.address().port}/docs/page-${width}.html';form.requestSubmit();
    await wait(()=>[...document.querySelectorAll('.hosting-entry button')].some(b=>b.textContent==='Fixture ${width}'&&!b.disabled));
    [...document.querySelectorAll('.hosting-entry button')].find(b=>b.textContent==='Fixture ${width}').click();
    await wait(()=>window.hostedResult);
    if(!window.hostedResult.isolated)throw new Error('Hosting can access Remote DOM');
    if(document.documentElement.scrollWidth>window.innerWidth+2)throw new Error('Horizontal overflow');
   })()`);
   assert.ok(assets>0,'relative image not proxied');
   const bounds=await win.webContents.executeJavaScript(`({visible:!document.querySelector('.hosting-frame').hidden, mobile:document.querySelector('#mobileHostingButton').getBoundingClientRect().width})`);assert.equal(bounds.visible,true);if(width===390)assert.ok(bounds.mobile>=44);
   win.destroy();
  }
  console.log('REMOTE_HOSTING_UI_AND_SANDBOX_OK');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{clearTimeout(timer);for(const win of windows)if(!win.isDestroyed())win.destroy();await service?.stop();if(upstream)await new Promise(r=>upstream.close(r));try{fs.rmSync(root,{recursive:true,force:true});}catch{}app.exit(process.exitCode||0);}
 }).catch(error=>{console.error(error);app.exit(1);});
}
