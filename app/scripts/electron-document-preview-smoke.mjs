import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DocumentPreviewService } from "../electron/services/document-preview-service.mjs";
import { refreshDocumentPreview } from "../electron/services/document-preview-refresh.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-document-preview-"));
app.setPath("userData", path.join(root, "profile"));
const preview = new DocumentPreviewService();
const timer = setTimeout(() => { console.error("Document preview smoke timed out"); app.exit(1); }, 20_000);
app.whenReady().then(async () => {
  let window, status = 0;
  try {
    window = new BrowserWindow({ show: false, width: 1200, height: 800,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const html = '<!doctype html><meta charset="utf-8"><!--' + 'Large document data '.repeat(300_000)
      + '--><h1>Large document</h1><button onclick="this.textContent=\'Clicked\'">Check</button><script src="preview.js"></script>';
    fs.writeFileSync(path.join(root, "large.html"), html);
    fs.writeFileSync(path.join(root, "preview.js"), "document.title='Large preview ready';");
    assert.ok(Buffer.byteLength(html) > 5 * 1024 * 1024);
    const issued = await preview.issue({ folder: root, relativePath: "large.html" });
    await window.loadURL(issued.url);
    assert.deepEqual(await window.webContents.executeJavaScript(`({ title: document.title,
      heading: document.querySelector('h1')?.textContent, node: typeof require, bridge: typeof window.multiAgentElectron })`),
      { title: "Large preview ready", heading: "Large document", node: "undefined", bridge: "undefined" });
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('button').click(); document.querySelector('button').textContent"), "Clicked");
    assert.equal(window.isVisible(), false);
    console.log("LARGE_DOCUMENT_PREVIEW_OK streamed HTML, relative script, interaction, isolated renderer");
    const record = { folder: root, relativePath: "large.html", token: issued.token,
      previewUrl: issued.url, view: { webContents: window.webContents } };
    fs.writeFileSync(path.join(root, "large.html"), '<h1>Updated document</h1><script src="preview.js"></script>');
    fs.writeFileSync(path.join(root, "preview.js"), "document.title='Updated script';");
    assert.equal(await refreshDocumentPreview(record, preview), false);
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('h1').textContent"), "Large document");
    assert.equal(await refreshDocumentPreview(record, preview, true), true);
    assert.deepEqual(await window.webContents.executeJavaScript("({title:document.title, heading:document.querySelector('h1').textContent})"),
      { title: "Updated script", heading: "Updated document" });
    assert.notEqual(record.token, issued.token);
    assert.equal(preview.isPreviewUrl(issued.url, issued.token), false);
    preview.release(record.token);
    assert.equal(await refreshDocumentPreview(record, preview), true);
    assert.equal(await window.webContents.executeJavaScript("document.title"), "Updated script");
    assert.equal(await refreshDocumentPreview({ folder: "", relativePath: "" }, preview, true), false);
    console.log("DOCUMENT_REOPEN_REFRESH_OK updated HTML and script, expired preview recovery, external browser unchanged");

    // Optional read-only reproduction against a reported local HTML file.
    const documentPath = process.env.ACEDIA_PREVIEW_DOCUMENT;
    if (documentPath) {
      const absolutePath = path.resolve(documentPath);
      const document = await preview.issue({ folder: path.dirname(absolutePath), relativePath: path.basename(absolutePath) });
      await window.loadURL(document.url);
      const state = await window.webContents.executeJavaScript(`({ title: document.title,
        textLength: document.body?.innerText.length || 0, ready: document.readyState,
        node: typeof require, bridge: typeof window.multiAgentElectron })`);
      assert.equal(state.ready, "complete"); assert.ok(state.textLength > 0);
      assert.equal(state.node, "undefined"); assert.equal(state.bridge, "undefined");
      if (process.env.ACEDIA_PREVIEW_SCREENSHOT) {
        const png = await window.webContents.capturePage(); assert.ok(!png.isEmpty());
        fs.writeFileSync(process.env.ACEDIA_PREVIEW_SCREENSHOT, png.toPNG());
      }
      console.log("REPORTED_DOCUMENT_PREVIEW_OK " + JSON.stringify({ bytes: fs.statSync(absolutePath).size, ...state }));
    }
  } catch (error) { console.error(error); status = 1; }
  finally {
    clearTimeout(timer);
    if (window && !window.isDestroyed()) window.destroy();
    await preview.close();
    app.exit(status);
  }
});
