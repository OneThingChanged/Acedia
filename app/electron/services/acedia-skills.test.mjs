import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AcediaSkills } from './acedia-skills.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-skills-')) throw new Error('Unexpected cleanup path');
  fs.rmSync(root, { recursive: true });
} });
function fixture() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-skills-')); roots.push(root); return root; }
it('installs the same discoverable standalone skills and references into isolated provider homes idempotently', async () => {
  const root = fixture(), service = new AcediaSkills();
  for (const provider of ['codex', 'claude']) {
    const home = path.join(root, provider);
    expect(service.status(home).ready).toBe(false);
    expect(await service.install(home)).toMatchObject({ ready: true, changed: true, bundleVersion: 1 });
    expect(await service.install(home)).toMatchObject({ ready: true, changed: false });
    const status = service.status(home);
    expect(status.skills.map(skill => skill.name).sort()).toEqual(['acedia-browser', 'acedia-connection', 'acedia-page-capture', 'acedia-workspace']);
    for (const [relative, content] of Object.entries(service.bundle())) {
      expect(fs.readFileSync(path.join(home, 'skills', relative), 'utf8')).toBe(content);
      if (relative.endsWith('SKILL.md')) expect(content).toMatch(/^---\r?\nname: [a-z0-9-]+\r?\ndescription: .+\r?\n---/);
      for (const match of content.matchAll(/\]\((references\/[^)]+)\)/g)) expect(fs.existsSync(path.join(home, 'skills', path.dirname(relative), match[1]))).toBe(true);
    }
    expect(fs.existsSync(path.join(home, '.codex-plugin'))).toBe(false); expect(fs.existsSync(path.join(home, '.claude-plugin'))).toBe(false);
  }
});
it('updates unchanged owned files while retaining user modifications and restoring missing bundled files', async () => {
  const home = fixture(), relative = 'acedia-test/SKILL.md', reference = 'acedia-test/references/detail.md';
  const first = new AcediaSkills({ entries: { [relative]: 'original', [reference]: 'old reference' } });
  await first.install(home);
  const second = new AcediaSkills({ entries: { [relative]: 'updated', [reference]: 'new reference' }, version: 2 });
  fs.writeFileSync(path.join(home, 'skills', reference), 'user notes');
  expect(await second.install(home)).toMatchObject({ ready: false, state: 'attention', skills: [{ name: 'acedia-test', state: 'modified' }] });
  expect(fs.readFileSync(path.join(home, 'skills', relative), 'utf8')).toBe('updated');
  expect(fs.readFileSync(path.join(home, 'skills', reference), 'utf8')).toBe('user notes');
  fs.rmSync(path.join(home, 'skills', reference));
  expect((await second.install(home)).ready).toBe(true);
  expect(fs.readFileSync(path.join(home, 'skills', reference), 'utf8')).toBe('new reference');
});
it('preserves unowned conflicting skills and unrelated files while adopting identical shipped content', async () => {
  const home = fixture(), relative = 'acedia-test/SKILL.md';
  fs.mkdirSync(path.join(home, 'skills/acedia-test'), { recursive: true });
  fs.writeFileSync(path.join(home, 'skills', relative), 'my custom skill');
  fs.writeFileSync(path.join(home, 'skills', 'keep.txt'), 'unrelated');
  const service = new AcediaSkills({ entries: { [relative]: 'shipped', 'acedia-test/references/detail.md': 'new reference' } });
  expect((await service.install(home)).ready).toBe(false);
  expect(fs.readFileSync(path.join(home, 'skills', relative), 'utf8')).toBe('my custom skill');
  expect(fs.readFileSync(path.join(home, 'skills', 'keep.txt'), 'utf8')).toBe('unrelated');
  expect(fs.existsSync(path.join(home, 'skills/acedia-test/references/detail.md'))).toBe(false);
  fs.writeFileSync(path.join(home, 'skills', relative), 'shipped');
  expect((await service.install(home)).ready).toBe(true);
});
it('reports an unreadable manifest and linked paths without overwriting data or failing the session caller', async () => {
  const root = fixture(), home = path.join(root, 'home'), outside = path.join(root, 'outside');
  fs.mkdirSync(path.join(home, 'skills'), { recursive: true });
  const manifest = path.join(home, 'skills/.acedia-managed-skills.json'); fs.writeFileSync(manifest, 'invalid json');
  const service = new AcediaSkills({ entries: { 'acedia-test/SKILL.md': 'shipped' } });
  expect(await service.install(home)).toMatchObject({ state: 'error', reason: 'manifest-unreadable' });
  expect(fs.readFileSync(manifest, 'utf8')).toBe('invalid json'); fs.rmSync(manifest);
  fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'SKILL.md'), 'outside data');
  fs.symlinkSync(outside, path.join(home, 'skills/acedia-test'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(await service.install(home)).toMatchObject({ state: 'error', reason: 'linked-skill-path' });
  expect(fs.readFileSync(path.join(outside, 'SKILL.md'), 'utf8')).toBe('outside data');
  fs.unlinkSync(path.join(home, 'skills/acedia-test'));
});
