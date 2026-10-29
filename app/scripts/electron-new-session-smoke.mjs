import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exerciseUI() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 80));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const dialog = () => document.querySelector(".new-session-modal");
  const button = () => dialog().querySelector(".btn-primary");
  const tool = () => document.querySelector(".new-session-identity select");
  const name = () => document.querySelector(".new-session-identity input");
  const change = async (element, value) => {
    element.focus();
    if (element.tagName === "SELECT") {
      element.value = value; element.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await wait();
  };
  const showCodex = async () => {
    window.fixtureShow(); await wait(); await change(tool(), "codex"); await wait();
  };
  await wait();
  document.querySelector("#fixture-open").focus(); document.querySelector("#fixture-open").click();
  await wait(); await change(tool(), "codex"); await wait();
  check(dialog().getAttribute("role") === "dialog" && dialog().getAttribute("aria-modal") === "true", "Missing dialog semantics");
  check(!document.querySelector(".session-worker-disclosure, [data-testid=\"session-worker-settings\"]"), "Retired worker settings are visible");
  name().focus();
  name().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  check(document.activeElement === button(), "Backward focus trap");
  button().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  check(document.activeElement === name(), "Forward focus trap");
  document.querySelector(".new-session-backdrop").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await wait(); check(dialog(), "Backdrop dismissed creation");
  await change(name(), "   "); check(button().disabled, "Empty alias allowed creation");
  await change(name(), "  Plugin flow  ");
  const accounts = document.querySelectorAll(".new-session-accounts select");
  check(accounts.length === 2 && !accounts[0].disabled && !accounts[1].disabled, "Accounts did not load");
  await change(accounts[0], "11111111-1111-4111-8111-111111111111");
  await change(accounts[1], "22222222-2222-4222-8222-222222222222");
  const checks = document.querySelectorAll(".new-session-execution input");
  check(checks[0].checked, "Unconfigured supported session did not default Dangerous ON");
  checks[1].click(); await wait(); button().click(); await wait();
  const payload = window.fixtureCreated;
  check(payload.name === "Plugin flow" && payload.aiToolId === "codex", "Lost name or provider");
  check(payload.codexAccountId === accounts[0].value && payload.codexPoolAccountId === accounts[1].value, "Lost account choices");
  check(payload.dangerous && payload.useAltScreen, "Lost execution flags");
  check(!Object.hasOwn(payload, "workerSettings"), "Retired worker settings were submitted");
  await change(tool(), "claude");
  await change(document.querySelector(".new-session-accounts select"), "11111111-1111-4111-8111-111111111111");
  button().click(); await wait();
  check(window.fixtureCreated.claudeAccountId && !window.fixtureCreated.workerSettings && !window.fixtureCreated.codexAccountId, "Codex options leaked into Claude");
  check(!document.querySelector(".session-worker-disclosure") && !document.querySelector('[data-testid="session-worker-settings"]'), "Workers shown for another provider");
  await change(tool(), "none"); button().click(); await wait();
  check(!window.fixtureCreated.dangerous && !document.querySelector(".advanced-launch-options"), "Shell-only options leaked");
  await showCodex();
  const details = document.querySelector(".advanced-launch-options details"); details.open = true; await wait();
  [...details.querySelectorAll("button")].find(b => b.textContent === "직접 지정").click(); await wait();
  check(button().disabled, "Invalid launch path allowed creation");
  await change(details.querySelector('input[aria-label="CLI 실행 파일 경로"]'), "C:/fixture/custom.cmd");
  details.querySelector('input[aria-label="CLI 실행 파일 경로"]').dispatchEvent(new FocusEvent("focusout", { bubbles: true })); await wait();
  button().click(); await wait(); check(window.fixtureCreated.launchOptions.executable === "C:/fixture/custom.cmd", "Lost launch path");
  window.fixtureShow({ ssh: true }); await wait(); await change(tool(), "codex");
  check(!document.querySelector(".new-session-accounts") && !document.querySelector(".advanced-launch-options"), "Local settings shown for SSH");
  button().click(); await wait(); check(!window.fixtureCreated.codexAccountId && !window.fixtureCreated.launchOptions, "Local settings sent for SSH");
  window.fixtureShow({ missing: true }); await wait(); check(button().disabled, "Missing project allowed creation");
  window.fixtureShow({ poolOff: true }); await wait(); await change(tool(), "codex");
  check(document.querySelector(".new-session-accounts").textContent.includes("계정 분산이 꺼져 있습니다"), "Routing-off hint lost");
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await wait(); check(!dialog(), "Escape failed outside alias field");
  document.querySelector("#fixture-open").focus(); document.querySelector("#fixture-open").click(); await wait();
  dialog().querySelector(".new-session-footer .btn-secondary").click(); await wait();
  check(!dialog() && document.activeElement.id === "fixture-open", "Cancel did not restore focus");

  window.fixtureShow({ kind: "project" }); await wait();
  const projectName = () => document.querySelector(".new-project-details input");
  const projectTool = () => document.querySelector(".new-project-tool select");
  const projectField = label => [...document.querySelectorAll(".new-project-details .field")]
    .find(field => field.querySelector(".field-label")?.textContent === label);
  check(projectTool().value === "" && button().disabled, "Project preselected a tool");
  await change(projectTool(), "codex");
  check(button().disabled, "Missing project folder allowed creation");
  await change(projectName(), "  Compact project  ");
  document.querySelector(".folder-row .browse-btn").click(); await wait();
  check(document.querySelector(".folder-row input").value === "C:/fixture/browsed-project", "Folder browse failed");
  await change(projectField("사이드바 폴더").querySelector("select"), "local-folder");
  const projectAccounts = document.querySelectorAll(".new-session-accounts select");
  await change(projectAccounts[0], "11111111-1111-4111-8111-111111111111");
  await change(projectAccounts[1], "22222222-2222-4222-8222-222222222222");
  check(!document.querySelector(".session-worker-disclosure"), "Retired project workers are visible");
  check(document.querySelector('.new-session-execution input[type="checkbox"]').checked, "Unconfigured first project session did not default Dangerous ON");
  button().click(); await wait();
  check(window.fixtureCreated.name === "Compact project" && window.fixtureCreated.folder === "C:/fixture/browsed-project", "Lost project basics");
  check(window.fixtureCreated.projectFolderId === "local-folder", "Lost sidebar folder");
  check(window.fixtureCreated.codexAccountId === projectAccounts[0].value && window.fixtureCreated.codexPoolAccountId === projectAccounts[1].value, "Lost first-session accounts");
  check(!Object.hasOwn(window.fixtureCreated, "workerSettings"), "Retired project worker settings were submitted");
  check(window.fixtureCreated.dangerous, "Project lost default Dangerous ON");
  document.querySelector('.new-session-execution input[type="checkbox"]').click(); await wait(); button().click(); await wait();
  check(!window.fixtureCreated.dangerous, "Project ignored explicit checkbox OFF");
  const projectAdvanced = document.querySelector(".advanced-launch-options details");
  projectAdvanced.open = true; await wait();
  [...projectAdvanced.querySelectorAll("button")].find(control => control.textContent === "직접 지정").click(); await wait();
  check(button().disabled, "Invalid first-session launch path allowed creation");
  await change(projectAdvanced.querySelector('input[aria-label="CLI 실행 파일 경로"]'), "C:/fixture/project-codex.cmd");
  projectAdvanced.querySelector('input[aria-label="CLI 실행 파일 경로"]').dispatchEvent(new FocusEvent("focusout", { bubbles: true })); await wait();
  check(!button().disabled, "Valid first-session launch path blocked creation");
  button().click(); await wait();
  check(window.fixtureCreated.launchOptions?.executable === "C:/fixture/project-codex.cmd", "Lost first-session launch path");
  await change(projectField("실행 위치").querySelector("select"), "ssh");
  check(button().disabled, "Missing SSH host allowed creation");
  await change(projectField("SSH 호스트").querySelector("select"), "fixture-ssh");
  await change(projectField("원격 폴더").querySelector("input"), " /home/fixture/project ");
  check(!projectField("사이드바 폴더").querySelector("select").value, "Local sidebar folder leaked into SSH");
  await change(projectField("사이드바 폴더").querySelector("select"), "ssh-folder");
  check(!document.querySelector(".new-session-accounts") && !document.querySelector(".advanced-launch-options"), "Local first-session controls shown for SSH");
  button().click(); await wait();
  check(window.fixtureCreated.sshHostId === "fixture-ssh" && window.fixtureCreated.remoteFolder === "/home/fixture/project" && window.fixtureCreated.folder === "", "Lost SSH project fields");
  check(!window.fixtureCreated.codexAccountId && !window.fixtureCreated.codexPoolAccountId && !window.fixtureCreated.launchOptions && window.fixtureCreated.projectFolderId === "ssh-folder", "Local options leaked into SSH project");
  await change(projectField("실행 위치").querySelector("select"), "local");
  check(document.querySelector(".folder-row input").value === "C:/fixture/browsed-project", "Changing run location lost the local folder");
  await change(projectTool(), "none"); button().click(); await wait();
  check(!window.fixtureCreated.workerSettings && !window.fixtureCreated.dangerous && !window.fixtureCreated.launchOptions, "Codex settings leaked into Shell project");
  projectName().focus();
  projectName().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
  check(document.activeElement === button(), "Project backward focus trap");
  button().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  check(document.activeElement === projectName(), "Project forward focus trap");
  projectTool().focus();
  projectTool().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await wait(); check(!dialog() && document.activeElement.id === "fixture-open", "Project Escape did not restore focus");

  const dangerous = () => document.querySelector('.new-session-execution input[type="checkbox"]');
  // Explicit remember mode retains last-choice behavior independently of the new ON default.
  localStorage.setItem('multiagent.agentDefaults.v1', JSON.stringify({ codex: { dangerousDefaultMode: 'remember', dangerous: true }, claude: { dangerousDefaultMode: 'remember', dangerous: false } }));
  localStorage.removeItem('multiagent.newSessionPreferences.v1');
  await showCodex();
  if (dangerous().checked) { dangerous().click(); await wait(); }
  button().click(); await wait();
  window.fixtureShow(); await wait();
  check(tool().value === "codex" && !dangerous().checked, "New Session lost provider or explicit Dangerous off");
  await change(tool(), "claude"); dangerous().click(); await wait(); button().click(); await wait();
  window.fixtureShow(); await wait();
  check(tool().value === "claude" && dangerous().checked, "New Session lost Claude or Dangerous on");
  await change(tool(), "codex");
  check(!dangerous().checked, "Dangerous choice leaked between providers");
  dangerous().click(); await wait();
  document.querySelector('.new-session-footer .btn-secondary').click(); await wait();
  window.fixtureShow(); await wait();
  check(tool().value === "claude" && dangerous().checked, "Cancelled session replaced the remembered choice");
  window.fixtureShow({ failCreate: true }); await wait();
  await change(tool(), "codex"); dangerous().click(); await wait(); button().click(); await wait();
  window.fixtureShow(); await wait();
  check(tool().value === "claude" && dangerous().checked, "Failed creation replaced preferences");
  window.fixtureShow({ disabledTools: ["claude"] }); await wait();
  check(tool().value === "codex" && !dangerous().checked, "Disabled remembered provider was selected");
  window.fixtureShow({ parentToolId: "codex" }); await wait();
  check(tool().value === "codex" && !dangerous().checked, "Child lost its parent's provider or tool permission choice");

  const defaultSetting = provider => document.querySelector('[data-setting-id="agents.' + provider + '.dangerous"] select');
  const showDefaults = async () => { window.fixtureShow({ kind: "settings" }); await wait(); };
  await showDefaults();
  check(defaultSetting("codex").value === "remember" && !defaultSetting("codex").closest("details"), "Dangerous default hidden or legacy mode changed");
  await change(defaultSetting("codex"), "on");
  check(JSON.parse(localStorage.getItem("multiagent.agentDefaults.v1")).codex.dangerousDefaultMode === "on", "Dangerous default not saved");
  await showCodex();
  check(dangerous().checked, "Fixed on lost to remembered off");
  dangerous().click(); await wait(); button().click(); await wait();
  check(!window.fixtureCreated.dangerous, "Cannot override fixed on for a single session");
  await showCodex(); check(dangerous().checked, "Single-session override replaced fixed on");
  window.fixtureShow({ parentToolId: "codex" }); await wait();
  check(dangerous().checked, "Child session ignored fixed on");
  window.fixtureShow({ kind: "project" }); await wait(); await change(projectTool(), "codex");
  check(dangerous().checked, "Project first session ignored fixed on");
  await showDefaults();
  await change(defaultSetting("codex"), "off");
  [...document.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.includes("Claude")).click(); await wait();
  check(defaultSetting("claude").value === "remember", "Dangerous default leaked into another tool");
  await showCodex(); check(!dangerous().checked, "Fixed off not applied");
  dangerous().click(); await wait(); button().click(); await wait();
  check(window.fixtureCreated.dangerous, "Cannot override fixed off for a single session");
  await showCodex(); check(!dangerous().checked, "Fixed off lost to remembered on");
  window.fixtureShow({ kind: "project" }); await wait(); await change(projectTool(), "codex");
  check(!dangerous().checked, "Project first session ignored fixed off");
  await change(projectTool(), "claude"); check(dangerous().checked, "Project first session ignored remember mode");
  return "CREATION_INTERACTION_OK session + project";
}

function runElectronUI(temporary, artifacts) {
  const { app, BrowserWindow } = require("electron");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.error("Creation UI smoke timed out"); app.exit(2); }, 60000);
  let win;
  try {
    win = new BrowserWindow({ show: false, useContentSize: true, width: 1366, height: 768, webPreferences: { backgroundThrottling: false } });
    const errors = [];
    win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
    await win.loadFile(path.join(temporary, "index.html"));
    console.log(await win.webContents.executeJavaScript(`(${exerciseUI.toString()})()`));
    await win.webContents.reload();
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript(`(async () => {
      window.fixtureShow(); await new Promise(resolve => setTimeout(resolve,150));
      if (document.querySelector('.new-session-identity select').value !== 'codex' || document.querySelector('.new-session-execution input').checked) throw Error('Reload lost fixed Dangerous default');
    })()`);
    console.log('NEW_SESSION_DANGEROUS_DEFAULT_RELOAD_OK');
    for (const kind of ["project", "session"]) {
    for (const [width, height, theme, language, advanced] of [
      [1366, 768, "soft", "ko", false], [1920, 1080, "soft", "ko", false],
      [1366, 768, "light", "en", false], [1024, 768, "warm", "en", false],
      [390, 844, "soft", "ko", false], [375, 667, "light", "en", false],
      [844, 375, "soft", "ko", false], [1366, 768, "soft", "ko", true], [390, 844, "soft", "ko", true],
    ]) {
      win.setContentSize(width, height);
      await win.webContents.executeJavaScript(`window.fixtureShow(${JSON.stringify({ kind, theme, language })})`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await win.webContents.executeJavaScript(`(async () => {
        const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,40));}throw Error('Fixture did not settle');};
        await waitFor(()=>document.querySelector('.new-session-modal') && document.querySelector('.app').classList.contains('app-theme-${theme}'));
        const tool=document.querySelector('.new-session-identity select, .new-project-tool select');tool.value='codex';tool.dispatchEvent(new Event('change',{bubbles:true}));
        await waitFor(()=>document.querySelectorAll('.new-session-accounts select').length===2 && [...document.querySelectorAll('.new-session-accounts select')].every(el=>!el.disabled));
        if(${advanced}) {document.querySelector('.advanced-launch-options details').open=true;await new Promise(r=>setTimeout(r,100));document.querySelector('.new-session-body').scrollTop=100000;}
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      })()`);
      const state = await win.webContents.executeJavaScript(`(() => {
        const dialog=document.querySelector('.new-session-modal'),body=document.querySelector('.new-session-body'),footer=document.querySelector('.new-session-footer').getBoundingClientRect();
        return {viewport:[innerWidth,innerHeight],dialogWidth:dialog.getBoundingClientRect().width,dialogHeight:dialog.getBoundingClientRect().height,scroll:body.scrollHeight>body.clientHeight+1,horizontalOverflow:body.scrollWidth>body.clientWidth+1 || dialog.scrollWidth>dialog.clientWidth+1,footerVisible:footer.bottom<=innerHeight && footer.top>=0};
      })()`);
      const image = await win.webContents.capturePage();
      await fs.writeFile(path.join(artifacts, `${kind}-${width}x${height}-${theme}-${language}${advanced ? "-advanced" : ""}.png`), image.toPNG());
      if (state.horizontalOverflow || !state.footerVisible || (width >= 1366 && !advanced && state.scroll)) {
        throw new Error(`Creation layout failed: ${kind} ${width}x${height} ${JSON.stringify(state)}`);
      }
      console.log("CREATION_LAYOUT_OK", kind, theme, language, advanced ? "advanced" : "default", JSON.stringify(state));
    }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    console.log("NEW_SESSION_UI_OK", artifacts);
  } catch (error) {
    console.error(error); process.exitCode = 1;
  } finally {
    clearTimeout(timer); win?.destroy();
    app.exit(process.exitCode || 0);
  }
  }).catch(error => { console.error(error); app.exit(1); });
}

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-new-session-ui-"));
const artifacts = path.resolve(process.env.ACEDIA_NEW_SESSION_ARTIFACTS || path.resolve(appRoot, "../.acedia/new-session-ui"));
try {
  await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/new-session-renderer.tsx")], bundle: true, jsx: "automatic", define: { "import.meta.env": "{}" }, outfile: path.join(temporary, "renderer.js") });
  await fs.writeFile(path.join(temporary, "index.html"), '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const exerciseUI = ${exerciseUI.toString()};
    (${runElectronUI.toString()})(${JSON.stringify(temporary)}, ${JSON.stringify(artifacts)});
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], { env, windowsHide: true, stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally {
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("acedia-new-session-ui-")) throw new Error("Unexpected cleanup path");
  await fs.rm(temporary, { recursive: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
