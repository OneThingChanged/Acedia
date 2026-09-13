import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { Collector, defaultCollectorHome } from './runtime/collector.mjs';
import { loginIdentity } from './runtime/metadata.mjs';
import { request, serverUrl } from './runtime/protocol.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));
const input = createInterface({ input: process.stdin, output: process.stdout });
const run = (file, args) => {
  const result = spawnSync(file, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Command failed: ' + file);
};
try {
  console.log('Acedia Usage — Codex CLI collector setup (Node.js 22.13+)');
  console.log('Sends token counts, model/settings, account identity, Windows user and local IP. No conversation content.');
  const origin = (await input.question('Server URL (e.g. http://192.168.1.20:3007): ')).trim();
  let lan = false;
  if (new URL(origin).protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
    lan = (await input.question('Private LAN HTTP is unencrypted. Enable for this collector? [y/N]: ')).trim().toLowerCase() === 'y';
    if (!lan) throw Error('Use an HTTPS server URL or explicitly enable LAN mode');
    process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP = '1';
  }
  const server = serverUrl(origin);
  const codexHome = (await input.question('Codex home (Enter = CODEX_HOME or ~/.codex): ')).trim() || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const sessions = path.resolve(codexHome, 'sessions');
  const identity = loginIdentity(sessions);
  if (!identity || !fs.existsSync(sessions)) throw Error('Sign in to Codex and start a session first, then retry with its Codex home');
  const target = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local/share'), 'AcediaUsageClient');
  const home = defaultCollectorHome();
  const marker = path.join(target, 'setup.json');
  const expected = JSON.stringify({ server, home, sessions });
  if (fs.existsSync(path.join(target, 'client.json'))) throw Error('Client is already installed at ' + target + '. Use its run.cmd; existing installation was preserved.');
  if (fs.existsSync(target) && (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== expected)) throw Error('Existing installation directory does not match this setup');
  const collector = new Collector(home);
  try {
    if (collector.config().credential && (!fs.existsSync(marker) || collector.config().server !== server)) throw Error('This Windows user already has an enrolled collector. Existing profile was preserved.');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(marker, expected);
    if (!collector.config().credential) {
      const code = (await input.question('One-time device enrollment code: ')).trim();
      await collector.enroll(server, code, os.hostname());
    }
    const { account } = await request(server, '/v1/accounts/resolve', { credential: collector.credential(), body: { provider: 'codex', identity } });
    await collector.configure({ enabled: false, roots: [{ provider: 'codex', path: sessions, accountId: account.id }] });
  } finally { await collector.stop(); }
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(path.join(source, 'runtime'), path.join(target, 'runtime'), { recursive: true });
  fs.copyFileSync(path.join(source, 'run.mjs'), path.join(target, 'run.mjs'));
  fs.writeFileSync(path.join(target, 'run.cmd'), '@echo off\r\nnode "%~dp0run.mjs"\r\nif errorlevel 1 pause\r\n');
  const plugin = path.join(target, 'plugins/acedia-usage');
  if (!fs.existsSync(plugin)) run(process.execPath, [path.join(target, 'runtime/cli.mjs'), 'install', '--provider', 'codex', '--target', plugin, '--home', home]);
  const mcpPath = path.join(plugin, '.mcp.json');
  const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  mcp.mcpServers.acedia_usage.env = { ACEDIA_USAGE_ALLOW_LAN_HTTP: lan ? '1' : '0' };
  fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2));
  fs.mkdirSync(path.join(target, '.agents/plugins'), { recursive: true });
  // Dedicated team marketplace; never alters the user's personal marketplace.
  fs.writeFileSync(path.join(target, '.agents/plugins/marketplace.json'), JSON.stringify({
    name: 'acedia-usage-company', interface: { displayName: 'Acedia Usage' },
    plugins: [{ name: 'acedia-usage', source: { source: 'local', path: './plugins/acedia-usage' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
  }, null, 2));
  const ready = new Collector(home);
  try { const config = ready.config(); await ready.configure({ enabled: true, roots: config.roots }); }
  finally { await ready.stop(); }
  fs.writeFileSync(path.join(target, 'client.json'), JSON.stringify({ home, lan }));
  run(process.execPath, [path.join(target, 'run.mjs')]);
  console.log('\nCollector installed and started. After a reboot, run: ' + path.join(target, 'run.cmd'));
  console.log('For Codex plugin integration, run these commands and open a new Codex session:');
  console.log('codex plugin marketplace add "' + target + '"');
  console.log('codex plugin add acedia-usage@acedia-usage-company');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { input.close(); }
