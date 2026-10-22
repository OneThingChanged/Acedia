import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { StartupAutomation, startupPrompt } from './startup-automation.mjs';
import { CodexScrollbackFilter } from './terminal-stream.mjs';
import { readTerminalStartupScreen } from '../shared/terminal-startup-prompt.mjs';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-startup-auto-')); roots.push(root);
  const child = path.join(root, 'child'); fs.mkdirSync(child);
  const screen = (folder = child, repository = root) => `Folder access\n${folder}\n\nNote: You're in a subdirectory of a Git project. Trusting will apply to the repository root:\n${repository}\n\nTrust this folder? Codex can read, edit, and run files here, subject to your permission settings.\n\n› 1. Trust and continue\n  2. Quit\n\nenter continue · esc quit`;
  let entry = { cwd: child, aiToolId: 'codex', lastInputAt: 1, filter: { viewportText: () => screen() } }, allowed = root;
  const write = vi.fn(), publish = vi.fn(), automation = new StartupAutomation({ entry: () => entry, allowedRoot: () => allowed, write, publish });
  return { root, child, screen, entry, automation, write, publish, allow: value => { allowed = value; }, replace: value => { entry = value; } };
}
it('confirms only the exact project and repository scope once, without a window operation', () => {
  const f = fixture(); expect(f.automation.check('child')).toBe(true);
  expect(f.write).toHaveBeenCalledExactlyOnceWith('child', '\r');
  expect(f.entry.startupTrustConfirmation).toMatchObject({ at: expect.any(Number) }); expect(f.publish).toHaveBeenCalledTimes(1);
  expect(f.automation.check('child')).toBe(false); expect(f.write).toHaveBeenCalledTimes(1);
  f.replace({ ...f.entry }); expect(f.automation.check('child')).toBe(true); // Actual restart, distinct PTY.
});
it('leaves disabled, out-of-scope, unknown-root, wrong-folder and SSH prompts untouched', () => {
  for (const change of [f => f.allow(null), f => f.allow(f.child),
    f => { f.entry.filter.viewportText = () => f.screen(f.root); },
    f => { f.entry.filter.viewportText = () => f.screen(f.child, path.dirname(f.root)); },
    f => { f.entry.filter.viewportText = () => f.screen().replace(f.root + '\n\nTrust', 'unreadable\n\nTrust'); },
    f => { f.entry.ssh = {}; }, f => { f.entry.aiToolId = 'claude'; }]) {
    const f = fixture(); change(f); expect(f.automation.check('child')).toBe(false); expect(f.write).not.toHaveBeenCalled();
  }
});
it('does not approve hook execution, a user-selected Quit, partial screens or transcript prose', () => {
  const f = fixture();
  for (const value of [f.screen().replace('› 1.', '  1.').replace('  2.', '› 2.'), f.screen().replace('enter continue · esc quit', ''), 'Assistant says:\n' + f.screen(),
    'Hooks need review\nHooks can run outside the sandbox after you trust them.\n1. Review hooks\n› 2. Trust all and continue\n3. Continue without trusting (hooks won\'t run)\nenter confirm · esc skip']) {
    f.entry.filter.viewportText = () => value; expect(f.automation.check('child')).toBe(false);
  }
  expect(f.write).not.toHaveBeenCalled(); expect(startupPrompt({ ...f.entry, ssh: {} })).toBe(null);
});
it('reads wrapped folder paths from the native shadow viewport before checking scope', async () => {
  const f = fixture(), folder = path.join(f.child, 'long-folder-name-'.repeat(5)); fs.mkdirSync(folder);
  const filter = new CodexScrollbackFilter(30, 80);
  try {
    f.entry.cwd = folder; f.entry.filter = filter;
    filter.push(f.screen(folder).replaceAll('\n', '\r\n'));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(startupPrompt(f.entry)?.folder).toBe(folder);
    expect(f.automation.check('child')).toBe(true); expect(f.write).toHaveBeenCalledExactlyOnceWith('child', '\r');
  } finally { filter.dispose(); }
});
it('preserves a complete native dialog when full-width painting leaves wrapped row flags', () => {
  const f = fixture(), rows = f.screen().split('\n');
  const term = { rows: rows.length, buffer: { active: { baseY: 0, getLine: i => ({ isWrapped: i > 0, translateToString: () => rows[i] }) } } };
  expect(readTerminalStartupScreen(term)).toBe(f.screen());
});
it('does not replay an uncertain key or race a changed native selection, permission or input', () => {
  const f = fixture(); f.write.mockImplementation(() => { throw Error('disconnected'); });
  expect(f.automation.check('child')).toBe(false); expect(f.automation.check('child')).toBe(false); expect(f.write).toHaveBeenCalledTimes(1);
  const g = fixture(); let reads = 0;
  g.entry.filter.viewportText = () => { reads++; if (reads === 2) g.entry.lastInputAt++; return g.screen(); };
  expect(g.automation.check('child')).toBe(false); expect(g.write).not.toHaveBeenCalled();
  const h = fixture(); let permissions = 0;
  h.automation.allowedRoot = () => ++permissions === 1 ? h.root : null;
  expect(h.automation.check('child')).toBe(false); expect(h.write).not.toHaveBeenCalled();
});
