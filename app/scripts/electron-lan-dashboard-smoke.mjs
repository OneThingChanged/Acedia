import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LocalDashboardService } from "../electron/services/web-services.mjs";
const require = createRequire(import.meta.url);
const contract = require("../electron/ipc-contract.cjs");
const root = path.resolve(import.meta.dirname, "..");
const assert = (value, message) => { if (!value) throw new Error(message); };

if (process.versions.electron) {
  const { app, BrowserWindow, ipcMain } = require("electron");
  app.disableHardwareAcceleration();
  const directory = process.env.ACEDIA_LAN_FIXTURE;
  app.setPath("userData", path.join(directory, "profile"));
  const windows = [];
  let service;
  app.on("window-all-closed", () => {});
  const waitFor = async (win, expression) => {
    for (let n = 0; n < 100; n++) {
      if (await win.webContents.executeJavaScript(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`LAN UI condition failed: ${expression}`);
  };
  void app.whenReady().then(async () => {
    let exitCode = 0;
    try {
      const project = path.join(directory, "project"); await fs.mkdir(project);
      await fs.writeFile(path.join(project, "guide.md"), "# LAN document fixture");
      const sends = [];
      const agent = { id: "lan-agent", name: "LAN fixture session", aiToolId: "codex", projectId: "p1", status: "running", hook: { event: "done" } };
      service = new LocalDashboardService({ title: "LAN fixture", baseDir: directory, configName: "monitor.json", defaultPort: 0, allowLan: true,
        providers: {
          writePty: () => true,
          submitPty: async (id, message) => { sends.push({ id, message }); return { ok: true }; },
          chatProvider: () => ({ sessionId: "lan-fixture", blocks: [{ sequence: 1, role: "assistant", kind: "text", text: "LAN chat fixture · [Guide](guide.md)" }] }),
          terminalSnapshot: () => ({ id: agent.id, data: "LAN terminal fixture\r\n", cols: 80, rows: 24 }),
          subscribeTerminal: () => () => {},
        },
      });
      service.sync({ language: "ko", agents: [agent], ptyAgentIds: [agent.id], view: {
        language: "ko", projects: [{ id: "p1", name: "LAN project", folder: project }], agents: [agent],
      } });
      let copied = "";
      ipcMain.handle("multiagent:invoke", (_event, command, rawArgs) => {
        const args = contract.assertInvokeRequest(command, rawArgs);
        if (command === "monitor_server_status") return service.status();
        if (command === "monitor_lan_set") return args.allowedNetworks !== undefined ? service.setLanNetworks(args.allowedNetworks) : service.setLanEnabled(args.enabled);
        if (command === "monitor_lan_reset_code") return service.resetLanCode();
        if (command === "clipboard_write_text") { copied = args.text; return; }
        throw new Error("Unexpected fixture command");
      });
      const host = new BrowserWindow({ show: false, width: 850, height: 650, webPreferences: {
        preload: path.join(root, "electron/preload.cjs"), offscreen: true, backgroundThrottling: false,
        additionalArguments: [`--multiagent-invoke-commands=${contract.INVOKE_COMMANDS.join(",")}`, `--multiagent-delivered-events=${contract.DELIVERED_EVENTS.join(",")}`],
      } });
      windows.push(host);
      await host.loadFile(path.join(directory, "index.html"));
      await waitFor(host, "document.querySelector('input[type=checkbox]')?.disabled === false");
      await host.webContents.executeJavaScript("document.querySelector('input[type=checkbox]').click()");
      await waitFor(host, "!!document.querySelector('.dashboard-lan-code strong')?.textContent.trim()");
      await host.webContents.executeJavaScript(`(() => {
        const field = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '0.0.0.0/0');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await host.webContents.executeJavaScript("document.querySelector('textarea').closest('.app-about-card').querySelector('button').click()");
      await waitFor(host, "!!document.querySelector('[role=alert]')");
      assert(service.status().lan.allowedNetworks.length === 0, "Invalid network changed the allowlist");
      await host.webContents.executeJavaScript(`(() => {
        const field = document.querySelector('textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, '172.28.37.188/24');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await host.webContents.executeJavaScript("document.querySelector('textarea').closest('.app-about-card').querySelector('button').click()");
      await waitFor(host, "document.querySelector('textarea').value === '172.28.37.0/24' && !document.querySelector('[role=alert]')");
      assert(service.status().lan.allowedNetworks[0] === "172.28.37.0/24", "Allowed network was not saved");
      console.log("LAN_ALLOWED_NETWORK_EDITOR_OK");
      const status = service.status();
      assert(status.lan.addresses.length, "A private IPv4 interface is required for this smoke");
      const base = status.lan.addresses[0].url;
      await host.webContents.executeJavaScript("document.querySelector('.dashboard-lan-address button').click()");
      await new Promise(resolve => setTimeout(resolve, 100));
      assert(copied === base, "Address copy did not use the bound LAN port");
      const output = path.resolve(root, "../output"); await fs.mkdir(output, { recursive: true });
      await new Promise(resolve => setTimeout(resolve, 300));
      await fs.writeFile(path.join(output, "lan-dashboard-settings.png"), (await host.webContents.capturePage()).toPNG());

      const connect = async (win, code) => {
        await win.webContents.executeJavaScript(`document.querySelector('#lanCode').value = ${JSON.stringify(code)}; document.querySelector('#lanForm').requestSubmit();`);
      };
      let last;
      for (const width of [1024, 390]) {
        const win = new BrowserWindow({ show: false, width, height: 850, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false, partition: `lan-${width}` } });
        windows.push(win); last = win;
        await win.loadURL(`${base}/?agent=lan-agent`);
        await waitFor(win, "!!document.querySelector('#lanForm')");
        assert(await win.webContents.executeJavaScript("!window.isSecureContext"), "Smoke must exercise real plain LAN HTTP");
        const wrong = status.lan.code === "00000000" ? "11111111" : "00000000";
        await connect(win, wrong);
        await waitFor(win, "document.querySelector('#lanError')?.hidden === false");
        await fs.writeFile(path.join(output, `lan-login-${width}.png`), (await win.webContents.capturePage()).toPNG());
        await connect(win, service.status().lan.code);
        await waitFor(win, "document.querySelector('#detailName')?.textContent.includes('LAN fixture session')");
        if (width === 1024) {
          const previousCode = service.status().lan.code;
          await service.setLanNetworks(["172.28.37.0/24", "10.22.0.0/16"]);
          assert(service.status().lan.code === previousCode, "Adding a network changed the code");
          assert(await win.webContents.executeJavaScript("fetch('/api/state').then(r => r.status === 200)"), "Adding a network disconnected an authenticated client");
          await waitFor(host, "!!document.querySelector('.dashboard-lan-client code')?.textContent");
          assert(service.status().lan.clients.some(client => client.ip), "Authenticated direct IP missing");
          await fs.writeFile(path.join(output, "lan-dashboard-clients.png"), (await host.webContents.capturePage()).toPNG());
          console.log("LAN_CODE_CLIENT_PRESERVATION_AND_IP_UI_OK");
        }
        assert(await win.webContents.executeJavaScript("location.search.includes('agent=lan-agent')"), "Login lost the selected session link");
        await win.webContents.executeJavaScript("document.querySelector('#sessionMode [data-mode=chat]').click()");
        await waitFor(win, "document.querySelector('#chatView')?.textContent.includes('LAN chat fixture')");
        await win.webContents.executeJavaScript(`(() => { const field = document.querySelector('#messageInput'); field.value = 'LAN message ${width}'; field.dispatchEvent(new Event('input', {bubbles:true})); field.closest('form').requestSubmit(); })()`);
        for (let n = 0; n < 50 && !sends.some(entry => entry.message === `LAN message ${width}`); n++) await new Promise(resolve => setTimeout(resolve, 100));
        assert(sends.some(entry => entry.id === "lan-agent" && entry.message === `LAN message ${width}`), "Chat did not submit over LAN HTTP");
        await win.webContents.executeJavaScript("document.querySelector('.chat-file-link').click()");
        await waitFor(win, "document.querySelector('#filePreviewMarkdown')?.textContent.includes('LAN document fixture')");
        await win.webContents.executeJavaScript("document.querySelector('#filePreviewClose').click()");
        assert(await win.webContents.executeJavaScript(`(async () => {
          const original = document.execCommand; let copied = '';
          document.execCommand = command => { copied = document.activeElement?.value; return command === 'copy'; };
          try { await (await import('/pwa/dom.js')).copyText('LAN copy fixture'); return copied === 'LAN copy fixture'; }
          finally { document.execCommand = original; }
        })()`), "Clipboard fallback failed on LAN HTTP");
        assert(await win.webContents.executeJavaScript("document.documentElement.scrollWidth <= innerWidth"), "LAN dashboard overflowed");
        await fs.writeFile(path.join(output, `lan-dashboard-${width}.png`), (await win.webContents.capturePage()).toPNG());
        await win.webContents.executeJavaScript("document.querySelector('#logoutButton').click()");
        await waitFor(win, "!!document.querySelector('#lanForm')");
        assert(await win.webContents.executeJavaScript("fetch('/api/state').then(r => r.status === 401)"), "Logout kept access to sessions");
        await connect(win, service.status().lan.code);
        await waitFor(win, "!!document.querySelector('#detailName')");
        console.log(`LAN_LOGIN_CHAT_SEND_DOCUMENT_LOGOUT_OK ${width}px`);
      }
      await host.webContents.executeJavaScript("document.querySelector('.dashboard-lan-code button').click()");
      await waitFor(last, "!!document.querySelector('#lanForm')");
      await host.webContents.executeJavaScript("document.querySelector('input[type=checkbox]').click()");
      await waitFor(host, "document.querySelector('input[type=checkbox]').checked === false && !document.querySelector('.dashboard-lan-code')");
      assert(service.server.address().address === "127.0.0.1", "Disabling LAN did not restore loopback binding");
      const saved = JSON.parse(await fs.readFile(path.join(directory, "monitor.json"), "utf8"));
      assert(saved.lanEnabled === false, "LAN disable was not persisted");
      console.log("LAN_DESKTOP_TOGGLE_COPY_PAIR_RESET_AND_DISABLE_OK");
    } catch (error) { console.error(error); exitCode = 1; }
    finally {
      for (const win of windows) if (!win.isDestroyed()) win.destroy();
      await service?.stop(); app.exit(exitCode);
    }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-lan-smoke-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(root, "scripts/fixtures/lan-settings-renderer.tsx")], bundle: true, jsx: "automatic", define: { "import.meta.env": "{}" }, outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;width:100%;height:100%}</style><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_LAN_FIXTURE: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 90_000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error(`LAN smoke failed (${code})`);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-lan-smoke-")) throw new Error("Invalid cleanup path");
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 150 });
  }
}
