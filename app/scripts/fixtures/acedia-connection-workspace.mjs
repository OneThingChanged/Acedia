import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function exerciseConnection({ root, window, invoke, first, base, headers, executable }) {
  const { BrowserWindow } = await import('electron'), nativeCalls = [], restore = [];
  for (const win of BrowserWindow.getAllWindows()) for (const name of ['show', 'showInactive', 'focus', 'restore']) {
    const original = win[name]; restore.push(() => { win[name] = original; }); win[name] = () => { nativeCalls.push(name); };
  }
  const ui = () => window.webContents.executeJavaScript(`({view:localStorage.getItem('multiagent.view.v1'),groups:localStorage.getItem('multiagent.groups.v1'),focus:document.activeElement?.id})`);
  try {
    const launchFile = path.join(root, 'launch-' + first.sessionId + '.json');
    for (let i = 0; i < 100 && !fs.existsSync(launchFile); i++) await new Promise(resolve => setTimeout(resolve, 100));
    const before = await ui(), cliTime = fs.statSync(launchFile).mtimeMs;
    const response = await fetch(base + '/capabilities', { headers: { ...headers, 'x-acedia-agent-id': first.sessionId } });
    assert.equal(response.status, 200); const diagnostic = await response.json();
    assert.equal(diagnostic.host.name, 'Acedia'); assert.match(diagnostic.host.version, /^\d+\.\d+\.\d+\.\d+$/);
    assert.equal(diagnostic.caller.active, true); assert.equal(diagnostic.caller.registered, true);
    assert.equal(diagnostic.features.routing.supported, true); assert.equal(diagnostic.features.pageCollection.supported, true);
    assert.equal(diagnostic.skills.ready, true); assert.equal(diagnostic.skills.skills.length, 4);
    assert.ok(diagnostic.tools.includes('acedia_connection')); assert.ok(!JSON.stringify(diagnostic).includes(headers.authorization.slice(7)));
    assert.deepEqual(await ui(), before, 'Diagnosis changed selected session, layout or focus');
    assert.equal(fs.statSync(path.join(root, 'launch-' + first.sessionId + '.json')).mtimeMs, cliTime, 'Diagnosis restarted a CLI');
    // Exercise the real provider-specific setup before a dummy Claude PTY.
    // The isolated account home is supplied by the parent harness.
    const claudeId = randomUUID();
    await invoke('spawn_pty', { id: claudeId, aiToolId: 'claude', cwd: root, initCommand: 'claude', launchOptions: { executable }, cols: 80, rows: 24 });
    for (const name of diagnostic.skills.skills.map(item => item.name)) {
      assert.ok(fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'skills', name, 'SKILL.md')), 'Claude account missing ' + name);
    }
    await invoke('kill_pty', { id: claudeId });
    assert.deepEqual(nativeCalls, [], 'Connection diagnosis or provider setup activated a window');
    console.log('ACEDIA_CONNECTION_HOST_CAPABILITIES_BOTH_PROVIDER_SKILLS_NO_MUTATION_NO_FOCUS_OK');
  } finally { restore.forEach(fn => fn()); }
}
