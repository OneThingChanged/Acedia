import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";
import { SessionModelService } from "../electron/services/session-model-service.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-model-ui-"));
app.setPath("userData", path.join(root, "profile"));
app.disableHardwareAcceleration();
const windows = [], updates = [];
let web, exitCode = 0;
app.on("window-all-closed", () => {});
const assert = (value, message) => { if (!value) throw new Error(message); };
async function waitFor(win, expression) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`UI timed out: ${expression}`);
}
app.whenReady().then(async () => {
  try {
    const agents = [
      { id: "codex-session", aiToolId: "codex", name: "Codex fixture", projectId: "p", status: "working", hook: { event: "working" } },
      { id: "claude-session", aiToolId: "claude", name: "Claude fixture", projectId: "p", status: "done", hook: { event: "done" } },
    ];
    const model = (name, efforts) => ({ model: name, label: name, efforts: efforts.map(effort => ({ effort, description: "" })), defaultEffort: efforts[0] });
    const sessionModels = new SessionModelService({ agentFor: id => agents.find(agent => agent.id === id), active: () => true,
      catalog: async agent => ({ accountLabel: `${agent.aiToolId} account`, capabilitiesSource: agent.aiToolId === "claude" ? "cli-help" : "account",
        models: agent.aiToolId === "claude" ? [model("opus", ["low", "max"]), model("sonnet", ["medium", "high"])]
          : [model("fixture-a", ["low", "high"]), model("fixture-b", ["medium"])],
        current: { model: agent.aiToolId === "claude" ? "opus" : "fixture-a", effort: "low" }, currentSource: "last-turn" }),
      update: async payload => { updates.push(payload); agents.find(agent => agent.id === payload.id).modelSettings = payload.settings; return { id: payload.id, restarted: payload.restart }; },
    });
    web = new RemoteDashboardService({ baseDir: path.join(root, "web"), sessionModels });
    web.config.server_port = 0; web.syncAgents(agents);
    web.syncView({ language: "ko", projects: [{ id: "p", name: "Model project", folder: root }], agents });
    const status = await web.start();
    for (const width of [1024, 390]) {
      const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
      windows.push(win);
      const errors = [];
      win.webContents.on("console-message", event => { if (event.level === "error") { errors.push(event.message); console.error(event.message); } });
      await win.loadURL(`${status.url}/?agent=codex-session`);
      await waitFor(win, "document.querySelector('#detailName').textContent.includes('Codex fixture')");
      // The right-click target must win even when a different agent is selected.
      const custom = await win.webContents.executeJavaScript(`(() => {
        const row = document.querySelector('.session-row[data-agent-id="claude-session"]');
        return !row.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true,cancelable:true,clientX:100,clientY:200 }));
      })()`);
      assert(custom, "Native context menu was not suppressed");
      await win.webContents.executeJavaScript("document.querySelector('#sessionContextMenu button').click()");
      await waitFor(win, "!document.querySelector('#sessionModelSave').disabled");
      const state = await win.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('#sessionModelSelect');
        select.value = 'sonnet'; select.dispatchEvent(new Event('change'));
        document.querySelector('#sessionModelOverlay').dispatchEvent(new MouseEvent('click',{bubbles:true}));
        return { target:document.querySelector('#sessionModelTarget').textContent,
          efforts:[...document.querySelector('#sessionEffortSelect').options].map(o=>o.value),
          provider:document.querySelector('#sessionModelProvider').textContent,
          open:!document.querySelector('#sessionModelOverlay').hidden,
          restart:!document.querySelector('#sessionModelRestart').disabled,
          overflow:document.querySelector('#sessionModelForm').scrollWidth > document.querySelector('#sessionModelForm').clientWidth+1 };
      })()`);
      assert(state.target === "Model project / Claude fixture" && state.provider === "CLAUDE", "Editor targeted the selected rather than right-clicked agent");
      assert(state.efforts.join(",") === ",medium,high", "Efforts were not refreshed for the selected model");
      assert(state.open && state.restart && !state.overflow, "Dialog behavior or responsive layout failed");
      const screenshotDir = path.resolve(import.meta.dirname, "../../output");
      fs.mkdirSync(screenshotDir, { recursive: true });
      fs.writeFileSync(path.join(screenshotDir, `session-model-${width}.png`), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('#sessionEffortSelect').value='high';document.querySelector('#sessionModelRestart').click()");
      await waitFor(win, "document.querySelector('#sessionModelOverlay').hidden");
      assert(updates.at(-1).id === "claude-session" && updates.at(-1).restart && updates.at(-1).settings.effort === "high", "Claude request payload was incorrect");
      // Touch users reach the same editor through the header button.
      await win.webContents.executeJavaScript("document.querySelector('#sessionModelButton').click()");
      await waitFor(win, "!document.querySelector('#sessionModelSave').disabled");
      assert(await win.webContents.executeJavaScript("document.querySelector('#sessionModelRestart').disabled"), "Working Codex session could be restarted");
      await win.webContents.executeJavaScript("document.querySelector('#sessionModelSelect').value='fixture-b';document.querySelector('#sessionModelSelect').dispatchEvent(new Event('change'));document.querySelector('#sessionModelForm').requestSubmit()");
      await waitFor(win, "document.querySelector('#sessionModelOverlay').hidden");
      assert(updates.at(-1).id === "codex-session" && !updates.at(-1).restart && updates.at(-1).settings.effort === "medium", "Codex save/default effort request failed");
      await win.webContents.executeJavaScript("document.querySelector('#sessionModelButton').click()");
      await waitFor(win, "!document.querySelector('#sessionModelSave').disabled");
      await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
      assert(await win.webContents.executeJavaScript("document.querySelector('#sessionModelOverlay').hidden"), "Escape did not close the model editor");
      assert(errors.length === 0, errors.join("\n"));
      console.log(`Session model UI passed: ${width}px`);
    }
  } catch (error) { console.error(error); exitCode = 1; }
  finally {
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await web?.stop();
    // This is the unique temporary directory created by this script above.
    try { fs.rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chromium can retain its unique temporary profile until exit. */ }
    app.exit(exitCode);
  }
});
