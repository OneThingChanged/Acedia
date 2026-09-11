import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exercise() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const visible = element => element.getClientRects().length > 0;
  const button = label => [...document.querySelectorAll("button")].find(el => visible(el) && el.textContent.trim() === label);
  const click = async label => { const el = button(label); check(el, "Missing button: " + label); el.click(); await wait(); };
  const panel = () => document.querySelector('.properties-panel:not([hidden])');
  const field = label => document.querySelector('[aria-label="' + label + '"]');
  const edit = async (input, value) => {
    input.focus(); Object.getOwnPropertyDescriptor(input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true })); await wait();
  };
  const geometry = () => {
    const dialog = document.querySelector('.properties-dialog').getBoundingClientRect();
    const footer = document.querySelector('.properties-footer').getBoundingClientRect();
    check(dialog.width >= Math.min(1120, innerWidth - 48) - 2, "Dialog still narrow: " + dialog.width);
    check(dialog.x >= 0 && dialog.right <= innerWidth + 1 && dialog.bottom <= innerHeight + 1, "Dialog outside viewport");
    check(footer.bottom <= dialog.bottom && footer.top > dialog.top, "Footer outside dialog");
    check(panel().scrollWidth <= panel().clientWidth + 1, "Panel horizontal overflow");
    check(document.documentElement.scrollWidth <= innerWidth, "Page horizontal overflow");
  };
  await wait(); await wait(); geometry();
  check(document.querySelector('.property-path code').textContent.length > 100, "Long path missing");
  await click("실행 옵션"); geometry();
  const toggle = panel().querySelector('input[type="checkbox"]'); toggle.click(); await wait();
  check(!window.fixtureAgent.dangerous, "Options auto-saved before Save");
  await click("기본 정보"); await click("실행 옵션");
  check(panel().querySelector('input[type="checkbox"]').checked, "Tab change lost draft");
  window.confirm = () => false;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait();
  check(document.querySelector('.properties-dialog'), "Escape discarded dirty draft");
  await click("변경 저장"); check(window.fixtureAgent.dangerous, "Explicit save did not apply");
  await click("+ 인수 추가"); await edit(field("추가 인수 1"), "--profile");
  await click("변경 저장"); check(window.fixtureAgent.launchOptions.args[0] === "--profile", "Saved stale field value");
  await click("+ 변수 추가"); await edit(field("환경변수 1 이름"), "CODEX_HOME");
  check(button("변경 저장").disabled, "Invalid environment allowed save");
  field("환경변수 1 삭제").click(); await wait();
  await edit(field("추가 인수 1"), "--verbose");
  window.fixturePatch({ launchOptions: { executable: "", args: ["--external"], env: [] } }); await wait();
  await click("변경 저장"); check(window.fixtureAgent.launchOptions.args[0] === "--external" && document.body.textContent.includes("다른 창에서 실행 옵션"), "Concurrent options were overwritten");
  window.confirm = () => true; await click("현재 값 다시 불러오기");
  window.fixturePatch({ status: "running", runtimeStatus: "running" }); await wait();
  check(panel().querySelector('select').disabled, "Running account change enabled");
  window.fixturePatch({ status: "idle", runtimeStatus: "idle" }); await wait();
  const account = panel().querySelector('select'); account.value = '22222222-2222-4222-8222-222222222222'; account.dispatchEvent(new Event('change', {bubbles:true})); await wait();
  window.fixtureAccountFailure = true; await click("변경 저장");
  check(!window.fixtureAgent.codexAccountId && document.body.textContent.includes("계정 변경 실패"), "Account failure discarded draft or claimed success");
  window.fixtureAccountFailure = false; await click("변경 저장"); check(window.fixtureAgent.codexAccountId, "Account was not saved");
  await click("넓게"); geometry(); await click("기본 크기");
  window.fixtureShow("project"); await wait(); await wait(); geometry();
  check(document.querySelector('.property-metrics').textContent.includes('6.00 KiB'), "Project size summary missing");
  await click("기록 관리");
  await click("지난 대화 · 1");
  const search = field("기록 검색"); await edit(search, "does-not-match"); check(!panel().querySelector('.session-storage-card'), "Search did not filter history");
  await edit(search, "33333333"); check(panel().querySelectorAll('.session-storage-card').length === 1, "Past history not isolated");
  panel().querySelector('details').open = true; await wait(); geometry();
  window.confirm = () => false; await click("삭제"); check(!window.fixtureCalls.some(call => call.command === 'session_storage_delete'), "Cancelled deletion reached backend");
  window.confirm = () => true; await click("삭제"); check(window.fixtureCalls.filter(call => call.command === 'session_storage_delete').length === 1, "Confirmed history deletion missing");
  window.fixturePatch({status:'running',runtimeStatus:'running'}); await wait(); await click("현재 세션 · 1"); await edit(search, ""); panel().querySelector('details').open = true; await wait(); check(button("삭제").disabled, "Active transcript deletion enabled");
  await click("명령 및 시작"); panel().querySelector('details').open = true; await wait();
  const name = panel().querySelector('input'); await edit(name, "Draft command");
  await click("개요"); await click("명령 및 시작"); check(panel().querySelector('input').value === "Draft command", "Command draft lost across tabs");
  window.confirm = () => false; document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await wait(); check(document.querySelector('.properties-dialog'), "Project close discarded command draft");
  await edit(panel().querySelector('textarea'), "echo fixture"); await click("명령 저장");
  check(window.fixtureCalls.some(call => call.command === 'saved_commands_set'), "Command save missing");
  await click("현재 세션"); await click("정보 보기"); check(document.querySelector('.properties-header').textContent.includes("세션 속성"), "Project session navigation failed");
  window.fixtureShow("usage"); await wait(); await wait(); await click("계정 한도"); geometry();
  check(panel().querySelectorAll('.property-card').length === 1, "Unused profile leaked into current quotas");
  await click("이전·기타 프로필"); check(panel().textContent.includes('보관 프로필'), "Old profile unavailable for review");
  await click("기본 화면에 표시"); await click("현재 계정"); check(panel().querySelectorAll('.property-card').length === 2, "Restore did not show unused profile");
  const card = [...panel().querySelectorAll('.property-card')].find(el=>el.textContent.includes('보관 프로필')); card.querySelector('button').click(); await wait();
  check(panel().querySelectorAll('.property-card').length === 1, "Hide did not remove default quota");
  window.fixtureShow('closed'); await wait();
  const opener = document.querySelector('#fixture-opener'); opener.focus(); opener.click(); await wait();
  check(document.activeElement === document.querySelector('.properties-dialog'), 'Dialog did not receive focus');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
  check(document.activeElement === button('넓게'), 'Tab did not enter dialog controls');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}));
  check(document.activeElement === button('닫기'), 'Reverse Tab escaped the dialog');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await wait();
  check(document.activeElement === opener && !document.querySelector('.properties-dialog'), 'Close did not restore focus');
  window.fixtureShow('usage'); await wait();
  const profiles = ['codex','claude'].flatMap(provider => ['default','personal','work'].map((id,index)=>({key:`${provider}:${id}`,provider,id,label:index===0?provider:index===1?'개인 계정':'업무 계정',registered:true,current:false,hidden:false,visible:true})));
  const base = {primary:{usedPercent:25,windowMinutes:300,resetsAt:null},secondary:null,credits:{},updatedAt:Date.now()};
  window.fixtureSetQuotaData({profiles,limits:profiles.filter(profile=>profile.id!=='work').map(profile=>({...base,limitId:profile.id==='default'?profile.provider:profile.key,limitName:(profile.provider==='codex'?'Codex':'Claude')+(profile.id==='default'?'':` · ${profile.label}`),profile}))});
  await wait(); await wait(); await wait();
  const segments = [...document.querySelectorAll('.usage-status-provider')];
  check(segments.length===6, 'Registered accounts without sessions or quotas missing from status bar');
  check(segments.filter(el=>el.textContent.includes('한도 확인 전')).length===2, 'Missing quotas were fabricated or concealed');
  check(segments.filter(el=>el.textContent.includes('기본')).length===2, 'Default account is not distinguished');
  const strip = document.querySelector('.usage-status-summary');
  if (strip.scrollWidth>strip.clientWidth+1) {
    const next = field('뒤쪽 계정 보기'); check(next && !next.disabled,'Overflow has no account navigation'); next.click();
    for(let i=0;i<12&&strip.scrollLeft===0;i++)await wait();
    check(strip.scrollLeft>0,'Account navigation did not scroll');
    check(!field('앞쪽 계정 보기').disabled,'Reverse navigation stayed disabled');
  }
  check(document.querySelector('.usage-status-bar').getBoundingClientRect().height===28,'Accounts changed footer height');
  await click('계정 한도'); check(panel().querySelectorAll('.property-card').length===6,'Account overview omitted registered accounts');
  check([...panel().querySelectorAll('.property-card')].filter(el=>el.textContent.includes('한도 확인 전')).length===2,'Overview did not explain pending quotas');
  const pendingCard = [...panel().querySelectorAll('.property-card')].find(el=>el.textContent.includes('업무 계정')); pendingCard.querySelector('button').click(); await wait();
  check(panel().querySelectorAll('.property-card').length===5,'Pending quota account could not be hidden');
  await click('이전·기타 프로필'); await click('기본 화면에 표시'); await click('현재 계정');
  check(panel().querySelectorAll('.property-card').length===6,'Pending quota account could not be restored');
  check(!window.fixtureCalls.some(call=>['spawn_pty','kill_pty'].includes(call.command)), "Property editing changed terminal processes");
  return 'PROPERTIES_UI_OK '+innerWidth+'x'+innerHeight;
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require("electron");
  const directory = process.env.ACEDIA_PROPERTIES_DIRECTORY;
  app.setPath("userData", path.join(directory, "profile"));
  app.whenReady().then(async () => { try {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    const errors = []; win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    for (const [width,height] of [[1202,801],[800,640],[390,844]]) {
      win.setContentSize(width,height); await win.loadFile(path.join(directory,"index.html"));
      console.log(await win.webContents.executeJavaScript('('+exercise.toString()+')().catch(error=>{throw Error(error.stack+"\\n"+document.querySelector(".properties-panel:not([hidden])")?.innerText)})'));
      if(process.env.ACEDIA_PROPERTIES_SCREENSHOTS) {
        await fs.mkdir(process.env.ACEDIA_PROPERTIES_SCREENSHOTS,{recursive:true});
        for (const screen of ['session','project','usage']) {
          await win.webContents.executeJavaScript(`window.fixtureShow('${screen}')`); await new Promise(resolve=>setTimeout(resolve,250));
          await fs.writeFile(path.join(process.env.ACEDIA_PROPERTIES_SCREENSHOTS,`${screen}-${width}.png`),(await win.webContents.capturePage()).toPNG());
        }
      }
    }
    if(errors.length)throw Error(errors.join('\n')); app.exit(0);
  } catch(error) { console.error(error); app.exit(1); } });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),"acedia-properties-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints:[path.join(root,"scripts/fixtures/properties-renderer.tsx")],bundle:true,jsx:'automatic',define:{'import.meta.env':'{}','__MULTIAGENT_APP_VERSION__':JSON.stringify('properties-smoke')},outfile:path.join(directory,'renderer.js') });
    await fs.writeFile(path.join(directory,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
    const env = {...process.env,ACEDIA_PROPERTIES_DIRECTORY:directory}; delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve,reject)=> {
      const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{cwd:root,env,stdio:'inherit',windowsHide:true});
      const timer=setTimeout(()=>{child.kill();reject(Error('Properties smoke timed out'));},60000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Properties smoke failed: '+code));});
    });
  } finally {
    if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('acedia-properties-'))throw Error('Unsafe temporary directory');
    await fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
}
