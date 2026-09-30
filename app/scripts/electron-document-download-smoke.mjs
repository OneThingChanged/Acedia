import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-document-download-ui-"));
app.setPath("userData", path.join(root, "profile"));
app.on("window-all-closed", () => {});
const windows = [];
const filename = "internal-service-api-integration.md";
const source = Buffer.from("\uFEFF# 원본 문서 다운로드\r\n\r\n**Markdown 원본**을 UTF-8 파일로 저장합니다.\r\n");
let service;
let downloadCount = 0;
const timer = setTimeout(() => { console.error("Document download smoke timed out"); app.exit(1); }, 60000);

async function waitFor(win, expression) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`UI condition failed: ${expression}`);
}

async function saveDownload(win, expression) {
  const target = path.join(root, `download-${++downloadCount}.md`);
  await new Promise((resolve, reject) => {
    const session = win.webContents.session;
    const cleanup = () => { clearTimeout(timeout); session.off("will-download", listener); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("No completed browser download")); }, 10000);
    const listener = (_event, item, contents) => {
      if (contents !== win.webContents) return;
      session.off("will-download", listener);
      try {
        assert.equal(item.getFilename(), filename);
        assert.match(item.getURL(), /\/api\/docs\/download\?/);
        item.setSavePath(target);
        item.once("done", (_event, state) => {
          cleanup();
          if (state === "completed") resolve();
          else reject(new Error(`Download ended in ${state}`));
        });
      } catch (error) { item.cancel(); cleanup(); reject(error); }
    };
    session.on("will-download", listener);
    win.webContents.executeJavaScript(expression).catch(error => { cleanup(); reject(error); });
  });
  assert.deepEqual(fs.readFileSync(target), source);
}

void app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const project = path.join(root, "project");
    const docs = path.join(project, "docs");
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, filename), source);
    service = new RemoteDashboardService({
      baseDir: path.join(root, "service"),
      chatProvider: async () => ({ sessionId: "fixture", blocks: [
        { sequence: 1, role: "assistant", kind: "text", text: `\`${filename}\`\n\n\`missing.md\`` },
      ] }),
    });
    service.config.server_port = 0;
    service.syncView({ language: "ko", projects: [{ id: "p1", name: "Download fixture", folder: project }], agents: [{ id: "a1", projectId: "p1", folder: docs, aiToolId: "codex" }] });
    service.syncAgents([{ id: "a1", name: "Document session", projectId: "p1", tool: "codex", status: "running" }]);
    const { url } = await service.start();
    for (const [width, height] of [[1024, 850], [390, 850], [375, 812], [844, 375]]) {
      service.syncView({ ...service.view, language: "ko" });
      const win = new BrowserWindow({ width, height, show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
      windows.push(win);
      const errors = [];
      win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
      await win.loadURL(`${url}/?agent=a1`);
      await waitFor(win, "document.querySelector('#detailName')?.textContent.includes('Document session')");
      await win.webContents.executeJavaScript("document.querySelector('#sessionMode [data-mode=chat]').click()");
      await waitFor(win, `document.querySelector('.chat-file-link[data-chat-file-path="${filename}"]')`);
      await win.webContents.executeJavaScript(`document.querySelector('.chat-file-link[data-chat-file-path="${filename}"]').click()`);
      await waitFor(win, "!document.querySelector('#filePreviewMarkdown').hidden && document.querySelector('#filePreviewMarkdown').textContent.includes('원본 문서 다운로드')");
      const layout = await win.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('#filePreviewDownload');
        const header = document.querySelector('.file-preview-head');
        const title = document.querySelector('#filePreviewTitle');
        const rect = button.getBoundingClientRect();
        return { visible: !button.hidden && rect.width > 0, height: rect.height, label: button.getAttribute('aria-label'), titleWidth: title.getBoundingClientRect().width, fits: header.scrollWidth <= header.clientWidth && rect.right <= innerWidth };
      })()`);
      assert(layout.visible && layout.height >= 44 && layout.fits && layout.titleWidth >= 120, `Preview header did not fit ${width}x${height}`);
      assert(layout.label.includes(filename));
      await saveDownload(win, "document.querySelector('#filePreviewDownload').click()");
      assert(await win.webContents.executeJavaScript("!document.querySelector('#filePreviewOverlay').hidden && !document.querySelector('#filePreviewDownload').disabled"), "Download closed or disabled the preview");
      const output = path.resolve("../output"); fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(path.join(output, `remote-document-download-${width}.png`), (await win.webContents.capturePage()).toPNG());

      await win.webContents.executeJavaScript("document.querySelector('#filePreviewClose').click(); document.querySelector('.chat-file-link[data-chat-file-path=\"missing.md\"]').click()");
      await waitFor(win, "document.querySelector('#filePreviewMessage').textContent.includes('파일을 열지 못했습니다')");
      let unexpectedDownload = false;
      const failedDownload = () => { unexpectedDownload = true; };
      win.webContents.session.on("will-download", failedDownload);
      try {
        await win.webContents.executeJavaScript("document.querySelector('#filePreviewDownload').click()");
        await waitFor(win, "document.querySelector('#toast').textContent.includes('파일을 다운로드하지 못했습니다') && !document.querySelector('#filePreviewDownload').disabled");
        assert.equal(unexpectedDownload, false, "A missing file started a download");
      } finally { win.webContents.session.off("will-download", failedDownload); }

      await win.webContents.executeJavaScript(`document.querySelector('#filePreviewClose').click(); document.querySelector('${width < 800 ? '#mobileDocumentsButton' : '#documentsButton'}').click()`);
      await waitFor(win, "document.querySelector('.document-folder-row[title=docs]')");
      await win.webContents.executeJavaScript("const folder=document.querySelector('.document-folder-row[title=docs]'); if(folder.getAttribute('aria-expanded')==='false') folder.click()");
      await waitFor(win, `document.querySelector('.document-tree-file[title="docs/${filename}"]')`);
      await win.webContents.executeJavaScript(`document.querySelector('.document-tree-file[title="docs/${filename}"]').click()`);
      await waitFor(win, "!document.querySelector('#documentMarkdown').hidden && document.querySelector('#documentMarkdown').textContent.includes('원본 문서 다운로드')");
      assert(await win.webContents.executeJavaScript("!document.querySelector('#documentDownloadButton').hidden && document.querySelector('.document-preview-head').scrollWidth <= document.querySelector('.document-preview-head').clientWidth"), "Document header download was missing or overflowed");
      await saveDownload(win, "document.querySelector('#documentDownloadButton').click()");
      if (width < 800) await win.webContents.executeJavaScript("document.querySelector('#documentSidebarToggle').click()");
      await win.webContents.executeJavaScript(`document.querySelector('.document-tree-file[title="docs/${filename}"]').nextElementSibling.click()`);
      await waitFor(win, "!document.querySelector('#documentContextMenu').hidden");
      await saveDownload(win, "document.querySelector('[data-document-action=download]').click()");
      assert(await win.webContents.executeJavaScript("document.querySelector('#documentContextMenu').hidden && !document.querySelector('#documentDownloadButton').disabled"), "Menu download left controls blocked");
      if (width === 375) {
        service.syncView({ ...service.view, language: "es" });
        await waitFor(win, "document.querySelector('#documentDownloadButton').textContent==='Descargar'");
        assert(await win.webContents.executeJavaScript("document.querySelector('.document-preview-head').scrollWidth <= document.querySelector('.document-preview-head').clientWidth"), "Localized download header overflowed");
      }
      assert.deepEqual(errors, [], `Renderer errors at ${width}px`);
      console.log(`Document download UI passed ${width}x${height}: modal, header, menu, source bytes and missing-file recovery`);
      win.destroy();
    }
    console.log("MULTIAGENT_DOCUMENT_DOWNLOAD_SMOKE_OK");
  } catch (error) { console.error(error.stack || error); exitCode = 1; }
  finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await service?.stop();
    if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("acedia-document-download-ui-")) {
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    }
    app.exit(exitCode);
  }
});
