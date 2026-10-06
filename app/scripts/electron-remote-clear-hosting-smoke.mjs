import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-clear-hosting-ui-'));
  const env = { ...process.env, ACEDIA_CLEAR_HOSTING_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(createRequire(import.meta.url)('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
  process.exitCode = await new Promise(r => child.on('exit', r));
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('acedia-clear-hosting-ui-'));
  await fs.promises.rm(root,{recursive:true,maxRetries:10,retryDelay:200});
} else {
  const { app, BrowserWindow } = await import('electron');
  const { RemoteDashboardService, LocalDashboardService } = await import('../electron/services/web-services.mjs');
  const root = process.env.ACEDIA_CLEAR_HOSTING_ROOT;
  assert.ok(root && path.dirname(root)===path.resolve(os.tmpdir()) && path.basename(root).startsWith('acedia-clear-hosting-ui-'));
  app.setPath('userData', path.join(root, 'profile')); app.on('window-all-closed', () => {});
  const windows = [], services = [];
  let upstream;
  const timer = setTimeout(() => app.exit(2), 120000);
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(win, expression) {
    for (let i=0; i<200; i++) { if (await win.webContents.executeJavaScript(expression)) return; await pause(70); }
    throw new Error('UI timeout: ' + expression + '\n' + await win.webContents.executeJavaScript('document.body.innerText'));
  }
  void app.whenReady().then(async () => {
    try {
      upstream = http.createServer((req,res) => {
        if (req.url.startsWith('/offline')) { res.writeHead(503, {'content-type':'text/html'}).end('offline'); return; }
        if (req.url.endsWith('.svg')) { res.writeHead(200, {'content-type':'image/svg+xml'}).end('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>'); return; }
        res.writeHead(200, {'content-type':'text/html'}).end('<html><head><title>Aerial fixture</title></head><body><h1>Aerial comparison</h1><img src="assets/map.svg"><script>let isolated=false;try{parent.document.body}catch(e){isolated=true}parent.postMessage({hostingFixture:true,isolated},"*")</script></body></html>');
      }); await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
      const localUrl = `http://127.0.0.1:${upstream.address().port}/docs/aerial.html?mode=side#overlay`;
      for (const surface of ['remote','dashboard']) {
        let generation=0, stale=0, rejectClear=false;
        const submitted=[];
        const agents=['fixture','other'].map(id=>({id,name:id,projectId:'p',aiToolId:'codex',status:'done',runtimeStatus:'running'}));
        const snapshot=()=>({language:'en',agents,view:{language:'en',projects:[{id:'p',name:'ProjectWitch',folder:root}],agents,groups:[]}});
        const blocks=[{role:'assistant',kind:'text',sequence:1,text:`OLD_CONTEXT_MARKER\n[항공뷰](${localUrl})\n\`${localUrl}\`\n(${localUrl}).`}];
        const providers={usageProvider:async()=>({limits:[],profiles:[]}), chatProvider:async(id)=>{
          if(id==='other')return {sessionId:'other',blocks:[],lifecycle:'idle'};
          if(stale>0){stale--;return {sessionId:`session-${generation-1}`,blocks:[...blocks,{role:'assistant',kind:'text',sequence:2,text:'late old transcript'}],lifecycle:'idle'};}
          return {sessionId:`session-${generation}`,blocks:generation?[]:blocks,lifecycle:'idle'};
        },submitPty:async(_id,message)=>{
          submitted.push(message);if(rejectClear)return false;
          generation++;stale=1;return true;
        }};
        const service=surface==='remote'?new RemoteDashboardService({baseDir:path.join(root,surface),stateProvider:snapshot,...providers})
          :new LocalDashboardService({baseDir:path.join(root,surface),defaultPort:0,configName:'dashboard.json',stateProvider:snapshot,providers});
        services.push(service);if(surface==='remote')service.config.server_port=0;
        const {url}=await service.start();
        for(const width of [1280,390]) {
          generation=0;stale=0;submitted.length=0;rejectClear=false;
          const win=new BrowserWindow({width,height:850,show:false,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}});windows.push(win);
          const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
          await win.loadURL(url+'/?agent=fixture&view=chat');
          await waitFor(win,"document.querySelector('#chatView').innerText.includes('OLD_CONTEXT_MARKER')");
          await win.webContents.executeJavaScript('window.open=()=>null;true;');
          for(let i=0;i<3;i++){
            await win.webContents.executeJavaScript(`document.querySelectorAll('[data-chat-hosting-url]')[${i}].click()`);
            await waitFor(win,"!document.querySelector('#filePreviewOpen').hidden");
            const href=await win.webContents.executeJavaScript("document.querySelector('#filePreviewOpen').href");
            assert.match(href,/\/hosting-preview\/[A-Za-z0-9_-]{43}\/docs\/aerial.html\?mode=side#overlay$/);
            await win.webContents.executeJavaScript("document.querySelector('#filePreviewClose').click()");
          }
          assert.equal(service.hosting.store.get().entries.length,1,'duplicate registration');
          await win.webContents.executeJavaScript(`(() => {
            window.addEventListener('message', e => { if(e.data?.hostingFixture)window.hostedResult=e.data; });
            document.querySelector('#hostingButton').click();
          })()`);
          await waitFor(win,"document.querySelector('.hosting-entry button')&&!document.querySelector('.hosting-entry button').disabled");
          await win.webContents.executeJavaScript("document.querySelector('.hosting-entry button').click()");
          await waitFor(win,'window.hostedResult?.isolated===true');
          assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth+2'),true);
          await win.webContents.executeJavaScript("document.querySelector('.session-row[data-agent-id=fixture]').click()");
          await waitFor(win,"!document.querySelector('#chatView').hidden");
          rejectClear=true;
          await win.webContents.executeJavaScript(`(() => { const i=document.querySelector('#messageInput');i.value='/clear';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
          await waitFor(win,"document.querySelector('#toast').innerText.includes('Could not send')");
          assert.equal(await win.webContents.executeJavaScript("document.querySelector('#messageInput').value"),'/clear');
          assert.equal(await win.webContents.executeJavaScript("document.querySelector('#chatView').innerText.includes('OLD_CONTEXT_MARKER')"),true);
          rejectClear=false;await pause(1200);
          await win.webContents.executeJavaScript("document.querySelector('#messageInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
          await waitFor(win,"document.querySelector('#messageInput').value===''");
          await waitFor(win,"!document.querySelector('#chatView').innerText.includes('OLD_CONTEXT_MARKER')");
          await pause(4200);
          assert.equal(await win.webContents.executeJavaScript("document.querySelector('#chatView').innerText.includes('late old transcript')"),false);
          await win.webContents.executeJavaScript("document.querySelector('.session-row[data-agent-id=other]').click()");
          await pause(200);
          await win.webContents.executeJavaScript("document.querySelector('.session-row[data-agent-id=fixture]').click()");
          await pause(500);
          assert.equal(await win.webContents.executeJavaScript("document.querySelector('#chatView').innerText.includes('OLD_CONTEXT_MARKER')"),false);
          await win.loadURL(url+'/?agent=fixture&view=chat');await waitFor(win,"document.querySelector('#detailName').textContent==='fixture'");
          assert.equal(await win.webContents.executeJavaScript("document.querySelector('#chatView').innerText.includes('OLD_CONTEXT_MARKER')"),false);
          assert.equal(submitted.length,2,'exact command was not sent once per Enter');
          if(width===390){
            generation=0;await win.loadURL(url+'/?agent=fixture&view=chat');
            await waitFor(win,"document.querySelector('[data-chat-hosting-url]')");
            await win.webContents.executeJavaScript(`window.__MULTIAGENT_NATIVE_APP__=true;window.__MULTIAGENT_NATIVE_EXTERNAL_PREVIEW__=true;window.ReactNativeWebView={postMessage:value=>{if(JSON.parse(value).type==='multiagent:open-external-preview')window.unexpectedExternalOpen=true}};document.querySelector('[data-chat-hosting-url]').click();true;`);
            await waitFor(win,"!document.querySelector('#hostingView').hidden&&!document.querySelector('.hosting-frame').hidden");
            assert.match(await win.webContents.executeJavaScript("document.querySelector('.hosting-frame').src"),/hosting-preview/);
            assert.equal(await win.webContents.executeJavaScript('Boolean(window.unexpectedExternalOpen)'),false,'old APK bridge cannot open Hosting links');
          }
          assert.deepEqual(errors,[]);
          console.log('CLEAR_AND_AUTO_HOSTING_OK',surface,width);win.destroy();
        }
        service.server?.closeAllConnections();await service.stop();
      }
      console.log('REMOTE_DASHBOARD_CLEAR_AUTO_HOSTING_MOBILE_DESKTOP_OK');
    } catch(error){ console.error(error);process.exitCode=1; }
    finally {
      clearTimeout(timer);for(const win of windows)if(!win.isDestroyed())win.destroy();for(const service of services){service.server?.closeAllConnections();await service.stop();}
      if(upstream)await new Promise(r=>{upstream.closeAllConnections();upstream.close(r);});
      app.exit(process.exitCode||0);
    }
  }).catch(error=>{console.error(error);app.exit(1);});
}
