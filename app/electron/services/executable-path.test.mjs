import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { refreshWindowsPath, findExecutableOnPath } from './executable-path.mjs';
import { prepareLaunchCommand, mergeLaunchEnvironment } from './agent-launch.mjs';
import { spawnSync } from 'node:child_process';

describe('Windows executable discovery after installation', () => {
  it('adds current stored PATH entries without changing the parent, priority or account environment', () => {
    const parent = { Path: 'C:\\Preferred;C:\\Windows\\System32', USERPROFILE: 'C:\\Users\\fixture', CLAUDE_CONFIG_DIR: 'profile-a' };
    const fresh = refreshWindowsPath(parent, 'win32', () => ({ Machine: 'c:\\windows\\system32;C:\\New machine', User: '%userprofile%\\New Claude;C:\\Preferred' }));
    expect(fresh).toEqual({ ...parent, Path: 'C:\\Preferred;C:\\Windows\\System32;C:\\New machine;C:\\Users\\fixture\\New Claude' });
    expect(parent.Path).toBe('C:\\Preferred;C:\\Windows\\System32');
    expect(mergeLaunchEnvironment(fresh, { env: [{ name: 'PATH', value: 'C:\\Explicit' }] }, 'win32')).toEqual({
      USERPROFILE: parent.USERPROFILE, CLAUDE_CONFIG_DIR: 'profile-a', PATH: 'C:\\Explicit',
    });
  });

  it('preserves the inherited environment when stored paths cannot be read and does not query Windows on POSIX', () => {
    const env = { PATH: '/fixture/bin', CLAUDE_CONFIG_DIR: 'profile-a' };
    expect(refreshWindowsPath(env, 'win32', () => { throw Error('Registry unavailable'); })).toEqual(env);
    expect(refreshWindowsPath(env, 'linux', () => { throw Error('Unexpected Windows query'); })).toEqual(env);
    expect(findExecutableOnPath('claude', { env, platform: 'linux' })).toBe('claude');
  });

  it('collapses case-variant PATH keys so Windows child processes cannot select the stale value', () => {
    const fresh = refreshWindowsPath({ PATH: 'C:\\CLI', Path: 'C:\\Windows' }, 'win32', () => ({ User: 'C:\\New' }));
    expect(fresh).toEqual({ PATH: 'C:\\CLI;C:\\Windows;C:\\New' });
  });

  it.runIf(process.platform === 'win32')('launches a newly resolved CLI through PowerShell with the original environment and exact arguments', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-new-cli-'));
    try {
      const executable = path.join(root, 'claude.exe'), script = path.join(root, 'fixture.cjs');
      fs.copyFileSync(process.execPath, executable);
      fs.writeFileSync(script, 'process.stdout.write(JSON.stringify({args:process.argv.slice(2),profile:process.env.CLAUDE_CONFIG_DIR}));');
      const env = refreshWindowsPath({ ...process.env, CLAUDE_CONFIG_DIR: 'isolated-profile' }, 'win32', () => ({ User: root }));
      const shell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      const command = prepareLaunchCommand('claude', undefined, { shell, toolId: 'claude', env, extraArgs: [script, '--model', 'sonnet', 'one argument'] });
      expect(command).toContain(executable);
      const result = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command + '; exit $LASTEXITCODE'], {
        env, encoding: 'utf8', windowsHide: true, timeout: 10000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ args: ['--model', 'sonnet', 'one argument'], profile: 'isolated-profile' });
    } finally {
      if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-new-cli-')) throw Error('Invalid fixture cleanup path');
      fs.rmSync(root, { recursive: true });
    }
  });
});
