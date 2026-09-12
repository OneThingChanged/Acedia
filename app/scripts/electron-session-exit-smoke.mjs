import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { TerminalSessionService } from '../electron/services/terminal-session-service.mjs';
import { createTerminalLauncher } from '../electron/services/terminal-launcher.mjs';

const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const env = { ...process.env, ACEDIA_EXIT_SMOKE_NODE: process.execPath };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill(), 45000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(timer);
  if (code !== 0) throw Error(`Session exit smoke failed: ${code}`);
} else {
  const { app } = require('electron');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-session-exit-'));
  app.setPath('userData', path.join(directory, 'profile'));
  app.whenReady().then(async () => {
  let result = 0;
  try {
    const fixture = path.join(directory, 'cli.cjs');
    fs.writeFileSync(fixture, "console.log('CLI_READY');require('node:readline').createInterface({input:process.stdin}).once('line',line=>{console.log('CLI_FINISHED');process.exit(line==='/quit'?0:7)});");
    const shells = [path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      path.join(process.env.ProgramFiles, 'PowerShell/7/pwsh.exe')].filter(file => fs.existsSync(file));
    assert.ok(shells.length);
    for (const shell of shells) {
      for (const input of ['/quit', 'failure']) {
        let resolveExit;
        const ended = new Promise(resolve => { resolveExit = resolve; });
        const sessions = new TerminalSessionService({ broadcastExit: resolveExit });
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const launch = createTerminalLauncher({ terminalSessions: sessions,
          hookService: { port: 0, token: '', setupProject: async () => {}, setupCodexHome: async () => {} },
          ensureBrowserIntegrationReady: async () => {}, waitForHooks: async () => {},
          accountsForTool: () => null, accountBindings: new Map(), accountSwitches: new Set(),
          defaultShell: () => shell, sshPasswords: new Map(), browserMcpScriptPath: '',
          baseEnv: env, spawnProcess: require('node-pty').spawn });
        let timer;
        try {
          await launch({ id: 'fixture', aiToolId: 'codex', cwd: directory,
            initCommand: 'codex', launchOptions: { executable: process.env.ACEDIA_EXIT_SMOKE_NODE, args: [fixture] } });
          let output = '', sent = false;
          sessions.subscribeData('fixture', { onData({ data }) {
            output += data;
            if (!sent && output.includes('CLI_READY')) { sent = true; sessions.write('fixture', input + '\r'); }
          } });
          const event = await Promise.race([ended, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('CLI exited but PTY did not settle')), 12000);
          })]);
          assert.equal(event.exitCode, input === '/quit' ? 0 : 7);
          assert.equal(sessions.has('fixture'), false);
          assert.ok(output.includes('CLI_FINISHED'));
          console.log(`SESSION_EXIT_OK ${path.basename(shell)} ${input}`);
        } finally { clearTimeout(timer); sessions.closeAll(); }
      }
    }
  } catch (error) { console.error(error); result = 1; }
  // Keep isolated diagnostics on failure; the OS temp directory is not user data.
  app.exit(result);
  });
}
