#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Collector, defaultCollectorHome } from './collector.mjs';
import { createUsageServer, mcpResult } from './server.mjs';
import { request, CAPABILITIES } from './protocol.mjs';
import { ensureWatcher, watch } from './watcher.mjs';

const argv = process.argv.slice(2), command = argv.shift();
const arg = (name, fallback = '') => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : fallback; };
const home = path.resolve(arg('home', defaultCollectorHome()));
const out = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
async function main() {
  if (command === 'watch') { await watch(home); return; }
  if (command === 'server') {
    const service = createUsageServer({ databasePath: path.join(home, 'server.db'), adminToken: process.env.ACEDIA_USAGE_ADMIN_TOKEN });
    const port = Number(arg('port', '3007')), host = arg('host', '127.0.0.1');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
    service.server.listen(port, host, () => out({ listening: `http://${host}:${port}`, database: path.join(home, 'server.db') }));
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await service.close(); process.exit(0); });
    return;
  }
  if (command === 'install') {
    const provider = arg('provider'), target = arg('target');
    if (!['codex', 'claude'].includes(provider) || !path.isAbsolute(target)) throw Error('install --provider codex|claude --target <absolute new plugin directory>');
    if (fs.existsSync(target)) throw Error('Target already exists; choose a new directory');
    const source = path.dirname(fileURLToPath(import.meta.url)), runtime = path.join(target, 'runtime');
    fs.cpSync(path.join(source, 'plugins', 'acedia-usage'), target, { recursive: true });
    fs.mkdirSync(runtime, { recursive: true });
    for (const entry of fs.readdirSync(source)) if (/\.(mjs|js|html)$/.test(entry) && !entry.includes('.test.')) fs.copyFileSync(path.join(source, entry), path.join(runtime, entry));
    const manifestDir = path.join(target, provider === 'codex' ? '.codex-plugin' : '.claude-plugin');
    if (!fs.existsSync(path.join(manifestDir, 'plugin.json'))) throw Error('Missing provider manifest');
    const manifestPath = path.join(target, '.codex-plugin', 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.mcpServers = './.mcp.json';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(target, '.mcp.json'), JSON.stringify({ mcpServers: { acedia_usage: { command: process.execPath, args: [path.join(runtime, 'cli.mjs'), 'mcp', '--home', home] } } }, null, 2));
    out({ plugin: target, provider, collectorHome: home, next: 'Install this local plugin using your host plugin manager. Enroll and configure the collector before enabling collection.', capabilities: CAPABILITIES }); return;
  }
  if (!['enroll', 'configure', 'status', 'accounts', 'scan', 'run', 'mcp'].includes(command)) {
    out({ commands: ['server --port 3007 (ACEDIA_USAGE_ADMIN_TOKEN required)', 'enroll --server <origin> --code-file <file> --name <device>', 'accounts', 'configure --file <JSON>', 'status', 'scan', 'run', 'install --provider codex|claude --target <new absolute directory>', 'mcp'], profile: '--home <directory>', node: '22.13+', capabilities: CAPABILITIES }); return;
  }
  const collector = new Collector(home);
  if (command === 'run' || command === 'mcp') {
    if (command === 'mcp' && collector.config().enabled) await ensureWatcher(home);
    collector.start();
    if (command === 'run') { collector.timer.ref(); out({ running: true, home }); }
    const finish = async () => { await collector.tick(); await collector.stop(); };
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await finish(); process.exit(0); });
    if (command === 'mcp') {
      const input = readline.createInterface({ input: process.stdin });
      let chain = Promise.resolve();
      input.on('line', line => { chain = chain.then(async () => {
        let rpc;
        try {
          rpc = JSON.parse(line); if (rpc.id === undefined) return;
          let result;
          if (rpc.method === 'tools/call' && rpc.params?.name === 'usage_summary') {
            await collector.tick();
            const c = collector.config(); if (!c.credential) throw Error('Collector is not enrolled');
            const summary = await request(c.server, '/v1/summary', { credential: collector.credential() });
            result = mcpResult(rpc, () => summary);
          } else result = mcpResult(rpc, () => ({}));
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, ...result }) + '\n');
        } catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: rpc?.id ?? null, error: { code: -32603, message: String(error.message).slice(0, 200) } }) + '\n'); }
      }); });
      input.once('close', () => { void chain.then(finish).catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; }); });
    }
    return;
  }
  try {
    if (command === 'enroll') out(await collector.enroll(arg('server'), fs.readFileSync(arg('code-file'), 'utf8').trim(), arg('name')));
    if (command === 'configure') out(await collector.configure(JSON.parse(fs.readFileSync(arg('file'), 'utf8'))));
    if (command === 'accounts') out(await collector.accounts());
    if (command === 'status') out(collector.status());
    if (command === 'scan') out(await collector.tick());
  } finally { await collector.stop(); }
}
main().catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; });
