import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { StartupAutomation, startupPrompt } from './startup-automation.mjs';
import { CodexScrollbackFilter } from './terminal-stream.mjs';
import { readTerminalStartupScreen } from '../shared/terminal-startup-prompt.mjs';
import { TaskOrchestration } from './task-orchestration.mjs';
import { WorkspaceManagement } from './workspace-management.mjs';
import { noteFirstMessageInput, firstMessageSession } from './session-first-message.mjs';
import { SessionReadiness } from './session-readiness.mjs';
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
it('confirms ordinary and task API creations without project opt-in, including after coordinator metadata arrives', async () => {
  const f = fixture(), catalog = { projects: [{ id: 'p', folder: f.root }],
    agents: [{ id: 'owner', projectId: 'p', aiToolId: 'codex' }], availableTools: [{ id: 'codex' }] };
  const engine = new TaskOrchestration({ file: path.join(f.root, 'tasks.json'), catalog: () => catalog });
  const entries = new Map(), writes = vi.fn();
  const automation = new StartupAutomation({ entry: id => entries.get(id),
    allowedRoot: id => engine.startupTrustRoot(id), write: writes });
  let serial = 0;
  const create = vi.fn(async payload => {
    const id = payload.id || `api-${++serial}`;
    if (payload.project) catalog.projects.push({ id: payload.projectId, ...payload.project });
    entries.set(id, { ...f.entry, filter: { viewportText: () => f.screen(f.child, payload.project ? f.child : f.root) } });
    expect(automation.check(id)).toBe(false); // A PTY alone cannot identify a project.
    catalog.agents.push({ ...payload, id });
    expect(automation.check(id)).toBe(true);
    expect(automation.check(id)).toBe(false);
    return { id };
  });
  const workspace = new WorkspaceManagement({ catalog: () => catalog, create, isActive: () => true });
  try {
    await workspace.handle({ action: 'create-session', agentId: 'owner',
      body: { projectId: 'p', requestKey: 'child' } });
    await workspace.createTaskSession({ id: 'task-child', ownerId: 'owner', projectId: 'p', folder: f.child, name: 'Task' });
    await workspace.handle({ action: 'create-project', agentId: 'owner', body: { folder: f.child } });
    expect(writes.mock.calls).toEqual([['api-1', '\r'], ['task-child', '\r'], ['api-2', '\r']]);
    expect(engine.data.startupTrust).toEqual({});
    // Folder trust is independent of permissions. New creations defer their
    // permission choice to the coordinator rather than forcing an OFF value.
    for (const [payload] of create.mock.calls) expect(payload).not.toHaveProperty('dangerous');
  } finally { engine.close(); }
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
it('confirms an API dedicated folder outside the project but never its broader repository',()=>{
  const f=fixture(),folder=path.join(f.root,'dedicated');fs.mkdirSync(folder);
  const catalog={projects:[{id:'p',folder:f.child}],agents:[{id:'external',projectId:'p',aiToolId:'codex',folder,sessionHierarchy:{createdById:'owner'}}]};
  const engine=new TaskOrchestration({file:path.join(f.root,'tasks-external.json'),catalog:()=>catalog});
  let entry={...f.entry,cwd:folder,filter:{viewportText:()=>f.screen(folder,folder)}};
  const write=vi.fn(),automation=new StartupAutomation({entry:()=>entry,allowedRoot:id=>engine.startupTrustRoot(id),write});
  try{
    expect(automation.check('external')).toBe(true);expect(write).toHaveBeenCalledExactlyOnceWith('external','\r');
    entry={...entry,filter:{viewportText:()=>f.screen(folder,f.root)}};
    expect(automation.check('external')).toBe(false);expect(write).toHaveBeenCalledTimes(1);
  }finally{engine.close();}
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

const updateScreen = [
  'Update available · 0.169.0 → 0.169.1',
  '',
  'Release notes: https://github.com/openai/codex/releases/latest',
  '› 1. Update now (runs `winget upgrade OpenAI.Codex`)',
  '  2. Skip',
  '  3. Skip until next version',
  '',
  'enter continue · esc skip',
].join('\r\n');

it('reports the exact native update blocker, skips once in the background and verifies the first composer again', async () => {
  const f = fixture(), filter = new CodexScrollbackFilter(30, 64);
  try {
    const entry = Object.assign(f.entry, { filter, startedAt: 1, subscribers: new Set() });
    const paint = text => new Promise(resolve => filter.shadow.write('\x1b[2J\x1b[H' + text, resolve));
    const readiness = new SessionReadiness({ context: () => ({ entry, conversationId: null }), read: async () => null,
      freshRead: () => firstMessageSession({ entry, agent: { id: 'child' }, conversationId: null }), ready: () => true });
    await paint(updateScreen.replace('winget upgrade OpenAI.Codex', 'winget upgrade ' + 'package-name-'.repeat(5)));
    expect(await readiness.handle({ sessionId: 'child' })).toMatchObject({ phase: 'cli-update', reason: 'cli-update', ready: false });
    expect(f.write).not.toHaveBeenCalled();
    entry.subscribers.add(1);
    expect(f.automation.check('child')).toBe(false);
    entry.subscribers.clear();
    f.write.mockImplementation((_id, key) => noteFirstMessageInput(entry, key));
    expect(f.automation.check('child')).toBe(true);
    expect(f.write).toHaveBeenCalledExactlyOnceWith('child', '\x1b');
    expect(f.automation.check('child')).toBe(false);
    expect(await readiness.handle({ sessionId: 'child' })).toMatchObject({ ready: false });
    await paint('› \x1b[90mAsk Codex to do anything\x1b[0m\x1b[1;3H');
    expect(await readiness.handle({ sessionId: 'child' })).toMatchObject({ ready: true, firstMessageReady: true });
  } finally { filter.dispose(); }
});

it('leaves quoted, incomplete or user-interacted update screens alone', () => {
  const f = fixture();
  for (const screen of ['Assistant says:\n' + updateScreen, updateScreen.replace('  2. Skip\r\n', ''), updateScreen.replace('esc skip', 'esc quit')]) {
    f.entry.filter.viewportText = () => screen;
    expect(f.automation.check('child')).toBe(false);
  }
  f.entry.filter.viewportText = () => updateScreen;
  noteFirstMessageInput(f.entry, 'draft');
  expect(f.automation.check('child')).toBe(false);
  expect(f.write).not.toHaveBeenCalled();
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

function hooksFixture(index = 0) {
  const f = fixture(); let selected = index;
  const screen = () => `Hooks need review\n6 hooks are new or changed.\nHooks can run outside the sandbox after you trust them.\n${selected === 0 ? '›' : ' '} 1. Review hooks\n${selected === 1 ? '›' : ' '} 2. Trust all and continue\n${selected === 2 ? '›' : ' '} 3. Continue without trusting (hooks won't run)\nenter confirm · esc skip`;
  f.entry.filter.viewportText = screen;
  const proof = { count: 6, fingerprint: 'verified', cwd: f.child };
  f.automation.verifyHooks = () => proof;
  return { ...f, screen, select: value => { selected = value; }, proof };
}
it('moves Review to Trust all, observes the repainted selection, and confirms once', () => {
  vi.useFakeTimers();
  try {
    const f = hooksFixture();
    expect(f.automation.check('child')).toBe(false); expect(f.write).toHaveBeenCalledExactlyOnceWith('child', '\x1b[B');
    vi.advanceTimersByTime(300); expect(f.automation.check('child')).toBe(false); expect(f.write).toHaveBeenCalledTimes(1);
    f.select(1); expect(f.automation.check('child')).toBe(true);
    expect(f.write.mock.calls).toEqual([['child', '\x1b[B'], ['child', '\r']]);
    expect(f.entry.startupHookConfirmation).toMatchObject({ hookCount: 6, fingerprint: 'verified' });
    expect(f.automation.check('child')).toBe(false); expect(f.write).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it('handles folder trust and hook review independently on the same PTY', () => {
  const f = hooksFixture(1), hookScreen = f.screen;
  f.entry.filter.viewportText = () => fixtureScreen(f);
  function fixtureScreen(f) { return `Folder access\n${f.child}\n\nTrust this folder?\n› 1. Trust and continue\n  2. Quit\nenter continue · esc quit`; }
  f.allow(f.child); expect(f.automation.check('child')).toBe(true);
  f.entry.filter.viewportText = hookScreen; expect(f.automation.check('child')).toBe(true);
  expect(f.write.mock.calls).toEqual([['child', '\r'], ['child', '\r']]);
});
it('leaves unknown hooks, count mismatches, partial dialogs, SSH, and selected Skip untouched', () => {
  for (const change of [f => { f.automation.verifyHooks = () => null; }, f => { f.proof.count = 5; },
    f => { f.entry.filter.viewportText = () => f.screen().replace('6 hooks are new or changed.', ''); },
    f => { f.entry.ssh = {}; }, f => f.select(2)]) {
    const f = hooksFixture(1); change(f); expect(f.automation.check('child')).toBe(false); expect(f.write).not.toHaveBeenCalled();
  }
});
it('does not confirm a changed proof or user input after moving, nor replay an uncertain write', () => {
  vi.useFakeTimers();
  try {
    for (const change of [f => { f.proof.fingerprint = 'changed'; }, f => { f.entry.lastInputAt++; }]) {
      const f = hooksFixture(); f.automation.check('child'); f.select(1); vi.advanceTimersByTime(300); change(f);
      expect(f.automation.check('child')).toBe(false); expect(f.write).toHaveBeenCalledTimes(1);
    }
    const f = hooksFixture(1); f.write.mockImplementation(() => { throw Error('uncertain'); });
    f.automation.check('child'); f.automation.check('child'); expect(f.write).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
