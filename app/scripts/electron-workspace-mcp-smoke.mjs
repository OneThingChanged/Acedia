import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const trustOnly = process.argv.includes('--folder-trust') || process.env.ACEDIA_WORKSPACE_AUTO_TRUST_FIXTURE === '1';
const organizationOnly = process.argv.includes('--organization') || process.env.ACEDIA_WORKSPACE_ORGANIZATION_FIXTURE === '1';
const messagesOnly = process.argv.includes('--messages') || process.env.ACEDIA_WORKSPACE_MESSAGES_FIXTURE === '1';
const dangerousOnly = process.argv.includes('--dangerous-defaults') || process.env.ACEDIA_WORKSPACE_DANGEROUS_FIXTURE === '1';
if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  app.on('browser-window-created', (_event, win) => win.on('show', () => win.hide()));
  void (async () => {
  const root = process.env.ACEDIA_WORKSPACE_MCP_FIXTURE;
  assert.ok(root && path.basename(root).startsWith('acedia-workspace-mcp-smoke-'));
  const timeout = setTimeout(() => { console.error('Workspace MCP smoke timeout'); app.exit(1); }, dangerousOnly ? 120000 : 60000);
  let window;
  try {
    await import('../electron/main.mjs');
    for (let i = 0; i < 150; i++) {
      for (const candidate of BrowserWindow.getAllWindows()) {
        if (!candidate.webContents.getURL().includes('/dist/index.html')) continue;
        const runtime = await candidate.webContents.executeJavaScript('window.multiAgentElectron?.invoke("runtime_flags")').catch(() => null);
        if (runtime?.workspace_window && runtime.coordinator) { window = candidate; break; }
      }
      if (window) break;
      await wait(100);
    }
    assert.ok(window, 'Coordinator window unavailable');
    console.log('WORKSPACE_FIXTURE_COORDINATOR_READY');
    const invoke = (command, args = {}) => window.webContents.executeJavaScript(`window.multiAgentElectron.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`);
    const executable = path.join(root, 'fixture-cli.ps1');
    const trustScreen = trustOnly ? `Write-Host -NoNewline (([char]27) + '[2J' + ([char]27) + '[H')
Write-Output 'Folder access'
Write-Output $PWD.Path
Write-Output ''
Write-Output 'Trust this folder? Codex can read, edit, and run files here, subject to your permission settings.'
Write-Output ''
Write-Output '> 1. Trust and continue'
Write-Output '  2. Quit'
Write-Output ''
Write-Output ('enter continue ' + [char]183 + ' esc quit')
$answer = [Console]::ReadLine()
if ($null -eq $answer -or $answer -ne '') { exit 1 }
[IO.File]::WriteAllText((Join-Path $env:ACEDIA_WORKSPACE_MCP_FIXTURE ('trust-' + $env:MULTIAGENT_AGENT_ID + '.json')), '{"confirmed":true}')
Write-Host -NoNewline (([char]27) + '[2J' + ([char]27) + '[H')
` : '';
    fs.writeFileSync(executable, '[IO.File]::WriteAllText((Join-Path $env:ACEDIA_WORKSPACE_MCP_FIXTURE ("launch-" + $env:MULTIAGENT_AGENT_ID + ".json")), (ConvertTo-Json -InputObject @($args) -Compress))\n[IO.File]::WriteAllText((Join-Path $env:ACEDIA_WORKSPACE_MCP_FIXTURE ("cwd-" + $env:MULTIAGENT_AGENT_ID + ".txt")), $PWD.Path)\n' + trustScreen + 'Write-Output "ACEDIA_WORKSPACE_FIXTURE_CLI"\n[Console]::ReadLine() | Out-Null\n');
    await window.webContents.executeJavaScript(`localStorage.setItem('multiagent.agentDefaults.v1', ${JSON.stringify(JSON.stringify({ codex: { launchOptions: { executable }, dangerous: false } }))})`);
    await invoke('spawn_pty', { id: 'workspace-mcp-caller', aiToolId: 'none', cwd: root, cols: 80, rows: 24 });
    console.log('WORKSPACE_FIXTURE_CALLER_READY');
    const infoPath = path.join(process.env.MULTIAGENT_LOCAL_DATA, 'hook-info.json');
    let info;
    // Hook runtime placement is deliberately discovered only in this isolated profile.
    function findInfo(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.name === 'hook-info.json') return file;
        if (entry.isDirectory()) { const found = findInfo(file); if (found) return found; }
      }
    }
    const actualInfo = fs.existsSync(infoPath) ? infoPath : findInfo(root);
    assert.ok(actualInfo); info = JSON.parse(fs.readFileSync(actualInfo, 'utf8'));
    const base = `http://127.0.0.1:${info.port}/integration/v1/workspace`;
    const headers = { authorization: 'Bearer ' + info.token, 'x-acedia-agent-id': 'workspace-mcp-caller', 'content-type': 'application/json' };
    const call = async (endpoint, body) => {
      const response = await fetch(base + endpoint, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
    };
    for (let i = 0; i < 100; i++) { if ((await call('/projects')).availableTools.some(t => t.id === 'codex')) break; await wait(100); }
    if (dangerousOnly) {
      const { exerciseDangerousDefaults } = await import('./fixtures/dangerous-defaults-workspace.mjs');
      await exerciseDangerousDefaults({ root, window, invoke, call, executable, wait });
      clearTimeout(timeout); app.quit(); return;
    }
    const projectFolder = path.join(root, 'PixelDev'); fs.mkdirSync(projectFolder);
    const first = await call('/projects', { folder: projectFolder, name: 'PixelDev', aiToolId: 'codex' });
    console.log('WORKSPACE_FIXTURE_PROJECT_CREATED');
    assert.equal(first.created, true); assert.equal(first.active, true, JSON.stringify(first));
    assert.equal((await call('/projects', { folder: projectFolder })).created, false);
    if (messagesOnly) {
      const target = await call('/sessions', { projectId: first.projectId, name: '한글 수신 세션', requestKey: 'message-target' });
      const original = '한글 작업 지시를 원문 그대로 저장합니다. 🚀\n\t줄바꿈과 들여쓰기도 유지합니다.';
      const nativeCalls = [], restore = [];
      for (const win of BrowserWindow.getAllWindows()) for (const name of ['show', 'showInactive', 'focus', 'restore']) {
        const method = win[name]; restore.push(() => { win[name] = method; }); win[name] = () => { nativeCalls.push(name); };
      }
      await window.webContents.executeJavaScript(`{ const input=document.createElement('input');input.id='message-focus';input.value='preserve draft';document.body.appendChild(input);input.focus(); }`);
      const readUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id,draft:document.getElementById('message-focus')?.value})`);
      const before = await readUi();
      const message = async (sender, endpoint, body) => {
        const response = await fetch(base + '/messages/' + endpoint, { method:'POST',headers:{...headers,'x-acedia-agent-id':sender},body:JSON.stringify(body) });
        const data = await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
      };
      const body = { sessionId:target.sessionId,message:original,requestKey:'utf8-native-main',notify:false };
      const saved = await message(first.sessionId,'send',body);
      assert.equal(saved.saved,true);assert.equal(saved.readAt,null);
      const received = await message(target.sessionId,'receive',{messageId:saved.messageId,includeBase64:true});
      assert.equal(received.messages[0].message,original);assert.equal(Buffer.from(received.messages[0].messageBase64,'base64').toString('utf8'),original);
      const repeated = await message(first.sessionId,'send',body);assert.equal(repeated.messageId,saved.messageId);assert.ok(repeated.readAt);
      await message(target.sessionId,'send',{sessionId:first.sessionId,message:'원문 확인했습니다.',replyTo:saved.messageId,requestKey:'reply-main',notify:false});
      assert.equal((await message(first.sessionId,'receive',{})).messages[0].message,'원문 확인했습니다.');
      const disk = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'session-messages-v1.json'),'utf8'));
      assert.equal(disk.find(r=>r.messageId===saved.messageId).message,original);assert.ok(disk.find(r=>r.messageId===saved.messageId).readAt);
      assert.deepEqual(await readUi(),before,'Messages changed selection, pane, focus or draft');assert.deepEqual(nativeCalls,[]);
      restore.forEach(fn=>fn());for(const id of ['workspace-mcp-caller',first.sessionId,target.sessionId])await invoke('kill_pty',{id});
      console.log('ACEDIA_SESSION_MESSAGES_MAIN_PROCESS_UTF8_READ_REPLY_DURABLE_NO_FOCUS_OK');clearTimeout(timeout);app.quit();return;
    }
    if (organizationOnly) {
      const nativeCalls = [], restore = [];
      const readUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id,draft:document.getElementById('organization-focus')?.value})`);
      await window.webContents.executeJavaScript(`{ const input=document.createElement('input'); input.id='organization-focus'; input.value='preserve organization draft'; document.body.appendChild(input); input.focus(); }`);
      const beforeUi = await readUi();
      for (const win of BrowserWindow.getAllWindows()) for (const name of ['show', 'showInactive', 'focus', 'restore']) {
        const original = win[name]; restore.push(() => { win[name] = original; }); win[name] = () => { nativeCalls.push(name); };
      }
      const folder = path.join(projectFolder, 'PCGLab'); fs.mkdirSync(folder);
      const body = { projectId: first.projectId, parentSessionId: first.sessionId, folder, name: 'Worker', start: false, requestKey: 'explicit-standby' };
      const child = await call('/sessions', body);
      const launch = id => path.join(root, `launch-${id}.json`);
      const storedAgents = async () => JSON.parse((await invoke('storage_snapshot_get')).values['multiagent.agents.v1']);
      const record = (await storedAgents()).find(a => a.id === child.sessionId);
      assert.equal(child.active, false); assert.equal(fs.existsSync(launch(child.sessionId)), false);
      assert.equal(record.folder, fs.realpathSync(folder)); assert.equal(record.resumeEligible, false);
      assert.equal(record.sessionHierarchy.parentId, first.sessionId); assert.equal(record.sessionHierarchy.inheritFolder, false);
      assert.equal((await call('/sessions', body)).sessionId, child.sessionId);
      const organized = await call('/organize-sessions', { changes: [
        { sessionId: first.sessionId, name: 'Chief', expectedName: 'Session 1' },
        { sessionId: child.sessionId, name: 'PCGLab', expectedName: 'Worker', parentSessionId: null, expectedParentSessionId: first.sessionId },
      ] });
      assert.equal(organized.saved, true);
      let listed = await call('/projects');
      assert.equal(listed.sessions.find(a => a.id === first.sessionId).name, 'Chief');
      assert.equal(listed.sessions.find(a => a.id === child.sessionId).parentSessionId, undefined);
      assert.equal(listed.sessions.find(a => a.id === first.sessionId).active, true);
      const parentBack = { changes: [{ sessionId: child.sessionId, parentSessionId: first.sessionId, expectedParentSessionId: null }] };
      await call('/organize-sessions', parentBack); await call('/organize-sessions', parentBack);
      const invalid = await fetch(base + '/organize-sessions', { method: 'POST', headers, body: JSON.stringify({ changes: [{ sessionId: first.sessionId, parentSessionId: child.sessionId, expectedParentSessionId: null }] }) });
      assert.equal(invalid.status, 409);
      assert.equal((await call('/start', { sessionId: child.sessionId })).active, true);
      for (let i = 0; i < 100 && !fs.existsSync(launch(child.sessionId)); i++) await wait(100);
      assert.equal(fs.readFileSync(path.join(root, `cwd-${child.sessionId}.txt`), 'utf8'), fs.realpathSync(folder));
      assert.deepEqual(await readUi(), beforeUi, 'Create, rename, reparent or start changed the workspace');
      // Mount a real terminal pane before stopping: its exit handler must not
      // restart the CLI, remove the pane or alter the selected project.
      await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`[data-sidebar-agent-id="${child.sessionId}"]`)}).dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }))`);
      await wait(200);
      await window.webContents.executeJavaScript(`document.getElementById('organization-focus').focus()`);
      const mountedUi = await readUi();
      const stopped = await call('/stop', { sessionId: child.sessionId });
      assert.deepEqual(stopped, { saved: true, background: true, sessionId: child.sessionId, active: false });
      await call('/stop', { sessionId: child.sessionId });
      await wait(200);
      assert.equal((await call('/projects')).sessions.find(a => a.id === child.sessionId).active, false, 'Mounted pane restarted a stopped CLI');
      assert.deepEqual(await readUi(), mountedUi, 'Stopping removed or selected a pane or changed the draft');
      const stoppedRecord = (await storedAgents()).find(a => a.id === child.sessionId);
      assert.equal(stoppedRecord.resumeEligible, false);
      assert.equal(stoppedRecord.sessionHierarchy.parentId, first.sessionId);
      const newFolder = path.join(projectFolder, 'MovedLab'); fs.mkdirSync(newFolder);
      await call('/relocate-sessions', { moves: [{ sessionId: child.sessionId, projectId: first.projectId, folder: newFolder, expectedProjectId: first.projectId, expectedFolder: fs.realpathSync(folder) }] });
      await call('/start', { sessionId: child.sessionId });
      for (let i = 0; i < 100 && fs.readFileSync(path.join(root, `cwd-${child.sessionId}.txt`), 'utf8') !== fs.realpathSync(newFolder); i++) await wait(100);
      assert.equal(fs.readFileSync(path.join(root, `cwd-${child.sessionId}.txt`), 'utf8'), fs.realpathSync(newFolder));
      const standbyProjectFolder = path.join(root, 'StandbyProject'); fs.mkdirSync(standbyProjectFolder);
      const standby = await call('/projects', { folder: standbyProjectFolder, name: 'Standby', start: false });
      await wait(300);
      assert.equal(standby.active, false); assert.equal(fs.existsSync(launch(standby.sessionId)), false);
      assert.deepEqual(await readUi(), mountedUi, 'Organization API changed the selected project, pane layout, focus or draft');
      assert.deepEqual(nativeCalls, [], 'Organization API activated a native window');
      restore.forEach(fn => fn());
      for (const id of ['workspace-mcp-caller', first.sessionId, child.sessionId]) await invoke('kill_pty', { id });
      console.log('ACEDIA_ORGANIZATION_RENAME_REPARENT_EXPLICIT_CWD_STANDBY_STOP_MOVE_START_DURABLE_NO_FOCUS_OK');
      clearTimeout(timeout); app.quit(); return;
    }
    const nativeCalls = [];
    const originalMethods = [];
    const readTrustUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id,draft:document.getElementById('trust-focus')?.value})`);
    if (trustOnly) await window.webContents.executeJavaScript(`{ const input=document.createElement('input'); input.id='trust-focus'; input.value='preserve trust draft'; document.body.appendChild(input); input.focus(); }`);
    const trustUi = trustOnly ? await readTrustUi() : null;
    if (trustOnly) for (const win of BrowserWindow.getAllWindows()) for (const name of ['show', 'showInactive', 'focus', 'restore']) {
      const original = win[name]; originalMethods.push(() => { win[name] = original; });
      win[name] = () => { nativeCalls.push(name); };
    }
    const second = await call('/sessions', { projectId: first.projectId, name: 'Additional session', requestKey: 'additional' });
    assert.equal(second.created, true); assert.equal(second.active, true, JSON.stringify(second));
    const retried = await call('/sessions', { projectId: first.projectId, name: 'Additional session', requestKey: 'additional' });
    assert.equal(retried.sessionId, second.sessionId); assert.equal(retried.created, false);
    const stored = await invoke('storage_snapshot_get');
    assert.ok(JSON.stringify(stored).includes(first.projectId) && JSON.stringify(stored).includes(second.sessionId), 'Created items were not persisted');
    const ui = await window.webContents.executeJavaScript('({projects:JSON.parse(localStorage.getItem("multiagent.projects.v1")),agents:JSON.parse(localStorage.getItem("multiagent.agents.v1"))})');
    assert.equal(ui.projects.filter(p => p.folder === projectFolder).length, 1);
    assert.equal(ui.agents.filter(a => a.projectId === first.projectId).length, 2);
    assert.ok(ui.agents.filter(a => a.projectId === first.projectId).every(a => a.dangerous === false));
    if (trustOnly) {
      for (const id of [first.sessionId, second.sessionId]) {
        const receipt = path.join(root, `trust-${id}.json`);
        for (let i = 0; i < 100 && !fs.existsSync(receipt); i++) await wait(100);
        assert.ok(fs.existsSync(receipt), 'Main process did not confirm API-created folder trust');
        assert.equal(JSON.parse(fs.readFileSync(receipt, 'utf8')).confirmed, true);
        assert.equal(ui.agents.find(a => a.id === id).sessionHierarchy.createdById, 'workspace-mcp-caller');
      }
      const policy = await invoke('task_orchestration', { action: 'policy', body: { ownerId: first.sessionId } });
      assert.equal(policy.startupTrust.enabled, false);
      assert.deepEqual(await readTrustUi(), trustUi, 'Folder confirmation changed selection, focus or draft');
      assert.deepEqual(nativeCalls, [], 'Folder confirmation activated a window');
      originalMethods.forEach(restore => restore());
      for (const id of ['workspace-mcp-caller', first.sessionId, second.sessionId]) await invoke('kill_pty', { id });
      console.log('ACEDIA_API_CREATED_FOLDER_TRUST_MAIN_PROCESS_NO_OPT_IN_NO_ACTIVATION_OK');
      clearTimeout(timeout); app.quit(); return;
    }
    // Both active and OFFLINE targets save without selecting a session, moving
    // the pane, changing DOM focus or starting/restarting a native process.
    const launchFile = id => path.join(root, `launch-${id}.json`);
    for (let i = 0; i < 100 && !fs.existsSync(launchFile(second.sessionId)); i++) await wait(100);
    assert.ok(fs.existsSync(launchFile(second.sessionId)), 'Fixture CLI did not start');
    const secondLaunch = fs.statSync(launchFile(second.sessionId)).mtimeMs;
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`[data-sidebar-agent-id="${first.sessionId}"] .sidebar-session-close`)}).click()`);
    let read = await call('/session-settings', { sessionId: first.sessionId });
    for (let i = 0; i < 100 && read.active; i++) { await wait(100); read = await call('/session-settings', { sessionId: first.sessionId }); }
    assert.equal(read.active, false); assert.equal(read.dangerous, false);
    const readUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id,draft:document.getElementById('launch-settings-focus')?.value})`);
    await window.webContents.executeJavaScript(`{ const input=document.createElement('input'); input.id='launch-settings-focus'; input.value='preserve my draft'; document.body.appendChild(input); input.focus(); }`);
    const before = await readUi();
    const results = await Promise.all([first.sessionId, second.sessionId].map(sessionId => call('/session-settings', { sessionId, dangerous: true, expectedDangerous: false })));
    assert.ok(results.every(result => result.dangerous === true && result.saved && result.appliesOn === 'next_start'));
    assert.deepEqual(results.map(result => result.active), [false, true]);
    assert.deepEqual(await readUi(), before, 'Saving settings changed the view, pane, focus or draft');
    assert.equal(fs.statSync(launchFile(second.sessionId)).mtimeMs, secondLaunch, 'Active CLI was restarted');
    assert.equal((await call('/session-settings', { sessionId: first.sessionId })).active, false, 'OFFLINE target was started');
    const saved = JSON.parse((await invoke('storage_snapshot_get')).values['multiagent.agents.v1']);
    for (const id of [first.sessionId, second.sessionId]) {
      const original = ui.agents.find(item => item.id === id);
      const updated = saved.find(item => item.id === id);
      assert.equal(updated.dangerous, true);
      for (const key of ['aiToolId', 'folder', 'launchOptions', 'modelSettings', 'name', 'createdAt']) assert.deepEqual(updated[key], original[key], `Unrelated ${key} changed`);
    }
    console.log('ACEDIA_SESSION_SETTINGS_OFFLINE_ACTIVE_DURABLE_NO_FOCUS_OK');
    // Starting the offline target is a separate, explicit UI action. Verify
    // the saved setting reaches the next CLI, rather than only its badge.
    const firstLaunch = fs.statSync(launchFile(first.sessionId)).mtimeMs;
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`[data-sidebar-agent-id="${first.sessionId}"]`)}).dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }))`);
    let clicked = false;
    for (let i = 0; i < 100 && fs.statSync(launchFile(first.sessionId)).mtimeMs === firstLaunch; i++) {
      if (!clicked) clicked = await window.webContents.executeJavaScript(`{ const button=document.querySelector('.session-standby button, .session-recovery button'); if(button) button.click(); Boolean(button); }`);
      await wait(100);
    }
    assert.ok(fs.statSync(launchFile(first.sessionId)).mtimeMs > firstLaunch, 'Next CLI did not start');
    assert.ok(JSON.parse(fs.readFileSync(launchFile(first.sessionId), 'utf8')).includes('--dangerously-bypass-approvals-and-sandbox'), 'Next CLI did not receive saved Dangerous flag');
    console.log('ACEDIA_SESSION_SETTINGS_NEXT_CLI_FLAG_OK');
    const rndFolder = path.join(root, 'RnDHub'); fs.mkdirSync(rndFolder);
    const rnd = await call('/projects', { folder: rndFolder, name: 'RnDHub' });
    const moves = [first.sessionId, second.sessionId].map((sessionId, index) => {
      const folder = path.join(rndFolder, `research-${index + 1}`); fs.mkdirSync(folder);
      return { sessionId, projectId: rnd.projectId, folder, expectedProjectId: first.projectId, expectedFolder: projectFolder };
    });
    // Batch validation refuses a still-running target without changing either.
    const refused = await fetch(base + '/relocate-sessions', { method: 'POST', headers, body: JSON.stringify({ moves }) });
    assert.equal(refused.status, 409);
    for (const id of [first.sessionId, second.sessionId]) await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`[data-sidebar-agent-id="${id}"] .sidebar-session-close`)}).click()`);
    for (let i = 0; i < 100; i++) {
      if ((await call('/projects')).sessions.filter(a => moves.some(m => m.sessionId === a.id)).every(a => !a.active)) break;
      await wait(100);
    }
    await window.webContents.executeJavaScript(`document.getElementById('launch-settings-focus').focus()`);
    const relocationUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),focus:document.activeElement?.id,draft:document.getElementById('launch-settings-focus')?.value,groups:JSON.parse(localStorage.getItem('multiagent.groups.v1')||'[]').map(({projectId,...rest})=>rest)})`);
    const uiBeforeMove = await relocationUi();
    const registrationsBefore = JSON.parse((await invoke('storage_snapshot_get')).values['multiagent.agents.v1']);
    assert.equal((await call('/relocate-sessions', { moves })).saved, true);
    assert.deepEqual(await relocationUi(), uiBeforeMove, 'Relocation changed pane selection, layout, focus or draft');
    const registrations = JSON.parse((await invoke('storage_snapshot_get')).values['multiagent.agents.v1']);
    const listed = await call('/projects');
    for (const move of moves) {
      const original = registrationsBefore.find(a => a.id === move.sessionId), saved = registrations.find(a => a.id === move.sessionId);
      assert.equal(saved.projectId, rnd.projectId); assert.equal(saved.folder, fs.realpathSync(move.folder));
      for (const key of ['id', 'name', 'aiToolId', 'lastSessionId', 'modelSettings', 'dangerous', 'codexAccountId', 'codexAccountSessions', 'launchOptions']) assert.deepEqual(saved[key], original[key], `Relocation changed ${key}`);
      assert.equal(listed.sessions.find(a => a.id === move.sessionId).active, false);
    }
    assert.equal(listed.sessions.find(a => a.id === rnd.sessionId).active, true);
    // Explicitly open the moved session and verify its native working folder.
    const beforeMoveLaunch = fs.statSync(launchFile(first.sessionId)).mtimeMs;
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`[data-sidebar-agent-id="${first.sessionId}"]`)}).dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }))`);
    clicked = false;
    for (let i = 0; i < 100 && (fs.statSync(launchFile(first.sessionId)).mtimeMs === beforeMoveLaunch
      || fs.readFileSync(path.join(root, `cwd-${first.sessionId}.txt`), 'utf8') !== fs.realpathSync(moves[0].folder)); i++) {
      if (!clicked) clicked = await window.webContents.executeJavaScript(`{ const b=document.querySelector('.session-standby button'); if(b) b.click(); Boolean(b); }`);
      await wait(100);
    }
    assert.equal(fs.readFileSync(path.join(root, `cwd-${first.sessionId}.txt`), 'utf8'), fs.realpathSync(moves[0].folder));
    assert.ok(fs.existsSync(projectFolder), 'Registry relocation moved physical directories');
    console.log('ACEDIA_SESSION_RELOCATION_BATCH_PERSIST_FOCUS_AND_NATIVE_CWD_OK');
    // Both public start routes must start existing OFFLINE sessions without
    // opening/selecting their panes or calling any native activation method.
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`[data-sidebar-agent-id="${first.sessionId}"] .sidebar-session-close`)}).click()`);
    for (let i = 0; i < 100; i++) {
      if ((await call('/projects')).sessions.filter(s => [first.sessionId, second.sessionId].includes(s.id)).every(s => !s.active)) break;
      await wait(100);
    }
    await wait(200);
    assert.equal((await call('/projects')).sessions.find(s => s.id === first.sessionId).active, false);
    await window.webContents.executeJavaScript(`document.getElementById('launch-settings-focus').focus()`);
    const readStartUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id,draft:document.getElementById('launch-settings-focus')?.value,ids:JSON.parse(localStorage.getItem('multiagent.agents.v1')).map(a=>a.id)})`);
    const startUi = await readStartUi(), restoreMethods = [];
    const nativeState = () => BrowserWindow.getAllWindows().map(w => ({ id:w.id, visible:w.isVisible(), focused:w.isFocused(), minimized:w.isMinimized() }));
    const beforeNative = nativeState();
    for (const w of BrowserWindow.getAllWindows()) for (const name of ['show', 'showInactive', 'focus', 'restore']) {
      const original = w[name];
      w[name] = () => { nativeCalls.push({ id:w.id, name }); };
      restoreMethods.push(() => { w[name] = original; });
    }
    try {
      const launchBefore = [first.sessionId, second.sessionId].map(id => fs.statSync(launchFile(id)).mtimeMs);
      assert.deepEqual(await call('/start', { sessionId:first.sessionId }), { sessionId:first.sessionId, active:true, started:true, background:true });
      const activateResponse = await fetch(`http://127.0.0.1:${info.port}/integration/v1/sessions/${second.sessionId}/activate`, { method:'POST', headers });
      assert.equal(activateResponse.status, 202);
      assert.deepEqual(await activateResponse.json(), { ok:true, agentId:second.sessionId, sessionId:second.sessionId, active:true, started:true, background:true });
      for (let i = 0; i < 100 && [first.sessionId, second.sessionId].some((id, index) => fs.statSync(launchFile(id)).mtimeMs === launchBefore[index]); i++) await wait(100);
      const currentLaunch = [first.sessionId, second.sessionId].map(id => fs.statSync(launchFile(id)).mtimeMs);
      assert.ok(currentLaunch.every((time, index) => time > launchBefore[index]), 'Background CLI did not start');
      assert.equal((await call('/start', { sessionId:first.sessionId })).started, false);
      const repeated = await fetch(`http://127.0.0.1:${info.port}/integration/v1/sessions/${second.sessionId}/activate`, { method:'POST', headers });
      assert.equal((await repeated.json()).started, false);
      await wait(200);
      assert.deepEqual([first.sessionId, second.sessionId].map(id => fs.statSync(launchFile(id)).mtimeMs), currentLaunch, 'Start restarted an active CLI');
      assert.deepEqual(await readStartUi(), startUi, 'Background start changed selection, layout, focus, draft or session IDs');
      assert.deepEqual(nativeCalls, [], 'Start called a native window display/activation method');
      assert.deepEqual(nativeState(), beforeNative, 'Start changed native window state or opened another window');
      assert.equal((await call('/projects')).sessions.find(s => s.id === rnd.sessionId).active, true, 'Unrelated CLI was stopped');
      for (const move of moves) assert.equal(fs.readFileSync(path.join(root, `cwd-${move.sessionId}.txt`), 'utf8'), fs.realpathSync(move.folder));
      console.log('ACEDIA_EXISTING_SESSION_START_BOTH_APIS_NO_WINDOW_FOCUS_OK');
    } finally { for (const restore of restoreMethods) restore(); }
    for (const id of ['workspace-mcp-caller', first.sessionId, second.sessionId, rnd.sessionId]) await invoke('kill_pty', { id });
    console.log('ACEDIA_WORKSPACE_MCP_PROJECT_AND_SESSIONS_OK');
    clearTimeout(timeout); app.quit();
  } catch (error) { console.error(error); clearTimeout(timeout); app.exit(1); }
  })();
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-mcp-smoke-'));
  const home = path.join(root, 'codex'); fs.mkdirSync(home);
  const env = { ...process.env, ACEDIA_WORKSPACE_MCP_FIXTURE: root, MULTIAGENT_ELECTRON_USER_DATA: path.join(root, 'profile'),
    MULTIAGENT_LOCAL_DATA: path.join(root, 'local-data'), CODEX_HOME: home,
    ACEDIA_WORKSPACE_AUTO_TRUST_FIXTURE: trustOnly ? '1' : '0' };
  env.ACEDIA_WORKSPACE_ORGANIZATION_FIXTURE = organizationOnly ? '1' : '0';
  env.ACEDIA_WORKSPACE_MESSAGES_FIXTURE = messagesOnly ? '1' : '0';
  env.ACEDIA_WORKSPACE_DANGEROUS_FIXTURE = dangerousOnly ? '1' : '0';
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, cwd: appRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-16000); });
    const timer = setTimeout(() => child.kill(), dangerousOnly ? 135000 : 75000);
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, output);
    if (dangerousOnly) {
      for (const label of ['unset=true', 'on=true', 'off=false', 'remember-off=false', 'remember-on=true', 'legacy-off=false']) assert.ok(output.includes('DANGEROUS_DEFAULT_MAIN_RENDERER_PROJECT_API_TASK_OK ' + label), output);
      assert.ok(output.includes('DANGEROUS_DEFAULT_UNSUPPORTED_OFF_EXISTING_SESSION_CLI_AND_FOCUS_UNCHANGED_OK'), output);
      console.log(output.split('\n').filter(line => line.startsWith('DANGEROUS_DEFAULT_')).join('\n'));
    } else if (messagesOnly) {
      const marker = 'ACEDIA_SESSION_MESSAGES_MAIN_PROCESS_UTF8_READ_REPLY_DURABLE_NO_FOCUS_OK';
      assert.ok(output.includes(marker), output); console.log(marker);
    } else if (organizationOnly) {
      const marker = 'ACEDIA_ORGANIZATION_RENAME_REPARENT_EXPLICIT_CWD_STANDBY_STOP_MOVE_START_DURABLE_NO_FOCUS_OK';
      assert.ok(output.includes(marker), output); console.log(marker);
    } else if (trustOnly) {
      const marker = 'ACEDIA_API_CREATED_FOLDER_TRUST_MAIN_PROCESS_NO_OPT_IN_NO_ACTIVATION_OK';
      assert.ok(output.includes(marker), output); console.log(marker);
    } else {
    assert.ok(output.includes('ACEDIA_WORKSPACE_MCP_PROJECT_AND_SESSIONS_OK'), output);
    assert.ok(output.includes('ACEDIA_SESSION_SETTINGS_OFFLINE_ACTIVE_DURABLE_NO_FOCUS_OK'), output);
    assert.ok(output.includes('ACEDIA_SESSION_SETTINGS_NEXT_CLI_FLAG_OK'), output);
    assert.ok(output.includes('ACEDIA_SESSION_RELOCATION_BATCH_PERSIST_FOCUS_AND_NATIVE_CWD_OK'), output);
    assert.ok(output.includes('ACEDIA_EXISTING_SESSION_START_BOTH_APIS_NO_WINDOW_FOCUS_OK'), output);
    console.log('ACEDIA_WORKSPACE_MCP_PROJECT_AND_SESSIONS_OK');
    console.log('ACEDIA_SESSION_SETTINGS_OFFLINE_ACTIVE_DURABLE_NO_FOCUS_OK');
    console.log('ACEDIA_SESSION_SETTINGS_NEXT_CLI_FLAG_OK');
    console.log('ACEDIA_SESSION_RELOCATION_BATCH_PERSIST_FOCUS_AND_NATIVE_CWD_OK');
    console.log('ACEDIA_EXISTING_SESSION_START_BOTH_APIS_NO_WINDOW_FOCUS_OK');
    }
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-workspace-mcp-smoke-')) throw new Error('Unexpected cleanup path');
    await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
  }
}
