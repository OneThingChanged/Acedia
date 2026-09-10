import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { prepareLaunchCommand, mergeLaunchEnvironment } from "../electron/services/agent-launch.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

async function exerciseUI() {
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const button = label => [...document.querySelectorAll("button")].find(el => el.textContent.trim() === label);
  const field = label => document.querySelector('[aria-label="' + label + '"]');
  const change = async (label, value) => {
    const input = field(label); check(input, "Missing " + label);
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true })); await wait();
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); input.blur(); await wait();
  };
  const open = async () => { document.querySelector(".advanced-launch-options details").open = true; await wait(); };
  await wait();
  await open();
  button("직접 지정").click(); await wait();
  window.fixtureDialogResult = null;
  button("찾아보기").click(); await wait();
  check(field("CLI 실행 파일 경로").value === "", "Cancelled picker changed the path");
  window.fixtureDialogResult = "C:/fixture/custom.exe";
  button("찾아보기").click(); await wait();
  check(window.fixtureDefaults("codex").launchOptions.executable === "C:/fixture/custom.exe", "Picker did not save the path");
  button("+ 인수 추가").click(); await wait(); await change("추가 인수 1", "--profile");
  button("+ 인수 추가").click(); await wait(); await change("추가 인수 2", "work space");
  button("+ 변수 추가").click(); await wait();
  await change("환경변수 1 이름", "ACEDIA_SAMPLE"); await change("환경변수 1 값", "value with spaces");
  check(field("환경변수 1 값").type === "password", "Value is not masked");
  field("환경변수 1 값 표시").click(); await wait();
  check(field("환경변수 1 값").type === "text", "Reveal does not work");
  const saved = window.fixtureDefaults("codex").launchOptions;
  const setter = Storage.prototype.setItem;
  Storage.prototype.setItem = () => { throw new Error("fixture write failure"); };
  await change("추가 인수 2", "unsaved edit");
  check(document.body.textContent.includes("기본값을 저장하지 못했습니다") && window.fixtureDefaults("codex").launchOptions.args[1] === "work space", "Failed write reported as saved");
  Storage.prototype.setItem = setter;
  await change("추가 인수 2", "work space");
  button("+ 변수 추가").click(); await wait(); await change("환경변수 2 이름", "CODEX_HOME");
  check(document.querySelector(".advanced-launch-error") && window.fixtureDefaults("codex").launchOptions.env.length === 1, "Protected environment was saved");
  await change("환경변수 2 이름", "acedia_sample");
  check(document.querySelector(".advanced-launch-error"), "Case-insensitive duplicate was accepted");
  field("환경변수 2 삭제").click(); await wait();
  check(!document.querySelector(".advanced-launch-error"), "Error did not clear");
  button("Claude").click(); await wait(); await open();
  check(!window.fixtureDefaults("claude").launchOptions, "Provider settings leaked");
  button("Codex").click(); await wait(); await open();
  check(field("추가 인수 2").value === "work space", "Provider switch lost saved values");
  window.fixtureShow("new"); await wait();
  const tool = document.querySelector("select");
  tool.value = "codex"; tool.dispatchEvent(new Event("change", { bubbles: true })); await wait(); await open();
  check(field("추가 인수 2").value === "work space", "New-session defaults missing");
  button("+ 변수 추가").click(); await wait(); await change("환경변수 2 이름", "CODEX_HOME");
  check(button("만들기").disabled, "Creation allowed invalid draft");
  field("환경변수 2 삭제").click(); await wait(); button("만들기").click(); await wait();
  check(JSON.stringify(window.fixtureCreated.launchOptions) === JSON.stringify(saved), "Creation payload lost advanced settings: " + JSON.stringify({ actual: window.fixtureCreated.launchOptions, expected: saved }));
  window.fixtureShow("session"); await wait(); button("실행 옵션").click(); await wait(); await open();
  check(!window.fixtureAgent.launchOptions, "Legacy session adopted new defaults implicitly");
  button("현재 기본값 불러오기").click(); await wait();
  check(JSON.stringify(window.fixtureAgent.launchOptions) === JSON.stringify(saved), "Explicit default loading failed");
  button("고급 설정 초기화").click(); await wait();
  check(!window.fixtureAgent.launchOptions && !!window.fixtureDefaults("codex").launchOptions, "Session reset changed global defaults");
  window.fixtureShow("settings"); await wait(); await open();
  check(document.querySelector(".advanced-launch-options").scrollWidth <= document.querySelector(".advanced-launch-options").clientWidth + 1, "Settings overflow");
  return "ADVANCED_LAUNCH_UI_OK";
}

async function nativePtySmoke(directory) {
  if (process.platform !== "win32") return;
  const pty = require("node-pty");
  const shell = spawnSync("where.exe", ["pwsh.exe"], { encoding: "utf8", windowsHide: true }).stdout?.trim().split(/\r?\n/)[0] ||
    path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
  const node = process.env.ACEDIA_SMOKE_NODE;
  const fixture = path.join(directory, "native-fixture.cjs");
  await fs.writeFile(fixture, [
    "const timer=setTimeout(()=>process.exit(9),10000);",
    "console.log('ACEDIA_READY');",
    "require('node:readline').createInterface({input:process.stdin}).once('line',line=>{",
    "console.log('ACEDIA_RESULT:'+Buffer.from(JSON.stringify({args:process.argv.slice(2),env:process.env.ACEDIA_SAMPLE,input:line})).toString('base64'));",
    "clearTimeout(timer);process.exit(0);});",
  ].join("\n"));
  await fs.writeFile(path.join(directory, "codex.cmd"), '@echo off\r\n"' + node + '" "' + fixture + '" %*\r\n');
  const expected = ["work space", 'key="value"', "a&b", "%ACEDIA_SAMPLE%"];
  for (const shim of [false, true]) {
    const options = {
      executable: shim ? "" : node,
      args: shim ? expected : [fixture, ...expected],
      env: [{ name: "ACEDIA_SAMPLE", value: "pty-only" }, { name: "PATH", value: directory + ";" + (process.env.Path || process.env.PATH) }],
    };
    const env = mergeLaunchEnvironment(process.env, options);
    const command = prepareLaunchCommand("codex", options, { shell, toolId: "codex", env });
    const handle = pty.spawn(shell, ["-NoLogo", "-NoProfile"], { cwd: directory, env, cols: 300, rows: 30, useConpty: true });
    let exited = false;
    const exit = new Promise(resolve => handle.onExit(() => { exited = true; resolve(); }));
    try {
      await new Promise((resolve, reject) => {
        let output = "", inputSent = false;
        const timer = setTimeout(() => reject(new Error("PTY launch/input timeout")), 13000);
        const subscription = handle.onData(chunk => {
          output += chunk;
          if (!inputSent && output.includes("ACEDIA_READY")) { inputSent = true; handle.write("ACEDIA_INPUT\r"); }
          const result = output.match(/ACEDIA_RESULT:([A-Za-z0-9+/=]+)/);
          if (!result) return;
          try {
            const parsed = JSON.parse(Buffer.from(result[1], "base64").toString());
            if (JSON.stringify(parsed) !== JSON.stringify({ args: expected, env: "pty-only", input: "ACEDIA_INPUT" })) throw new Error("PTY argv/env/input mismatch");
            clearTimeout(timer); subscription.dispose(); resolve();
          } catch (error) {
            if (error instanceof SyntaxError) return;
            clearTimeout(timer); subscription.dispose(); reject(error);
          }
        });
        setTimeout(() => handle.write(command + "\r"), 650);
      });
      console.log(shim ? "ADVANCED_LAUNCH_PTY_CMD_OK" : "ADVANCED_LAUNCH_PTY_NATIVE_OK");
    } finally {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (!exited) handle.write("exit\r");
      await Promise.race([exit, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (!exited) { handle.kill(); await new Promise(resolve => setTimeout(resolve, 300)); }
    }
  }
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require("electron");
  const directory = process.env.ACEDIA_SMOKE_DIRECTORY;
  app.setPath("userData", path.join(directory, "profile"));
  app.whenReady().then(async () => { try {
    const win = new BrowserWindow({ show: false, width: 1050, height: 1050, webPreferences: { offscreen: true, backgroundThrottling: false } });
    await win.loadFile(path.join(directory, "index.html"));
    console.log(await win.webContents.executeJavaScript("(" + exerciseUI.toString() + ")()"));
    const writer = new BrowserWindow({ show: false });
    await writer.loadFile(path.join(directory, "index.html"), { query: { writer: "1" } });
    await writer.webContents.executeJavaScript("const k='multiagent.agentDefaults.v1';const d=JSON.parse(localStorage.getItem(k));d.codex.launchOptions.args=['--profile','from other window'];localStorage.setItem(k,JSON.stringify(d));");
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(await win.webContents.executeJavaScript("if(document.querySelector('[aria-label=\"추가 인수 2\"]').value!=='from other window')throw Error('Cross-window sync failed');'ADVANCED_LAUNCH_CROSS_WINDOW_OK'"));
    writer.destroy();
    await win.reload();
    await new Promise(resolve => setTimeout(resolve, 400));
    console.log(await win.webContents.executeJavaScript("if(window.fixtureDefaults('codex').launchOptions.args[1]!=='from other window')throw Error('Reload persistence failed');document.querySelector('.advanced-launch-options details').open=true;'ADVANCED_LAUNCH_RELOAD_OK'"));
    await new Promise(resolve => setTimeout(resolve, 200));
    if (process.env.ACEDIA_LAUNCH_SCREENSHOT) {
      win.setSize(1050, 1600);
      await new Promise(resolve => setTimeout(resolve, 300));
      const bounds = await win.webContents.executeJavaScript("const b=document.querySelector('.advanced-launch-options').getBoundingClientRect();({x:Math.floor(b.x),y:Math.floor(b.y),width:Math.ceil(b.width),height:Math.ceil(b.height)})");
      await fs.writeFile(process.env.ACEDIA_LAUNCH_SCREENSHOT, (await win.webContents.capturePage(bounds)).toPNG());
    }
    await nativePtySmoke(directory);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); } });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-advanced-launch-"));
  try {
    const { build } = await import("esbuild");
    await build({
      entryPoints: [path.join(root, "scripts/fixtures/advanced-launch-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "renderer.js"),
    });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;min-height:100%;height:auto}#root{display:block;background:var(--app-bg);color:var(--app-text)}.modal-backdrop{position:relative;min-height:950px}.modal{max-height:none}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_SMOKE_DIRECTORY: directory, ACEDIA_SMOKE_NODE: process.execPath };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 45000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error("Advanced launch smoke failed: " + code);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-advanced-launch-")) throw new Error("Unexpected cleanup path");
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
