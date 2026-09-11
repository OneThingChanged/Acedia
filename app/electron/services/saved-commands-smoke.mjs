import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifySavedCommands(window) {
  const call = (command, args = {}) => window.webContents.executeJavaScript('window.multiAgentElectron.invoke(' + JSON.stringify(command) + ',' + JSON.stringify(args) + ')');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-command-smoke-'));
  const before = await call('saved_commands_get'), id = randomUUID(), sessionId = randomUUID();
  const project = { id: randomUUID(), name: 'Fixture', folder: root };
  const output = path.join(root, 'executed.txt');
  const script = "Set-Content -LiteralPath '" + output.replaceAll("'", "''") + "' -Value (Get-Location).Path";
  try {
    await call('saved_commands_set', { patch: { commands: [{ id, name: 'Fixture', scope: 'project', projectId: project.id, command: script }], startups: { [project.id]: { commandId: id, automatic: true } } }, revision: before.revision });
    const selected = await call('saved_command_resolve', { commandId: id, project });
    assert.equal((await call('project_startup_claim', { project })).id, id);
    assert.equal(await call('project_startup_claim', { project }), null);
    await assert.rejects(call('saved_command_resolve', { commandId: id, project: { ...project, folder: path.join(root, 'missing') } }));
    await call('spawn_pty', { id: sessionId, shell: 'powershell.exe', cwd: root, aiToolId: 'none', initCommand: selected.command, cols: 100, rows: 30 });
    for (let n = 0; n < 80 && !fs.existsSync(output); n++) await new Promise(resolve => setTimeout(resolve, 50));
    const actualDirectory = fs.statSync(fs.readFileSync(output, 'utf8').trim());
    assert.equal(actualDirectory.ino, fs.statSync(root).ino);
    assert.equal(actualDirectory.dev, fs.statSync(root).dev);
    console.log('SAVED_COMMAND_NATIVE_PTY_AND_SCOPE_OK');
  } catch (error) { console.error("SAVED_COMMAND_RUNTIME_FAILURE", error); throw error; } finally {
    await call('write_pty', { id: sessionId, data: 'exit\r' }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 400));
    await call('kill_pty', { id: sessionId });
    await new Promise(resolve => setTimeout(resolve, 400));
    const current = await call('saved_commands_get');
    await call('saved_commands_set', { patch: before, revision: current.revision });
    if (path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { console.warn('Command fixture cleanup deferred until process exit.'); }
    }
  }
}
