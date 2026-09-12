import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loginIdentity, validateQuota } from './metadata.mjs';

function executable() {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = (process.env.PATH || '').split(path.delimiter).map(p => path.join(p, name));
  if (process.env.LOCALAPPDATA) candidates.unshift(path.join(process.env.LOCALAPPDATA, 'Programs/OpenAI/Codex/bin/codex.exe'));
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}
// Account-only RPCs; no thread/turn, inference, hook, or reset-credit consumption.
export function fetchAccountQuota(root, { start = spawn, command = executable(), timeoutMs = 8000 } = {}) {
  const identity = loginIdentity(root.path);
  if (!identity) return Promise.resolve({ identity: null, status: 'login_required', quota: null });
  if (!command) return Promise.resolve({ identity, status: 'cli_missing', quota: null });
  return new Promise(resolve => {
    let child, timer, buffer = '', expected = 1, settled = false;
    const finish = (status, quota = null) => {
      if (settled) return; settled = true; clearTimeout(timer);
      try { child?.stdin.end(); if (child?.exitCode == null) child?.kill(); } catch {}
      resolve({ identity, status, quota });
    };
    const send = rpc => { try { child.stdin.write(JSON.stringify(rpc) + '\n'); } catch { finish('failed'); } };
    try {
      child = start(command, ['app-server'], { env: { ...process.env, CODEX_HOME: path.dirname(root.path) }, cwd: path.dirname(root.path), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      timer = setTimeout(() => finish('timeout'), timeoutMs);
      child.on('error', () => finish('failed')); child.on('exit', () => finish('failed')); child.stdin.on('error', () => finish('failed'));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk; if (buffer.length > 1024 * 1024) return finish('failed');
        let end;
        while (!settled && (end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); let rpc;
          try { rpc = JSON.parse(line); } catch { continue; }
          if (rpc.id !== expected || rpc.method) continue;
          if (rpc.error || !rpc.result) return finish('failed');
          if (expected === 1) { expected = 2; send({ method: 'initialized' }); send({ id: 2, method: 'account/read', params: { refreshToken: false } }); }
          else if (expected === 2) {
            const account = rpc.result.account;
            if (!account) return finish('login_required');
            if (account.type === 'apiKey') return finish('unavailable');
            if (identity.email && account.email && identity.email.toLowerCase() !== account.email.toLowerCase()) return finish('identity_changed');
            expected = 3; send({ id: 3, method: 'account/rateLimits/read' });
          } else {
            if (loginIdentity(root.path)?.id !== identity.id) return finish('identity_changed');
            const b = rpc.result.rateLimitsByLimitId?.codex || rpc.result.rateLimits;
            if (!b || (b.limitId && b.limitId !== 'codex')) return finish('unavailable');
            const window = w => w && Number.isFinite(w.usedPercent) ? { usedPercent: Math.min(100, Math.max(0, w.usedPercent)), windowMinutes: w.windowDurationMins ?? null, resetsAt: w.resetsAt ?? null } : null;
            try { finish('success', validateQuota({ primary: window(b.primary), secondary: window(b.secondary), plan: b.planType ?? null, updatedAt: Date.now() })); } catch { finish('failed'); }
          }
        }
      });
      send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'acedia_usage_collector', version: '0.1.0' } } });
    } catch { finish('failed'); }
  });
}
