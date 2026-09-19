import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { CodexLbConnection } from "../electron/services/codex-lb.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exerciseUI(baseUrl) {
  const wait = () => new Promise(resolve => setTimeout(resolve, 100));
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const button = label => [...document.querySelectorAll("button")].find(el => el.textContent.trim() === label);
  const input = selector => document.querySelector(selector);
  const change = async (selector, value) => {
    const field = input(selector); check(field, "Missing input " + selector);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true })); await wait();
  };
  const ready = async () => {
    for (let i = 0; i < 100; i++) { if (input("fieldset") && !input("fieldset").disabled) return; await wait(); }
    throw new Error("Settings remained unavailable");
  };
  await ready();
  check(!input('[role="switch"]').checked, "Connection must default off");
  await change('input[type="url"]', baseUrl);
  await change('input[type="password"]', "fixture-lb-secret");
  input('[role="switch"]').click(); await wait();
  button("연결 확인").click(); await wait(); await ready();
  check(document.body.textContent.includes("연결됨 · 모델 1개"), "Connection test did not show catalog result");
  const before = await window.multiAgentElectron.invoke("codex_lb_get", {});
  check(!before.settings.enabled && !before.hasApiKey, "Test persisted the draft");
  button("연결 설정 저장").click(); await wait(); await ready();
  check(document.body.textContent.includes("저장했습니다"), "Save success missing");
  check(input('input[type="password"]').value === "", "Saved key remained in the field");
  const saved = await window.multiAgentElectron.invoke("codex_lb_get", {});
  check(saved.settings.enabled && saved.hasApiKey && !JSON.stringify(saved).includes("fixture-lb-secret"), "IPC key disclosure or save failure");
  check(saved.settings.baseUrl.endsWith("/backend-api/codex"), "Endpoint normalization failed");
  await change('input[type="password"]', "incorrect-key");
  button("연결 확인").click(); await wait(); await ready();
  check(document.querySelector('[role="alert"]')?.textContent.includes("인증을 거부"), "Authentication error missing");
  check(input('input[type="password"]').value === "incorrect-key", "Failed test discarded the editable draft");
  button("저장된 설정 다시 불러오기").click(); await wait(); await ready();
  check(input('input[type="password"]').value === "", "Reload did not clear key draft");
  const concurrent = await window.multiAgentElectron.invoke("codex_lb_get", {});
  await window.multiAgentElectron.invoke("codex_lb_save", { settings: concurrent.settings, revision: concurrent.revision });
  button("연결 설정 저장").click(); await wait(); await ready();
  check(document.querySelector('[role="alert"]')?.textContent.includes("another window"), "Stale-window write was not rejected");
  button("저장된 설정 다시 불러오기").click(); await wait(); await ready();
  button("연결 확인").click(); await wait(); await ready();
  check(document.body.textContent.includes("연결됨 · 모델 1개"), "Encrypted key could not be reused");
  check([...document.querySelectorAll("input")].every(el => el.closest("label")), "Unlabeled input");
  return "CODEX_LB_UI_SAVE_TEST_ERRORS_OK";
}

if (process.versions.electron) {
  const { app, BrowserWindow, ipcMain, safeStorage } = require("electron");
  const directory = process.env.ACEDIA_LB_SMOKE_DIR;
  app.setPath("userData", path.join(directory, "profile"));
  const contract = require("../electron/ipc-contract.cjs");
  app.whenReady().then(async () => {
    let server;
    try {
      const service = new CodexLbConnection(app.getPath("userData"), { safeStorage });
      ipcMain.handle("multiagent:invoke", (_event, command, args) => {
        contract.assertInvokeRequest(command, args);
        if (command === "codex_lb_get") return service.get();
        if (command === "codex_lb_save") return service.save(args);
        if (command === "codex_lb_test") return service.test(args);
        throw new Error("Unexpected smoke command");
      });
      let requests = 0;
      server = http.createServer((req, res) => {
        requests++;
        if (req.method !== "GET" || req.url !== "/backend-api/codex/models") { res.writeHead(500); res.end(); return; }
        if (req.headers.authorization !== "Bearer fixture-lb-secret") { res.writeHead(401); res.end("Do not expose upstream details"); return; }
        res.writeHead(200, { "content-type": "application/json" }); res.end('{"models":[{"slug":"fixture"}]}');
      });
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      const win = new BrowserWindow({ show: false, width: 850, height: 1000, webPreferences: {
        offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false,
        preload: path.join(root, "electron/preload.cjs"),
        additionalArguments: ["--multiagent-invoke-commands=codex_lb_get,codex_lb_save,codex_lb_test"],
      } });
      await win.loadFile(path.join(directory, "index.html"));
      console.log(await win.webContents.executeJavaScript(`(${exerciseUI.toString()})(${JSON.stringify(`http://127.0.0.1:${server.address().port}`)})`));
      assert.equal(requests, 3);
      assert.ok(!(await fs.readFile(service.file, "utf8")).includes("fixture-lb-secret"));
      assert.equal(new CodexLbConnection(app.getPath("userData"), { safeStorage }).launch().env.ACEDIA_CODEX_LB_API_KEY, "fixture-lb-secret");
      win.setSize(460, 1000);
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.ok(await win.webContents.executeJavaScript("document.documentElement.scrollWidth <= innerWidth"), "Narrow settings overflow");
      await win.webContents.executeJavaScript("document.querySelector('#root').className='app app-theme-light'");
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.ok(await win.webContents.executeJavaScript("document.documentElement.scrollWidth <= innerWidth"), "Light theme overflow");
      if (process.env.ACEDIA_LB_SCREENSHOT) await fs.writeFile(process.env.ACEDIA_LB_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      win.destroy();
      console.log("CODEX_LB_ENCRYPTION_RELOAD_LAYOUT_OK");
      server.close(); server.closeAllConnections();
      app.exit(0);
    } catch (error) { console.error(error); server?.close(); server?.closeAllConnections(); app.exit(1); }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-codex-lb-ui-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(root, "scripts/fixtures/codex-lb-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;min-height:100%;height:auto}#root{display:block;overflow:visible;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_LB_SMOKE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: "inherit" });
    const timer = setTimeout(() => child.kill(), 30_000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, "codex-lb Electron smoke failed");
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-codex-lb-ui-")) throw new Error("Unexpected smoke cleanup path");
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
