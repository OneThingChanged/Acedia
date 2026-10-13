import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
if (!process.versions.electron) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-startup-update-"));
  try {
    const { build } = await import("esbuild");
    const metadata = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
    await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/startup-update-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}", __MULTIAGENT_APP_VERSION__: JSON.stringify(metadata.multiAgentReleaseVersion) },
      jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_STARTUP_UPDATE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [import.meta.filename], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 60_000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("acedia-startup-update-"));
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
} else {
  const { app, BrowserWindow } = require("electron");
  const directory = process.env.ACEDIA_STARTUP_UPDATE_DIR;
  app.setPath("userData", path.join(directory, "profile"));
  app.disableHardwareAcceleration(); app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = source => win.webContents.executeJavaScript(source);
  const waitFor = async source => {
    for (let i = 0; i < 100; i++) {
      if (await js(source)) return;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error("Startup update UI timed out: " + source);
  };
  const click = async index => {
    const bounds = await js(`(()=>{const r=document.querySelectorAll('.startup-update-modal button')[${index}].getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    win.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...bounds });
    win.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...bounds });
  };
  try {
    await win.loadFile(path.join(directory, "index.html"));
    await waitFor("!!document.querySelector('.startup-update-modal')");
    assert.deepEqual(await js("window.updateFixture.stats()"), { checks: 1, downloads: 0, restarts: 0, dismissals: 0 });
    const output = path.resolve(appRoot, "../output/startup-update-smoke"); await fs.mkdir(output, { recursive: true });
    for (const width of [1280, 390]) {
      win.setSize(width, 720);
      await js("window.updateFixture.reset()"); await waitFor("!!document.querySelector('.startup-update-modal')");
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(await js("document.querySelector('.startup-update-modal').textContent.includes('지금 업데이트')"), true);
      assert.equal(await js("(()=>{const r=document.querySelector('.startup-update-modal').getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"), true);
      await fs.writeFile(path.join(output, `prompt-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await click(0); await waitFor("!document.querySelector('.startup-update-modal')");
      await js("window.updateFixture.remount()");
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.deepEqual(await js("window.updateFixture.stats()"), { checks: 1, downloads: 0, restarts: 0, dismissals: 1 });
      assert.equal(await js("!!document.querySelector('.startup-update-modal')"), false);
    }
    for (const source of ["window.updateFixture.reset('current')", "window.updateFixture.reset('offline')", "window.updateFixture.reset('available',false)"]) {
      await js(source); await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await js("!!document.querySelector('.startup-update-modal')"), false);
      assert.equal((await js("window.updateFixture.stats()")).downloads, 0);
    }
    win.setSize(1280, 720);
    await js("window.updateFixture.reset('available',true,'en')"); await waitFor("!!document.querySelector('.startup-update-modal')");
    assert.equal(await js("document.querySelector('.startup-update-modal').textContent.includes('Update now')"), true);
    await click(1); await waitFor("!!document.querySelector('progress')");
    assert.equal(await js("Array.from(document.querySelectorAll('.startup-update-modal button')).every(button=>button.disabled)"), true);
    await js("window.updateFixture.emit('update:progress',{event:'Started',data:{contentLength:100}}); window.updateFixture.emit('update:progress',{event:'Progress',data:{chunkLength:64}})");
    await waitFor("document.querySelector('progress').value===64");
    await js("window.updateFixture.fail()"); await waitFor("document.querySelector('[role=alert]')?.textContent.includes('download interrupted')");
    assert.equal((await js("window.updateFixture.stats()")).restarts, 0);
    await click(1); await waitFor("!!document.querySelector('progress')");
    await js("window.updateFixture.finish()"); await waitFor("window.updateFixture.stats().restarts===1");
    await waitFor("document.querySelector('[role=status]')?.textContent.includes('Saving sessions')");
    await js("window.updateFixture.emit('app:close-cancelled',{message:'Session save interrupted'})");
    await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Session save interrupted')");
    await click(0); await waitFor("!document.querySelector('.startup-update-modal')");
    console.log("STARTUP_UPDATE_PROMPT_NATIVE_ACTIONS_PROGRESS_RETRY_LATER_OK");
    app.exit(0);
  } catch (error) {
    console.error(error); app.exit(1);
  }
  });
}
