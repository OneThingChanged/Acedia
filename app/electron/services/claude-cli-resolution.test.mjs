import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Exercise the production account-login and model-help callbacks without
// signing into an account or starting a user session.
const source = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
const loginSource = source.slice(source.indexOf('const claudeAccounts = new ClaudeAccounts('), source.indexOf('function accountsForTool('));
const catalogSource = source.match(/async function providerModelCatalog\([\s\S]*?\r?\n\}/)?.[0];
const parent = { Path: 'stale-path', CLAUDE_CONFIG_DIR: 'account-profile' };
const refresh = env => ({ ...env, Path: env.Path + ';new-claude-install' });

describe('common automatic Claude CLI discovery', () => {
  it.each([true, false])('refreshes the account login environment for %s native availability', native => {
    let options;
    const spawn = vi.fn(() => ({})), find = vi.fn(() => native ? 'C:\\New Claude\\claude.exe' : null);
    vm.runInNewContext(loginSource, {
      ClaudeAccounts: class { constructor(_root, value) { options = value; } },
      app: { getPath: () => 'fixture' }, os: { homedir: () => 'fixture' }, process: { platform: 'win32' },
      refreshWindowsPath: refresh, findExecutableOnPath: find, nodePty: { spawn }, defaultShell: () => 'powershell.exe',
    });
    options.startLogin(parent);
    const [file, args, settings] = spawn.mock.calls[0];
    expect(settings.env).toEqual({ Path: 'stale-path;new-claude-install', CLAUDE_CONFIG_DIR: 'account-profile' });
    expect(find).toHaveBeenCalledWith('claude.exe', { env: settings.env });
    expect(file).toBe(native ? 'C:\\New Claude\\claude.exe' : 'powershell.exe');
    expect(args).toEqual(native ? ['auth', 'login'] : ['-NoLogo', '-NoProfile', '-Command', 'claude.cmd auth login']);
    expect(parent.Path).toBe('stale-path');
  });

  it.each([true, false])('refreshes model help for multiple accounts with %s native availability', async native => {
    const execute = vi.fn((_file, _args, _options, done) => done(null, 'fixture help'));
    const find = vi.fn(() => native ? 'C:\\New Claude\\claude.exe' : null);
    const catalog = vm.runInNewContext(`(${catalogSource})`, {
      accountPool: { state: { sessions: {} } }, sessionModelCatalogCache: new Map(),
      process: { platform: 'win32' }, refreshWindowsPath: refresh, findExecutableOnPath: find,
      execFile: execute, defaultShell: () => 'powershell.exe', claudeModelCatalog: () => [{ model: 'sonnet' }],
      claudeAccounts: { environment: id => ({ ...parent, CLAUDE_CONFIG_DIR: id }),
        list: () => [{ id: 'a', label: 'Personal' }, { id: 'b', label: 'Work' }] },
    });
    for (const accountId of ['a', 'b']) expect(await catalog({ provider: 'claude', accountId })).toMatchObject({ models: [{ model: 'sonnet' }] });
    expect(execute.mock.calls.map(call => call[2].env)).toEqual([
      { Path: 'stale-path;new-claude-install', CLAUDE_CONFIG_DIR: 'a' },
      { Path: 'stale-path;new-claude-install', CLAUDE_CONFIG_DIR: 'b' },
    ]);
    expect(execute.mock.calls[0][0]).toBe(native ? 'C:\\New Claude\\claude.exe' : 'powershell.exe');
    expect(execute.mock.calls[0][1]).toEqual(native ? ['--help'] : ['-NoLogo', '-NoProfile', '-Command', 'claude.cmd --help']);
    expect(parent.Path).toBe('stale-path');
  });
});
