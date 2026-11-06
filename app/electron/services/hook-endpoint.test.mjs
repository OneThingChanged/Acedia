import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { HookService, hookInternals } from './hook-service.mjs';

async function runHelper(service, kind, env) {
  const binary = kind === 'node' ? process.execPath : 'powershell.exe';
  const args = kind === 'node' ? [service.nodeHelperPath] : ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', service.helperPath];
  const child = spawn(binary, [...args, 'tool-start', 'PreToolUse'], { env: { ...process.env, ...env, MULTIAGENT_AGENT_ID: 'fixture' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  child.stdin.end(JSON.stringify({ session_id: 'fixture-session', tool_name: 'Shell', tool_input: { command: '한글 보존' } }));
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(output || 'Helper failed'))); });
}

describe('hook endpoint selection across host restarts', () => {
  for (const kind of process.platform === 'win32' ? ['powershell', 'node'] : ['node']) {
    it.each(['stale-env', 'missing-info', 'invalid-info', ...(kind === 'node' ? ['remote-env'] : [])])(`${kind}: %s does not add a failed old-host request`, async mode => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-hook-endpoint-'));
      const events = []; let staleRequests = 0;
      const stale = http.createServer((_request, response) => { staleRequests++; response.writeHead(401).end(); });
      const service = new HookService({ baseDir: root, sessionService: { noteHook: async () => {} }, sendEvent: (_name, payload) => events.push(payload) });
      try {
        await new Promise(resolve => stale.listen(0, '127.0.0.1', resolve)); await service.start();
        const runtime = { MULTIAGENT_PORT: String(service.port), MULTIAGENT_TOKEN: service.token };
        if (mode === 'remote-env') {
          const encoded = hookInternals.remoteBootstrap('codex').match(/Buffer\.from\("([A-Za-z0-9+/=]+)","base64"\)/)[1];
          fs.writeFileSync(service.nodeHelperPath, Buffer.from(encoded, 'base64'));
          fs.writeFileSync(service.infoPath, JSON.stringify({ port: stale.address().port, token: 'unrelated-local-host' }));
        } else if (mode === 'missing-info') fs.unlinkSync(service.infoPath);
        else if (mode === 'invalid-info') fs.writeFileSync(service.infoPath, '{"port":65536,"token":"invalid"}');
        else { runtime.MULTIAGENT_PORT = String(stale.address().port); runtime.MULTIAGENT_TOKEN = 'stale-fixture-token'; }
        await runHelper(service, kind, runtime);
        expect(staleRequests).toBe(0); expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ id: 'fixture', session_id: 'fixture-session', tool_name: 'Shell' });
        expect(JSON.parse(events[0].tool_input)).toEqual({ command: '한글 보존' });
      } finally {
        stale.closeAllConnections(); await new Promise(resolve => stale.close(resolve)); await service.stop();
        if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-hook-endpoint-')) throw new Error('Unexpected hook fixture');
        fs.rmSync(root, { recursive: true });
      }
    }, 15000);
  }
});
