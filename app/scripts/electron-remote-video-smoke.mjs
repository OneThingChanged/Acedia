import {app,BrowserWindow} from 'electron';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {RemoteDashboardService} from '../electron/services/web-services.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-video-ui-'));app.setPath('userData',path.join(root,'profile'));
const timeout=setTimeout(()=>app.exit(1),45000);
console.log("VIDEO_SMOKE_START");
void app.whenReady().then(async () => { let win,service;
try {
 win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{backgroundThrottling:false}});
 await win.loadURL('about:blank');
 const {spawnSync}=await import('node:child_process');
 const generated=spawnSync(process.env.ACEDIA_FFMPEG || 'ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-t','2','-c:v','libvpx','-an',path.join(root,'demo.webm')],{windowsHide:true});
 assert.equal(generated.status,0,generated.stderr?.toString());
 service=new RemoteDashboardService({baseDir:path.join(root,'service'),chatProvider:async()=>({blocks:[{sequence:1,role:'assistant',kind:'text',text:'(demo.webm)'}]})});service.config.server_port=0;
 service.syncAgents([{id:'a',projectId:'p',name:'Video test',aiToolId:'codex',status:'running'}]);service.syncView({projects:[{id:'p',name:'Video project',folder:root}],agents:[{id:'a',projectId:'p',aiToolId:'codex'}]});const status=await service.start();
 async function wait(expression){for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error(expression);}
 await win.loadURL(status.url+'/?agent=a');await wait(`!!document.querySelector('[data-chat-file-kind="video"]')`);await win.webContents.executeJavaScript(`document.querySelector('[data-chat-file-kind="video"]').click()`);await wait(`document.querySelector('#filePreviewVideo').readyState>=2`);
 await win.webContents.executeJavaScript(`document.querySelector('#filePreviewVideo').play()`);await wait(`document.querySelector('#filePreviewVideo').currentTime>0`);await win.webContents.executeJavaScript(`document.querySelector('#filePreviewClose').click()`);assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#filePreviewVideo').hasAttribute('src')`),false);
 win.setSize(390,800);
 await win.loadURL(status.url+'/?docs=p&file=demo.webm');await wait(`!!document.querySelector('.document-row[data-kind="video"]')`);await wait(`document.querySelector('#documentMarkdown video')?.readyState>=2`);
 await win.webContents.executeJavaScript(`document.querySelector('#documentMarkdown video').currentTime=0.5`);await wait(`document.querySelector('#documentMarkdown video').currentTime>=0.5`);
 console.log('REMOTE_VIDEO_UI_OK chat playback, close cleanup, Documents list and seek');
} catch(e){console.error(e);process.exitCode=1;} finally{clearTimeout(timeout);win?.destroy();await service?.stop();app.exit(process.exitCode||0);}

});
