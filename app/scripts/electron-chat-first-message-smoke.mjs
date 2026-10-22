import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(appRoot, '../output/chat-first-message-ui');

async function exercise(win) {
  const run = source => win.webContents.executeJavaScript(source);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (expression, label = expression) => {
    for (let n = 0; n < 80; n++) { if (await run(expression)) return; await wait(80); }
    throw Error('UI timeout: ' + label);
  };
  const patch = value => run(`window.questionFixture.patch(${JSON.stringify(value)})`);
  const input = async value => {
    await run(`(() => { const t=document.querySelector('.chat-composer-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await wait(40);
  };
  const send = () => run("document.querySelector('.chat-composer-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  const idle = { supported:true, tool:'codex', blocks:[], artifacts:[], lifecycle:'idle', lifecycleAt:Date.now() };
  await until('!!window.questionFixture');
  await patch({chat:idle,state:{sessionId:null,agentStatus:'starting',question:null}});
  await wait(100);
  await input('시작 중에 입력한 첫 요청'); await send();
  await until("document.querySelector('.chat-queue')?.textContent.includes('시작 중에 입력한 첫 요청')");
  assert.equal(await run('window.questionFixture.submittedMessages.length'), 0, 'Sent before startup finished');
  await input('첫 요청 다음에 작성 중인 초안');
  await patch({show:false}); await until("!document.querySelector('.chat-view')");
  await patch({show:true}); await until("!!document.querySelector('.chat-queue')");
  // SessionStart can publish the native ID before the terminal is ready.
  await patch({state:{sessionId:'newly-bound'}});
  await wait(200);
  assert.ok(await run("document.querySelector('.chat-queue')?.textContent.includes('시작 중에 입력한 첫 요청')"), 'Initial native session binding lost the first queued request');
  assert.equal(await run("document.querySelector('.chat-composer-input').value"), '첫 요청 다음에 작성 중인 초안', 'Initial session binding lost a draft');
  await patch({chat:idle,state:{agentStatus:'running'}});
  await until('window.questionFixture.recordedMessages.length===1', 'First request must survive initial session binding and dispatch without a wake-up message');
  assert.deepEqual(await run('window.questionFixture.writes'), ['시작 중에 입력한 첫 요청', '\r']);
  assert.equal(await run('window.questionFixture.submittedMessages[0].sessionId'), 'newly-bound');
  await patch({show:false}); await until("!document.querySelector('.chat-view')");
  await patch({show:true}); await until("!!document.querySelector('.chat-view')");
  await wait(1400);
  assert.equal(await run('window.questionFixture.submittedMessages.length'), 1, 'Binding/remount replayed the first request');

  // Binding while a submission is awaiting the host must preserve its receipt
  // and lock, with the record attached to the newly established native ID.
  await patch({chat:{...idle,lifecycleAt:Date.now()},holdSubmissions:true,state:{agentId:'in-flight-first',sessionId:null,agentStatus:'running'}});
  await wait(100); await input('전송 도중 ID가 연결되는 첫 요청'); await send();
  await until('window.questionFixture.writes.length===4');
  await patch({state:{sessionId:'bound-during-submit'}});
  await wait(100); await input('진행 중 요청 뒤에 예약할 메시지'); await send();
  await until("document.querySelector('.chat-queue')?.textContent.includes('진행 중 요청 뒤에 예약할 메시지')");
  await wait(1300);
  assert.equal(await run('window.questionFixture.submittedMessages.length'), 2, 'Binding unlocked an in-flight send');
  await patch({chat:{...idle,lifecycle:'working',lifecycleAt:Date.now()},state:{agentStatus:'working'}});
  await run('window.questionFixture.releaseSubmissions()');
  await until('window.questionFixture.recordedMessages.length===2');
  assert.equal(await run('window.questionFixture.recordedMessages[1].sessionId'), 'bound-during-submit', 'First submission receipt was dropped or assigned to the wrong conversation');

  // Switching a known conversation to an idle one cannot dispatch its queue.
  await patch({chat:{...idle,lifecycleAt:Date.now()},state:{sessionId:'another-known',agentStatus:'running'}});
  await wait(1400);
  assert.equal(await run('window.questionFixture.submittedMessages.length'), 2, 'A queued request leaked to another conversation');
  assert.equal(await run("!!document.querySelector('.chat-queue')"), false);
  await patch({chat:{...idle,lifecycle:'working',lifecycleAt:Date.now()},state:{sessionId:'bound-during-submit',agentStatus:'working'}});
  await until("document.querySelector('.chat-queue')?.textContent.includes('진행 중 요청 뒤에 예약할 메시지')");
  await patch({chat:{...idle,lifecycleAt:Date.now()},state:{agentStatus:'running'}});
  await until('window.questionFixture.recordedMessages.length===3');
  assert.deepEqual(await run('window.questionFixture.writes.slice(4)'), ['진행 중 요청 뒤에 예약할 메시지','\r']);
  assert.equal(await run('window.questionFixture.submittedMessages[2].sessionId'), 'bound-during-submit');

  // A failed submission follows the first binding but never retries itself.
  await patch({chat:{...idle,lifecycleAt:Date.now()},failWrites:true,state:{agentId:'failed-first',sessionId:null,agentStatus:'running'}});
  await wait(1300); await input('실패한 첫 요청'); await send();
  await until("document.querySelector('.chat-submission-error')?.textContent.includes('실패한 첫 요청')");
  await patch({failWrites:false,state:{sessionId:'bound-after-failure'}});
  await wait(1400);
  assert.ok(await run("document.querySelector('.chat-submission-error')?.textContent.includes('실패한 첫 요청')"), 'Binding concealed the uncertain send');
  assert.equal(await run('window.questionFixture.submittedMessages.length'), 4, 'Binding replayed an uncertain send');
  console.log('CHAT_FIRST_MESSAGE_UI_OK startup queue/draft survive first binding and remount; exactly-once dispatch; in-flight binding lock and correct receipt; known-conversation queue isolation; failed-send review preserved');
}

if (process.versions.electron) {
  const {app,BrowserWindow} = require('electron');
  app.disableHardwareAcceleration(); app.setPath('userData',process.env.ACEDIA_CHAT_FIRST_MESSAGE_PROFILE);
  app.whenReady().then(async () => { let win; try {
    win=new BrowserWindow({show:false,width:1024,height:800,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false}});
    await win.loadFile(path.join(output,'index.html'),{query:{unbound:'1'}});
    await exercise(win); win.destroy(); app.exit(0);
  } catch(error) { console.error(error); if(win && !win.isDestroyed()) await fs.writeFile(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG()); app.exit(1); } });
} else {
  await fs.mkdir(output,{recursive:true});
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-chat-first-message-'));
  try {
    const {build} = await import('esbuild');
    await build({entryPoints:[path.join(appRoot,'scripts/fixtures/chat-question-renderer.tsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},outfile:path.join(output,'renderer.js')});
    await fs.writeFile(path.join(output,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    const env={...process.env,ACEDIA_CHAT_FIRST_MESSAGE_PROFILE:profile}; delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve,reject)=>{
      const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{cwd:appRoot,env,stdio:'inherit',windowsHide:true});
      const timer=setTimeout(()=>{child.kill();reject(Error('First-message smoke timed out'));},30000);
      child.once('error',error=>{clearTimeout(timer);reject(error);}); child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('First-message smoke failed: '+code));});
    });
  } finally {
    assert.equal(path.dirname(profile), path.resolve(os.tmpdir()));
    assert.ok(path.basename(profile).startsWith('acedia-chat-first-message-'));
    await fs.rm(profile,{recursive:true,maxRetries:10,retryDelay:200});
  }
}
