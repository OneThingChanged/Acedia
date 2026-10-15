import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LocalDashboardService, RemoteDashboardService } from '../electron/services/web-services.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-remote-zip-'));
app.setPath('userData',path.join(root,'profile'));
app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const windows=[],services=[];
const source=Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==','base64'); // Empty ZIP, including its binary end-of-central-directory record.
let downloads=0;
const timer=setTimeout(()=>{console.error('ZIP download smoke timed out');app.exit(1);},90000);
const evaluate=(win,code)=>win.webContents.executeJavaScript(code);
async function wait(win,code){
  for(let i=0;i<100;i++){if(await evaluate(win,code))return;await pause(50);}
  throw Error('ZIP UI condition failed: '+code);
}
async function download(win,expression,name){
  const target=path.join(root,`download-${++downloads}.zip`);
  await new Promise((resolve,reject)=>{
    const session=win.webContents.session;
    const cleanup=()=>{clearTimeout(timeout);session.off('will-download',listener);};
    const timeout=setTimeout(()=>{cleanup();reject(Error('ZIP browser download did not finish'));},10000);
    const listener=(_event,item,contents)=>{
      if(contents!==win.webContents)return;
      session.off('will-download',listener);
      try{
        assert.equal(item.getFilename(),name);assert.match(item.getURL(),/\/api\/docs\/download\?/);
        item.setSavePath(target);
        item.once('done',(_event,state)=>{cleanup();state==='completed'?resolve():reject(Error('ZIP download state: '+state));});
      }catch(error){item.cancel();cleanup();reject(error);}
    };
    session.on('will-download',listener);
    evaluate(win,expression).catch(error=>{cleanup();reject(error);});
  });
  assert.deepEqual(fs.readFileSync(target),source);
}
void app.whenReady().then(async()=>{
  let exitCode=0;
  try{
    const project=path.join(root,'project'),docs=path.join(project,'docs'),exports=path.join(root,'Downloads');
    fs.mkdirSync(docs,{recursive:true});fs.mkdirSync(exports);
    const name='연동 묶음.ZIP',archive=path.join(docs,name),external=path.join(exports,'공개키 전달.zip');
    fs.writeFileSync(archive,source);fs.writeFileSync(external,source);
    fs.writeFileSync(path.join(docs,'guide.md'),`# 전달 안내\n\n[압축 파일 받기](${encodeURIComponent(name)})\n`);
    const agents=[{id:'a1',name:'ZIP fixture',projectId:'p1',folder:project,aiToolId:'codex',tool:'codex',status:'running'}];
    const view={language:'en',projects:[{id:'p1',name:'Archive project',folder:project}],agents};
    const text=[`[연동 묶음](${archive.replaceAll('\\','/')})`,`\`docs/${name}\``,`[공개키 전달](${pathToFileURL(external).href})`,`[결과 폴더](${docs.replaceAll('\\','/')})`,'`missing.zip`','`docs/guide.md`'].join('\n\n');
    const chat=async()=>({sessionId:'fixture',lifecycle:'idle',hasOlder:false,blocks:[{sequence:1,role:'assistant',kind:'text',text}],
      artifacts:[{sourceSequence:1,path:archive,kind:'zip',usage:'output'}]});
    for(const channel of ['remote','dashboard']){
      const service=channel==='remote'
        ?new RemoteDashboardService({baseDir:path.join(root,channel),chatProvider:chat})
        :new LocalDashboardService({title:'ZIP fixture',defaultPort:0,baseDir:path.join(root,channel),configName:'dashboard.json',providers:{chatProvider:chat}});
      services.push(service);
      if(channel==='remote'){service.config.server_port=0;service.syncView(view);service.syncAgents(agents);}
      else {service.config.enabled=true;service.config.serverPort=0;service.sync({view,agents});}
      const {url}=await service.start();
      for(const width of [1280,390]){
        const win=new BrowserWindow({width,height:900,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true}});windows.push(win);
        const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
        await win.loadURL(url+'/?agent=a1');
        await wait(win,"document.querySelector('#detailName')?.textContent.includes('ZIP fixture')");
        await evaluate(win,`window.zipRequests=[];const nativeFetch=window.fetch;window.fetch=(input,options)=>{window.zipRequests.push({url:String(input),method:options?.method||'GET'});return nativeFetch(input,options);};document.querySelector('#sessionMode [data-mode=chat]').click()`);
        await wait(win,"document.querySelectorAll('.chat-md [data-chat-file-kind=archive]').length===4");
        const clickLabel=label=>`Array.from(document.querySelectorAll('.chat-md .chat-file-link')).find(node=>node.textContent===${JSON.stringify(label)}).click()`;
        for(const [label,filename]of [['연동 묶음',name],[`docs/${name}`,name],['공개키 전달','공개키 전달.zip']]){
          await download(win,clickLabel(label),filename);
          assert.equal(await evaluate(win,"document.querySelector('#filePreviewOverlay').hidden"),true,'ZIP click opened a text preview');
        }
        await download(win,"document.querySelector('.chat-file-card[data-chat-file-kind=archive]').click()",name);
        await evaluate(win,clickLabel('결과 폴더'));
        await wait(win,"document.querySelector('.chat-folder-list')?.textContent.includes('연동 묶음.ZIP')");
        await download(win,`Array.from(document.querySelectorAll('.chat-folder-list button')).find(node=>node.textContent===${JSON.stringify(name)}).click()`,name);
        assert.equal(await evaluate(win,"!document.querySelector('#filePreviewOverlay').hidden && !!document.querySelector('.chat-folder-list')"),true,'ZIP download closed folder browsing');
        await evaluate(win,"document.querySelector('#filePreviewClose').click()");
        await evaluate(win,clickLabel('docs/guide.md'));
        await wait(win,"document.querySelector('#filePreviewMarkdown [data-document-link]')");
        await download(win,"document.querySelector('#filePreviewMarkdown [data-document-link]').click()",name);
        await evaluate(win,"document.querySelector('#filePreviewClose').click()");
        let unwanted=false;const listener=()=>{unwanted=true;};win.webContents.session.on('will-download',listener);
        try{
          await evaluate(win,clickLabel('missing.zip'));
          await wait(win,"document.querySelector('#toast')?.textContent.includes('Could not download file')");
          assert.equal(unwanted,false,'Missing ZIP started a browser download');
        }finally{win.webContents.session.off('will-download',listener);}
        const requests=await evaluate(win,'window.zipRequests');
        assert.ok(requests.some(request=>request.url.startsWith('/api/docs/download?')&&request.method==='HEAD'));
        assert.ok(!requests.some(request=>request.url.startsWith('/api/docs/read?')&&decodeURIComponent(request.url).includes('.ZIP')),'ZIP was requested as text');
        assert.deepEqual(errors.filter(error=>!error.includes('404 (Not Found)')),[]);
        console.log('REMOTE_ZIP_CHAT_CARD_FOLDER_MARKDOWN_DOWNLOAD_OK '+JSON.stringify({channel,width,downloads,bytes:source.length}));win.destroy();
      }
    }
  }catch(error){console.error(error);exitCode=1;}
  finally{
    clearTimeout(timer);for(const win of windows)if(!win.isDestroyed())win.destroy();
    for(const service of services)await service.stop();
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('acedia-remote-zip-'));
    try{fs.rmSync(root,{recursive:true,maxRetries:5,retryDelay:100});}catch{/* Chromium may release profile locks after exit. */}
    app.exit(exitCode);
  }
});
