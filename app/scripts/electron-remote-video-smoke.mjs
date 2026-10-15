import {app,BrowserWindow} from 'electron';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {RemoteDashboardService,LocalDashboardService} from '../electron/services/web-services.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-video-ui-'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timer=setTimeout(()=>{console.error('Video UI timed out');app.exit(1)},90000);
const evaluate=(win,code)=>win.webContents.executeJavaScript(code).catch(error=>{throw new Error(code,{cause:error})});
async function wait(win,code){for(let i=0;i<150;i++){if(await evaluate(win,code))return;await pause(60)}throw Error('Video UI condition failed: '+code)}
void app.whenReady().then(async()=>{let win,service,exitCode=0;
try{
 const project=path.join(root,'Plugins/Effects'),videoDirectory=path.join(root,'Saved/Results');
 fs.mkdirSync(project,{recursive:true});fs.mkdirSync(videoDirectory,{recursive:true});fs.writeFileSync(path.join(root,'Fixture.uproject'),'{}');
 const mp4=path.join(videoDirectory,'ToonStylePlus_WithCharacter.mp4'),webm=path.join(project,'demo.webm');
 const ffmpeg=process.env.ACEDIA_FFMPEG||'ffmpeg';
 if(process.env.ACEDIA_VIDEO_FIXTURE)fs.copyFileSync(process.env.ACEDIA_VIDEO_FIXTURE,mp4);
 else{const r=spawnSync(ffmpeg,['-y','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-an',mp4],{windowsHide:true});assert.equal(r.status,0,r.stderr?.toString())}
 const generated=spawnSync(ffmpeg,['-y','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-t','2','-c:v','libvpx','-an',webm],{windowsHide:true});assert.equal(generated.status,0,generated.stderr?.toString());
 fs.writeFileSync(path.join(project,'invalid.mp4'),'not a playable video');
 const chat={sessionId:'video-fixture',lifecycle:'idle',blocks:[
  {sequence:1,role:'user',kind:'text',text:'Show the video.'},
  {sequence:2,role:'tool',kind:'tool-result',output:mp4},
  {sequence:3,role:'assistant',kind:'text',text:'**Video** (`ToonStylePlus_WithCharacter.mp4`)\n\n`missing.mp4`\n\n`invalid.mp4`'}
 ],artifacts:[{path:mp4,kind:'mp4',sourceSequence:2,usage:'reference',size:fs.statSync(mp4).size}]};
 const view={language:'en',projects:[{id:'p',name:'Video project',folder:project}],agents:[{id:'a',projectId:'p',aiToolId:'claude'}]};
 const agent={id:'a',projectId:'p',folder:project,name:'Video test',aiToolId:'claude',status:'running'};
 const providers={chatProvider:async()=>chat};const output=path.resolve(import.meta.dirname,'../../output');fs.mkdirSync(output,{recursive:true});
 for(const channel of ['remote','dashboard']){
  service=channel==='remote'?new RemoteDashboardService({baseDir:path.join(root,channel),...providers}):new LocalDashboardService({baseDir:path.join(root,channel),title:'Video',defaultPort:0,configName:'dashboard.json',providers});
  if(channel==='remote'){service.config.server_port=0;service.syncView(view);service.syncAgents([agent])}else{service.config.enabled=true;service.config.serverPort=0;service.sync({view,agents:[agent]})}
  const status=await service.start();
  for(const width of [1100,390]){
   win=new BrowserWindow({show:false,width,height:850,webPreferences:{offscreen:true,backgroundThrottling:false}});
   const link="document.querySelector('.chat-md [data-chat-file-kind=video]')";
   await win.loadURL(status.url+'/?agent=a');await wait(win,'!!'+link);assert.equal(await evaluate(win,link+'.dataset.chatFilePath'),mp4);
   await evaluate(win,link+'.click()');await wait(win,"document.querySelector('#filePreviewVideo').readyState>=2");
   await evaluate(win,"document.querySelector('#filePreviewVideo').play()");await wait(win,"document.querySelector('#filePreviewVideo').currentTime>0");
   await evaluate(win,"document.querySelector('#filePreviewVideo').currentTime=0.5");await wait(win,"document.querySelector('#filePreviewVideo').currentTime>=0.5");
   assert(await evaluate(win,"(()=>{const v=document.querySelector('#filePreviewVideo').getBoundingClientRect();return v.right<=innerWidth&&v.bottom<=innerHeight&&!document.querySelector('#filePreviewVideo').hidden})()"));
   fs.writeFileSync(path.join(output,`video-path-${channel}-${width}.png`),(await win.webContents.capturePage()).toPNG());
   await evaluate(win,"document.querySelector('#filePreviewClose').click()");assert.equal(await evaluate(win,"document.querySelector('#filePreviewVideo').hasAttribute('src')"),false);
   await evaluate(win,"document.querySelector('[data-chat-file-path=\"missing.mp4\"]').click()");await wait(win,"document.querySelector('#filePreviewMessage').textContent.includes('Video file not found')");
   assert(await evaluate(win,"document.querySelector('#filePreviewVideo').hidden&&!document.querySelector('#filePreviewVideo').hasAttribute('src')"));
   fs.writeFileSync(path.join(output,`video-missing-${channel}-${width}.png`),(await win.webContents.capturePage()).toPNG());
   await evaluate(win,"document.querySelector('#filePreviewClose').click();document.querySelector('[data-chat-file-path=\"invalid.mp4\"]').click()");
   await wait(win,"!document.querySelector('#filePreviewMessage').hidden&&document.querySelector('#filePreviewMessage').textContent.includes('codec')");await evaluate(win,"document.querySelector('#filePreviewClose').click()");
   await evaluate(win,"window.originalVideoFetch=window.fetch;window.fetch=(url,options)=>options?.method==='HEAD'&&String(url).startsWith('/api/files/video')?new Promise(resolve=>{window.releaseVideoHead=()=>resolve(new Response(null,{status:200}))}):window.originalVideoFetch(url,options);void 0");
   await evaluate(win,link+'.click()');await wait(win,'!!window.releaseVideoHead');
   await evaluate(win,"document.querySelector('#filePreviewClose').click();window.releaseVideoHead();window.fetch=window.originalVideoFetch;void 0");await pause(100);
   assert(await evaluate(win,"document.querySelector('#filePreviewOverlay').hidden&&!document.querySelector('#filePreviewVideo').hasAttribute('src')"));
   await win.loadURL(status.url+'/?docs=p&file=demo.webm');await wait(win,"document.querySelector('#documentMarkdown video')?.readyState>=2");
   await evaluate(win,"document.querySelector('#documentMarkdown video').currentTime=0.5");await wait(win,"document.querySelector('#documentMarkdown video').currentTime>=0.5");
   console.log('REMOTE_VIDEO_UI_OK '+JSON.stringify({channel,width,video:process.env.ACEDIA_VIDEO_FIXTURE?'supplied MP4':'generated H264',filenameResolution:true,playback:true,seek:true,missing404:true,codecError:true,closeDuringLoad:true,documentsWebM:true}));
   win.destroy();win=null;
  }
  await service.stop();service=null;
 }
}catch(error){console.error(error);exitCode=1}finally{clearTimeout(timer);win?.destroy();await service?.stop();app.exit(exitCode)}
});
