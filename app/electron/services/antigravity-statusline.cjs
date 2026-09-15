// Standalone bridge copied outside app.asar; never persist the raw CLI payload.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const http = require('node:http');

function sessionEvent(payload, env = process.env) {
  const session = payload?.conversation_id || payload?.session_id;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(session || '') ||
      !env.MULTIAGENT_AGENT_ID || !env.MULTIAGENT_AGY_LAUNCH_ID || !env.MULTIAGENT_TOKEN) return null;
  return { id: env.MULTIAGENT_AGENT_ID, token: env.MULTIAGENT_TOKEN, event: 'session-start',
    hook_event_name: 'AntigravitySession', session_id: session,
    launch_id: env.MULTIAGENT_AGY_LAUNCH_ID, cwd: typeof payload.cwd === 'string' ? payload.cwd : null };
}

function reportSession(payload) {
  const event = sessionEvent(payload);
  const port = Number(process.env.MULTIAGENT_PORT);
  if (!event || !Number.isInteger(port) || port < 1 || port > 65535) return;
  const request = http.request({ hostname: '127.0.0.1', port, path: '/event', method: 'POST',
    headers: { 'content-type': 'application/json' }, timeout: 1500 }, response => response.resume());
  request.on('timeout', () => request.destroy()); request.on('error', () => {});
  request.end(JSON.stringify(event));
}

function sanitizeQuota(payload, now = Date.now()) {
  const quota = {};
  for (const [id, value] of Object.entries(payload?.quota || {}).slice(0, 128)) {
    if (!/^[a-zA-Z0-9_. -]{1,120}$/.test(id) || typeof value?.remaining_fraction !== 'number' ||
        !Number.isFinite(value.remaining_fraction) || value.remaining_fraction < 0 || value.remaining_fraction > 1) continue;
    const reset = Date.parse(value.reset_time);
    quota[id] = { remainingFraction: value.remaining_fraction, resetsAt: Number.isFinite(reset) ? Math.floor(reset / 1000) : null };
  }
  return { schemaVersion: 1, updatedAt: now, quota,
    account: createHash('sha256').update(String(payload?.email || 'default').trim().toLowerCase()).digest('hex'),
    plan: typeof payload?.plan_tier === 'string' ? payload.plan_tier.slice(0, 80) : null };
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (input.length > 1024 * 1024) process.exit(0); });
  process.stdin.on('end', () => {
    const directory = __dirname;
    try {
      const payload = JSON.parse(input);
      reportSession(payload);
      const snapshot = sanitizeQuota(payload);
      const temporary = path.join(directory, `quota-${process.pid}.tmp`);
      try {
        fs.writeFileSync(temporary, JSON.stringify(snapshot), { mode: 0o600 });
        fs.renameSync(temporary, path.join(directory, 'quota.json'));
      } finally { fs.rmSync(temporary, { force: true }); }
    } catch { /* Status display must never interrupt the CLI. */ }
    try {
      const original = JSON.parse(fs.readFileSync(path.join(directory, 'original.json'), 'utf8'));
      if (original?.command && original.enabled !== false) {
        const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
        const result = spawnSync(original.command, { shell: true, input, encoding: 'utf8', env,
          windowsHide: true, timeout: 2000, maxBuffer: 1024 * 1024 });
        if (result.stdout) process.stdout.write(result.stdout);
      }
    } catch { /* Preserve a functioning CLI even if a custom display fails. */ }
  });
}
module.exports = { sanitizeQuota, sessionEvent };
