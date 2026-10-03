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
if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  app.on('browser-window-created', (_event, win) => win.on('show', () => win.hide()));
  void (async () => {
  const root = process.env.ACEDIA_WORKSPACE_MCP_FIXTURE;
  assert.ok(root && path.basename(root).startsWith('acedia-workspace-mcp-smoke-'));
  const timeout = setTimeout(() => { console.error('Workspace MCP smoke timeout'); app.exit(1); }, 60000);
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
    fs.writeFileSync(executable, 'Write-Output "ACEDIA_WORKSPACE_FIXTURE_CLI"\n[Console]::ReadLine() | Out-Null\n');
    await window.webContents.executeJavaScript(`localStorage.setItem('multiagent.agentDefaults.v1', ${JSON.stringify(JSON.stringify({ codex: { launchOptions: { executable }, workerSettings: null, dangerous: false } }))})`);
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
    const projectFolder = path.join(root, 'PixelDev'); fs.mkdirSync(projectFolder);
    const first = await call('/projects', { folder: projectFolder, name: 'PixelDev', aiToolId: 'codex' });
    console.log('WORKSPACE_FIXTURE_PROJECT_CREATED');
    assert.equal(first.created, true); assert.equal(first.active, true, JSON.stringify(first));
    assert.equal((await call('/projects', { folder: projectFolder })).created, false);
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
    for (const id of ['workspace-mcp-caller', first.sessionId, second.sessionId]) await invoke('kill_pty', { id });
    console.log('ACEDIA_WORKSPACE_MCP_PROJECT_AND_SESSIONS_OK');
    clearTimeout(timeout); app.quit();
  } catch (error) { console.error(error); clearTimeout(timeout); app.exit(1); }
  })();
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-workspace-mcp-smoke-'));
  const home = path.join(root, 'codex'); fs.mkdirSync(home);
  const env = { ...process.env, ACEDIA_WORKSPACE_MCP_FIXTURE: root, MULTIAGENT_ELECTRON_USER_DATA: path.join(root, 'profile'),
    MULTIAGENT_LOCAL_DATA: path.join(root, 'local-data'), CODEX_HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, cwd: appRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-16000); });
    const timer = setTimeout(() => child.kill(), 75000);
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, output);
    assert.ok(output.includes('ACEDIA_WORKSPACE_MCP_PROJECT_AND_SESSIONS_OK'), output);
    console.log('ACEDIA_WORKSPACE_MCP_PROJECT_AND_SESSIONS_OK');
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-workspace-mcp-smoke-')) throw new Error('Unexpected cleanup path');
    await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
  }
}
