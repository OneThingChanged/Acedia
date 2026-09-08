import { app, BrowserWindow } from "electron";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { BrowserActivity } from "../electron/services/browser-activity.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-download-smoke-"));
app.setPath("userData", path.join(root, "profile"));
app.on("window-all-closed", () => {});
let win, server;
const timer = setTimeout(() => { console.error("Download smoke timed out"); app.exit(1); }, 20000);
void app.whenReady().then(async () => {
let exitCode = 0;
try {
  const content = "Browser download fixture\n";
  server = http.createServer((request, response) => {
    if (request.url === "/file") {
      response.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="fixture.txt"' });
      response.end(content);
    } else response.end('<title>Download test</title><a href="/file">Download</a>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, partition: "download-smoke" } });
  const options = { directory: root, downloadsDirectory: root, ownerOf: id => id === win.webContents.id, shell: { showItemInFolder() {} } };
  const activity = new BrowserActivity(options);
  activity.attach(win.webContents);
  win.webContents.on("did-navigate", (_, target) => activity.visit(win.webContents, target));
  win.webContents.on("page-title-updated", (_, title) => activity.visit(win.webContents, win.webContents.getURL(), title, { replace: true }));
  const destination = path.join(root, "fixture.txt");
  const completed = new Promise((resolve, reject) => {
    win.webContents.session.once("will-download", (_, item) => {
      // This fixture chooses its temporary destination; production uses the save dialog.
      item.setSavePath(destination);
      item.once("done", (_, state) => state === "completed" ? resolve() : reject(new Error(state)));
    });
  });
  await win.loadURL(url);
  await win.webContents.executeJavaScript("document.querySelector('a').click()");
  await completed;
  assert.equal(fs.readFileSync(destination, "utf8"), content);
  const restored = new BrowserActivity(options).list();
  assert.equal(restored.downloads[0].state, "completed");
  assert.equal(restored.downloads[0].receivedBytes, Buffer.byteLength(content));
  assert.ok(restored.history.some(row => row.url === `${url}/`));
  console.log("BROWSER_DOWNLOAD_SMOKE_OK real download bytes, progress completion, history persistence");
} catch (error) { console.error(error); exitCode = 1; }
finally {
  clearTimeout(timer);
  if (win && !win.isDestroyed()) win.destroy();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  // Only the unique temporary directory created above is eligible for cleanup.
  if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("browser-download-smoke-")) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* profile handles can outlive the window */ }
  }
  app.exit(exitCode);
}

});
