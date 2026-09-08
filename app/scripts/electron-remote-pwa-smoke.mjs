import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-ui-"));
app.setPath("userData", path.join(root, "profile"));
const windows = [];
let service;
let exitCode = 0;
app.on("window-all-closed", () => {});
const assert = (value, message) => { if (!value) throw new Error(message); };
const timer = setTimeout(() => { console.error("Remote PWA smoke timed out"); app.exit(1); }, 30000);

async function waitFor(win, expression) {
  for (let i = 0; i < 50; i++) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Remote UI condition failed: ${expression}`);
}

void app.whenReady().then(async () => {
  try {
    const project = path.join(root, "project"); fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, "guide.md"), "# Remote document fixture");
    service = new RemoteDashboardService({
      baseDir: path.join(root, "service"),
      chatProvider: async () => ({ sessionId: "fixture", blocks: [
        { sequence: 1, role: "user", kind: "text", text: "Read guide.md" },
        { sequence: 2, role: "assistant", kind: "text", text: "**Module rendering works**" },
      ] }),
    });
    service.config.server_port = 0;
    service.syncAgents([{ id: "agent-1", name: "Fixture session", projectId: "p1", aiToolId: "codex", status: "running" }]);
    service.syncView({ projects: [{ id: "p1", name: "Fixture project", folder: project }], agents: [{ id: "agent-1", projectId: "p1", aiToolId: "codex" }] });
    const status = await service.start();
    for (const width of [1280, 390]) {
      const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
      windows.push(win);
      const errors = [];
      win.webContents.on("console-message", event => { if (event.level === "error") { errors.push(event.message); console.error(event.message); } });
      await win.loadURL(`${status.url}/?agent=agent-1`);
      await waitFor(win, "document.querySelector('#detailName')?.textContent.includes('Fixture session')");
      await win.webContents.executeJavaScript("document.querySelector('#sessionMode [data-mode=chat]').click()");
      await waitFor(win, "document.querySelector('#chatView')?.textContent.includes('Module rendering works')");
      assert(await win.webContents.executeJavaScript("!!document.querySelector('#chatView .chat-file-link[data-chat-file-path=\"guide.md\"]')"), "Chat file links did not render");
      await win.webContents.executeJavaScript("document.querySelector('#chatView .chat-file-link').click()");
      await waitFor(win, "document.querySelector('#filePreviewMarkdown')?.textContent.includes('Remote document fixture')");
      const moduleState = await win.webContents.executeJavaScript(`(async () => {
        const history = await import('/pwa/chat-history.js');
        const merged = history.mergeChatPages([{sequence:2,text:'b'}], [{sequence:1,text:'a'}], {prepend:true});
        return { order: merged.map(block => block.text).join(''), worker: !!(await navigator.serviceWorker.ready).active };
      })()`);
      assert(moduleState.order === "ab" && moduleState.worker, "History module or service worker failed");
      const composerCheck = await win.webContents.executeJavaScript(`(async () => {
        const originalFetch = window.fetch;
        let finish;
        let sends = 0;
        window.fetch = (url, options) => {
          if (url === '/api/session/submit') {
            sends++;
            return new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({ok:true}), {status:200})); });
          }
          return originalFetch(url, options);
        };
        const input = document.querySelector('#messageInput');
        const form = input.closest('form');
        const type = value => { input.value = value; input.dispatchEvent(new Event('input', {bubbles:true})); };
        const submit = () => form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
        try {
          type('first message'); submit(); submit();
          const locked = document.querySelector('#sendButton').disabled;
          type('next draft');
          if (!finish) throw new Error('Composer did not start a submission');
          finish();
          await new Promise(resolve => setTimeout(resolve, 50));
          return { sends, locked, draft: input.value, queue: document.querySelector('#composerQueue').textContent };
        } finally { window.fetch = originalFetch; }
      })()`);
      assert(composerCheck.sends === 1 && composerCheck.locked, "Concurrent submission was not blocked");
      assert(composerCheck.draft === "next draft", "Pending response erased the newer draft");
      assert(!composerCheck.queue.includes("first message"), "Duplicate submission entered the queue");
      assert(errors.length === 0, `Renderer errors: ${errors.join("; ")}`);
      win.destroy();
    }
    console.log("MULTIAGENT_REMOTE_PWA_SMOKE_OK desktop/mobile chat, document preview, modules and service worker");
  } catch (error) {
    console.error(error.stack || error); exitCode = 1;
  } finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await service?.stop();
    // Only this smoke's freshly created directory is removed.
    if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("multiagent-remote-ui-")) {
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chromium may retain its temporary profile until process exit. */ }
    }
    app.exit(exitCode);
  }
});
