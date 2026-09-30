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
  const worker = kind => document.querySelector(`[data-worker-kind="${kind}"]`);
  const showCodex = async () => {
    window.fixtureShow(); await wait(); await change(tool(), "codex"); await wait();
  };
  await wait();
  document.querySelector("#fixture-open").focus(); document.querySelector("#fixture-open").click();
  await wait(); await change(tool(), "codex"); await wait();
  check(dialog().getAttribute("role") === "dialog" && dialog().getAttribute("aria-modal") === "true", "Missing dialog semantics");
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
  await change(worker("documents").querySelector("[data-worker-model]"), "gpt-6-sol");
  await change(worker("documents").querySelector("[data-worker-effort]"), "ultra");
  await change(worker("html").querySelector("select"), "claude-opus");
  await change(worker("html").querySelector("[data-worker-model]"), "sonnet");
  await change(worker("html").querySelector("[data-worker-effort]"), "high");
  const checks = document.querySelectorAll(".new-session-execution input");
  checks[1].click(); await wait(); button().click(); await wait();
  const payload = window.fixtureCreated;
  check(payload.name === "Plugin flow" && payload.aiToolId === "codex", "Lost name or provider");
  check(payload.codexAccountId === accounts[0].value && payload.codexPoolAccountId === accounts[1].value, "Lost account choices");
  check(payload.dangerous && payload.useAltScreen, "Lost execution flags");
  check(payload.workerSettings.documents.model === "gpt-6-sol" && payload.workerSettings.documents.effort === "ultra", "Lost document worker settings");
  check(payload.workerSettings.html.model === "sonnet" && payload.workerSettings.html.effort === "high", "Lost HTML worker settings");
  await change(worker("documents").querySelector("[data-worker-model]"), "gpt-5.5");
  check(worker("documents").querySelector("[data-worker-effort]").value === "xhigh", "Invalid effort was kept");
  await change(worker("html").querySelector("select"), "");
  button().click(); await wait(); check(!window.fixtureCreated.workerSettings.html, "Disabled worker was submitted");
  await change(tool(), "claude");
  await change(document.querySelector(".new-session-accounts select"), "11111111-1111-4111-8111-111111111111");
  button().click(); await wait();
  check(window.fixtureCreated.claudeAccountId && !window.fixtureCreated.workerSettings && !window.fixtureCreated.codexAccountId, "Codex options leaked into Claude");
  check(document.querySelector(".new-session-workers-empty") && !document.querySelector('[data-testid="session-worker-settings"]'), "Missing alternate provider state");
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
  return "NEW_SESSION_INTERACTION_OK";
}

function runElectronUI(temporary, artifacts) {
  const { app, BrowserWindow } = require("electron");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
  const timer = setTimeout(() => { console.error("New-session UI smoke timed out"); app.exit(2); }, 45000);
  let win;
  try {
    win = new BrowserWindow({ show: false, useContentSize: true, width: 1366, height: 768, webPreferences: { backgroundThrottling: false } });
    const errors = [];
    win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
    await win.loadFile(path.join(temporary, "index.html"));
    console.log(await win.webContents.executeJavaScript(`(${exerciseUI.toString()})()`));
    for (const [width, height, theme, language, advanced] of [
      [1366, 768, "soft", "ko", false], [1920, 1080, "soft", "ko", false],
      [1366, 768, "light", "en", false], [1024, 768, "warm", "en", false],
      [390, 844, "soft", "ko", false], [375, 667, "light", "en", false],
      [844, 375, "soft", "ko", false], [1366, 768, "soft", "ko", true], [390, 844, "soft", "ko", true],
    ]) {
      win.setContentSize(width, height);
      await win.webContents.executeJavaScript(`window.fixtureShow(${JSON.stringify({ theme, language })})`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await win.webContents.executeJavaScript(`(async () => {
        const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,40));}throw Error('Fixture did not settle');};
        await waitFor(()=>document.querySelector('.new-session-modal') && document.querySelector('.app').classList.contains('app-theme-${theme}'));
        const tool=document.querySelector('.new-session-identity select');tool.value='codex';tool.dispatchEvent(new Event('change',{bubbles:true}));
        await waitFor(()=>document.querySelector('[data-testid="session-worker-settings"]') && document.querySelectorAll('.new-session-accounts select').length===2 && [...document.querySelectorAll('.new-session-accounts select')].every(el=>!el.disabled));
        if(${advanced}) {document.querySelector('.advanced-launch-options details').open=true;await new Promise(r=>setTimeout(r,100));document.querySelector('.new-session-body').scrollTop=100000;}
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      })()`);
      const state = await win.webContents.executeJavaScript(`(() => {
        const dialog=document.querySelector('.new-session-modal'),body=document.querySelector('.new-session-body'),footer=document.querySelector('.new-session-footer').getBoundingClientRect();
        if(body.scrollWidth>body.clientWidth+1 || dialog.scrollWidth>dialog.clientWidth+1) throw Error('Horizontal overflow at ${width}x${height}');
        if(footer.bottom>innerHeight || footer.top<0) throw Error('Hidden footer at ${width}x${height}');
        if(${width>=1366 && !advanced} && body.scrollHeight>body.clientHeight+1) throw Error('Default desktop requires scrolling');
        return {viewport:[innerWidth,innerHeight],dialogWidth:dialog.getBoundingClientRect().width,scroll:body.scrollHeight>body.clientHeight+1};
      })()`);
      const image = await win.webContents.capturePage();
      await fs.writeFile(path.join(artifacts, `${width}x${height}-${theme}-${language}${advanced ? "-advanced" : ""}.png`), image.toPNG());
      console.log("NEW_SESSION_LAYOUT_OK", theme, language, advanced ? "advanced" : "default", JSON.stringify(state));
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
const artifacts = path.resolve(appRoot, "../.acedia/new-session-ui");
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
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
