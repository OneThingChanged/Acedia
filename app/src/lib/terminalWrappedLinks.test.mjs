import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Terminal as NativeTerminal } from '@xterm/xterm/lib/xterm.mjs';
import { afterEach, expect, it, vi } from 'vitest';
import { findTerminalLinkAtMouseEvent, registerMarkdownLinkProvider } from './terminal';
import { resolveTerminalPath } from '../../electron/services/terminal-path-service.mjs';

vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-serialize', () => ({ SerializeAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));
vi.mock('../platform/runtime', () => ({ invoke: vi.fn(), listen: vi.fn() }));
const terminals = [], roots = [];
afterEach(() => {
  terminals.splice(0).forEach(term => term.dispose()); vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-wrapped-links-')) throw Error('Unexpected cleanup');
    fs.rmSync(root, { recursive: true });
  }
});
const width = text => [...text].reduce((sum, char) => sum + (/[가-힣]/.test(char) ? 2 : 1), 0);
async function fixture(output, cols) {
  const native = new NativeTerminal({ cols, rows: 10, allowProposedApi: true }); terminals.push(native);
  await new Promise(resolve => native.write(output, resolve));
  const providers = [], open = vi.fn(), screen = { getBoundingClientRect: () => ({ left: 0, top: 0, width: cols * 10, height: 200 }) };
  vi.stubGlobal('window', { getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }) });
  const term = { cols, rows: 10, buffer: native.buffer, element: { querySelector: () => screen },
    registerLinkProvider: provider => providers.push(provider) };
  registerMarkdownLinkProvider(term, 'session', open, open, open, open);
  return { term, open, hit: (row, col) => findTerminalLinkAtMouseEvent(term, { clientX: (col + .5) * 10, clientY: (row + .5) * 20 }),
    links: row => new Promise(resolve => providers[0].provideLinks(row + 1, resolve)) };
}
const folder = 'Client/Saved/Recordings/ThreeBuildGameplay/Native24-20261116-QA-independent/final-check/';
const cut = folder.indexOf('independent');
it.each(['parentheses', 'brackets', 'backticks', 'highlight'])('recovers a hard-wrapped extensionless folder in %s from both rows and the hover provider', async style => {
  const [left, right] = { parentheses: ['(', ')'], brackets: ['[', ']'], backticks: ['`', '`'], highlight: ['', ''] }[style];
  const prefix = '녹화 ' + left;
  const f = await fixture(prefix + '\x1b[32m' + folder.slice(0, cut) + '\x1b[39m\r\n  \x1b[32m' + folder.slice(cut) + '\x1b[39m' + right + ' 확인', width(prefix) + cut + 2);
  expect(f.term.buffer.active.getLine(1).isWrapped).toBe(false);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-wrapped-links-')); roots.push(root);
  fs.mkdirSync(path.join(root, folder), { recursive: true });
  for (const [row, col] of [[0, width(prefix) + 8], [1, 5]]) {
    const link = f.hit(row, col); expect(link).toEqual({ kind: 'folder', text: folder });
    expect(resolveTerminalPath(root, link.text)).toEqual({ kind: 'folder', path: fs.realpathSync(path.join(root, folder)) });
    const links = await f.links(row), provided = links.find(link => link.text === folder);
    expect(provided).toBeDefined(); expect(provided.range.start.y).toBe(1); expect(provided.range.end.y).toBe(2);
    provided.activate({ button: 0, preventDefault() {} }, provided.text); expect(f.open).toHaveBeenLastCalledWith('session', folder);
  }
});
it('preserves an explicitly delimited folder across a soft wrap with a different continuation color', async () => {
  const prefix = '녹화 (';
  const f = await fixture(prefix + '\x1b[32m' + folder.slice(0, cut) + '\x1b[38;2;80;190;120m' + folder.slice(cut) + '\x1b[39m)', width(prefix) + cut);
  expect(f.term.buffer.active.getLine(1).isWrapped).toBe(true);
  for (const [row, col] of [[0, width(prefix) + 8], [1, 5]]) {
    expect(f.hit(row, col)).toEqual({ kind: 'folder', text: folder });
    expect((await f.links(row)).some(link => link.text === folder)).toBe(true);
  }
});
it('keeps ordinary separate path lines separate even when both are highlighted', async () => {
  const f = await fixture('\x1b[32mDocs/first-folder\x1b[39m\r\n  \x1b[32mDocs/second-folder\x1b[39m', 80);
  expect(f.hit(0, 5)).toEqual({ kind: 'folder', text: 'Docs/first-folder' });
  expect(f.hit(1, 7)).toEqual({ kind: 'folder', text: 'Docs/second-folder' });
});
it('preserves folder boundaries when a hard-wrapped continuation uses another color', async () => {
  const prefix = '녹화 ';
  const f = await fixture(prefix + '\x1b[32m`' + folder.slice(0, cut) + '\x1b[39m\r\n  \x1b[38;2;80;190;120m' + folder.slice(cut) + '`\x1b[39m', width(prefix) + cut + 3);
  for (const [row, col] of [[0, width(prefix) + 8], [1, 5]]) {
    expect(f.hit(row, col)).toEqual({ kind: 'folder', text: folder });
    expect((await f.links(row)).some(link => link.text === folder)).toBe(true);
  }
});
it('keeps a three-row image path intact and routes every row to the image action', async () => {
  const image = 'Client/Saved/Recordings/ThreeBuildGameplay/' + 'nested/'.repeat(14) + 'capture.png', prefix = '그림 (', cols = 58;
  const first = cols - width(prefix) - 2, second = first + cols - 4;
  const f = await fixture(prefix + image.slice(0, first) + '\r\n  ' + image.slice(first, second) + '\r\n  ' + image.slice(second) + ')', cols);
  for (const [row, col] of [[0, width(prefix) + 5], [1, 5], [2, 5]]) {
    expect(f.hit(row, col)).toEqual({ kind: 'image', text: image });
    const provided = (await f.links(row)).find(link => link.text === image);
    expect(provided.range.end.y).toBe(3);
    provided.activate({ button: 0, ctrlKey: false, metaKey: false, preventDefault() {} }, provided.text);
    expect(f.open).toHaveBeenLastCalledWith('session', image, false);
  }
});
it('does not consume adjacent uncolored Korean prose at the end of a path', async () => {
  const prefix = '폴더 ', value = 'Docs/Project';
  const f = await fixture(prefix + '\x1b[32m' + value + '\x1b[39m는', 80);
  expect(f.hit(0, width(prefix) + 4)).toEqual({ kind: 'folder', text: value });
  expect(f.hit(0, width(prefix + value))).toBeNull();
  expect((await f.links(0)).find(link => link.text === value)).toBeDefined();
});
it('stops a highlighted wrapped path before attached prose and before a separate absolute path', async () => {
  const prefix = '녹화 ', cols = width(prefix) + cut + 2;
  const f = await fixture(prefix + '\x1b[32m' + folder.slice(0, cut) + '\x1b[39m\r\n  \x1b[32m' + folder.slice(cut) + '\x1b[39m는 완료', cols);
  expect(f.hit(1, 5)).toEqual({ kind: 'folder', text: folder });
  expect(f.hit(1, 2 + width(folder.slice(cut)))).toBeNull();
  const separate = await fixture('\x1b[32m' + folder.slice(0, cut) + '\x1b[39m\r\n  \x1b[32mC:/other/folder\x1b[39m', cut + 2);
  expect(separate.hit(0, 5)).toEqual({ kind: 'folder', text: folder.slice(0, cut) });
  expect(separate.hit(1, 7)).toEqual({ kind: 'terminal', text: 'C:/other/folder' });
});
it('does not infer continuation from ordinary same-color prose or another indented column', async () => {
  const prefix = 'report ', part = folder.slice(0, cut), cols = prefix.length + part.length + 2;
  const prose = await fixture('\x1b[32m' + prefix + part + '\r\n  unrelated sentence\x1b[39m', cols);
  expect(prose.hit(0, prefix.length + 5)).toEqual({ kind: 'folder', text: part });
  expect(prose.hit(1, 5)).toBeNull();
  const column = await fixture('\x1b[32m' + part + '\x1b[39m\r\n                    \x1b[32mother-folder\x1b[39m', part.length + 2);
  expect(column.hit(0, 5)).toEqual({ kind: 'folder', text: part });
});
