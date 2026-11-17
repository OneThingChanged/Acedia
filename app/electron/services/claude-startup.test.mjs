import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { StartupAutomation, registeredClaudeTrustRoot, startupPrompt } from './startup-automation.mjs';
import { TrackedTerminalFilter } from './terminal-stream.mjs';
import { parseTerminalStartupPrompt } from '../shared/terminal-startup-prompt.mjs';
const roots = [];
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-claude-startup-')) throw Error('Unexpected cleanup path');
    fs.rmSync(root, { recursive: true });
  }
});
const screen = (folder, selected = 0, marker = '❯') => `────────────────────\nAccessing workspace:\n\n${folder}\n\nQuick safety check: Is this a project you created or one you trust?\n\nClaude Code'll be able to read, edit, and execute files here.\n\nSecurity guide\n\n${selected === 0 ? marker + ' ' : ''}No, exit\n${selected === 1 ? marker + ' ' : ''}Yes, I trust this folder\n\nEnter to confirm · Esc to cancel`;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-claude-startup-')); roots.push(root);
  const folder = path.join(root, 'ordinary-child'); fs.mkdirSync(folder);
  const catalog = { projects: [{ id: 'p', folder: root }], agents: [{ id: 'claude', projectId: 'p', aiToolId: 'claude', folder }] };
  let selected = 0;
  const entry = { cwd: folder, aiToolId: 'claude', lastInputAt: 1, filter: { viewportText: () => screen(folder, selected) } };
  const write = vi.fn(), automation = new StartupAutomation({ entry: () => entry, allowedRoot: id => registeredClaudeTrustRoot(catalog, id), write });
  return { root, folder, entry, catalog, write, automation, select: value => { selected = value; } };
}
it.each(['❯', '›', '>'])('recognizes the exact Claude folder screen with native selector %s', marker => {
  expect(parseTerminalStartupPrompt(screen('C:\\workspace', 0, marker), 'claude')).toMatchObject({ selectedIndex: 0, confirmIndex: 1, folder: 'C:\\workspace' });
  expect(parseTerminalStartupPrompt(screen('C:\\workspace', 1, marker), 'claude')).toMatchObject({ selectedIndex: 1 });
  expect(parseTerminalStartupPrompt('Assistant says:\n' + screen('C:\\workspace', 1, marker), 'claude')).toBeNull();
});
it('activates ordinary registered Claude sessions without API provenance, observing the new selection before Enter', () => {
  vi.useFakeTimers(); const f = fixture();
  expect(f.automation.check('claude')).toBe(false); expect(f.write.mock.calls).toEqual([['claude', '\x1b[B']]);
  vi.advanceTimersByTime(300); expect(f.automation.check('claude')).toBe(false);
  f.select(1); expect(f.automation.check('claude')).toBe(true);
  expect(f.write.mock.calls).toEqual([['claude', '\x1b[B'], ['claude', '\r']]);
  expect(f.automation.check('claude')).toBe(false);
});
it('keeps unknown folders, changed input, SSH and login/API-key approval outside automatic trust', () => {
  const f = fixture(); f.entry.cwd = f.root;
  expect(f.automation.check('claude')).toBe(false);
  f.entry.cwd = f.folder; f.entry.ssh = {};
  expect(f.automation.check('claude')).toBe(false);
  f.catalog.agents[0].sshHostId = 'host'; expect(registeredClaudeTrustRoot(f.catalog, 'claude')).toBeNull();
  const g = fixture(); g.automation.check('claude'); g.entry.lastInputAt++; g.select(1);
  expect(g.automation.check('claude')).toBe(false);
  g.entry.filter.viewportText = () => 'Detected a custom API key in your environment\nDo you want to use this API key?\nEnter to confirm · Esc to cancel';
  expect(startupPrompt(g.entry)).toBeNull();
});
it('detects the screenshot-style prompt in a real wrapped xterm buffer and confirms the repainted selection once', async () => {
  const f = fixture(), filter = new TrackedTerminalFilter(50, 80); f.entry.filter = filter;
  const paint = async index => { filter.push('\x1b[2J\x1b[H' + screen(f.folder, index, '›').replaceAll('\n', '\r\n')); await new Promise(resolve => setTimeout(resolve, 30)); };
  try {
    await paint(0); expect(startupPrompt(f.entry)?.folder).toBe(f.folder);
    expect(f.automation.check('claude')).toBe(false); expect(f.write.mock.calls).toEqual([['claude', '\x1b[B']]);
    await paint(1); await new Promise(resolve => setTimeout(resolve, 220));
    expect(f.automation.check('claude')).toBe(true); expect(f.automation.check('claude')).toBe(false);
    expect(f.write.mock.calls).toEqual([['claude', '\x1b[B'], ['claude', '\r']]);
  } finally { filter.dispose(); }
});
