import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Collector } from './collector.mjs';

// Hosts can kill MCP processes before their final transcript write. An enrolled,
// enabled collector therefore owns a separate watcher that survives the CLI.
export async function ensureWatcher(home) {
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  let executable = process.execPath, args = [cli, 'watch', '--home', home];
  if (process.platform === 'win32') {
    const literal = value => "'" + value.replaceAll("'", "''") + "'";
    const argumentLine = ['"' + cli + '"', 'watch', '--home', '"' + home + '"'].join(' ');
    // Codex tears down its Windows job (including detached children). WMI starts
    // the watcher under the current user's token outside that CLI-owned job.
    const commandLine = '"' + process.execPath + '" ' + argumentLine;
    const script = `$ErrorActionPreference='Stop'; $startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; $result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${literal(commandLine)};ProcessStartupInformation=$startup}; if($result.ReturnValue -ne 0){throw 'Usage watcher process creation failed'}`;
    executable = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
  }
  const child = spawn(executable, args, {
    detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (process.platform === 'win32') await new Promise((resolve, reject) => {
    let error = ''; child.stderr.on('data', data => { error = (error + data).slice(-2000); });
    child.once('exit', code => code === 0 ? resolve() : reject(Error('Could not start usage watcher: ' + error)));
    child.once('error', reject);
  });
  else { child.on('error', () => {}); child.unref(); }
}
export async function watch(home) {
  const collector = new Collector(home);
  collector.db.exec('CREATE TABLE IF NOT EXISTS watcher(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL)');
  const claim = collector.db.prepare('INSERT INTO watcher VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE watcher.expires<?');
  if (!claim.run(collector.owner, Date.now() + 45000, Date.now()).changes) { await collector.stop(); return; }
  let timer, finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true; clearTimeout(timer);
    await collector.running;
    collector.db.prepare('DELETE FROM watcher WHERE owner=?').run(collector.owner);
    await collector.stop();
  };
  const cycle = async () => {
    if (finished) return;
    try {
      if (!collector.config().enabled) { await finish(); return; }
      const renewed = collector.db.prepare('UPDATE watcher SET expires=? WHERE owner=?').run(Date.now() + 45000, collector.owner);
      if (!renewed.changes) { await finish(); return; }
      await collector.tick();
    } catch { /* Collector keeps offline/error status and the queued events. */ }
    if (!finished) timer = setTimeout(cycle, 5000);
  };
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void finish());
  await cycle();
}
