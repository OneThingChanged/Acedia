import path from 'node:path';
import { spawnSync } from 'node:child_process';

let storedPaths;
let storedAt = 0;
function readWindowsPaths(env) {
  if (storedPaths && Date.now() - storedAt < 5000) return storedPaths;
  const shell = path.win32.join(env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); '
    + '@{ User = [Environment]::GetEnvironmentVariable("Path", "User"); '
    + 'Machine = [Environment]::GetEnvironmentVariable("Path", "Machine") } | ConvertTo-Json -Compress';
  const result = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    env, encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 128 * 1024,
  });
  try { storedPaths = result.status === 0 ? JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()) : {}; }
  catch { storedPaths = {}; }
  storedAt = Date.now();
  return storedPaths;
}

// Refresh only newly launched children. Keep inherited PATH entries first and
// leave the parent and already-running sessions alone. Launch-option overrides
// are applied afterwards, so an explicit per-session PATH remains authoritative.
export function refreshWindowsPath(env, platform = process.platform, readPaths = readWindowsPaths) {
  const next = { ...env };
  if (platform !== 'win32') return next;
  const pathKeys = Object.keys(next).filter(name => name.toLowerCase() === 'path');
  const key = pathKeys[0] || 'Path';
  let stored;
  try { stored = readPaths(env); } catch { return next; }
  const variables = new Map(Object.entries(env).map(([name, value]) => [name.toUpperCase(), value]));
  const expand = value => String(value || '').replace(/%([^%]+)%/g, (match, name) => variables.get(name.toUpperCase()) ?? match);
  const seen = new Set(), entries = [];
  for (const value of [...pathKeys.map(name => next[name]), stored?.Machine, stored?.User]) {
    for (const raw of expand(value).split(';')) {
      const directory = raw.trim().replace(/^"(.*)"$/, '$1');
      const identity = path.win32.normalize(directory).toLowerCase();
      if (!directory || seen.has(identity)) continue;
      seen.add(identity); entries.push(directory);
    }
  }
  if (entries.length) {
    for (const name of pathKeys) delete next[name];
    next[key] = entries.join(';');
  }
  return next;
}

export function findExecutableOnPath(name, { env = process.env, platform = process.platform } = {}) {
  if (platform !== 'win32') return name;
  const where = path.win32.join(env.SystemRoot || 'C:/Windows', 'System32/where.exe');
  const lookup = environment => {
    const result = spawnSync(where, [name], { env: environment, encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (result.status !== 0) return null;
    return result.stdout.split(/\r?\n/).map(line => line.trim())
      .find(file => file && !file.toLowerCase().includes('\\windowsapps\\')) || null;
  };
  return lookup(env) || lookup(refreshWindowsPath(env, platform));
}
