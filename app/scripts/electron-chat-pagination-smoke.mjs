import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ConversationStoreManager } from '../electron/services/conversation-store.mjs';
import { RemoteDashboardService, LocalDashboardService } from '../electron/services/web-services.mjs';
const require=createRequire(import.meta.url), appRoot=path.resolve(import.meta.dirname,'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const line=(role,text)=>JSON.stringify({type:'response_item',payload:{type:'message',role,content:[{type:role==='user'?'input_text':'output_text',text}]}});
async function waitFor(win,expression){for(let i=0;i<180;i++){if(await win.webContents.executeJavaScript(expression))return;await sleep(60);}throw Error('UI timeout: '+expression);}
if(process.versions.electron){
  const {app,BrowserWindow,ipcMain}=require('electron'),root=process.env.ACEDIA_PAGINATION_FIXTURE;
  app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const manager=new ConversationStoreManager({configDir:path.join(root,'config'),defaultRoot:path.join(root,'history')});
    const input={agentId:'fixture',sessionId:'one',provider:'codex',transcriptPath:path.join(root,'session.jsonl'),projectPath:root};
    const records=[];
    const answer=i=>`Answer ${i}\n\n`+('Readable history with a stable scroll anchor.\n\n').repeat(16);
    for(let i=0;i<200;i++){
      records.push(line('user','Question '+i));
      for(let t=0;t<4;t++){
        records.push(JSON.stringify({type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:`${i}-${t}`,arguments:JSON.stringify({cmd:'echo '+'x'.repeat(1800)})}}));
        records.push(JSON.stringify({type:'response_item',payload:{type:'function_call_output',call_id:`${i}-${t}`,output:'Fixture tool output '+i+'-'+t+'\n'+'x'.repeat(2000)}}));
      }
      records.push(line('assistant',answer(i)));
    }
    await fs.writeFile(input.transcriptPath,records.join('\n')+'\n');await manager.ingestTranscript(input);
    const baseline=await manager.listBlocks({...input,limit:400});
    const first=await manager.listBlocks({...input,turnLimit:5});
    const oldBytes=Buffer.byteLength(JSON.stringify(baseline)),newBytes=Buffer.byteLength(JSON.stringify(first));
    assert.ok(newBytes<oldBytes/5);
    console.log(`CHAT_FIRST_PAGE_BYTES legacy=${oldBytes} paged=${newBytes} blocks=${first.blocks.length}`);
    const calls=[], details=[], images=[];
    let failOlder=false,delayOlder=0;
    const getPage=async(id,options)=>{
      calls.push({id,...options});
      if(options.beforeSequence){if(failOlder){failOlder=false;throw Error('Fixture older page failure');}await sleep(delayOlder);}
      const page=await manager.listBlocks({...input,agentId:id,...options});
      return {...page,sessionId:'one',tool:'codex',lifecycle:'idle',pendingQuestion:null};
    };
    const getDetails=async(id,options)=>{details.push({id,...options});return manager.readBlockDetails({...options,agentId:id});};
    ipcMain.handle('pagination-fixture',async(_event,command,args)=>{
      if(command==='chat_blocks')return getPage(args.id,args);
      if(command==='chat_block_details')return getDetails(args.id,args);
      if(command==='read_chat_images'){images.push(args);return [];}
      return null;
    });
    const append=async i=>{await fs.appendFile(input.transcriptPath,line('user','Question '+i)+'\n'+line('assistant',answer(i))+'\n');await manager.ingestTranscript(input);};
    const desktop=new BrowserWindow({width:1000,height:820,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(root,'preload.cjs')}});
    try{
      await desktop.loadFile(path.join(root,'index.html'));
      await waitFor(desktop,"document.querySelector('.chat-thread')?.textContent.includes('Answer 199')");
      assert.ok(await desktop.webContents.executeJavaScript("!document.querySelector('.chat-thread').textContent.includes('Answer 194') && document.querySelectorAll('.chat-turn.user').length===5"));
      assert.equal(details.length,0,'Collapsed work fetched full details');
      await desktop.webContents.executeJavaScript("[...document.querySelectorAll('.chat-work-tools')].at(-1).open=true");
      await waitFor(desktop,"document.querySelectorAll('.chat-tool').length===4");
      await desktop.webContents.executeJavaScript("document.querySelectorAll('.chat-tool')[0].open=true");
      await waitFor(desktop,"document.querySelector('.chat-tool pre')?.textContent.includes('Fixture tool output 199-0')");
      assert.equal(details.length,1);
      const firstImageReads=images.length;await desktop.webContents.executeJavaScript("window.paginationFixture.refresh()");await sleep(400);
      assert.ok(calls.some(call=>call.afterSequence===first.lastSequence));
      assert.equal(images.length,firstImageReads,'Unchanged update re-read images');
      await desktop.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop=0");
      await waitFor(desktop,"document.querySelector('.chat-thread').textContent.includes('Answer 190') && !document.querySelector('.chat-thread').textContent.includes('Answer 189')");
      assert.ok(await desktop.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop>400"),'Prepend moved the reader to the old page');
      delayOlder=500;await desktop.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop=0");
      await sleep(100);await append(200);await desktop.webContents.executeJavaScript("window.paginationFixture.refresh()");
      await waitFor(desktop,"document.querySelector('.chat-thread').textContent.includes('Answer 185') && document.querySelector('.chat-thread').textContent.includes('Answer 200')");
      assert.ok(await desktop.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop>400"),'Concurrent update discarded the older-page scroll anchor');
      delayOlder=0;failOlder=true;await desktop.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop=0");
      await waitFor(desktop,"document.querySelector('.chat-more')?.textContent.includes('다시 시도')");
      await desktop.webContents.executeJavaScript("document.querySelector('.chat-more').click()");
      await waitFor(desktop,"document.querySelector('.chat-thread').textContent.includes('Answer 180')");
      await fs.mkdir(path.resolve(appRoot,'../output'),{recursive:true});
      await fs.writeFile(path.resolve(appRoot,'../output/chat-pagination-desktop.png'),(await desktop.webContents.capturePage()).toPNG());
      console.log('DESKTOP_CHAT_PAGING_LAZY_DETAILS_DELTA_SCROLL_ANCHOR_CONCURRENT_UPDATE_AND_RETRY_OK');
    }finally{desktop.destroy();}
    for(const dashboard of [false,true])for(const width of [1024,390]){
      calls.length=0;details.length=0;
      const agent={id:'fixture',name:'Paging fixture',projectId:'p',aiToolId:'codex',status:'running',hook:{event:'done',session_id:'one'}};
      const view={language:'ko',projects:[{id:'p',name:'Fixture',folder:root}],agents:[agent]};
      const providers={chatProvider:getPage,chatDetails:getDetails,chatImages:async()=>[]};
      const web=dashboard?new LocalDashboardService({baseDir:path.join(root,'dashboard-'+width),title:'Fixture',defaultPort:0,configName:'dashboard.json',providers,stateProvider:()=>({view,agents:[agent]})})
        :new RemoteDashboardService({baseDir:path.join(root,'remote-'+width),...providers});
      if(!dashboard){web.config.server_port=0;web.syncView(view);web.syncAgents([agent]);}
      const status=await web.start(),win=new BrowserWindow({width,height:820,show:false,webPreferences:{sandbox:true,contextIsolation:true,offscreen:true,backgroundThrottling:false}});
      try{
        await win.loadURL(status.url+'/?agent=fixture');
        await waitFor(win,"document.querySelector('#chatView').textContent.includes('Answer 200')");
        assert.equal(calls[0].turnLimit,5);assert.equal(details.length,0);
        assert.ok(await win.webContents.executeJavaScript("!document.querySelector('#chatView').textContent.includes('Answer 195') && document.querySelectorAll('#chatView .chat-turn.user').length===5"));
        await win.webContents.executeJavaScript("[...document.querySelectorAll('#chatView .chat-work')].at(-1).open=true");
        await waitFor(win,"document.querySelectorAll('#chatView .chat-tool').length===4");
        await win.webContents.executeJavaScript("document.querySelector('#chatView .chat-tool').open=true");
        await waitFor(win,"document.querySelector('#chatView .chat-tool pre')?.textContent.includes('Fixture tool output 199-0')");
        await waitFor(win,"document.querySelector('#chatView').textContent.includes('Answer 200')");
        await sleep(3300);assert.ok(calls.some(call=>call.afterSequence),'Remote resent the entire last page');
        await win.webContents.executeJavaScript("document.querySelector('#chatView').scrollTop=0");
        await waitFor(win,"document.querySelector('#chatView').textContent.includes('Answer 191') && !document.querySelector('#chatView').textContent.includes('Answer 190')");
        assert.ok(await win.webContents.executeJavaScript("document.querySelector('#chatView').scrollTop>400"));
        failOlder=true;await win.webContents.executeJavaScript("document.querySelector('#chatView').scrollTop=0");
        await waitFor(win,"document.querySelector('#chatView .chat-more')?.textContent.includes('다시 시도')");
        await win.webContents.executeJavaScript("document.querySelector('#chatView .chat-more').click()");
        await waitFor(win,"document.querySelector('#chatView').textContent.includes('Answer 186')");
        assert.ok(await win.webContents.executeJavaScript("document.documentElement.scrollWidth<=innerWidth+1"));
        await fs.writeFile(path.resolve(appRoot,`../output/chat-pagination-${dashboard?'dashboard':'remote'}-${width}.png`),(await win.webContents.capturePage()).toPNG());
        console.log(`${dashboard?'DASHBOARD':'REMOTE'}_CHAT_PAGING_DETAILS_DELTA_ANCHOR_AND_RETRY_${width}_OK`);
      }finally{win.destroy();await web.stop();}
    }
    manager.close();app.exit(0);
  }).catch(error=>{console.error(error);app.exit(1);});
}else{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-chat-pagination-'));
  try{
    const {build}=await import('esbuild');
    await build({entryPoints:[path.join(appRoot,'scripts/fixtures/chat-pagination-renderer.tsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},outfile:path.join(root,'renderer.js')});
    await fs.writeFile(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;width:100%;height:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    await fs.copyFile(path.join(appRoot,'public/app-icon.png'),path.join(root,'app-icon.png'));
    await fs.writeFile(path.join(root,'preload.cjs'),"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('paginationBridge',{invoke:(command,args)=>ipcRenderer.invoke('pagination-fixture',command,args)});");
    const env={...process.env,ACEDIA_PAGINATION_FIXTURE:root};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{env,windowsHide:true,stdio:'inherit'});
    const timeout=setTimeout(()=>child.kill(),120000);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}).finally(()=>clearTimeout(timeout));
    if(code!==0)throw Error('Pagination smoke failed: '+code);
  }finally{
    if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('acedia-chat-pagination-'))throw Error('Unsafe fixture cleanup path');
    await fs.rm(root,{recursive:true,maxRetries:5,retryDelay:200});
  }
}
