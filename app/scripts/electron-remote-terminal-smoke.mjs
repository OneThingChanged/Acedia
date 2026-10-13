import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { LocalDashboardService, RemoteDashboardService } from "../electron/services/web-services.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-terminal-viewport-"));
app.setPath("userData", path.join(root, "profile"));
app.disableHardwareAcceleration(); app.on("window-all-closed", () => {});
const windows = [], services = [], writes = [];
const output = path.resolve(import.meta.dirname, "../../output/remote-terminal-smoke");
fs.mkdirSync(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = (win, source) => win.webContents.executeJavaScript(source);
const wait = async (win, source) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(win, source)) return;
    await pause(40);
  }
  throw new Error("Terminal viewport timed out: " + source);
};
const geometry = `(selector => {
  const mount = document.querySelector(selector), screen = mount.querySelector('.xterm-screen');
  const box = mount.getBoundingClientRect(), grid = screen.getBoundingClientRect(), css = getComputedStyle(mount);
  const left = box.left + mount.clientLeft + parseFloat(css.paddingLeft);
  const top = box.top + mount.clientTop + parseFloat(css.paddingTop);
  const right = box.left + mount.clientLeft + mount.clientWidth - parseFloat(css.paddingRight);
  const bottom = box.top + mount.clientTop + mount.clientHeight - parseFloat(css.paddingBottom);
  return { bottom: grid.bottom, clipBottom: bottom, right: grid.right, clipRight: right,
    fits: grid.left >= left-1 && grid.top >= top-1 && grid.bottom <= bottom+1 && grid.right <= right+1,
    footer: screen.textContent.includes('BOTTOM FOOTER: model effort fast'),
    scale: mount.querySelector('.xterm').style.transform };
})`;
const check = async (win, selector, label) => {
  const result = await evaluate(win, `${geometry}(${JSON.stringify(selector)})`);
  console.log(label, JSON.stringify(result));
  assert.equal(result.fits, true, `${label}: terminal grid clipped at the content boundary`);
  assert.equal(result.footer, true, `${label}: final host row missing`);
};
const timer = setTimeout(() => { console.error("Remote terminal smoke timed out"); app.exit(1); }, 60_000);

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const agents = ["one", "two"].map(id => ({ id, name: `Terminal ${id}`, projectId: "project", aiToolId: "codex", status: "running", runtimeStatus: "running" }));
    const groups = [{ id: "pair", name: "Pair", layout: { type: "split", direction: "h", children: [
      { type: "leaf", id: "left", tabs: ["one"], activeIndex: 0 }, { type: "leaf", id: "right", tabs: ["two"], activeIndex: 0 },
    ], sizes: [0.5, 0.5] } }];
    const snapshot = () => ({ language: "en", agents, view: { language: "en", agents, groups, projects: [{ id: "project", name: "Project", folder: root }] } });
    const data = "\x1b[2J\x1b[H" + Array.from({ length: 99 }, (_, i) => `Row ${i+1}: terminal output\r\n`).join("")
      + "\x1b[42mBOTTOM FOOTER: model effort fast\x1b[0m";
    const providers = { terminalSnapshot: () => ({ data }), terminalSize: () => ({ cols: 120, rows: 100 }),
      subscribeTerminal: () => () => {}, writePty: (...args) => { writes.push(args); return true; },
      usageProvider: async () => ({ limits: [], profiles: [] }), chatProvider: async () => ({ blocks: [], lifecycle: "idle" }),
    };
    for (const kind of ["remote", "dashboard"]) {
      const service = kind === "remote"
        ? new RemoteDashboardService({ baseDir: path.join(root, kind), stateProvider: snapshot, ...providers })
        : new LocalDashboardService({ title: "Dashboard", defaultPort: 0, baseDir: path.join(root, kind), configName: "dashboard.json", stateProvider: snapshot, providers });
      if (kind === "remote") { service.config.server_port = 0; service.syncAgents(agents); service.syncView(snapshot().view); }
      else { service.config.enabled = true; service.config.serverPort = 0; }
      services.push(service);
      const status = await service.start();
      for (const [width, height] of [[1440, 1132], [1024, 760], [390, 844]]) {
        const win = new BrowserWindow({ width, height, useContentSize: true, show: false,
          webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true } });
        windows.push(win);
        await win.loadURL(`${status.url}/?agent=one`);
        await wait(win, "document.querySelector('#detailName').textContent.includes('Terminal one')");
        await evaluate(win, "document.querySelector('#sessionMode [data-mode=term]').click()");
        await wait(win, "document.querySelector('#terminalMount .xterm-screen')?.textContent.includes('BOTTOM FOOTER: model effort fast')");
        await pause(200);
        await fs.promises.writeFile(path.join(output, `${kind}-${width}.png`), (await win.webContents.capturePage()).toPNG());
        await check(win, "#terminalMount", `${kind} ${width} initial`);
        // Growth and shrink must refit before the next state poll, without a
        // synthetic window-resize event or changing the desktop PTY dimensions.
        for (const text of [Array(9).fill("A multiline message").join("\n"), "short"]) {
          await evaluate(win, `(()=>{const input=document.querySelector('#messageInput');input.value=${JSON.stringify(text)}; input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
          await evaluate(win, "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))");
          await check(win, "#terminalMount", `${kind} ${width} composer ${text === "short" ? "shrink" : "grow"}`);
        }
        if (width === 1440) {
          await win.loadURL(`${status.url}/?screen=pair`);
          await wait(win, "document.querySelectorAll('.screen-terminal-mount .xterm-screen').length===2");
          await pause(200);
          const selectors = await evaluate(win, "Array.from(document.querySelectorAll('.screen-terminal-mount')).map((mount,i)=>{mount.dataset.viewportFixture=String(i);return '[data-viewport-fixture=\"'+i+'\"]';})");
          for (const selector of selectors) await check(win, selector, `${kind} split`);
        }
        win.destroy();
      }
    }
    assert.equal(writes.length, 0, "Visual fitting must not write to the host PTY");
    console.log("REMOTE_DASHBOARD_TERMINAL_LAST_ROW_AND_COMPOSER_RESIZE_OK");
  } catch (error) { console.error(error); exitCode = 1; }
  finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await Promise.all(services.map(service => service.stop()));
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("acedia-terminal-viewport-"));
    try { fs.rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chromium profile locks release at exit. */ }
    app.exit(exitCode);
  }
});
