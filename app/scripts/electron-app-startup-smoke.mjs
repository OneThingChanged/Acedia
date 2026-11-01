import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),appRoot=path.resolve(import.meta.dirname,'..');
if(!process.versions.electron){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-app-startup-'));
  try{
    for(const scenario of ['off','on','invalid']){
      const directory=path.join(root,scenario),local=path.join(directory,'local');fs.mkdirSync(local,{recursive:true});
      fs.writeFileSync(path.join(local,'remote-config.json'),JSON.stringify({auto_start:scenario!=='off',auto_start_tunnel:false,client_id:scenario==='invalid'?'':'fake-client',owner:'fixture',server_port:0}));
      const env={...process.env,ACEDIA_STARTUP_FIXTURE:directory,ACEDIA_STARTUP_SCENARIO:scenario,MULTIAGENT_ELECTRON_USER_DATA:path.join(directory,'profile'),MULTIAGENT_LOCAL_DATA:local,CODEX_HOME:path.join(directory,'codex'),CLAUDE_CONFIG_DIR:path.join(directory,'claude'),MULTIAGENT_BUILD_VARIANT:'standard',MULTIAGENT_DEV_URL:'',MULTIAGENT_DESKTOP_PET:'0'};
      for(const key of ['ELECTRON_RUN_AS_NODE','MULTIAGENT_ELECTRON_BRIDGE_SMOKE','MULTIAGENT_ELECTRON_CLOSE_SMOKE','MULTIAGENT_ELECTRON_WORKSPACE_SMOKE','MULTIAGENT_ELECTRON_SECURITY_SMOKE','MULTIAGENT_ELECTRON_SINGLE_INSTANCE_SMOKE'])delete env[key];
      const child=spawn(require('electron'),[import.meta.filename],{cwd:appRoot,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{log=(log+data).slice(-18000);});
      const timer=setTimeout(()=>child.kill(),55000);
      const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);}).finally(()=>clearTimeout(timer));
      assert.equal(code,0,log);assert.ok(log.includes('APP_STARTUP_MAIN_OK '+scenario),log);console.log('APP_STARTUP_MAIN_OK '+scenario);
    }
  }finally{
    assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('acedia-app-startup-'));
    await fs.promises.rm(root,{recursive:true,maxRetries:5,retryDelay:200});
  }
}else{
  void (async()=>{
  const {app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();
  // Run the real main bootstrap with an empty isolated profile, without native
  // window activation, user CLI sessions, OS registration or collector workers.
  const {Collector}=await import('../electron/usage-collector/collector.mjs');Collector.prototype.start=function(){};
  let registrations=0;
  app.setLoginItemSettings=()=>{registrations++;throw Error('Fixture must not register a Windows startup item');};
  for(const name of ['show','showInactive','focus','restore'])BrowserWindow.prototype[name]=function(){};
  const scenario=process.env.ACEDIA_STARTUP_SCENARIO;
  const timeout=setTimeout(()=>{console.error('App startup fixture timed out');app.exit(1);},45000);
  try{
    await import('../electron/main.mjs');
    let win;
    for(let i=0;i<180&&!win;i++){
      for(const candidate of BrowserWindow.getAllWindows()){
        if(!candidate.webContents.getURL().includes('/dist/index.html'))continue;
        const runtime=await candidate.webContents.executeJavaScript('window.multiAgentElectron?.invoke("runtime_flags")').catch(()=>null);
        if(runtime?.workspace_window&&runtime.coordinator){win=candidate;break;}
      }
      if(!win)await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(win,'Coordinator missing');
    const invoke=(name,args={})=>win.webContents.executeJavaScript(`window.multiAgentElectron.invoke(${JSON.stringify(name)},${JSON.stringify(args)})`);
    let status;
    for(let i=0;i<100;i++){
      status=await invoke('remote_server_status');
      if(status.startup.phase!=='starting')break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(status.running,scenario==='on');assert.equal(status.startup.phase,scenario==='on'?'started':scenario==='invalid'?'failed':'idle');
    assert.equal((await invoke('app_startup_get')).supported,false);
    await assert.rejects(invoke('app_startup_set',{enabled:true}));assert.equal(registrations,0);
    assert.equal((await invoke('tunnel_status')).running,false);
    if(scenario==='on'){
      const response=await fetch(status.url+'/login');assert.equal(response.status,200);
      const [a,b]=await Promise.all([invoke('start_remote_server'),invoke('start_remote_server')]);assert.equal(a.port,b.port);assert.equal(a.port,status.port);
      await invoke('stop_remote_server');assert.equal((await invoke('remote_server_status')).running,false);
      assert.equal((await invoke('remote_config_get')).auto_start,true);
    }
    assert.equal((await invoke('runtime_flags')).live_agent_ids.length,0);
    console.log('APP_STARTUP_MAIN_OK '+scenario);clearTimeout(timeout);app.quit();
  }catch(error){console.error(error);clearTimeout(timeout);app.exit(1);}
  })();
}
