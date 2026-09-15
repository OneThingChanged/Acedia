import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const antigravityDirectory = () => path.join(os.homedir(), '.gemini', 'antigravity-cli');
export const antigravityQuotaPath = () => path.join(antigravityDirectory(), 'acedia-statusline', 'quota.json');

export function installAntigravityStatusline({ directory = antigravityDirectory(), executable = process.execPath, platform = process.platform } = {}) {
  const settingsPath = path.join(directory, 'settings.json');
  const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf8')) : {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid Antigravity settings');
  const target = path.join(directory, 'acedia-statusline');
  const launcher = path.join(target, platform === 'win32' ? 'bridge.cmd' : 'bridge.sh');
  // Go's Windows command runner escapes embedded quotes before cmd.exe sees
  // them. Encode paths rather than depending on cmd's nested quoting rules.
  const ps = `& '${launcher.replaceAll("'", "''")}'`;
  const command = platform === 'win32'
    ? `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, 'utf16le').toString('base64')}`
    : `"${launcher}"`;
  fs.mkdirSync(target, { recursive: true });
  if (settings.statusLine?.command !== command && settings.statusLine?.command !== `"${launcher}"` && settings.statusLine?.command !== `call "${launcher}"`) {
    fs.writeFileSync(path.join(target, 'original.json'), JSON.stringify(settings.statusLine ?? null), { mode: 0o600 });
  }
  fs.copyFileSync(fileURLToPath(new URL('./antigravity-statusline.cjs', import.meta.url)), path.join(target, 'bridge.cjs'));
  const script = path.join(target, 'bridge.cjs');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  fs.writeFileSync(launcher, platform === 'win32'
    ? `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${executable}" "${script}"\r\n`
    : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(executable)} ${quote(script)}\n`, { mode: 0o700 });
  const original = JSON.parse(fs.readFileSync(path.join(target, 'original.json'), 'utf8'));
  settings.statusLine = { ...(original || {}), type: 'command', command, enabled: true,
    stack_with_default: original?.command && original.enabled !== false ? original.stack_with_default ?? false : true };
  const next = JSON.stringify(settings, null, 2) + '\n';
  if (!fs.existsSync(settingsPath) || fs.readFileSync(settingsPath, 'utf8') !== next) fs.writeFileSync(settingsPath, next);
}

export function readAntigravityQuota(file = antigravityQuotaPath(), now = Date.now()) {
  if (!fs.existsSync(file)) return null;
  try {
    if (fs.statSync(file).size > 128 * 1024) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.schemaVersion !== 1 || !Number.isFinite(data.updatedAt) || data.updatedAt > now + 60_000 ||
        !/^[a-f0-9]{64}$/.test(data.account)) return null;
    const snapshots = Object.entries(data.quota || {}).slice(0, 128).flatMap(([id, value]) => {
      if (!/^[a-zA-Z0-9_. -]{1,120}$/.test(id) || typeof value?.remainingFraction !== 'number' ||
          !Number.isFinite(value.remainingFraction) || value.remainingFraction < 0 || value.remainingFraction > 1) return [];
      return [{ limitId: `agy:${id}`, limitName: id, planType: typeof data.plan === 'string' ? data.plan.slice(0, 80) : null,
        primary: { usedPercent: (1 - value.remainingFraction) * 100, windowMinutes: /-weekly$/i.test(id) ? 10080 : /-5h$/i.test(id) ? 300 : null,
          resetsAt: Number.isSafeInteger(value.resetsAt) && value.resetsAt > 0 ? value.resetsAt : null }, secondary: null,
        hasCredits: false, unlimited: false, creditBalance: null, sourcePath: null, updatedAt: Math.floor(data.updatedAt / 1000) }];
    });
    const grouped = new Map();
    for (const snapshot of snapshots) {
      const match = /^(.*)-(5h|weekly)$/.exec(snapshot.limitName);
      if (!match) { grouped.set(snapshot.limitId, snapshot); continue; }
      const key = `agy:${match[1]}`;
      const entry = grouped.get(key) || { ...snapshot, limitId: key,
        limitName: match[1] === 'gemini' ? 'Gemini' : match[1], primary: null, secondary: null };
      entry[match[2] === '5h' ? 'primary' : 'secondary'] = snapshot.primary;
      grouped.set(key, entry);
    }
    return { snapshots: [...grouped.values()], updatedAt: data.updatedAt,
      status: snapshots.length && now - data.updatedAt < 5 * 60_000 ? 'success' : 'unavailable' };
  } catch { return null; }
}
