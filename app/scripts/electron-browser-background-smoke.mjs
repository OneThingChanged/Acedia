import { captureBrowserPng } from "../electron/services/browser-capture.mjs";
import { app, BrowserWindow, WebContentsView, nativeImage } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-background-smoke-"));
app.setPath("userData", root);
app.on("window-all-closed", () => {});
const timeout = setTimeout(() => { console.error("Background browser smoke timed out"); app.exit(1); }, 20000);
void app.whenReady().then(async () => {
  let win, workspace, view;
  let status = 0;
  try {
    win = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 1280, height: 800 });
    view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    win.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
    view.setVisible(false);
    let shown = 0;
    let focused = 0;
    win.on("show", () => shown++);
    win.on("focus", () => focused++);
    await view.webContents.loadURL('data:text/html,<body style="background:tomato"><input id="field"><h1>Background fixture</h1>');
    await view.webContents.executeJavaScript("document.querySelector('input').value='AI input'; document.querySelector('input').focus();");
    const image = nativeImage.createFromBuffer(await captureBrowserPng(view.webContents));
    assert.ok(!image.isEmpty() && image.toPNG().length > 100);
    assert.deepEqual([...image.toBitmap().subarray(0, 4)], [71, 99, 255, 255], "Hidden capture must contain the page, not a black window surface");
    console.log("BROWSER_HIDDEN_PIXELS_OK");
    await view.webContents.executeJavaScript("document.documentElement.style.overflow='hidden'; document.body.style.minHeight='2000px'; document.body.style.background='#00ff00'; window.scrollTo(0,200);");
    const crop = nativeImage.createFromBuffer(await captureBrowserPng(view.webContents, { x: 10, y: 20, width: 50, height: 60 }));
    assert.deepEqual(crop.getSize(), { width: 50, height: 60 });
    assert.deepEqual([...crop.toBitmap().subarray(0, 4)], [0, 255, 0, 255], "Repeated capture must include the latest page update");
    assert.equal(view.webContents.getBackgroundThrottling(), false);
    console.log("BROWSER_HIDDEN_SCROLLED_CROP_OK");
    assert.equal(shown, 0); assert.equal(focused, 0);
    assert.equal(win.isVisible(), false); assert.equal(view.getVisible(), false);
    console.log("BROWSER_BACKGROUND_SMOKE_OK hidden navigation, DOM input, real pixels and scrolled crop without show/focus");
    workspace = new BrowserWindow({ show: false, focusable: false, skipTaskbar: true, width: 1280, height: 800 });
    workspace.on("show", () => shown++);
    workspace.on("focus", () => focused++);
    const source = fs.readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
    const start = source.indexOf("function attachDocumentBrowserToWindow(");
    const end = source.indexOf("\nasync function refreshDocumentBrowserPreview", start);
    const events = [];
    const context = { runtimeByWebContents: new Map([[workspace.webContents.id, { workspace_window: true }]]),
      browserParentWindowForAgent: () => workspace, documentBrowserByAgent: new Map(), documentBrowserByShellWebContents: new Map(),
      publishDocumentBrowserCatalog: () => {}, sendEvent: (_win, _name, payload) => events.push(payload), sanitizeBrowserUrl: url => url };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end), context);
    const record = { id: "fixture", win, view, background: true, shellWebContentsId: win.webContents.id, bounds: view.getBounds() };
    assert.equal(context.showBrowserIntegrationTab(record, "agent", "right"), true);
    context.browserParentWindowForAgent = () => { throw Error("Repeated connection tried to move the browser"); };
    assert.equal(context.showBrowserIntegrationTab(record, "agent", "right"), true);
    const connectedImage = nativeImage.createFromBuffer(await captureBrowserPng(view.webContents));
    assert.equal(connectedImage.getSize().width, 1280);
    assert.equal(connectedImage.getSize().height, 800);
    assert.equal(record.win, workspace);
    assert.equal(view.getVisible(), false);
    assert.ok(events.every(event => event.activate === false));
    assert.equal(shown, 0); assert.equal(focused, 0);
    console.log("BROWSER_CONNECTION_BACKGROUND_OK repeated connection, retained window, 1280x800 hidden capture without show/focus");
  } catch (error) { console.error(error); status = 1; }
  finally {
    clearTimeout(timeout);
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    if (workspace && !workspace.isDestroyed()) workspace.destroy();
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(status);
  }
});
