import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serverUrl, request, token } from './protocol.mjs';
import { createUsageServer } from './server.mjs';
import { Collector } from './collector.mjs';

it('requires opt-in for RFC1918 HTTP and still refuses public IPs and arbitrary hostnames', () => {
  const old = process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP;
  try {
    delete process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP;
    expect(() => serverUrl('http://192.168.1.2:3007')).toThrow();
    process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP = '1';
    for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.2']) expect(serverUrl(`http://${host}:3007`)).toBe(`http://${host}:3007`);
    for (const host of ['8.8.8.8', '172.32.0.1', '169.254.1.1', 'example.com', '[::ffff:192.168.1.2]']) expect(() => serverUrl(`http://${host}:3007`)).toThrow();
    expect(() => serverUrl('http://user:pass@192.168.1.2')).toThrow();
  } finally { if (old === undefined) delete process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP; else process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP = old; }
});

it.skipIf(process.platform !== 'win32')('packages a clean server and installs an isolated client with enrollment and a watcher', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-distribution-'));
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const target = path.join(root, 'server'), local = path.join(root, 'local');
  let service, collector;
  try {
    execFileSync(process.execPath, [path.join(repo, 'app/scripts/package-usage-server.mjs'), target], { windowsHide: true });
    expect(fs.existsSync(target + '.zip')).toBe(true);
    const zip = fs.readFileSync(path.join(target, 'downloads/acedia-usage-client.zip'));
    expect(zip.includes(Buffer.from('.codex-plugin/plugin.json'))).toBe(true);
    expect(zip.includes(Buffer.from('admin.protected'))).toBe(false);
    const admin = token();
    service = createUsageServer({ databasePath: path.join(root, 'test.db'), adminToken: admin, clientPackagePath: path.join(target, 'downloads/acedia-usage-client.zip') });
    await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${service.server.address().port}`;
    expect(Buffer.from(await (await fetch(origin + '/downloads/acedia-usage-client.zip')).arrayBuffer()).equals(zip)).toBe(true);
    expect((await fetch(origin + '/downloads/admin.protected')).status).toBe(401);
    const employee = await request(origin, '/v1/admin/employees', { credential: admin, body: { name: 'Fixture Windows User' } });
    const enrollment = await request(origin, '/v1/admin/enrollments', { credential: admin, body: { employeeId: employee.id } });
    const codex = path.join(root, 'codex'); fs.mkdirSync(path.join(codex, 'sessions'), { recursive: true });
    const payload = Buffer.from(JSON.stringify({ sub: 'fixture', email: 'fixture@example.test' })).toString('base64url');
    fs.writeFileSync(path.join(codex, 'auth.json'), JSON.stringify({ tokens: { account_id: 'fixture', id_token: `x.${payload}.x` } }));
    const child = spawn(process.execPath, [path.join(target, 'client/setup.mjs')], { windowsHide: true,
      env: { ...process.env, LOCALAPPDATA: local, CODEX_HOME: codex, PATH: path.join(process.env.SystemRoot, 'System32') }, stdio: ['pipe','pipe','pipe'] });
    let output = '', stage = 0;
    const prompts = [['Server URL', origin], ['Codex home', codex], ['One-time device', enrollment.code]];
    child.stdout.on('data', chunk => { output += chunk; if (stage < prompts.length && output.includes(prompts[stage][0])) child.stdin.write(prompts[stage++][1] + '\n'); });
    child.stderr.on('data', chunk => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    expect(code, output).toBe(0);
    const installed = path.join(local, 'AcediaUsageClient');
    expect(fs.existsSync(path.join(installed, 'plugins/acedia-usage/.codex-plugin/plugin.json'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(installed, 'plugins/acedia-usage/.mcp.json'))).mcpServers.acedia_usage.env.ACEDIA_USAGE_ALLOW_LAN_HTTP).toBe('0');
    collector = new Collector(path.join(local, 'AcediaUsage'));
    expect(collector.config().enabled).toBe(true);
    expect(collector.config().employee.id).toBe(employee.id);
    expect(collector.config().roots[0].path).toBe(path.join(codex, 'sessions'));
    const accounts = await collector.accounts(); expect(accounts[0].loginEmail).toBe('fixture@example.test');
    expect(accounts[0].kind).toBe('personal');
    const records = [
      { type: 'session_meta', payload: { id: 'distribution-fixture' } },
      { type: 'turn_context', payload: { model: 'gpt-6-astra', effort: 'low' } },
      { type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 40, reasoning_output_tokens: 10, total_tokens: 140 }, total_token_usage: { total_tokens: 140 } } } },
    ];
    fs.writeFileSync(path.join(codex, 'sessions/fixture.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
    let summary;
    for (let attempt = 0; attempt < 12; attempt++) {
      summary = await request(origin, '/v1/summary', { credential: admin });
      if (summary.total === 140) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    expect(summary.total).toBe(140);
    expect(summary.recent[0].sender.windowsUser).toBeTruthy();
    const codexExe = (process.env.PATH || '').split(path.delimiter).map(p => path.join(p, 'codex.exe')).find(p => fs.existsSync(p));
    if (codexExe) {
      const env = { ...process.env, CODEX_HOME: path.join(root, 'plugin-profile') };
      fs.mkdirSync(env.CODEX_HOME);
      execFileSync(codexExe, ['plugin', 'marketplace', 'add', installed, '--json'], { env, windowsHide: true, timeout: 10000 });
      const added = execFileSync(codexExe, ['plugin', 'add', 'acedia-usage@acedia-usage-company', '--json'], { env, windowsHide: true, timeout: 10000, encoding: 'utf8' });
      expect(added).toContain('acedia-usage');
    }
  } finally {
    if (!collector && fs.existsSync(path.join(local, 'AcediaUsage/collector.db'))) collector = new Collector(path.join(local, 'AcediaUsage'));
    if (collector) { collector.pause(); await new Promise(resolve => setTimeout(resolve, 6000)); await collector.stop(); }
    if (service) await service.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
