import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { submitPtyMessage } from '../electron/services/pty-submit.mjs';
import { LocalDashboardService } from '../electron/services/web-services.mjs';

const require = createRequire(import.meta.url);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const marker = 'REMOTE_IMAGE_SUBMIT_PROBE';
if (!process.versions.electron) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-remote-image-'));
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise((resolve,reject) => {
      const child = spawn(require('electron'), [fileURLToPath(import.meta.url), base], {env,windowsHide:true,stdio:'inherit'});
      const timer = setTimeout(()=>child.kill(),30000);
      child.on('error',reject);
      child.on('exit',code=>{clearTimeout(timer); code===0 ? resolve() : reject(new Error('Remote image submission smoke failed'));});
    });
  } finally { fs.rmSync(base,{recursive:true,force:true,maxRetries:5,retryDelay:200}); }
} else {
  const {app} = require('electron');
  const pty = require('node-pty');
  const base = process.argv[2];
  const home = path.join(base,'codex-home'); fs.mkdirSync(home);
  app.setPath('userData',path.join(base,'electron'));
  void app.whenReady().then(async()=>{
    let terminal, dashboard, modelRequests = 0, enters = 0, output = '';
    const mock = http.createServer((req,res)=>{
      let body = '';
      req.on('data',chunk=>{body += chunk;});
      req.on('end',()=>{
        if (req.method==='POST' && req.url.includes('/responses') && body.includes(marker)) modelRequests++;
        res.writeHead(400,{'content-type':'application/json'});
        res.end(JSON.stringify({error:{message:'Local smoke only; no model invoked',type:'invalid_request_error'}}));
      });
    });
    let failed;
    try {
      await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
      fs.writeFileSync(path.join(home,'config.toml'),
        `model = "probe"\nmodel_provider = "probe"\ncheck_for_update_on_startup = false\n[analytics]\nenabled = false\n[model_providers.probe]\nname = "Probe"\nbase_url = "http://127.0.0.1:${mock.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n[projects.${JSON.stringify(base)}]\ntrust_level = "trusted"\n`);
      const found = spawnSync('where.exe',['codex.exe'],{encoding:'utf8',windowsHide:true});
      const codex = (found.stdout || '').split(/\r?\n/).find(file=>file && fs.existsSync(file) && !/WindowsApps/i.test(file));
      assert.ok(codex,'Install Codex CLI before running this optional integration smoke.');
      const env = {...process.env,CODEX_HOME:home,TERM:'xterm-256color'};
      for (const key of Object.keys(env)) if (/API_KEY|ACCESS_TOKEN|AUTH_TOKEN|OTEL_/.test(key)) delete env[key];
      terminal = pty.spawn(codex,['--no-alt-screen','--sandbox','read-only'],{cwd:base,env,cols:120,rows:35,useConpty:true});
      terminal.onData(data=>{
        output = (output + data).slice(-100000);
        if(data.includes('\x1b[6n')) terminal.write('\x1b[1;1R');
      });
      const readyDeadline = Date.now()+12000;
      while(!output.includes('Ask Codex to do anything') && Date.now()<readyDeadline) await delay(50);
      assert.ok(output.includes('Ask Codex to do anything'),'Isolated Codex composer did not become ready.');
      await delay(250);
      const adapter = {onData:fn=>terminal.onData(fn),write(value){if(value==='\r') enters++;terminal.write(value);}};
      dashboard = new LocalDashboardService({title:'Smoke',defaultPort:0,baseDir:path.join(base,'remote'),configName:'smoke.json',
        stateProvider:()=>({}),providers:{submitPty:(_id,message)=>submitPtyMessage({ptyProcess:adapter,message})}});
      const {url} = await dashboard.start();
      const post = (route,body)=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const uploaded = await post('/api/attachment',{id:'probe',name:'한글 이미지.png',type:'image/png',
        data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='});
      assert.equal(uploaded.status,201);
      const attachment = await uploaded.json();
      const body = {id:'probe',requestId:`${Date.now()}-0123456789abcdef`,message:`${marker} 이미지 확인\n\n첨부 이미지:\n"${attachment.path}"`};
      assert.equal((await post('/api/session/submit',body)).status,200);
      const deadline = Date.now()+7000;
      while(!modelRequests && Date.now()<deadline) await delay(50);
      assert.ok(modelRequests>0,'Composer received the image message but did not initiate a model request.');
      assert.equal((await post('/api/session/submit',body)).status,200);
      assert.equal(enters,1,'HTTP retry must not send another Enter.');
      console.log('Remote image smoke passed: upload → HTTP submit → Codex model request; one Enter and no replay. No external model used.');
    } catch(error) { failed=error; }
    finally {
      await dashboard?.stop();
      mock.closeAllConnections(); await new Promise(resolve=>mock.close(resolve));
      if(terminal){
        const exited = new Promise(resolve=>terminal.onExit(resolve));
        try { process.kill(terminal.pid); } catch {}
        await Promise.race([exited,delay(2000)]);
      }
      if(failed) console.error(failed.message);
      app.exit(failed ? 1 : 0);
    }
  });
}
