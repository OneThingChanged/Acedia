import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(appRoot, '../output/chat-delivery-ui');

async function exercise(win) {
  const run = source => win.webContents.executeJavaScript(source);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = async (expression, label) => assert.ok(await run(expression), label);
  const until = async expression => {
    for (let n = 0; n < 80; n++) { if (await run(expression)) return; await wait(80); }
    throw Error('UI timeout: '+expression);
  };
  const patch = value => run(`window.questionFixture.patch(${JSON.stringify(value)})`);
  const input = async value => {
    await run(`(() => { const t=document.querySelector('.chat-composer-input');t.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await wait(40);
  };
  const key = (value, extra = {}) => run(`(() => { const e=new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true,cancelable:true,...${JSON.stringify(extra)}});document.querySelector('.chat-composer-input').dispatchEvent(e);return e.defaultPrevented; })()`);
  const chat = { supported:true, tool:'codex', blocks:[{role:'assistant',kind:'text',text:'현재 작업 중입니다.'}], artifacts:[], lifecycle:'working', lifecycleAt:Date.now() };
  await until('!!window.questionFixture');
  await patch({chat,state:{agentStatus:'working',question:null}});
  await until("!!document.querySelector('.chat-send-mode') && !document.querySelector('.chat-send-mode').disabled");
  await input('현재 작업에 추가할 지시');
  await check("document.querySelector('.chat-send-mode').dataset.sendMode==='queue'", 'Preserve default completion queue');
  assert.equal(await key('Tab', {isComposing:true}), false);
  await check("document.querySelector('.chat-send-mode').dataset.sendMode==='queue'", 'IME changed delivery');
  assert.equal(await key('Tab', {shiftKey:true}), false, 'Shift+Tab trapped focus');
  assert.equal(await key('Tab'), true);
  await until("document.querySelector('.chat-send-mode').dataset.sendMode==='now'");
  await check("document.activeElement.classList.contains('chat-composer-input') && document.querySelector('.chat-composer-input').value==='현재 작업에 추가할 지시' && window.questionFixture.writes.length===0", 'Tab sent text, lost draft or focus');
  await key('Enter');
  await until('window.questionFixture.writes.length===2');
  await check("JSON.stringify(window.questionFixture.writes)===JSON.stringify(['현재 작업에 추가할 지시','\\r']) && !document.querySelector('.chat-queue')", 'Steering queued or interrupted native work');
  await input('기존 작업 완료 후 실행'); await key('Tab'); await wait(40); await key('Enter');
  await until("document.querySelector('.chat-queue')?.textContent.includes('기존 작업 완료 후 실행')");
  await wait(250); await check('window.questionFixture.writes.length===2', 'Reserved message was sent during work');
  await patch({show:false}); await until("!document.querySelector('.chat-view')"); await patch({show:true});
  await until("document.querySelector('.chat-queue')?.textContent.includes('기존 작업 완료 후 실행')");
  await check("document.querySelector('.chat-send-mode').dataset.sendMode==='queue'", 'View remount lost delivery mode');
  await patch({state:{sessionId:'another-conversation'}}); await wait(150);
  await check("!document.querySelector('.chat-queue')", 'Reservations leaked across conversations');
  await input('다른 대화 초안'); await key('Tab'); await wait(60);
  await patch({state:{sessionId:'fixture-session'}}); await wait(150);
  await check("document.querySelector('.chat-send-mode').dataset.sendMode==='queue' && document.querySelector('.chat-composer-input').value==='' && !!document.querySelector('.chat-queue')", 'Conversation delivery mode, draft or queue mixed');
  await patch({chat:{...chat,lifecycle:'idle',lifecycleAt:Date.now()},state:{agentStatus:'running'}});
  await until('window.questionFixture.writes.length===4');
  await check("JSON.stringify(window.questionFixture.writes.slice(2))===JSON.stringify(['기존 작업 완료 후 실행','\\r']) && !document.querySelector('.chat-queue')", 'Queue did not drain exactly once after completion');
  await patch({chat,state:{agentStatus:'working'}}); await input('취소할 예약'); await key('Enter');
  await until("!!document.querySelector('.chat-queue-cancel')");
  await run("document.querySelector('.chat-queue-cancel').click()");
  await until("!document.querySelector('.chat-queue')");
  await input('질문 대기 중 메시지'); await key('Tab'); await wait(50);
  await patch({state:{agentStatus:'waiting',question:'어느 파일을 사용할까요?',questionToken:2},chat:{...chat,pendingQuestion:{id:'delivery-question',toolName:'request_user_input',question:{questions:[{id:'file',question:'어느 파일을 사용할까요?',options:[{label:'현재 파일'}]}]}}}});
  await until("document.querySelector('.chat-send-mode').disabled");
  await key('Tab'); await key('Enter');
  await until("document.querySelector('.chat-queue')?.textContent.includes('질문 대기 중 메시지')");
  await wait(250); await check('window.questionFixture.writes.length===4', 'Steering consumed the pending question');
  await run("document.querySelector('.chat-queue-cancel').click()");
  await patch({chat,state:{agentStatus:'working',question:null}});
  await until("!document.querySelector('.chat-send-mode').disabled && !document.querySelector('.chat-prompt')");
  await input('/mod'); await until("!!document.querySelector('.chat-ac')");
  const mode = await run("document.querySelector('.chat-send-mode').dataset.sendMode");
  assert.equal(await key('Tab', {shiftKey:true}), false, 'Autocomplete trapped Shift+Tab');
  await key('Tab'); await wait(80);
  await check("document.querySelector('.chat-composer-input').value.startsWith('/model') && document.querySelector('.chat-send-mode').dataset.sendMode==="+JSON.stringify(mode), 'Autocomplete Tab changed delivery instead of accepting command');
  await input('첫 줄'); await key('Enter', {ctrlKey:true}); await wait(80);
  await check("document.querySelector('.chat-composer-input').value.includes('\\n') && window.questionFixture.writes.length===4", 'Ctrl+Enter newline changed delivery');
  await patch({state:{provider:'claude'},chat:{...chat,tool:'claude'}}); await input('Claude 중간 지시');
  if (await run("document.querySelector('.chat-send-mode').dataset.sendMode==='queue'")) { await key('Tab'); await wait(60); }
  await key('Enter'); await until('window.questionFixture.writes.length===6');
  await check("JSON.stringify(window.questionFixture.writes.slice(4))===JSON.stringify(['Claude 중간 지시','\\r'])", 'Claude immediate delivery used interrupt or queue');
  await input('Claude 완료 후 예약'); await key('Tab'); await wait(50); await key('Enter');
  await until("!!document.querySelector('.chat-queue')");
  await wait(200); await check('window.questionFixture.writes.length===6', 'Claude completion reservation reached native mid-turn queue');
  await input('예약보다 먼저 전달할 중간 지시'); await key('Tab'); await wait(40); await key('Enter');
  await until('window.questionFixture.writes.length===8');
  await check("JSON.stringify(window.questionFixture.writes.slice(6))===JSON.stringify(['예약보다 먼저 전달할 중간 지시','\\r']) && document.querySelector('.chat-queue')?.textContent.includes('Claude 완료 후 예약') && !document.querySelector('.chat-queue-mode')", 'Input cooldown changed steering into completion reservation or lost future queue');
  await input('작성 중인 초안');
  for (const [width,theme] of [[1024,'soft'],[420,'light'],[320,'soft']]) {
    win.setContentSize(width,800);
    await run(`document.querySelector('#root').className='app app-theme-${theme}'`); await wait(220);
    await check(`(() => { const toolbar=document.querySelector('.chat-composer-toolbar'), card=document.querySelector('.chat-composer').getBoundingClientRect();return toolbar.scrollWidth<=toolbar.clientWidth && [...toolbar.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=card.left && r.right<=card.right && r.bottom<=card.bottom;}) && document.documentElement.scrollWidth===innerWidth;})()`, 'Delivery controls overflow at '+width);
    await fs.writeFile(path.join(output, `delivery-${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  console.log('CHAT_DELIVERY_UI_OK Tab selection/IME/focus, Enter steering and completion queue, remount/conversation isolation, cancellation, question guard, autocomplete/newlines, Codex/Claude, dark/light 1024/420/320px');
}

if (process.versions.electron) {
  const {app,BrowserWindow} = require('electron');
  app.disableHardwareAcceleration(); app.setPath('userData',process.env.ACEDIA_CHAT_DELIVERY_PROFILE);
  app.whenReady().then(async () => { let win; try {
    win=new BrowserWindow({show:false,width:1024,height:800,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false}});
    await win.loadFile(path.join(output,'index.html'));
    await exercise(win); win.destroy(); app.exit(0);
  } catch(error) { console.error(error); if(win && !win.isDestroyed()) await fs.writeFile(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG()); app.exit(1); } });
} else {
  await fs.mkdir(output,{recursive:true}); const profile=await fs.mkdtemp(path.join(output,'profile-'));
  const {build} = await import('esbuild');
  await build({entryPoints:[path.join(appRoot,'scripts/fixtures/chat-question-renderer.tsx')],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}'},outfile:path.join(output,'renderer.js')});
  await fs.writeFile(path.join(output,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
  await fs.copyFile(path.join(appRoot,'public/app-icon.png'),path.join(output,'app-icon.png'));
  const env={...process.env,ACEDIA_CHAT_DELIVERY_PROFILE:profile}; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{
    const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{cwd:appRoot,env,stdio:'inherit',windowsHide:true});
    const timer=setTimeout(()=>{child.kill();reject(Error('Delivery smoke timed out'));},45000);
    child.once('error',error=>{clearTimeout(timer);reject(error);}); child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Delivery smoke failed: '+code));});
  });
}
