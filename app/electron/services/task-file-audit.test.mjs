import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { taskFileSnapshot } from './task-file-audit.mjs';
import { runGit } from './git-command.mjs';

it('observes changes in an isolated Git fixture without touching the existing work or index', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-task-audit-'));
  try {
    await runGit(root, ['init', '-q']);
    const prior = path.join(root, 'prior.txt'); fs.writeFileSync(prior, 'user change');
    const before = await taskFileSnapshot(root); expect(before.available).toBe(true);
    fs.writeFileSync(path.join(root, 'new.txt'), 'worker fixture');
    const after = await taskFileSnapshot(root);
    expect(after.files['prior.txt']).toBe(before.files['prior.txt']); expect(after.files['new.txt']).toBeTruthy();
    expect(fs.readFileSync(prior, 'utf8')).toBe('user change');
    expect(await runGit(root, ['diff', '--cached', '--name-only'])).toBe('');
    fs.writeFileSync(prior, 'changed again'); expect((await taskFileSnapshot(root)).files['prior.txt']).not.toBe(before.files['prior.txt']);
  } finally {
    assertFixtureRoot(root); fs.rmSync(root, { recursive: true });
  }
});
function assertFixtureRoot(root) { if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-task-audit-')) throw Error('Invalid cleanup path'); }
