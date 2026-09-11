import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exercise() {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms ?? 35));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const until = async (predicate, message) => {
    for (let n = 0; n < 80; n++) { if (predicate()) return; await wait(); }
    throw new Error(message);
  };
  const input = () => document.querySelector(".app-settings-search input");
  const query = async text => {
    const field = input(); field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true })); await wait();
  };
  const key = (element, name, extra = {}) => element.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...extra }));
  const open = async id => {
    const button = [...document.querySelectorAll("[data-setting-result]")].find(el => el.dataset.settingResult === id);
    check(button, "Missing search result: " + id); button.click();
    await until(() => document.querySelector(".setting-target-highlight")?.dataset.settingId === id, "Missing highlight: " + id);
    const target = document.querySelector(".setting-target-highlight");
    check(document.activeElement === target, "Target not focused: " + id);
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") check(parent.open, "Hidden result: " + id);
    }
    const bounds = target.getBoundingClientRect();
    const body = document.querySelector(".app-settings-body").getBoundingClientRect();
    check(bounds.bottom > body.top && bounds.top < body.bottom, "Target not scrolled into view: " + id);
    const scrollBody = document.querySelector(".app-settings-body");
    check(scrollBody.scrollWidth <= scrollBody.clientWidth + 1, "Target layout overflow: " + id);
    check(target.querySelector(".setting-scope"), "Target is missing scope metadata: " + id);
  };
  await until(() => input(), "Settings did not mount"); await wait(150);
  const storage = JSON.stringify(localStorage);
  const workspace = document.querySelector("#preserved-workspace");
  const catalog = window.fixtureCatalog();
  for (const item of catalog) {
    await query(item.label[0]);
    await open(item.id);
  }
  check(JSON.stringify(localStorage) === storage && !window.fixtureMutation, "Search changed persisted settings");
  const allowed = new Set(["idle_preferences_get", "notification_preferences_get", "power_policy_status", "saved_commands_get","browser_preferences_get","check_tools", "codex_accounts_list", "claude_accounts_list", "qwen_region_get", "conversation_storage_get",
    "get_developer_update_settings", "get_ssh_public_key", "remote_config_get", "monitor_config_get",
    "remote_access_list", "remote_server_status", "monitor_server_status", "tunnel_status"]);
  check(window.fixtureCalls.every(call => allowed.has(call.command)), "Navigation invoked an action: " + window.fixtureCalls.filter(call => !allowed.has(call.command)).map(call => call.command));
  await query("환경 변수");
  check(document.querySelectorAll("[data-setting-result]").length === 4, "Expected four provider environment results");
  key(input(), "ArrowDown"); await wait();
  check(document.activeElement.dataset.settingResult === "agents.codex.env", "ArrowDown did not enter results");
  key(document.activeElement, "ArrowDown");
  check(document.activeElement.dataset.settingResult === "agents.claude.env", "Result keyboard navigation failed");
  await open("agents.claude.env");
  check(document.querySelector('[role="tab"][aria-selected="true"]').textContent.includes("Claude"), "Wrong provider tab");
  const advanced = document.querySelector(".advanced-launch-options details");
  check(advanced.open, "Advanced options did not expand");
  advanced.open = false;
  [...document.querySelectorAll("button")].find(b => b.textContent === "검색 결과로 돌아가기").click(); await wait();
  await open("agents.claude.env");
  check(document.querySelector(".advanced-launch-options details").open, "Repeated navigation did not reopen details");
  await query("커서 모양"); key(input(), "Enter"); await until(() => document.querySelector(".setting-target-highlight")?.dataset.settingId === "terminal.cursorStyle", "Enter did not select a result");
  await query("private-fixture"); check(document.querySelectorAll("[data-setting-result]").length === 0, "Private values entered the search index");
  check(document.body.textContent.includes("일치하는 설정이 없습니다"), "Empty result message missing");
  key(input(), "Escape"); await wait();
  check(input().value === "" && document.querySelector(".app-settings-screen"), "Escape did not clear search first");
  check(!document.querySelector(".setting-target-highlight"), "Clearing search retained highlight");
  await query("앱 언어"); await open("language.display");
  [...document.querySelectorAll('[role="radio"]')].find(button => button.textContent === "English").click(); await wait();
  await query("cursor"); check(document.querySelectorAll("[data-setting-result]").length === 2, "English option search failed");
  await open("terminal.cursorBlink");
  check(document.querySelector(".setting-target-highlight .setting-scope").textContent.includes("Immediate"), "Scope label did not follow language");
  await query("App language"); await open("language.display");
  [...document.querySelectorAll('[role="radio"]')].find(button => button.textContent === "한국어").click(); await wait();
  window.fixtureContext("company", ["codex", "claude"]); await wait();
  await query("remote"); check(![...document.querySelectorAll("[data-setting-result]")].some(el => el.dataset.settingResult.startsWith("remote.")), "Company exposed Remote settings");
  await query("작업자"); check(![...document.querySelectorAll("[data-setting-result]")].some(el => el.dataset.settingResult.includes(".workers.")), "Unavailable workers appeared");
  window.fixtureContext("standard"); await wait();
  await query("environment CLAUDE"); key(input(), "Enter", { isComposing: true }); await wait();
  check(document.querySelector(".settings-search-results"), "IME Enter selected a result");
  key(input(), "Escape", { isComposing: true }); await wait();
  check(document.querySelector(".settings-search-results") && input().value === "environment CLAUDE", "IME Escape closed settings or cleared search");
  await open("agents.claude.env");
  window.fixtureAccountState = "pending"; await wait(2300);
  check(document.activeElement.dataset.settingId === "agents.claude.env", "Background login stole result focus");
  window.fixtureAccountState = "saved"; await wait(2300);
  check(document.activeElement.dataset.settingId === "agents.claude.env", "Login completion stole result focus");
  window.fixtureAccountState = null;
  check(document.querySelector("#preserved-workspace") === workspace && workspace.value === "RUNNING_SESSION" && workspace.closest(".terminal-area").inert, "Covered workspace was changed");
  input().focus(); key(input(), "Escape"); await wait(); key(input(), "Escape"); await wait();
  check(!document.querySelector(".app-settings-screen") && !workspace.closest(".terminal-area").inert, "Escape did not return to workspace");
  document.querySelector(".app-topbar button").click(); await wait();
  await query("환경변수");
  return "SETTINGS_SEARCH_UI_OK " + catalog.length + " targets";
}

async function exerciseSavedCommands() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 60));
  const set = (element, value) => {
    Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set(document.querySelector('.app-settings-search input'), '저장 명령'); await wait();
  document.querySelector('[data-setting-result="commands.library"]').click(); await wait();
  const panel = document.querySelector('.saved-commands-panel');
  panel.querySelector('details').open = true;
  set(panel.querySelector('details input'), 'Fixture command'); await wait();
  set(panel.querySelector('textarea'), 'echo harmless-fixture'); await wait();
  [...panel.querySelectorAll('button')].find(b => b.textContent === '명령 저장').click(); await wait();
  const saved = window.fixtureCommandConfig.commands[0];
  if (saved?.name !== 'Fixture command' || !panel.textContent.includes('echo harmless-fixture')) throw Error('Command editor did not save/render');
  [...panel.querySelectorAll('button')].find(b => b.textContent === '새 셸에서 실행').click(); await wait();
  if (window.fixtureRun?.id !== saved.id || window.fixtureRun?.projectId !== 'fixture-project') throw Error('Command run target mismatch');
  const startup = panel.querySelector('[aria-label="프로젝트 시작 명령"]'); startup.value = saved.id; startup.dispatchEvent(new Event('change', { bubbles: true })); await wait();
  panel.querySelector('input[type="checkbox"]').click(); await wait();
  if (!window.fixtureCommandConfig.startups['fixture-project']?.automatic) throw Error('Startup selection not saved');
  return 'SAVED_COMMAND_EDITOR_UI_OK';
}

async function exercisePolicies() {
  const wait=()=>new Promise(resolve=>setTimeout(resolve,100));
  const open=async(query,id)=>{
    const input=document.querySelector('.app-settings-search input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,query);input.dispatchEvent(new Event('input',{bubbles:true}));await wait();
    document.querySelector('[data-setting-result="'+id+'"]').click();await wait();
  };
  const select=async(element,value)=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('change',{bubbles:true}));await wait();};
  await open('유휴 세션 자동 중지','idle.enabled');
  document.querySelector('[aria-label="유휴 세션 자동 중지"]').click();await wait();
  await select(document.querySelector('[aria-label="유휴 시간"]'),'15');
  document.querySelector('.app-settings-body .btn-primary').click();await wait();
  if(!window.fixtureIdleConfig.enabled||window.fixtureIdleConfig.minutes!==15)throw Error('Idle policy editor failed');
  await open('완료 알림','general.completion');
  const panel=document.querySelector('[data-setting-id="general.completion"]').closest('section');
  panel.querySelector('[aria-label="완료 알림"]').click();await wait();
  panel.querySelector('[aria-label="터미널 벨 알림"]').click();await wait();
  await select(panel.querySelector('[aria-label="절전 방지"]'),'working');
  panel.querySelector('.btn-primary').click();await wait();
  if(window.fixtureNotificationConfig.completion||!window.fixtureNotificationConfig.bell||window.fixtureNotificationConfig.powerMode!=='working')throw Error('Notification policy editor failed');
  return 'NOTIFICATION_AND_IDLE_POLICY_EDITORS_UI_OK';
}

async function exerciseStatusBar() {
  const wait = () => new Promise(resolve => setTimeout(resolve,100));
  window.fixtureStatus(); await wait(); await wait();
  const check = (ok,message) => {if(!ok) throw Error(message);};
  check(document.querySelectorAll('.usage-status-provider').length === 2, 'Initial providers missing');
  check(document.querySelector('.usage-status-limit b').textContent.includes('90%'), 'Used percentage missing');
  document.querySelector('[aria-label="status.codex"]').click(); await wait();
  check(document.querySelectorAll('.usage-status-provider').length === 1, 'Account provider filter failed');
  const display = document.querySelector('[aria-label="한도 비율 표시"]');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(display,'remaining');
  display.dispatchEvent(new Event('change',{bubbles:true})); await wait();
  check(document.querySelector('.usage-status-limit b').textContent.includes('10%'), 'Remaining percentage missing');
  check(document.querySelector('.usage-progress-fill').style.width === '10%', 'Remaining bar width mismatch');
  check(document.querySelector('.usage-progress-fill').className.includes('danger'), 'Warning color was inverted');
  document.querySelector('[aria-label="status.resources"]').click();
  document.querySelector('[aria-label="status.ports"]').click(); await wait();
  check(!document.querySelector('.resource-monitor') && !document.querySelector('.ports-monitor'), 'Hidden monitor still mounted');
  document.querySelector('.usage-status-provider').click(); await wait();
  check(document.querySelector('.usage-provider-popover').textContent.includes('계정 사용 한도'), 'Quota scope missing');
  check(document.querySelector('.usage-detail-window-meta').textContent.includes('10%'), 'Detail percentage mismatch');
  return 'STATUS_BAR_PREFERENCES_UI_OK';
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require("electron");
  const directory = process.env.ACEDIA_SMOKE_DIRECTORY;
  app.setPath("userData", path.join(directory, "profile"));
  app.whenReady().then(async () => { try {
    const win = new BrowserWindow({ show: false, width: 800, height: 640, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadFile(path.join(directory, "index.html"));
    console.log(await win.webContents.executeJavaScript("(" + exercise.toString() + ")()"));
    for (const [width, height] of [[800, 640], [1202, 801], [1920, 1080]]) {
      win.setContentSize(width, height); await new Promise(resolve => setTimeout(resolve, 150));
      console.log(await win.webContents.executeJavaScript("(() => { const screen=document.querySelector('.app-settings-screen'); const body=document.querySelector('.app-settings-body');if(screen.scrollWidth>screen.clientWidth+1 || body.scrollWidth>body.clientWidth+1)throw Error('Search layout overflow');return 'SETTINGS_SEARCH_LAYOUT_OK'; })()"));
    }
    win.setContentSize(1202, 801); await new Promise(resolve => setTimeout(resolve, 200));
    if (process.env.ACEDIA_SETTINGS_SEARCH_SCREENSHOT) await fs.writeFile(process.env.ACEDIA_SETTINGS_SEARCH_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelector('[data-setting-result=\"agents.claude.env\"]').click()");
    await new Promise(resolve => setTimeout(resolve, 300));
    if (process.env.ACEDIA_SETTINGS_TARGET_SCREENSHOT) await fs.writeFile(process.env.ACEDIA_SETTINGS_TARGET_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    console.log(await win.webContents.executeJavaScript("(" + exerciseSavedCommands.toString() + ")()"));
    console.log(await win.webContents.executeJavaScript("(" + exercisePolicies.toString() + ")()"));
    console.log(await win.webContents.executeJavaScript("(" + exerciseStatusBar.toString() + ")()"));
    const peer = new BrowserWindow({show:false,width:800,height:640,webPreferences:{offscreen:true,backgroundThrottling:false}});
    await peer.loadFile(path.join(directory,"index.html"));
    await peer.webContents.executeJavaScript('window.fixtureStatus()');
    await new Promise(resolve=>setTimeout(resolve,250));
    await peer.webContents.executeJavaScript(`if(document.querySelectorAll('.usage-status-provider').length!==1 || !document.querySelector('.usage-status-limit b').textContent.includes('10%'))throw Error('Status preferences did not restore'); document.querySelector('[aria-label="status.codex"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,200));
    await win.webContents.executeJavaScript("if(document.querySelectorAll('.usage-status-provider').length!==2)throw Error('Status preferences did not sync across windows')");
    console.log('STATUS_BAR_RESTORE_AND_WINDOW_SYNC_OK');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); } });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-settings-search-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(root, "scripts/fixtures/settings-search-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}", __MULTIAGENT_APP_VERSION__: JSON.stringify("0.0.0.0") }, jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>.app-topbar{position:fixed;inset:0 0 auto;height:36px;display:flex;align-items:center;gap:12px;padding:0 14px;font-size:12px;background:var(--app-panel)}.app-topbar button{color:var(--app-text);background:var(--app-button-bg);border:1px solid var(--app-border);border-radius:4px}.terminal-area{position:absolute;inset:36px 0 0}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_SMOKE_DIRECTORY: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 55000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error("Settings search smoke failed: " + code);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-settings-search-")) throw new Error("Unexpected cleanup path");
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
