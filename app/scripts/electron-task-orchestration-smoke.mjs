import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url), appRoot = path.resolve(import.meta.dirname, '..'), repo = path.dirname(appRoot);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (condition, label) => { for (let n = 0; n < 200; n++) { if (await condition()) return; await wait(40); } throw Error('Task smoke timeout: ' + label); };

if (!process.versions.electron) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-task-smoke-'));
  try {
    const { build } = await import('esbuild');
    const entry = `import ${JSON.stringify(path.join(appRoot, 'scripts/fixtures/session-organization-renderer.tsx').replaceAll('\\', '/'))};
      const local=window.multiAgentElectron, original=local.invoke; local.invoke=(command,args)=>command==='task_orchestration'?window.taskNative.invoke(command,args):original(command,args);`;
    await build({ stdin: { contents: entry, resolveDir: appRoot, loader: 'tsx' }, bundle: true, define: { 'import.meta.env': '{}', '__MULTIAGENT_APP_VERSION__': '"fixture"' }, jsx: 'automatic', outfile: path.join(directory, 'renderer.js') });
    fs.writeFileSync(path.join(directory, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>body{margin:0;background:#10151c;color:#c8d7e7}#root{height:100vh}</style><div id="root"></div><script>window.taskNative=window.taskSmokeBridge</script><script src="renderer.js"></script>');
    fs.writeFileSync(path.join(directory, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('taskSmokeBridge',{invoke:(command,args)=>ipcRenderer.invoke('multiagent:invoke',command,args)});`);
    const env = { ...process.env, ACEDIA_TASK_FIXTURE_ROOT: directory, ACEDIA_TASK_FIXTURE_NODE: process.execPath }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [import.meta.filename], { env, cwd: appRoot, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill(), 90000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('acedia-task-smoke-'));
    await fs.promises.rm(directory, { recursive: true, maxRetries: 10, retryDelay: 200 });
  }
} else {
  void (async () => {
  const { app, BrowserWindow, ipcMain } = require('electron'), directory = process.env.ACEDIA_TASK_FIXTURE_ROOT;
  assert.ok(directory && path.basename(directory).startsWith('acedia-task-smoke-'));
  app.setPath('userData', path.join(directory, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
  const { TaskOrchestration } = await import('../electron/services/task-orchestration.mjs');
  const { SessionDeliveries } = await import('../electron/services/session-delivery.mjs');
  const { WorkspaceManagement } = await import('../electron/services/workspace-management.mjs');
  const { RemoteSessionCreateBroker } = await import('../electron/services/remote-session-create-broker.mjs');
  const { HookService } = await import('../electron/services/hook-service.mjs');
  const { ActiveQuestions } = await import('../electron/services/active-questions.mjs');
  const { lastTurnModel } = await import('../electron/services/session-model-service.mjs');
  const { RemoteDashboardService } = await import('../electron/services/web-services.mjs');
  const contract = require('../electron/ipc-contract.cjs');
  const model = { model: 'fixture-codex-model', effort: 'medium', serviceTier: 'default' };
  const catalog = { projects: [{ id: 'project', name: 'Fixture', folder: directory }], agents: [{ id: 'root', projectId: 'project', aiToolId: 'codex', name: 'A' }], availableTools: [{ id: 'codex', label: 'Codex' }] };
  const live = new Map([['root', {}]]), cli = new Map(), processes = [], questions = new ActiveQuestions(); let engine, hook, win, remoteWindow, remote, poll, mcp, sends = 0;
  const read = async id => { const c = cli.get(id); return c ? questions.read({ id, tool: 'codex', root: directory, transcriptPath: c.file, sessionId: c.conversationId, startedAt: c.startedAt }) : null; };
  const createBroker = new RemoteSessionCreateBroker({ dispatch: payload => {
    const file = path.join(directory, payload.id + '-' + randomUUID() + '.jsonl'), child = spawn(process.env.ACEDIA_TASK_FIXTURE_NODE, [path.join(appRoot, 'scripts/fixtures/task-worker-cli.mjs'), file, JSON.stringify(payload.modelSettings)], {
      env: { ...process.env, MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: payload.id }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    processes.push(child); const startedAt = Date.now();
    readline.createInterface({ input: child.stdout }).on('line', line => {
      const event = JSON.parse(line); if (event.error) console.error('CLI fixture:', event.error);
      if (!event.ready) return;
      const entry = { id: payload.id, aiToolId: 'codex', modelSettings: event.model, startedAt, lastInputAt: 0, process: child };
      live.set(payload.id, entry); cli.set(payload.id, { ...event, file, child, startedAt }); catalog.agents.push({ ...payload, projectId: 'project' });
      createBroker.complete({ requestId: payload.requestId, id: payload.id, ok: true });
    }); return true;
  } });
  const deliveries = new SessionDeliveries({ file: path.join(directory, 'deliveries.json'), read, ready: () => true,
    context: id => live.has(id) ? { entry: live.get(id), name: id, conversationId: cli.get(id)?.conversationId } : null,
    submit: async (id, entry, message) => { sends++; entry.process.stdin.write(JSON.stringify({ message }) + '\n'); return true; },
  });
  const workspace = new WorkspaceManagement({ catalog: () => catalog, create: payload => createBroker.create(payload), isActive: id => live.has(id), deliveries });
  const options = { file: path.join(directory, 'tasks.json'), catalog: () => catalog, runtime: id => live.get(id), createSession: p => workspace.createTaskSession(p), delivery: deliveries, read,
    models: async () => ({ models: [{ model: model.model, label: 'Codex fixture', efforts: [{ effort: 'medium' }] }] }), launchedModel: id => cli.get(id)?.model,
    actualModel: async (id, since) => lastTurnModel(cli.get(id)?.file, 'codex', since), defaults: () => model,
    answer: async () => { throw Error('No question fixture in this path'); }, stop: async id => { cli.get(id)?.child.kill(); live.delete(id); },
  };
  engine = new TaskOrchestration(options); workspace.tasks = engine;
  hook = new HookService({ baseDir: path.join(directory, 'hooks'), workspaceProvider: req => workspace.handle(req) });
  await app.whenReady();
  try {
    await hook.start();
    poll = setInterval(async () => { for (const [id] of cli) deliveries.observe(id, live.get(id), await read(id)); await engine.tick(); }, 40);
    ipcMain.handle('multiagent:invoke', (_event, command, args) => { contract.assertInvokeRequest(command, args); assert.equal(command, 'task_orchestration'); return engine.handle({ ...args, operator: true }); });
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(directory, 'preload.cjs') } });
    win.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) console.error('Fixture renderer:', event.message); });
    const runJS = source => win.webContents.executeJavaScript(source);
    await win.loadFile(path.join(directory, 'index.html')); await until(() => runJS('!!window.organizationEvent'), 'App renderer');
    // Actual App.tsx background creation branch must preserve tabs, view and focus.
    await runJS(`document.body.insertAdjacentHTML('beforeend','<input id="focus-fixture" value="A draft preserved">');document.querySelector('#focus-fixture').focus()`);
    const before = await runJS('({groups:localStorage.getItem("multiagent.groups.v1"),view:localStorage.getItem("multiagent.view.v1")})');
    await runJS(`window.organizationEvent('remote:create-session',{requestId:'task-background-fixture',id:'background-fixture',projectId:'project',name:'Background worker',aiToolId:'codex',dangerous:false,workspaceManaged:true,modelSettings:${JSON.stringify(model)},sessionHierarchy:{parentId:'root',createdById:'root',inheritModel:false}})`);
    await until(() => runJS('JSON.parse(localStorage.getItem("multiagent.agents.v1")).some(a=>a.id==="background-fixture")'), 'durable background child');
    const after = await runJS('({groups:localStorage.getItem("multiagent.groups.v1"),view:localStorage.getItem("multiagent.view.v1"),focus:document.activeElement.id,draft:document.querySelector("#focus-fixture").value,agent:JSON.parse(localStorage.getItem("multiagent.agents.v1")).find(a=>a.id==="background-fixture")})');
    assert.equal(after.groups, before.groups); assert.equal(after.view, before.view); assert.equal(after.focus, 'focus-fixture'); assert.equal(after.draft, 'A draft preserved'); assert.deepEqual(after.agent.modelSettings, model); assert.equal(after.agent.sessionHierarchy.inheritModel, false);
    const familyExpanded = await runJS('document.querySelector("[data-sidebar-agent-id=root] [aria-expanded]")?.getAttribute("aria-expanded")'); assert.equal(familyExpanded, 'false');
    assert.equal(await runJS('!!document.querySelector(".sidebar-recents [data-sidebar-agent-id=root] .sidebar-family-toggle")?.getClientRects().length'), true, 'Child count/toggle hidden until hover');
    assert.equal(await runJS('!!document.querySelector(".sidebar-recents [data-sidebar-agent-id=background-fixture]")'), false);
    await runJS('document.querySelector("[data-sidebar-agent-id=root] [aria-expanded]").click()');
    await until(() => runJS('!!document.querySelector(".sidebar-recents [data-sidebar-agent-id=background-fixture]")'), 'background child under A');
    await runJS('document.querySelector("[data-sidebar-agent-id=root] [aria-expanded]").click()');
    await runJS('document.querySelector("#focus-fixture").remove()');
    await runJS('document.querySelector("[data-sidebar-project-id=project] .project-item").click()');
    await until(() => runJS('!!document.querySelector(".sidebar-project-navigation [data-sidebar-agent-id=root] .sidebar-family-toggle")'), 'project tree family');
    assert.equal(await runJS('!!document.querySelector(".sidebar-project-navigation [data-sidebar-agent-id=background-fixture]")'), false);
    await runJS('document.querySelector(".sidebar-project-navigation [data-sidebar-agent-id=root] .sidebar-family-toggle").click()');
    await until(() => runJS('!!document.querySelector(".sidebar-project-navigation [data-sidebar-agent-id=background-fixture]")&&!!document.querySelector(".sidebar-recents [data-sidebar-agent-id=background-fixture]")'), 'shared project/recent family expansion');
    // A uses the shipped stdio MCP server; each worker is a distinct CLI process.
    mcp = spawn(process.env.ACEDIA_TASK_FIXTURE_NODE, [path.join(appRoot, 'electron/services/browser-mcp-server.mjs')], { env: { ...process.env, MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: 'root' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let next = 0; const pending = new Map();
    readline.createInterface({ input: mcp.stdout }).on('line', line => { const response = JSON.parse(line); pending.get(response.id)?.(response.result); pending.delete(response.id); });
    const rpc = (method, params) => new Promise((resolve, reject) => { const id = ++next, timeout = setTimeout(() => reject(Error('MCP timeout')), 15000); pending.set(id, result => { clearTimeout(timeout); resolve(result); }); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    const tool = async (name, args) => { const response = await rpc('tools/call', { name, arguments: args }); assert.ok(!response.isError, JSON.stringify(response)); return response.structuredContent; };
    await rpc('initialize'); assert.ok((await rpc('tools/list')).tools.some(t => t.name === 'acedia_task_plan'));
    const plan = { requestKey: 'fixture', title: '독립 세션 통합 fixture', request: 'fixture only', tasks: [
      { id: 'first', title: '첫 작업', goal: '독립 작업 1', acceptance: 'fixture check', dependsOn: [], writeScopes: ['first.txt'] },
      { id: 'second', title: '병렬 작업', goal: '독립 작업 2', acceptance: 'fixture check', dependsOn: [], writeScopes: ['second.txt'] },
      { id: 'verify', title: '통합 검증', goal: '결과 검증', acceptance: 'fixture check', dependsOn: ['first', 'second'], writeScopes: [] },
    ] };
    const planned = await tool('acedia_task_plan', plan), runId = planned.run.id;
    await until(() => engine.data.runs[0].tasks.slice(0, 2).every(t => t.state === 'result_submitted'), 'independent process results');
    assert.equal(cli.size, 2); assert.equal(sends, 2); assert.equal(engine.data.runs[0].tasks[2].attempts.length, 0);
    assert.equal((await tool('acedia_task_plan', plan)).run.id, runId); assert.equal(sends, 2);
    // Expose the created fixture sessions through the actual background App
    // branch too, so both sidebar lists read the host's exact task states.
    for (const task of engine.data.runs[0].tasks.slice(0, 2)) {
      const id = task.attempts[0].sessionId;
      await runJS(`window.organizationEvent('remote:create-session',${JSON.stringify({requestId:'sidebar-'+id,id,projectId:'project',name:task.title,aiToolId:'codex',dangerous:false,workspaceManaged:true,modelSettings:model,sessionHierarchy:{parentId:'root',createdById:'root',inheritModel:false}})})`);
      await until(() => runJS(`document.querySelectorAll('[data-sidebar-agent-id="${id}"][data-task-state=result_submitted]').length===2`), 'exact sidebar result review state');
    }
    const sidebarWorkerId = engine.data.runs[0].tasks[0].attempts[0].sessionId;
    const clickSidebar = async (scope, id) => {
      await runJS(`{const row=document.querySelector('${scope} [data-sidebar-agent-id="${id}"]');for(const type of ['pointerdown','pointerup'])row.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:71,clientX:50,clientY:50}));}`);
      await until(() => runJS(`document.querySelectorAll('[data-sidebar-agent-id="${id}"][aria-current=page]').length===2`), 'explicit sidebar session selection');
    };
    await clickSidebar('.sidebar-project-navigation', sidebarWorkerId);
    await clickSidebar('.sidebar-recents', 'root');
    // Shipped desktop organization embeds the same view as Remote.
    await runJS('document.querySelector(".organization-sidebar-slot button").click()');
    await until(() => runJS('[...document.querySelectorAll("button")].some(b=>b.textContent==="작업 흐름")'), 'organization task entry');
    await runJS('[...document.querySelectorAll("button")].find(b=>b.textContent==="작업 흐름").click()');
    await until(() => runJS('document.querySelectorAll(".task-card").length===3'), 'task board');
    await runJS('document.querySelector("[data-task=first]").click()'); await until(() => runJS('document.querySelector(".task-detail").textContent.includes("실제 턴")'), 'attempt detail');
    const out = path.join(repo, 'output/task-orchestration'); fs.mkdirSync(out, { recursive: true });
    await wait(150); fs.writeFileSync(path.join(out, 'desktop.png'), (await win.webContents.capturePage()).toPNG());
    await runJS('document.querySelector("[data-action=policy]").click()'); await until(() => runJS('document.querySelectorAll("[data-model]").length===3'), 'model policies');
    await runJS('document.querySelector("[data-action=close-policy]").click()');
    await runJS('window.taskBoardFixture=document.querySelector(".task-board");window.taskCardFixture=document.querySelector("[data-task=first]")');
    for (const taskId of ['first', 'second']) {
      const attempt = engine.data.runs[0].tasks.find(t => t.id === taskId).attempts.at(-1), attemptId = attempt.id;
      await until(async () => (await read(attempt.sessionId))?.turn?.status === 'done', 'worker turn settled');
      await tool('acedia_task_control', { action: 'review', runId, taskId, attemptId, accept: true, note: 'Independent fixture process/turn and checks reviewed' });
      await until(() => runJS(`document.querySelector('[data-task=${taskId}]')?.dataset.state==='completed'`), 'incremental card update');
      await until(() => runJS(`document.querySelectorAll('[data-sidebar-agent-id="${attempt.sessionId}"][data-task-state=completed]').length===2`), 'sidebar completed state');
      assert.equal(await runJS('window.taskBoardFixture===document.querySelector(".task-board")&&window.taskCardFixture===document.querySelector("[data-task=first]")'), true, 'Polling remounted the graph');
      if (taskId === 'first') await runJS('window.taskDetailFixture=document.querySelector(".task-detail h3");window.taskTitleFixture=document.querySelector("[data-task=first] strong")');
      else assert.equal(await runJS('window.taskDetailFixture===document.querySelector(".task-detail h3")&&window.taskTitleFixture===document.querySelector("[data-task=first] strong")'), true, 'Unrelated task update replaced the selected detail/card');
    }
    await until(() => engine.data.runs[0].tasks[2].state === 'result_submitted', 'dependent result');
    const attemptId = engine.data.runs[0].tasks[2].attempts[0].id;
    await until(async () => (await read(engine.data.runs[0].tasks[2].attempts[0].sessionId))?.turn?.status === 'done', 'verification turn settled');
    await tool('acedia_task_control', { action: 'review', runId, taskId: 'verify', attemptId, accept: true, note: 'Dependent fixture validated' });
    await tool('acedia_task_control', { action: 'finish', runId, summary: 'All required fixture tasks reviewed' });
    assert.equal(sends, 3); assert.equal(new Set([...cli.values()].map(c => c.child.pid)).size, 3);
    engine.close(); engine = new TaskOrchestration(options); workspace.tasks = engine; await engine.tick(); assert.equal(sends, 3); assert.equal(engine.data.runs[0].state, 'completed');
    // Real Remote HTTP/PWA shell reads the identical host run after reconnect.
    let remotePolls = 0;
    remote = new RemoteDashboardService({ baseDir: path.join(directory, 'remote'), stateProvider: () => ({ ...catalog, view: catalog }),
      tasks: request => { remotePolls++; return engine.handle({ ...request, operator: true }); } });
    remote.config.server_port = 0; const { url } = await remote.start();
    remoteWindow = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { offscreen: true, backgroundThrottling: false } });
    remoteWindow.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) console.error('Remote fixture renderer:', event.message); });
    await remoteWindow.loadURL(url + '/?tasks=1');
    const remoteJS = source => remoteWindow.webContents.executeJavaScript(source);
    await until(() => remoteJS('document.querySelectorAll(".task-card").length===3'), 'Remote host tasks');
    await remoteJS('document.querySelector("[data-task=first]").click()'); await wait(150);
    assert.equal(await remoteJS('document.documentElement.scrollWidth<=innerWidth'), true);
    fs.writeFileSync(path.join(out, 'remote-mobile.png'), (await remoteWindow.webContents.capturePage()).toPNG());
    await remoteWindow.reload(); await until(() => remoteJS('document.querySelectorAll(".task-card").length===3'), 'Remote reconnect');
    await remoteJS('document.querySelector("#hostingButton").click()'); await wait(150); const hiddenPolls = remotePolls;
    await wait(2200); assert.equal(remotePolls, hiddenPolls, 'Hidden task view continued polling');
    assert.equal((await fetch(url + '/api/tasks', { headers: { 'cf-connecting-ip': '203.0.113.4' } })).status, 401);
    // Standalone Korean draft: real clicks at desktop and phone sizes.
    await win.loadFile(path.join(repo, 'docs/mockups/task-orchestration.html'));
    await runJS('document.querySelector("[data-id=retry]").click();document.querySelector("#override").value="고성능 모델 · high";document.querySelector("#override").dispatchEvent(new Event("change"));document.querySelector("#retry").click()');
    assert.ok(await runJS('document.querySelector("#details").textContent.includes("고성능 모델")'));
    await runJS('document.querySelector("#collapse").click();document.querySelector("#settings").click();document.querySelector("#savePolicy").click()');
    win.setContentSize(390, 844); await wait(150); await runJS('document.querySelector("[data-id=question]").click();document.querySelector("#reply").click()');
    assert.equal(await runJS('document.documentElement.scrollWidth<=innerWidth'), true); await wait(150); fs.writeFileSync(path.join(out, 'mockup-mobile.png'), (await win.webContents.capturePage()).toPNG());
    await runJS('document.querySelector("#mobile").click()'); assert.ok(await runJS('!document.body.classList.contains("detail")'));
    console.log('TASK_ORCHESTRATION_MCP_BROKERS_INDEPENDENT_CLI_RESULTS_RESTART_APP_FOCUS_DESKTOP_REMOTE_390PX_RECONNECT_HIDDEN_POLL_AND_MOCKUP_OK');
    process.exitCode = 0;
  } catch (error) { console.error(error); console.error('Fixture task diagnostics:', JSON.stringify(engine.data.runs.map(r => ({ state: r.state, tasks: r.tasks.map(t => ({ id: t.id, state: t.state, reason: t.reason })) })))); process.exitCode = 1; }
  finally { clearInterval(poll); engine.close(); createBroker.close(); deliveries.dispose(); mcp?.kill(); for (const child of processes) child.kill(); await hook.stop(); remoteWindow?.destroy(); if (remote) await remote.stop(); win?.destroy(); app.exit(process.exitCode || 0); }
  })().catch(error => { console.error(error); require('electron').app.exit(1); });
}
