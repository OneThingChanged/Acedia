import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { HookService } from './hook-service.mjs';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });
async function fixture({ linkedRuntime = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-hook-proof-')); roots.push(root);
  const cwd = path.join(root, 'project'), home = path.join(root, 'account');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  const baseDir = path.join(root, 'runtime');
  if (linkedRuntime) {
    const physical = path.join(root, 'physical-runtime');
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, baseDir, 'junction');
  }
  const service = new HookService({ baseDir });
  await service.writeRuntimeFiles(); await service.setupProject(cwd, 'codex');
  const capture = (args, options = {}) => service.captureStartupHooks({ cwd, home, args, ...options });
  const entry = { cwd, aiToolId: 'codex', startupHookProof: capture() };
  return { root, cwd, home, service, capture, entry, config: path.join(cwd, '.codex', 'config.toml') };
}
it('proves the exact six host hooks and helper bytes across account and project layers', async () => {
  const f = await fixture(); expect(f.capture()).toMatchObject({ count: 6, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(f.service.verifyStartupHooks(f.entry)).toEqual(f.entry.startupHookProof);
  expect(f.capture(['resume', 'existing', '--no-alt-screen', '-c', 'mcp_servers.multiagent_browser.enabled=true'])).not.toBeNull();
  fs.writeFileSync(path.join(f.home, 'config.toml'), '[projects.fixture]\ntrust_level="trusted"\n');
  expect(f.service.verifyStartupHooks(f.entry)).toEqual(f.entry.startupHookProof);
  fs.mkdirSync(path.join(f.home, 'plugins'));
  expect(f.service.verifyStartupHooks(f.entry)).toEqual(f.entry.startupHookProof);
  fs.writeFileSync(path.join(f.home, 'plugins/registry.json'), '{}');
  expect(f.service.verifyStartupHooks(f.entry)).toBeNull();
  fs.unlinkSync(path.join(f.home, 'plugins/registry.json'));
  fs.writeFileSync(f.config, fs.readFileSync(f.config, 'utf8').replace('tool-start PreToolUse', 'unknown PreToolUse'));
  expect(f.service.verifyStartupHooks(f.entry)).toBeNull();
});
it.each(['account', 'ancestor', 'json', 'plugin', 'nested', 'helper', 'count'])('leaves %s changes for native manual review', async kind => {
  const f = await fixture();
  const foreign = '\n[[hooks.Stop]]\nmatcher=""\n[[hooks.Stop.hooks]]\ntype="command"\ncommand="unknown-tool"\n';
  if (kind === 'account') fs.writeFileSync(path.join(f.home, 'config.toml'), foreign);
  if (kind === 'ancestor') { fs.mkdirSync(path.join(f.root, '.git')); fs.mkdirSync(path.join(f.root, '.codex')); fs.writeFileSync(path.join(f.root, '.codex/config.toml'), foreign); }
  if (kind === 'json') fs.writeFileSync(path.join(f.home, 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'unknown' }] }] } }));
  if (kind === 'plugin') fs.writeFileSync(path.join(f.home, 'config.toml'), '[plugins.example]\nenabled=true\n');
  if (kind === 'nested') fs.writeFileSync(path.join(f.home, 'config.toml'), '[profiles.example.hooks]\nStop=[]\n');
  if (kind === 'helper') fs.appendFileSync(f.service.helperPath, '\n# changed helper');
  if (kind === 'count') fs.writeFileSync(f.config, 'model="test"\n');
  expect(f.capture()).toBeNull(); expect(f.service.verifyStartupHooks(f.entry)).toBeNull();
});
it('refuses unknown launch hook/profile/cwd overrides and malformed or oversized files', async () => {
  const f = await fixture();
  for (const args of [['-c', 'hooks.Stop=[]'], ['--config=plugins.x.enabled=true'], ['--profile', 'extra'], ['--cd', f.root], ['--hooks-file=x']]) expect(f.capture(args)).toBeNull();
  fs.writeFileSync(f.config, 'invalid = ['); expect(f.capture()).toBeNull();
  fs.writeFileSync(f.config, '#'.repeat(1024 * 1024 + 1)); expect(f.capture()).toBeNull();
});

it('verifies a managed helper in a relocated app directory and rejects a retargeted junction', async () => {
  const f = await fixture({ linkedRuntime: true });
  expect(f.capture()).toMatchObject({ count: 6 });
  expect(f.service.verifyStartupHooks(f.entry)).toEqual(f.entry.startupHookProof);
  const copy = path.join(f.root, 'different-runtime');
  fs.mkdirSync(copy);
  fs.copyFileSync(f.service.helperPath, path.join(copy, 'notify.ps1'));
  fs.renameSync(f.service.baseDir, path.join(f.root, 'previous-link'));
  fs.symlinkSync(copy, f.service.baseDir, 'junction');
  expect(f.service.verifyStartupHooks(f.entry)).toBeNull();
});

async function routedFixture() {
  const f = await fixture();
  fs.mkdirSync(path.join(f.home, 'plugins'));
  fs.writeFileSync(path.join(f.home, 'plugins/registry.json'), '{}');
  fs.writeFileSync(path.join(f.home, 'config.toml'), '[plugins.example]\nenabled=true\n');
  const startupHookProof = f.capture([], { nativeInventory: true });
  expect(startupHookProof).toBeTruthy();
  const hooks = [...startupHookProof.managedSources].flatMap(([sourcePath, commands]) =>
    [...commands].map(([eventName, command]) => ({
      sourcePath, eventName, command, source: 'project', handlerType: 'command', matcher: '',
      trustStatus: 'untrusted', enabled: true, isManaged: false, key: eventName, currentHash: 'sha256:' + 'a'.repeat(64),
    })));
  const data = [{ cwd: f.cwd, hooks, errors: [], warnings: [] }];
  const entry = { ...f.entry, startupHookProof, startupHookInventory: () => data };
  return { ...f, data, hooks, verify: () => f.service.verifyStartupHooks(entry) };
}

it('uses native pending entries to approve only the managed hooks when a plugin is enabled', async () => {
  const f = await routedFixture();
  expect(f.capture()).toBeNull();
  f.hooks.push({ source: 'plugin', trustStatus: 'trusted' });
  expect(f.verify()).toMatchObject({ count: 6, exactPending: true });
  f.hooks[0].trustStatus = 'trusted';
  expect(f.verify()).toMatchObject({ count: 5, exactPending: true });
  f.hooks.at(-1).trustStatus = 'modified';
  expect(f.verify()).toBeNull();
});

it.each(['bad source', 'wrong command', 'warning', 'changed config', 'duplicate key', 'no inventory'])(
  'keeps routed hook review pending for %s', async mode => {
    const f = await routedFixture();
    if (mode === 'bad source') f.hooks[0].sourcePath = path.join(f.home, 'config.toml');
    if (mode === 'wrong command') f.hooks[0].command += ' extra';
    if (mode === 'warning') f.data[0].warnings.push('unresolved plugin configuration');
    if (mode === 'changed config') fs.appendFileSync(path.join(f.home, 'config.toml'), '\n[plugins.other]\nenabled=true\n');
    if (mode === 'duplicate key') f.hooks[0].key = f.hooks[1].key;
    if (mode === 'no inventory') f.data.length = 0;
    expect(f.verify()).toBeNull();
  });
