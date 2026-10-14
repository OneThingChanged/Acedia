import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

// Actual context-menu clicks and React restart orchestration, with isolated
// host calls. This fixture cannot terminate or modify a user's sessions.
const root = path.resolve(import.meta.dirname, "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-restart-smoke-"));
const require = createRequire(import.meta.url);
try {
  await build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React, { useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ContextMenu } from './src/components/Menus';
    import { useSessionLifecycleActions } from './src/hooks/useSessionLifecycleActions';
    window.calls=[];
    const terminal=id=>({ term:{dispose:()=>window.calls.push(['dispose',id])},
      serialize:{serialize:()=>{window.calls.push(['save',id]);return 'saved-'+id;}} });
    function Harness(){
      const [agents,setAgents]=useState(['a','b'].map(id=>({id,name:id,projectId:'p',aiToolId:'codex',
        status:'working',runtimeStatus:'running',lastSessionId:'conversation-'+id,
        modelSettings:{model:'gpt-6.1-sol',effort:'xhigh',serviceTier:'priority'}})));
      const agentsRef=useRef(agents);agentsRef.current=agents;
      const termsRef=useRef(new Map([['a',terminal('a')],['b',terminal('b')]]));
      const detached=useRef(new Set());const removed=useRef(new Set());
      const [menu,setMenu]=useState(null);
      const actions=useSessionLifecycleActions({agentsRef,termsRef,detachedAgentIdsRef:detached,
        removedAgentIdsRef:removed,setAgents,applyGroupOp:()=>{throw Error('Restart changed the layout');},
        beforeRestart:id=>window.calls.push(['before',id]),pinnedSessionId:id=>'conversation-'+id});
      const spawn=async(id,options)=>{window.calls.push(['spawn',id,options]);termsRef.current.set(id,terminal(id));return {ok:true};};
      const restart=id=>actions.restartAgent(id,spawn).catch(error=>{window.lastError=String(error);});
      window.restartDirect=restart;
      window.setDetached=value=>{value?detached.current.add('b'):detached.current.delete('b');setAgents(current=>[...current]);};
      window.setSleeping=()=>setAgents(current=>current.map(agent=>agent.id==='b'?{...agent,status:'idle',runtimeStatus:'idle'}:agent));
      window.readState=()=>({agents,selected:'a',activePane:'pane-a',split:['a','b']});
      return <><h2 id="selected">Selected: a</h2>{agents.map(agent=><button key={agent.id} id={'row-'+agent.id}
        onContextMenu={event=>{event.preventDefault();setMenu({agentId:agent.id,x:event.clientX,y:event.clientY});}}>{agent.name}</button>)}
        {menu&&<ContextMenu state={menu} hasActive canPlaceInActive isSessionLocked={false} canPinSession={false}
          canDeactivate canRestart={!actions.restartingAgentIds.has(menu.agentId)&&!detached.current.has(menu.agentId)}
          onClose={()=>setMenu(null)} onAction={action=>{const id=menu.agentId;setMenu(null);if(action==='restart')void restart(id);}}/>}</>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  ` }, bundle: true, outfile: path.join(temporary, "renderer.js"), jsx: "automatic",
    plugins: [{ name: "isolated-restart-host", setup(bundler) {
      bundler.onResolve({ filter: /platform\/(runtime|electronBridge)$/ }, args => ({ path: args.path, namespace: "stub" }));
      bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `
        export const isElectronRuntime=()=>true;
        export const invoke=async(command,args)=>{
          window.calls.push([command,args]);
          if(command==='restart_session_model'){
            if(window.rejectHost)throw Error('Host rejected restart');
            if(window.holdHost)await new Promise(resolve=>{window.releaseHost=resolve;});
            return {sessionId:'conversation-'+args.id,poolResumeOwnerId:'original-account'};
          }
        };
        export const listen=async()=>()=>{};
      ` }));
    } }],
  });
  await fs.writeFile(path.join(temporary, "index.html"), '<style>body{background:#101820;color:white}#row-a,#row-b{display:block;width:200px;height:40px}.ctx-backdrop{position:fixed;inset:0}.ctx-menu{position:fixed;background:#202830;width:280px;padding:8px}.ctx-item{display:block;width:100%;height:30px}</style><div id="root"></div><script src="renderer.js"></script>');
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const {app,BrowserWindow}=require('electron');
    const assert=require('node:assert/strict');const fs=require('node:fs');
    app.setPath('userData',${JSON.stringify(path.join(temporary, "profile"))});app.disableHardwareAcceleration();
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({show:false,width:900,height:900,webPreferences:{offscreen:true,backgroundThrottling:false}});
      const run=source=>win.webContents.executeJavaScript(source);
      const pause=()=>new Promise(resolve=>setTimeout(resolve,40));
      const wait=async source=>{for(let i=0;i<100;i++){if(await run(source))return;await pause();}throw Error(source);};
      const click=async(selector,button='left')=>{
        const point=await run('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()');
        win.webContents.sendInputEvent({type:'mouseDown',...point,button,clickCount:1});
        win.webContents.sendInputEvent({type:'mouseUp',...point,button,clickCount:1});await pause();
      };
      const restart=async()=>{await click('#row-b','right');await wait('!!document.querySelector("[data-session-action=restart]")');await click('[data-session-action=restart]');};
      try{
        await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});await wait('!!window.readState');
        await click('#row-b','right');await wait('!!document.querySelector("[data-session-action=restart]")');
        fs.mkdirSync(${JSON.stringify(path.resolve(root, "../output/session-restart-smoke"))},{recursive:true});
        await new Promise(resolve=>setTimeout(resolve,150));
        fs.writeFileSync(${JSON.stringify(path.resolve(root, "../output/session-restart-smoke/context-menu.png"))},(await win.webContents.capturePage()).toPNG());
        await click('[data-session-action=restart]');await wait('window.calls.some(call=>call[0]==="spawn")');
        let calls=await run('window.calls');
        assert.deepEqual(calls.find(call=>call[0]==='restart_session_model')[1],{id:'b',expectedSessionId:'conversation-b',interrupt:true});
        assert.deepEqual(calls.find(call=>call[0]==='spawn').slice(1),['b',{recovering:true,resumeSessionId:'conversation-b',poolResumeOwnerId:'original-account'}]);
        assert.deepEqual(calls.filter(call=>call[0]==='dispose').map(call=>call[1]),['b']);
        assert.ok(calls.findIndex(call=>call[0]==='save')<calls.findIndex(call=>call[0]==='dispose'));
        const state=await run('window.readState()');
        assert.equal(state.selected,'a');assert.deepEqual(state.split,['a','b']);
        assert.deepEqual(state.agents[1].modelSettings,{model:'gpt-6.1-sol',effort:'xhigh',serviceTier:'priority'});
        await run('window.calls=[];window.holdHost=true');await restart();await wait('!!window.releaseHost');
        await run('window.restartDirect("b")');
        assert.equal((await run('window.calls')).filter(call=>call[0]==='restart_session_model').length,1);
        await run('window.holdHost=false;window.releaseHost()');await wait('window.calls.some(call=>call[0]==="spawn")');
        await run('window.calls=[];window.rejectHost=true');await restart();await wait('window.lastError.includes("Host rejected")');
        calls=await run('window.calls');assert.equal(calls.filter(call=>['dispose','save','spawn'].includes(call[0])).length,0);
        await run('window.rejectHost=false;window.calls=[];window.setDetached(true)');await pause();await click('#row-b','right');
        assert.equal(await run('document.querySelector("[data-session-action=restart]").disabled'),true);
        await run('window.restartDirect("b")');assert.equal((await run('window.calls')).length,0);
        await run('window.setDetached(false);window.setSleeping()');await pause();await restart();await wait('window.calls.some(call=>call[0]==="spawn")');
        assert.equal((await run('window.readState()')).agents[1].terminalEpoch,3);
        console.log('SESSION_CONTEXT_RESTART_TARGET_HISTORY_SETTINGS_FAILURE_AND_DUPLICATE_OK');app.exit(0);
      }catch(error){console.error(error);app.exit(1);}
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], { env, stdio: "inherit", windowsHide: true });
  const timer = setTimeout(() => child.kill(), 30000);
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); }).finally(() => clearTimeout(timer));
  assert.equal(code, 0, "Session restart smoke failed");
} finally {
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith("acedia-restart-smoke-"));
  await fs.rm(temporary, { recursive: true, maxRetries: 5, retryDelay: 200 });
}
