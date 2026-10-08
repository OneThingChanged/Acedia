import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const output = path.resolve(appRoot, "../output/chat-model-ui");
const check = (value, message) => { if (!value) throw Error(message); };

async function waitFor(win, expression) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw Error(`UI timed out: ${expression}`);
}

async function exercise(win, width) {
  const run = source => win.webContents.executeJavaScript(source);
  const patch = change => run(`window.modelFixture.patch(${JSON.stringify(change)})`);
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const input = value => run(`(() => { const input=document.querySelector('.chat-composer-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const open = async selector => {
    await click(selector);
    await waitFor(win, "document.querySelector('.chat-model-popover')?.getAttribute('aria-busy')==='false'");
  };
  await waitFor(win, "document.querySelector('.chat-model-trigger')?.textContent.includes('GPT-6 Sol')");
  await input("작성 중인 요청은 그대로 유지");
  await open(".chat-model-trigger");
  await click('[data-model="fixture-astra"]');
  await click('[data-effort="ultra"]');
  await waitFor(win, "document.querySelector('[data-effort=ultra]').getAttribute('aria-checked')==='true'");
  const layout = await run(`(() => { const root=document.querySelector('.chat-view').getBoundingClientRect(), panel=document.querySelector('.chat-model-popover').getBoundingClientRect(); const toolbar=document.querySelector('.chat-composer-toolbar'); return {fits:panel.left>=root.left && panel.right<=root.right && panel.top>=root.top && panel.bottom<=root.bottom, toolbar:toolbar.scrollWidth<=toolbar.clientWidth}; })()`);
  check(layout.fits && layout.toolbar, `Model controls overflow at ${width}px: ${JSON.stringify(layout)}`);
  await fs.writeFile(path.join(output, `codex-${width}.png`), (await win.webContents.capturePage()).toPNG());
  await patch({ holdApply: true });
  await click(".chat-model-apply");
  await waitFor(win, "document.querySelector('.chat-composer-send').disabled && document.querySelector('.chat-model-trigger').textContent.includes('적용 중')");
  await run("document.querySelector('.chat-composer-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); document.querySelector('.chat-composer-send').click()");
  check(await run("window.modelFixture.writes.length===0 && document.querySelector('.chat-composer-input').value==='작성 중인 요청은 그대로 유지'"), "Applying a model sent or erased the draft");
  await patch({ show: false }); await run("new Promise(resolve=>requestAnimationFrame(resolve))"); await patch({ show: true });
  await waitFor(win, "document.querySelector('.chat-composer-send')?.disabled");
  check(await run("document.querySelector('.chat-model-trigger').textContent.includes('적용 중') && document.querySelector('.chat-composer-input').value==='작성 중인 요청은 그대로 유지'"), "A remount lost the draft or model send lock");
  await run("window.modelFixture.complete()");
  await waitFor(win, "document.querySelector('.chat-model-trigger')?.textContent.includes('GPT-6 Astra') && !document.querySelector('.chat-composer-send').disabled");
  const update = await run("window.modelFixture.modelUpdates.at(-1)");
  check(update.id === "codex-chat" && update.restart && update.settings.model === "fixture-astra" && update.settings.effort === "ultra", "Wrong Codex model/effort/session payload");
  await open(".chat-effort-trigger");
  check(await run("document.querySelector('[data-effort=ultra]').getAttribute('aria-checked')==='true'"), "Applied effort was not selected");
  await click(".chat-model-selected"); await click('[data-model="fixture-lite"]');
  check(await run("!document.querySelector('[data-effort=ultra]') && document.querySelector('[data-effort=medium]').getAttribute('aria-checked')==='true'"), "New model kept an unsupported effort");
  await run("document.querySelector('.chat-model-popover').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await waitFor(win, "!document.querySelector('.chat-model-popover')");
  await waitFor(win, "document.activeElement===document.querySelector('.chat-effort-trigger')");
  const count = await run("window.modelFixture.modelUpdates.length");
  await patch({ state: { agentStatus: "working" } });
  await waitFor(win, "!!document.querySelector('.chat-thinking')");
  await open(".chat-model-trigger"); await click('[data-model="fixture-sol"]');
  check(await run("document.querySelector('.chat-model-apply').disabled && document.querySelector('.chat-model-notice').textContent.includes('작업')"), "An active turn could change model");
  check(await run(`window.modelFixture.modelUpdates.length===${count}`), "An active turn was restarted");
  await patch({ state: { agentStatus: "idle" } });
  await waitFor(win, "!document.querySelector('.chat-model-apply').disabled");
  await patch({ failApply: true }); await click(".chat-model-apply");
  await waitFor(win, "document.querySelector('.chat-model-error')?.textContent.includes('시작 hook') && !document.querySelector('.chat-composer-send').disabled");
  check(await run("document.querySelector('.chat-model-trigger').textContent.includes('GPT-6 Astra') && document.querySelector('.chat-composer-input').value==='작성 중인 요청은 그대로 유지'"), "Failed restart claimed the draft model or erased input");
  await patch({ failApply: false }); await click(".chat-model-footer button");
  await patch({ state: { agentStatus: "exited" } });
  await open(".chat-model-trigger"); await click('[data-model="fixture-sol"]');
  await waitFor(win, "!document.querySelector('.chat-model-apply').disabled");
  await click(".chat-model-apply");
  await waitFor(win, "!document.querySelector('.chat-model-popover') && document.querySelector('.chat-model-trigger').textContent.includes('GPT-6 Sol')");
  await patch({ state: { agentId: "claude-chat", provider: "claude", sessionId: "claude-original", agentStatus: "idle" } });
  await waitFor(win, "document.querySelector('.chat-model-trigger')?.textContent.includes('Sonnet')");
  await open(".chat-model-trigger"); await click('[data-model="opus"]'); await click('[data-effort="max"]');
  check(await run("!document.querySelector('[data-effort=ultra]') && document.querySelector('.chat-model-account').textContent.includes('Claude 개인 계정')"), "Claude inherited Codex options or account");
  await fs.writeFile(path.join(output, `claude-${width}.png`), (await win.webContents.capturePage()).toPNG());
  await click(".chat-model-apply");
  await waitFor(win, "!document.querySelector('.chat-model-popover') && document.querySelector('.chat-model-trigger')?.textContent.includes('Opus')");
  const claude = await run("window.modelFixture.modelUpdates.at(-1)");
  check(claude.id === "claude-chat" && claude.settings.model === "opus" && claude.settings.effort === "max", "Wrong Claude session payload");
  await patch({ state: { agentStatus: "waiting", question: "로그인을 승인해 주세요" } });
  await open(".chat-effort-trigger"); await click('[data-effort="low"]');
  check(await run("document.querySelector('.chat-model-apply').disabled"), "A waiting question could be interrupted by model selection");
  await click(".chat-model-footer button");
  await patch({ state: { agentStatus: "idle", question: null }, failRead: true });
  await click(".chat-model-trigger");
  await waitFor(win, "document.querySelector('.chat-model-error')?.textContent.includes('조회 실패')");
  check(await run("document.querySelector('.chat-model-apply').disabled"), "Failed discovery allowed a stale model choice");
  await patch({ failRead: false }); await click(".chat-model-error button");
  await waitFor(win, "!document.querySelector('.chat-model-error') && document.querySelector('.chat-model-popover').getAttribute('aria-busy')==='false'");
  await click(".chat-model-footer button");
  await patch({ theme: "light", language: "en" });
  await open(".chat-effort-trigger");
  check(await run("document.querySelector('.chat-model-head').textContent.includes('Reasoning effort')"), "English picker translation missing");
  await run("(() => { const option=document.querySelector('[data-effort=max]'); option.focus(); option.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true})); })()");
  await waitFor(win, "document.querySelector('.chat-effort-options [role=radio]').getAttribute('aria-checked')==='true'");
  await run("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))");
  await waitFor(win, "document.querySelector('[data-effort=max]').getAttribute('aria-checked')==='true'");
  await fs.writeFile(path.join(output, `light-${width}.png`), (await win.webContents.capturePage()).toPNG());
  await run("document.querySelector('.chat-composer-input').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await waitFor(win, "!document.querySelector('.chat-model-popover')");
  await patch({ catalog: { claude: { canEdit: false } }, state: { modelSettingsKey: "read-only" } });
  await waitFor(win, "document.querySelector('.chat-model-trigger')?.disabled");
  await patch({ state: { modelEditingSupported: false } });
  await waitFor(win, "!document.querySelector('.chat-model-picker') && !!document.querySelector('.chat-composer-provider')");
  console.log(`Desktop Chat model/effort passed: ${width}px`);
}

async function exerciseApp(win, directory) {
  await win.loadFile(path.join(directory, "app.html"));
  await waitFor(win, "!!document.querySelector('.sidebar-workspace')");
  const run = expression => win.webContents.executeJavaScript(expression);
  await run("document.querySelector('[data-pane-active-agent-id=ux] .session-standby .btn-primary')?.click()");
  await waitFor(win, "!document.querySelector('[data-pane-active-agent-id=ux] .session-standby')");
  await run("document.querySelector('[data-pane-active-agent-id=ux] [aria-label=\"대화(채팅) 뷰로 전환\"]').click()");
  await waitFor(win, "document.querySelector('[data-pane-active-agent-id=ux] .chat-model-trigger')?.textContent.includes('GPT-6 Sol')");
  await run("document.querySelector('[data-pane-active-agent-id=ux] .chat-model-trigger').click()");
  await waitFor(win, "document.querySelector('.chat-model-popover')?.getAttribute('aria-busy')==='false'");
  await run("document.querySelector('[data-model=fixture-astra]').click()");
  await run("document.querySelector('[data-effort=ultra]').click()");
  await waitFor(win, "document.querySelector('[data-effort=ultra]').getAttribute('aria-checked')==='true'");
  await run("document.querySelector('.chat-model-apply').click()");
  await waitFor(win, "!document.querySelector('.chat-model-popover') && document.querySelector('[data-pane-active-agent-id=ux] .chat-model-trigger')?.textContent.includes('GPT-6 Astra')");
  const result = await run(`(() => { const agents=JSON.parse(localStorage.getItem('multiagent.agents.v1')); return {agent:agents.find(agent=>agent.id==='ux'), parent:agents.find(agent=>agent.id==='routing'), spawn:window.layoutCalls.filter(call=>call.command==='spawn_pty' && call.args.id==='ux').at(-1), restart:window.layoutCalls.find(call=>call.command==='restart_session_model')}; })()`);
  check(result.agent.modelSettings.model === "fixture-astra" && result.agent.modelSettings.effort === "ultra" && result.agent.sessionHierarchy.inheritModel === false, "App did not persist an independent session model override");
  check(result.parent.modelSettings.model === "fixture-sol" && result.parent.modelSettings.effort === "high", "A child's model choice changed the parent");
  check(result.restart && result.spawn.args.initCommand.startsWith("codex resume same-codex-conversation ") && result.spawn.args.codexAccountId === "default" && result.spawn.args.modelSettings.model === "fixture-astra"
    && result.spawn.args.modelSettings.effort === "ultra", `App did not launch the same conversation with the chosen model: ${JSON.stringify(result.spawn?.args)}`);
  await fs.writeFile(path.join(output, "workspace-1440.png"), (await win.webContents.capturePage()).toPNG());
  console.log("Full App Chat model persistence, inheritance and same-conversation launch passed");
}

if (process.versions.electron) {
  const { app, BrowserWindow } = await import("electron");
  const directory = process.env.ACEDIA_CHAT_MODEL_DIR;
  app.setPath("userData", path.join(directory, "profile"));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
  let win, code = 0;
  try {
    await fs.mkdir(output, { recursive: true });
    for (const width of [940, 390, 300]) {
      win = new BrowserWindow({ width, height: 820, show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
      const errors = [];
      win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
      await win.loadFile(path.join(directory, "index.html"));
      await exercise(win, width);
      check(!errors.length, errors.join("\n"));
      win.destroy(); win = null;
    }
    win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
    win.webContents.on("console-message", event => { if (event.level === "error") console.error(`App fixture: ${event.message}`); });
    await exerciseApp(win, directory);
    win.destroy(); win = null;
    await fs.writeFile(path.join(directory, "passed.json"), JSON.stringify({ widths: [940, 390, 300], app: true }));
  } catch (error) {
    if (win && !win.isDestroyed()) await fs.writeFile(path.join(output, "failure.png"), (await win.webContents.capturePage()).toPNG());
    console.error(error); code = 1;
  } finally { win?.destroy(); app.exit(code); }
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  const { build } = await import("esbuild");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-chat-model-smoke-"));
  try {
    await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/chat-model-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text);overflow:hidden}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    await fs.copyFile(path.join(appRoot, "public/app-icon.png"), path.join(directory, "app-icon.png"));
    await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/chat-model-app-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}", "__MULTIAGENT_APP_VERSION__": JSON.stringify("chat-model-smoke") }, jsx: "automatic", outfile: path.join(directory, "app-renderer.js") });
    await fs.writeFile(path.join(directory, "app.html"), '<meta charset="utf-8"><link rel="stylesheet" href="app-renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}</style><div id="root"></div><script src="app-renderer.js"></script>');
    const env = { ...process.env, ACEDIA_CHAT_MODEL_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 100000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    check(code === 0, `Chat model smoke failed: ${code}`);
    const result = JSON.parse(await fs.readFile(path.join(directory, "passed.json"), "utf8"));
    check(result.widths.length === 3 && result.app, "Chat model smoke ended before all widths and App checks completed");
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-chat-model-smoke-")) throw Error("Unexpected fixture path");
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
}
