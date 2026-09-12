#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { unseal } from './runtime/credentials.mjs';
const args = process.argv.slice(2), index = args.indexOf('--home');
if (!args.includes('--copy') && !args.includes('--stdout')) {
  console.log('node admin.mjs --copy [--home <data folder>] (Windows clipboard)\nnode admin.mjs --stdout [--home <data folder>] (explicit secret output)');
} else {
  const home = path.resolve(index < 0 ? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data') : args[index + 1]);
  const key = process.env.ACEDIA_USAGE_ADMIN_TOKEN || unseal(fs.readFileSync(path.join(home, 'admin.protected'), 'utf8'));
  if (args.includes('--copy')) {
    if (process.platform !== 'win32') throw Error('--copy requires Windows; use --stdout locally if needed');
    const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'],
      { input: key, windowsHide: true, encoding: 'utf8', timeout: 10000 });
    if (result.status !== 0 || result.error) throw Error('Could not copy administrator key');
    console.log('Administrator key copied. Paste into the server login, then clear the clipboard.');
  } else process.stdout.write(key + '\n');
}
