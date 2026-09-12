import { spawnSync } from 'node:child_process';
import path from 'node:path';
function dpapi(value, decrypt) {
  const code = 'Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); ' + (decrypt
    ? '[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))'
    : '[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))');
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', code], { input: value, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (result.status !== 0 || result.error) throw Error('Could not access device credential protection');
  return result.stdout.trim();
}
export const seal = value => process.platform === 'win32' ? 'dpapi:' + dpapi(value, false) : 'file:' + value;
export const unseal = value => value.startsWith('dpapi:') ? dpapi(value.slice(6), true) : value.startsWith('file:') ? value.slice(5) : '';
