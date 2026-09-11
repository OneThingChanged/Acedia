import fs from "node:fs/promises";
import syncFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ProviderAccounts } from "../electron/services/provider-accounts.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exercise() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms ?? 120));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const button = (text, scope = document) => [...scope.querySelectorAll("button")].find(b => b.textContent.trim() === text);
  const click = async (text, scope = document) => {
    const target = button(text, scope); check(target && !target.disabled, "Missing/enabled button: " + text); target.click(); await wait();
  };
  const flow = () => document.querySelector(".account-flow");
  const until = async predicate => {
    for (let n = 0; n < 60; n++) { if (predicate()) return; await wait(100); }
    throw new Error("UI condition timed out: " + predicate);
  };
  const inputName = async value => {
    const input = document.querySelector(".account-flow input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true })); await wait();
  };
  await until(() => button("＋ 계정 추가") && !button("＋ 계정 추가").disabled);
  for (const provider of ["codex", "claude"]) {
    if (provider === "claude") await click("Claude");
    await until(() => !button("＋ 계정 추가").disabled);
    await click("＋ 계정 추가");
    check(flow().textContent.includes("표시 이름"), "Display name not distinguished");
    check(button("추가하고 로그인").disabled, "Empty label allowed");
    await inputName("   "); check(button("추가하고 로그인").disabled, "Whitespace label allowed");
    await click("취소", flow()); check(!flow(), "Draft cancellation did not close");
    check((await window.fixtureInvoke(provider + "_accounts_list")).length === 1, "Draft cancellation created an account");
    await click("＋ 계정 추가"); await inputName(provider === "codex" ? "업무" : "개인");
    await window.fixtureInvoke("fixture_mode", { provider, mode: "create-failure" });
    await click("추가하고 로그인");
    check(flow().textContent.includes("계정을 추가하지 못했습니다"), "Create failure was hidden");
    check((await window.fixtureInvoke(provider + "_accounts_list")).length === 1, "Failed creation left an account");
    await window.fixtureInvoke("fixture_mode", { provider, mode: "start-failure" });
    await click("추가하고 로그인");
    check(flow().textContent.includes("로그인을 시작하지 못했습니다"), "Login start failure was hidden");
    const account = (await window.fixtureInvoke(provider + "_accounts_list"))[1];
    check(account.state === "failed", "Expected failed login");
    await window.fixtureInvoke("fixture_mode", { provider, mode: "normal" });
    await click("다시 로그인", flow());
    check(flow().textContent.includes("브라우저에서 로그인 중"), "Pending step missing");
    check(button("＋ 계정 추가").disabled, "Concurrent registration allowed");
    check((await window.fixtureInvoke(provider + "_accounts_list")).length === 2, "Retry duplicated a profile");
    if (provider === "codex") {
      await click("Claude"); await click("Codex");
      await until(() => flow()?.textContent.includes("브라우저에서 로그인 중"));
      check(button("＋ 계정 추가").disabled, "Remount lost the pending login");
    }
    await click("로그인 취소", flow());
    check(flow().textContent.includes("로그인 취소됨"), "Cancellation result missing");
    await click("다시 로그인", flow());
    await window.fixtureInvoke("fixture_complete", { provider, result: "timeout" });
    await until(() => flow()?.textContent.includes("로그인 시간 초과"));
    await click("다시 로그인", flow());
    await window.fixtureInvoke("fixture_complete", { provider, result: "missing" });
    await until(() => flow()?.textContent.includes("인증 정보가 저장되지 않았습니다"));
    await click("다시 로그인", flow());
    await window.fixtureInvoke("fixture_complete", { provider, result: "saved" });
    await until(() => flow()?.textContent.includes("계정 등록 완료"));
    check(flow().textContent.includes(provider + "@example.invalid"), "Stored identity missing");
    check(flow().textContent.includes("실시간으로 검사한 결과는 아닙니다"), "Stored identity presented as live verification");
    check(!document.body.textContent.includes("private-fixture"), "Credential or CLI output leaked");
    const key = "multiagent.agentDefaults.v1";
    const defaults = JSON.parse(localStorage.getItem(key) || "{}");
    defaults[provider] = { ...defaults[provider], dangerous: true, launchOptions: { executable: "", args: ["--verbose"], env: [] } };
    localStorage.setItem(key, JSON.stringify(defaults));
    const setter = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) { if (k === key) throw new Error("fixture write failure"); return setter.call(this, k, v); };
    await click("새 세션의 기본 계정으로 사용", flow());
    check(flow().textContent.includes("기본 계정을 저장하지 못했습니다"), "Failed write reported as success");
    check(window.fixtureDefaults(provider)[provider + "AccountId"] === "default", "Failed write changed selection");
    Storage.prototype.setItem = setter;
    await click("새 세션의 기본 계정으로 사용", flow());
    check(flow().textContent.includes("새 세션의 기본 계정입니다"), "Default confirmation missing");
    check(window.fixtureDefaults(provider)[provider + "AccountId"] === account.id, "Default not persisted");
    check(window.fixtureDefaults(provider).dangerous && window.fixtureDefaults(provider).launchOptions.args[0] === "--verbose", "Default selection lost other options");
    await click("완료", flow()); check(!flow(), "Done did not close the flow");
    check(document.activeElement === button("＋ 계정 추가"), "Completion lost keyboard focus");
    await click("계정 정보");
    check(flow().textContent.includes("새 세션의 기본 계정입니다"), "Result could not be reopened");
    await click("완료", flow());
  }
  await click("Codex");
  await until(() => button("계정 정보") && !button("계정 정보").disabled);
  await click("계정 정보");
  check(flow().textContent.includes("codex@example.invalid") && !flow().textContent.includes("claude@example.invalid"), "Provider identities mixed");
  await window.fixtureInvoke("fixture_mode", { provider: "codex", mode: "list-failure" });
  await until(() => document.body.textContent.includes("계정 목록을 불러오지 못했습니다."));
  check(button("＋ 계정 추가").disabled, "Failed list left mutation controls enabled");
  await window.fixtureInvoke("fixture_mode", { provider: "codex", mode: "normal" });
  await click("목록 새로고침");
  await until(() => !document.body.textContent.includes("계정 목록을 불러오지 못했습니다."));
  check(window.fixtureDefaults("claude").claudeAccountId !== window.fixtureDefaults("codex").codexAccountId, "Provider defaults mixed");
  return "ACCOUNT_ONBOARDING_UI_OK";
}

async function manageAccounts() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 150));
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const click = async (label, scope = document) => { const button = [...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===label); check(button && !button.disabled,'Missing '+label); button.click(); await wait(); };
  for (const provider of ['codex','claude']) {
    await click(provider==='codex'?'Codex':'Claude'); await wait();
    const account=(await window.fixtureInvoke(provider+'_accounts_list'))[1];
    const row=()=>document.querySelector(`[data-account-id="${account.id}"]`);
    const form=()=>row().querySelector('.account-edit');
    await click('이름 변경',row());
    const type=async value=>{const input=form().querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await wait();};
    await type('  '); check(form().querySelector('[type=submit]').disabled,'Blank rename allowed');
    await type(provider+' 새 이름');
    await window.fixtureInvoke('fixture_mode',{provider,mode:'rename-failure'}); await click('이름 저장',form());
    check(!!form(),'Failed rename discarded draft'); check((await window.fixtureInvoke(provider+'_accounts_list'))[1].label===account.label,'Failed rename changed label');
    await window.fixtureInvoke('fixture_mode',{provider,mode:'normal'}); await click('이름 저장',form());
    check(row().textContent.includes(provider+' 새 이름'),'Rename did not update row');
    check((await window.fixtureInvoke(provider+'_accounts_list'))[1].id===account.id,'Rename changed identity');
    await click('삭제',row()); check(form().textContent.includes('default') && form().textContent.includes('비활성화'),'Removal effects missing');
    await click('취소',form()); check(!!row(),'Cancel removed the account');
    const key='multiagent.agents.v1';
    localStorage.setItem(key,JSON.stringify([{id:'bound',aiToolId:provider,[provider+'AccountId']:account.id,lastSessionId:'old',dangerous:true},{id:'other',aiToolId:provider,[provider+'AccountId']:'default',lastSessionId:'keep'}]));
    const defaults=JSON.parse(localStorage.getItem('multiagent.agentDefaults.v1'));defaults[provider][provider+'AccountId']=account.id;localStorage.setItem('multiagent.agentDefaults.v1',JSON.stringify(defaults));
    await click('삭제',row());
    await window.fixtureInvoke('fixture_mode',{provider,mode:'remove-failure'}); await click('삭제하고 기본 계정으로 전환',form());
    check(!!row() && JSON.parse(localStorage.getItem(key))[0][provider+'AccountId']===account.id,'Failed deletion changed bindings');
    await window.fixtureInvoke('fixture_mode',{provider,mode:'normal'}); await click('삭제하고 기본 계정으로 전환',form());
    check(!row(),'Deleted account remains in the list');
    const [bound,other]=JSON.parse(localStorage.getItem(key));
    check(bound[provider+'AccountId']==='default' && !bound.lastSessionId && bound.deferredStart && bound.dangerous,'Session did not return to default safely');
    check(other.lastSessionId==='keep','Unrelated session changed');
    check(window.fixtureDefaults(provider)[provider+'AccountId']==='default' && document.querySelector('.agent-defaults select').value==='default','New session default did not reset');
  }
  return 'ACCOUNT_RENAME_REMOVE_UI_OK';
}

if (process.versions.electron) {
  const { app, BrowserWindow, ipcMain } = require("electron");
  const directory = process.env.ACEDIA_SMOKE_DIRECTORY;
  app.setPath("userData", path.join(directory, "profile"));
  app.whenReady().then(async () => {
    const services = {}, jobs = {}, modes = {};
    try {
      for (const provider of ["codex", "claude"]) {
        const service = services[provider] = new ProviderAccounts(directory, provider, { baseEnv: {}, startLogin: () => {
          if (modes[provider] === "start-failure") throw new Error("private-fixture");
          const job = jobs[provider] = { onData(fn) { fn("private-fixture OAuth output"); }, onExit(fn) { this.finish = fn; }, kill() {} };
          return job;
        } });
        ipcMain.handle(provider + "_accounts_list", () => {
          if (modes[provider] === "list-failure") throw new Error("fixture unavailable");
          return service.list();
        });
        ipcMain.handle(provider + "_accounts_create", (_event, args) => {
          if (modes[provider] === "create-failure") throw new Error("fixture unavailable");
          return service.create(args.label);
        });
        ipcMain.handle(provider + "_accounts_login", (_event, args) => service.beginLogin(args.accountId));
        ipcMain.handle(provider + "_accounts_rename", (_event, args) => {
          if (modes[provider] === "rename-failure") throw Error("fixture write failure");
          return service.rename(args.accountId,args.label);
        });
        ipcMain.handle(provider + "_accounts_remove", (_event, args) => {
          if (modes[provider] === "remove-failure") throw Error("fixture write failure");
          service.remove(args.accountId);
          return {removed:{codex:services.codex.removedAccounts.map(a=>a.id),claude:services.claude.removedAccounts.map(a=>a.id)}};
        });
        ipcMain.handle(provider + "_accounts_cancel_login", (_event, args) => service.cancelLogin({ accountId: args.accountId }));
      }
      ipcMain.handle("fixture_mode", (_event, { provider, mode }) => { modes[provider] = mode; });
      ipcMain.handle("fixture_complete", (_event, { provider, result }) => {
        const service = services[provider], id = service.login.id, home = service.home(id);
        if (result === "timeout") { service.cancelLogin({ accountId: id, timedOut: true }); return; }
        if (result === "saved") {
          if (provider === "codex") {
            const token = "header." + Buffer.from(JSON.stringify({ email: "codex@example.invalid" })).toString("base64url") + ".signature";
            syncFs.writeFileSync(path.join(home, "auth.json"), JSON.stringify({ tokens: { id_token: token, access_token: "private-fixture" } }));
          } else {
            syncFs.writeFileSync(path.join(home, ".credentials.json"), '{"fixture":"private-fixture"}');
            syncFs.writeFileSync(path.join(home, ".claude.json"), '{"oauthAccount":{"emailAddress":"claude@example.invalid"}}');
          }
        }
        jobs[provider].finish({ exitCode: result === "failed" ? 1 : 0 });
      });
      ipcMain.handle("check_tools", () => ({ codex: { available: true }, claude: { available: true } }));
      ipcMain.handle("qwen_region_get", () => ({ available: false }));
      const win = new BrowserWindow({ show: false, width: 1080, height: 1100,
        webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
      await win.loadFile(path.join(directory, "index.html"));
      console.log(await win.webContents.executeJavaScript("(" + exercise.toString() + ")()"));
      await win.reload();
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(await win.webContents.executeJavaScript("if(document.querySelector('.agent-defaults select').value !== window.fixtureDefaults('codex').codexAccountId)throw Error('Reload lost default');[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='계정 정보').click();'ACCOUNT_ONBOARDING_RELOAD_OK'"));
      const writer = new BrowserWindow({ show: false });
      await writer.loadFile(path.join(directory, "index.html"));
      await writer.webContents.executeJavaScript("const k='multiagent.agentDefaults.v1';const d=JSON.parse(localStorage.getItem(k));d.codex.codexAccountId='default';localStorage.setItem(k,JSON.stringify(d));");
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log(await win.webContents.executeJavaScript("(() => { const flow=document.querySelector('.account-flow');const button=[...flow.querySelectorAll('button')].find(b=>b.textContent.trim()==='새 세션의 기본 계정으로 사용');if(!button || document.querySelector('.agent-defaults select').value!=='default')throw Error('Cross-window default not reflected');button.click();return 'ACCOUNT_ONBOARDING_CROSS_WINDOW_OK'; })()"));
      writer.destroy();
      await new Promise(resolve => setTimeout(resolve, 300));
      for (const width of [800, 1202]) {
        win.setContentSize(width, 1100);
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(await win.webContents.executeJavaScript("(() => { const panel=document.querySelector('.account-flow');if(panel.scrollWidth>panel.clientWidth+1 || document.documentElement.scrollWidth>innerWidth)throw Error('Onboarding overflow');return 'ACCOUNT_ONBOARDING_LAYOUT_OK'; })()"));
      }
      if (process.env.ACEDIA_ACCOUNT_SCREENSHOT) await fs.writeFile(process.env.ACEDIA_ACCOUNT_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      if (process.env.ACEDIA_ACCOUNT_MANAGEMENT_SCREENSHOTS) {
        const destination=process.env.ACEDIA_ACCOUNT_MANAGEMENT_SCREENSHOTS;
        await fs.mkdir(destination,{recursive:true});
        for(const width of [1202,800,390]) {
          win.setContentSize(width,1000);
          for(const [mode,label] of [['rename','이름 변경'],['remove','삭제']]) {
            await win.webContents.executeJavaScript(`(() => { const done=[...document.querySelectorAll('.account-flow button')].find(b=>b.textContent.trim()==='완료');done?.click();[...document.querySelectorAll('.account-list-actions button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click(); })()`);
            await new Promise(resolve=>setTimeout(resolve,200));
            await win.webContents.executeJavaScript("(() => { const form=document.querySelector('.account-edit');form.scrollIntoView({block:'center'});if(form.scrollWidth>form.clientWidth+1 || document.documentElement.scrollWidth>innerWidth)throw Error('Account edit overflow: '+innerWidth); })()");
            await fs.writeFile(path.join(destination,`${mode}-${width}.png`),(await win.webContents.capturePage()).toPNG());
          }
        }
        win.setContentSize(1202,1100);
        await win.webContents.executeJavaScript("[...document.querySelectorAll('.account-edit button')].find(b=>b.textContent.trim()==='취소').click()");
      }
      console.log(await win.webContents.executeJavaScript('('+manageAccounts.toString()+')()'));
      win.reload(); await new Promise(resolve=>setTimeout(resolve,500));
      console.log(await win.webContents.executeJavaScript("if(document.querySelectorAll('.account-list-row').length!==1 || document.querySelector('.agent-defaults select').value!=='default')throw Error('Deleted account returned on reload');'ACCOUNT_REMOVAL_RELOAD_OK'"));
      app.exit(0);
    } catch (error) { console.error(error); for (const service of Object.values(services)) service.cancelLogin(); app.exit(1); }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-onboarding-ui-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(root, "scripts/fixtures/account-onboarding-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{height:auto;min-height:100%;margin:0}#root{display:block;width:100%;background:var(--app-panel);color:var(--app-text);padding:24px;box-sizing:border-box}.agent-settings-tabs{max-width:760px;margin:auto}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_SMOKE_DIRECTORY: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 55000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error("Account onboarding smoke failed: " + code);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-onboarding-ui-")) throw new Error("Unexpected cleanup path");
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
