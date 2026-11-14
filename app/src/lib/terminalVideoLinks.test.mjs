import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTerminalPath } from '../../electron/services/terminal-path-service.mjs';
import { resolveSessionSettings } from './sessionHierarchy';
import { openTerminalFile } from './terminalFileActions';
import { findTerminalLinkAtMouseEvent } from './terminal';
import { invoke } from '../platform/runtime';

// Test hit detection using buffer cells, without creating a terminal or GUI.
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-serialize', () => ({ SerializeAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));
vi.mock('../platform/runtime', () => ({ invoke: vi.fn(async () => {}), listen: vi.fn() }));

const roots = [];
afterEach(() => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-video-link-')) throw new Error('Unexpected fixture path');
    fs.rmSync(root, { recursive: true });
  }
});

function lineBuffer(text) {
  const cells = [];
  for (const chars of text) {
    const width = /[가-힣]/.test(chars) ? 2 : 1;
    cells.push({ getChars: () => chars, getWidth: () => width, isFgDefault: () => true });
    if (width === 2) cells.push({ getChars: () => '', getWidth: () => 0 });
  }
  const cols = cells.length;
  const line = { isWrapped: false, translateToString: () => text, getCell: col => cells[col] };
  const screen = { getBoundingClientRect: () => ({ left: 0, top: 0, width: cols * 10, height: 20 }) };
  vi.stubGlobal('window', { getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }) });
  return { cols, rows: 1, buffer: { active: { viewportY: 0, length: 1, getLine: row => row === 0 ? line : undefined } },
    element: { querySelector: () => screen } };
}

describe('terminal video link hit → child folder resolution → OS action without GUI automation', () => {
  it.each(['Result.json', 'Status.md', 'preview.png'])('keeps a deep path clickable without blocking specialization on %s', name => {
    const relative = Array(24).fill('ProjectWitch').join('/') + '/' + name;
    const term = lineBuffer('[' + relative + ']');
    const link = findTerminalLinkAtMouseEvent(term, { clientX: 15, clientY: 10 });
    expect(link).toEqual({ kind: name.endsWith('.md') ? 'markdown' : name.endsWith('.png') ? 'image' : 'terminal', text: relative });
  });
  it.each(['Akane-PostProcess-Before-After.mp4', 'Akane-PostProcess-V1.mp4'])('opens %s from the session folder and reserves Ctrl-click for reveal', async name => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-video-link-')); roots.push(root);
    const childFolder = path.join(root, 'VFXProject');
    const relative = `Client/Saved/Comparison/NevernessToEverness/AkaneSlash/postprocess_v1/${name}`;
    // A same-named file in the parent must not override the child's file.
    for (const folder of [root, childFolder]) {
      const file = path.join(folder, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, folder);
    }
    const parent = { id: 'parent', projectId: 'p', folder: root, aiToolId: 'codex' };
    const child = { ...parent, id: 'child', folder: childFolder,
      sessionHierarchy: { parentId: parent.id, inheritFolder: false, folderOverride: childFolder } };
    const prefix = `• 전후 비교 - ${name} (`;
    const term = lineBuffer(prefix + relative + ')');
    const start = [...prefix].reduce((n, c) => n + (/[가-힣]/.test(c) ? 2 : 1), 0);
    const folder = resolveSessionSettings(child, [parent, child], [{ id: 'p', folder: root }]).folder;
    for (const offset of [0, Math.floor(relative.length / 2), relative.length - 1]) {
      const link = findTerminalLinkAtMouseEvent(term, { clientX: (start + offset + 0.5) * 10, clientY: 10 });
      expect(link).toEqual({ kind: 'terminal', text: relative });
      const resolved = resolveTerminalPath(folder, link.text);
      expect(resolved).toEqual({ kind: 'file', path: fs.realpathSync(path.join(childFolder, relative)) });
      await openTerminalFile(resolved.path);
      expect(invoke).toHaveBeenLastCalledWith('open_local_path', { path: resolved.path });
      await openTerminalFile(resolved.path, true);
      expect(invoke).toHaveBeenLastCalledWith('reveal_local_path', { path: resolved.path });
    }
  });
  it.each(['.MP4', '.webm', '.m4v', '.mov', '.mkv', '.avi', '.wmv', '.mpg', '.mpeg'])('uses the media association for %s files', async extension => {
    await openTerminalFile(`C:\\영상 보관함\\비교 (최종)${extension}`);
    expect(invoke).toHaveBeenLastCalledWith('open_local_path', { path: `C:\\영상 보관함\\비교 (최종)${extension}` });
  });
  it.each(['result.zip', 'run.exe', 'run.cmd', 'run.ps1', 'run.py', 'clip.mp4.exe'])('retains reveal-only behavior for %s', async name => {
    await openTerminalFile(`C:/output/${name}`);
    expect(invoke).toHaveBeenLastCalledWith('reveal_local_path', { path: `C:/output/${name}` });
  });
  it('propagates a missing media association error for the existing error toast', async () => {
    invoke.mockRejectedValueOnce(new Error('No media association'));
    await expect(openTerminalFile('C:/output/clip.mp4')).rejects.toThrow('No media association');
  });
});
