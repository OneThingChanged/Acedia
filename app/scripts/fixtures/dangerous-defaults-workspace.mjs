import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { WorkspaceManagement } from '../../electron/services/workspace-management.mjs';

// Called only by the temporary-profile, hidden actual-main/App smoke harness.
// All native launches use its dummy CLI; no model or credential endpoint is used.
export async function exerciseDangerousDefaults({ root, window, invoke, call, executable, wait }) {
  const read = async () => JSON.parse((await invoke('storage_snapshot_get')).values['multiagent.agents.v1'] || '[]');
  const launchFile = id => path.join(root, `launch-${id}.json`);
  const setDefaults = async (value, last) => window.webContents.executeJavaScript(`{
    localStorage.setItem('multiagent.agentDefaults.v1', ${JSON.stringify(JSON.stringify({ codex: { launchOptions: { executable }, ...value }, cline: { launchOptions: { executable } } }))});
    localStorage.setItem('multiagent.newSessionPreferences.v1', ${JSON.stringify(JSON.stringify({ dangerousByTool: typeof last === 'boolean' ? { codex: last } : {} }))});
  }`);
  await setDefaults({ dangerousDefaultMode: 'off' });
  const existingFolder = path.join(root, 'ExistingOff'); fs.mkdirSync(existingFolder);
  const existing = await call('/projects', { folder: existingFolder, name: 'Existing OFF' });
  for (let i = 0; i < 100 && !fs.existsSync(launchFile(existing.sessionId)); i++) await wait(100);
  assert.ok(fs.existsSync(launchFile(existing.sessionId)));
  // Initial launch asynchronously records resume eligibility; take the baseline
  // after that lifecycle write, before changing any creation preference.
  for (let i = 0; i < 100 && !(await read()).find(a => a.id === existing.sessionId)?.resumeEligible; i++) await wait(100);
  const existingAgent = (await read()).find(a => a.id === existing.sessionId);
  assert.equal(existingAgent.dangerous, false);
  const existingLaunch = fs.readFileSync(launchFile(existing.sessionId), 'utf8');
  const existingTime = fs.statSync(launchFile(existing.sessionId)).mtimeMs;
  const readUi = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id,draft:document.getElementById('defaults-focus')?.value})`);
  await window.webContents.executeJavaScript(`{const input=document.createElement('input');input.id='defaults-focus';input.value='preserve defaults draft';document.body.appendChild(input);input.focus();}`);
  const before = await readUi();
  const nativeCalls = [], restores = [], created = [existing.sessionId];
  for (const win of (await import('electron')).BrowserWindow.getAllWindows()) for (const method of ['show', 'showInactive', 'focus', 'restore']) {
    const original = win[method]; restores.push(() => { win[method] = original; }); win[method] = () => { nativeCalls.push(method); };
  }
  try {
    for (const [label, settings, last, expected] of [
      ['unset', {}, undefined, true], ['on', { dangerousDefaultMode: 'on' }, false, true],
      ['off', { dangerousDefaultMode: 'off' }, true, false],
      ['remember-off', { dangerousDefaultMode: 'remember', dangerous: true }, false, false],
      ['remember-on', { dangerousDefaultMode: 'remember', dangerous: false }, true, true],
      ['legacy-off', { dangerous: false }, undefined, false],
    ]) {
      await setDefaults(settings, last);
      const folder = path.join(root, `Policy-${label}`); fs.mkdirSync(folder);
      const first = await call('/projects', { folder, name: label }); created.push(first.sessionId);
      const child = await call('/sessions', { projectId: first.projectId, name: 'API child', requestKey: label }); created.push(child.sessionId);
      // Exercise the exact task factory, then its payload through the real App
      // event handler and main-process native launch/storage IPC. The fixture
      // observes persistence instead of using the production creation broker.
      const agents = await read();
      const taskId = randomUUID();
      const taskOwner = label === 'unset' ? existing : first;
      const taskFolder = label === 'unset' ? existingFolder : folder;
      const taskWorkspace = new WorkspaceManagement({
        catalog: () => ({ projects: [{ id: taskOwner.projectId, folder: taskFolder }], agents, availableTools: [{ id: 'codex' }] }),
        isActive: id => id === taskOwner.sessionId,
        create: async payload => {
          assert.equal(Object.hasOwn(payload, 'dangerous'), false);
          window.webContents.send('multiagent:event', 'remote:create-session', { ...payload, requestId: randomUUID() });
          for (let i = 0; i < 100; i++) { if ((await read()).some(a => a.id === taskId) && fs.existsSync(launchFile(taskId))) return { id: taskId }; await wait(100); }
          throw Error('Task factory payload was not persisted/launched');
        },
      });
      await taskWorkspace.createTaskSession({ id: taskId, ownerId: taskOwner.sessionId, projectId: taskOwner.projectId, folder: taskFolder, name: `Task ${label}`, modelSettings: { model: 'fixture-model', effort: 'medium' } });
      created.push(taskId);
      for (const id of [first.sessionId, child.sessionId, taskId]) {
        for (let i = 0; i < 100 && !fs.existsSync(launchFile(id)); i++) await wait(100);
        assert.equal((await read()).find(a => a.id === id).dangerous, expected, `${label}: saved permission`);
        assert.equal(JSON.parse(fs.readFileSync(launchFile(id), 'utf8')).includes('--dangerously-bypass-approvals-and-sandbox'), expected, `${label}: native CLI flag`);
      }
      const task = (await read()).find(a => a.id === taskId);
      assert.equal(task.sessionHierarchy.parentId, taskOwner.sessionId);
      assert.deepEqual(task.modelSettings, { model: 'fixture-model', effort: 'medium' });
      console.log(`DANGEROUS_DEFAULT_MAIN_RENDERER_PROJECT_API_TASK_OK ${label}=${expected}`);
      for (const id of [first.sessionId, child.sessionId, taskId]) await invoke('kill_pty', { id });
    }
    await setDefaults({});
    const explicitOff = randomUUID(); created.push(explicitOff);
    window.webContents.send('multiagent:event', 'remote:create-session', { requestId: randomUUID(), id: explicitOff, projectId: existing.projectId, name: 'Explicit creation OFF', aiToolId: 'codex', dangerous: false, workspaceManaged: true, start: false });
    for (let i = 0; i < 100 && !(await read()).some(a => a.id === explicitOff); i++) await wait(100);
    assert.equal((await read()).find(a => a.id === explicitOff).dangerous, false);
    assert.equal(fs.existsSync(launchFile(explicitOff)), false);
    const unsupported = await call('/sessions', { projectId: existing.projectId, aiToolId: 'cline', name: 'Unsupported', requestKey: 'unsupported', start: false }); created.push(unsupported.sessionId);
    assert.equal((await read()).find(a => a.id === unsupported.sessionId).dangerous, false);
    assert.equal(fs.existsSync(launchFile(unsupported.sessionId)), false);
    assert.deepEqual((await read()).find(a => a.id === existing.sessionId), existingAgent, 'Existing stored session was changed');
    assert.equal(fs.readFileSync(launchFile(existing.sessionId), 'utf8'), existingLaunch);
    assert.equal(fs.statSync(launchFile(existing.sessionId)).mtimeMs, existingTime, 'Existing CLI was restarted');
    assert.deepEqual(await readUi(), before, 'Creation changed view, groups, focus or draft');
    assert.deepEqual(nativeCalls, [], 'Creation activated a native window');
    console.log('DANGEROUS_DEFAULT_UNSUPPORTED_OFF_EXISTING_SESSION_CLI_AND_FOCUS_UNCHANGED_OK');
  } finally {
    restores.forEach(restore => restore());
    for (const id of ['workspace-mcp-caller', ...created]) await invoke('kill_pty', { id });
  }
}
