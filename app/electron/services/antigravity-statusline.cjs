// Standalone bridge copied outside app.asar; never persist the raw CLI payload.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

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
      const snapshot = sanitizeQuota(JSON.parse(input));
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
module.exports = { sanitizeQuota };
