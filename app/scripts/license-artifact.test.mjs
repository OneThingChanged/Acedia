import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
const { prepareLicenseArtifact } = createRequire(import.meta.url)('./license-artifact.cjs');
const roots = [];
function fixture(text) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-license-')); roots.push(root);
  fs.writeFileSync(path.join(root, 'LICENSE'), text, 'utf8'); return root;
}
afterEach(() => { for (const root of roots.splice(0)) {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-license-')) throw Error('Unexpected fixture path');
  fs.rmSync(root, { recursive: true });
} });
const heading = 'Acedia Personal Use and Organization Permission License 1.0\n';
it('derives deterministic installer text without mutating the canonical license and escapes RTF controls/unicode', () => {
  const text = heading + 'Line {one}\\two\n한\n', root = fixture(text);
  const first = prepareLicenseArtifact({ root }), second = prepareLicenseArtifact({ root });
  expect(first).toEqual(second); expect(fs.readFileSync(first.license, 'utf8')).toBe(text);
  const rtf = fs.readFileSync(first.file, 'utf8');
  expect(rtf).toContain('Line \\{one\\}\\\\two\\par\n'); expect(rtf).toContain('\\u-10916?');
  fs.writeFileSync(first.license, text + 'Another term\n');
  const changed = prepareLicenseArtifact({ root }); expect(changed.file).not.toBe(first.file);
  expect(fs.readFileSync(first.file, 'utf8')).toBe(rtf); expect(fs.readFileSync(changed.file, 'utf8')).toContain('Another term');
});
it('rejects an unexpected root license rather than shipping a misleading EULA', () => {
  const root = fixture('MIT License\n'); expect(() => prepareLicenseArtifact({ root })).toThrow('Unexpected Acedia license');
  expect(fs.existsSync(path.join(root, '.build-tools/licenses'))).toBe(false);
});
it('keeps historical MIT and separately licensed assets while marking only private application metadata proprietary', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  expect(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')).toContain('1.8.2.10 and later');
  expect(fs.readFileSync(path.join(root, 'licenses/ACEDIA-LEGACY-MIT.txt'), 'utf8')).toContain('to use, copy, modify, merge, publish, distribute');
  expect(fs.readFileSync(path.join(root, 'mobile/LICENSE'), 'utf8')).toContain('650 Industries');
  expect(fs.readFileSync(path.join(root, 'app/public/pixel-agents/LICENSE.txt'), 'utf8')).toContain('Pablo De Lucca');
  for (const name of ['app', 'mobile']) {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, name, 'package.json')));
    expect(metadata.private).toBe(true); expect(metadata.license).toBe('UNLICENSED');
    expect(JSON.parse(fs.readFileSync(path.join(root, name, 'package-lock.json'))).packages[''].license).toBe(metadata.license);
  }
});
