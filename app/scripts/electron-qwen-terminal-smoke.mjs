import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { devElectronEnvironment } from './electron-dev-environment.mjs';

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, '..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-qwen-terminal-'));
try {
  await build({ stdin: { resolveDir: appRoot, loader: 'ts', contents: `
    import { createEntry } from './src/lib/terminal';
    import '@xterm/xterm/css/xterm.css';
    window.entries = ['baseline','filtered'].map(id => {
      const entry = createEntry(id); entry.el.style.cssText='height:400px;width:800px';
      document.body.append(entry.el); entry.term.open(entry.el); entry.term.resize(80,24);
      entry.term.options.cursorBlink=false; return entry;
    });
    window.put = (i,data) => new Promise(resolve => window.entries[i].term.write(data,resolve));
    window.readScreen = i => {
      const term=window.entries[i].term, buffer=term.buffer.active;
      return Array.from({length:term.rows},(_,y)=>buffer.getLine(buffer.baseY+y)?.translateToString(true)||'').join('\\n');
    };
  ` }, bundle: true, define: {'import.meta.env':'{}'}, outfile:path.join(root,'renderer.js') });
  await fs.writeFile(path.join(root,'index.html'), '<link rel="stylesheet" href="renderer.css"><body><script src="renderer.js"></script></body>');
  await fs.writeFile(path.join(root,'main.cjs'), `
    const {app,BrowserWindow}=require('electron');
    const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
    const dependency=require(${JSON.stringify(path.join(appRoot,'node_modules/node-pty'))});
    app.setPath('userData',${JSON.stringify(path.join(root,'profile'))}); app.disableHardwareAcceleration();
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    void app.whenReady().then(async()=>{
      let win,terminal,server,code=0;
      try {
        const {SynchronizedTerminalFilter}=await import(${JSON.stringify(pathToFileURL(path.join(appRoot,'electron/services/terminal-stream.mjs')).href)});
        win=new BrowserWindow({show:false,width:900,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false}});
        win.webContents.on('console-message',details=>{if(details.level==='error')console.error(details.message);});
        await win.loadFile(${JSON.stringify(path.join(root,'index.html'))});
        const put=(i,data)=>win.webContents.executeJavaScript('window.put('+i+','+JSON.stringify(data)+')');
        const filter=new SynchronizedTerminalFilter(), esc=String.fromCharCode(27);
        for(let i=0;i<2;i++)await put(i,'BEFORE: full frame'+esc+'[24;1HFOOTER: ready');
        await pause(80);
        // An inner end from Ink must not reveal the erased footer while Qwen's
        // outer redraw is still in progress, even across delayed PTY chunks.
        const chunks=[esc+'[?2026h'+esc+'[2J'+esc+'[H'+esc+'[?2026hBODY: next'+esc+'[?2026l',esc+'[24;1HFOOTER: ready'+esc+'[?2026l'];
        await put(0,chunks[0]); await put(1,filter.push(chunks[0])); await pause(50);
        const before=await win.webContents.executeJavaScript('window.entries.map(e=>e.el.querySelector(".xterm-rows").textContent)');
        assert.ok(!before[0].includes('FOOTER: ready'),'Regression fixture did not expose the incomplete baseline');
        assert.ok(before[1].includes('FOOTER: ready'),'Incomplete filtered redraw became visible');
        await put(0,chunks[1]);await put(1,filter.push(chunks[1]));await pause(50);
        const after=await win.webContents.executeJavaScript('window.entries.map(e=>e.el.querySelector(".xterm-rows").textContent)');
        assert.equal(after[0],after[1]);assert.ok(after[1].includes('BODY: next')&&after[1].includes('FOOTER: ready'));
        console.log('QWEN_FRAGMENTED_NESTED_FRAME_NO_INTERMEDIATE_BLANK_OK'); filter.dispose();

        if(process.env.ACEDIA_QWEN_ENTRY && process.env.ACEDIA_QWEN_NODE){
          let requests=0;
          server=http.createServer((_req,res)=>{requests++;res.writeHead(400,{'Content-Type':'application/json'});res.end('{"error":{"message":"fixture; no model"}}');});
          await new Promise(r=>server.listen(0,'127.0.0.1',r));
          const home=${JSON.stringify(path.join(root,'qwen'))};fs.mkdirSync(path.join(home,'.qwen'),{recursive:true});
          const settings=path.join(home,'.qwen/settings.json');
          fs.writeFileSync(settings,JSON.stringify({security:{auth:{selectedType:'openai',apiKey:'fixture-only',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1'}},model:{name:'probe'},ui:{showWelcome:false,useTerminalBuffer:true},general:{enableAutoUpdate:false}}));
          const env={...process.env,USERPROFILE:home,HOME:home,APPDATA:path.join(home,'AppData/Roaming'),LOCALAPPDATA:path.join(home,'AppData/Local'),QWEN_CODE_USER_SETTINGS_PATH:settings,TERM:'xterm-256color',COLORTERM:'truecolor',OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:'http://127.0.0.1:'+server.address().port+'/v1',QWEN_CODE_SYNCHRONIZED_OUTPUT:'1'};
          for(const key of Object.keys(env))if(/TOKEN|API_KEY|AUTH|CODEX|CLAUDE|MULTIAGENT|GEMINI/.test(key)&&key!=='OPENAI_API_KEY')delete env[key];
          terminal=dependency.spawn(process.env.ACEDIA_QWEN_NODE,[process.env.ACEDIA_QWEN_ENTRY,'--model','probe'],{cwd:home,env,cols:80,rows:24,useConpty:true});
          let raw='',forwarded='',chunks=0,segments=0,exited=false;
          const exit=new Promise(r=>terminal.onExit(()=>{exited=true;r()}));
          const native=new SynchronizedTerminalFilter();native.setOutputSink(data=>{forwarded+=data;segments++;});
          terminal.onData(data=>{raw+=data;chunks++;const result=native.push(data);if(result){forwarded+=result;segments++;}if(data.includes(esc+'[6n'))terminal.write(esc+'[1;1R');});
          const deadline=Date.now()+20000;
          while(!raw.includes('Type your message')&&!exited&&Date.now()<deadline)await pause(100);
          assert.ok(raw.includes('Type your message'),'Isolated Qwen composer did not start');
          terminal.write('draft fixture');await pause(500);terminal.write(esc+'[D');await pause(200);terminal.write(String.fromCharCode(21));await pause(300);
          terminal.write(String.fromCharCode(3));await pause(400);terminal.write(String.fromCharCode(3));await Promise.race([exit,pause(2000)]);
          if(!exited){terminal.kill();await Promise.race([exit,pause(1500)]);} terminal=null;
          forwarded+=native.finish();native.dispose();
          assert.equal(requests,0,'Draft-only smoke invoked a model');
          assert.ok(raw.includes(esc+'[?2026h'),'Native Qwen omitted synchronized output');
          const withoutSync=data=>data.replace(/\x1b\[\?2026[hl]/g,'');
          assert.equal(withoutSync(forwarded),withoutSync(raw),'Native frame filter changed transcript bytes outside frame controls');
          for(const entry of await win.webContents.executeJavaScript('window.entries.map((_,i)=>i)'))await win.webContents.executeJavaScript('window.entries['+entry+'].term.reset()');
          await put(0,raw);await put(1,forwarded);await pause(80);
          const final=await win.webContents.executeJavaScript('window.entries.map(e=>({text:e.serialize.serialize(),rows:e.term.rows,cols:e.term.cols,baseY:e.term.buffer.active.baseY}))');
          assert.deepEqual(final[0],final[1]);assert.ok(segments<chunks,'Native frames were not coalesced');
          console.log('NATIVE_QWEN_DRAFT_CURSOR_TRANSCRIPT_PRESERVED_OK '+JSON.stringify({chunks,segments,requests,bytes:raw.length,recoveryControls:(forwarded.length-raw.length)/8}));
        }
      }catch(error){console.error(error);code=1;}
      finally{if(terminal)terminal.kill();if(win&&!win.isDestroyed())win.destroy();if(server)await new Promise(r=>server.close(r));app.exit(code);}
    });
  `);
  const env=devElectronEnvironment(process.env);delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{
    const child=spawn(require('electron'),[path.join(root,'main.cjs')],{env,windowsHide:true,stdio:'inherit'});
    const timeout=setTimeout(()=>child.kill(),60000);
    child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Qwen terminal smoke failed: '+code));});
  });
}finally{
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('acedia-qwen-terminal-'));
  await fs.rm(root,{recursive:true,maxRetries:5,retryDelay:100});
}
