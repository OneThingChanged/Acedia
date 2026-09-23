import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareWorkerRoleFiles } from './worker-role-config.mjs';
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function directory() { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-worker-test-')); roots.push(root); return root; }
describe('worker role files', () => {
  it('preserves different settings and reuses immutable files across concurrent sessions', async () => {
    const root = await directory();
    const roles = { documents: { provider: 'codex', model: 'gpt-6-sol', effort: 'xhigh' }, html: { provider: 'codex', model: 'gpt-6-luna', effort: 'max' } };
    const [first, second] = await Promise.all([prepareWorkerRoleFiles(root, roles), prepareWorkerRoleFiles(root, roles)]);
    expect(first).toEqual(second);
    expect(first.documents).not.toBe(first.html);
    expect(await fs.readFile(first.documents, 'utf8')).toBe('model = "gpt-6-sol"\nmodel_reasoning_effort = "xhigh"\n');
    const changed = await prepareWorkerRoleFiles(root, { documents: { ...roles.documents, effort: 'low' } });
    expect(changed.documents).not.toBe(first.documents);
    expect(await fs.readFile(first.documents, 'utf8')).toContain('"xhigh"');
  });
  it('rejects arbitrary paths and injected TOML before writing a file', async () => {
    const root = await directory();
    await expect(prepareWorkerRoleFiles(root, { documents: { provider: 'codex', model: 'x"\n[unsafe]', effort: 'max' } })).rejects.toThrow('Invalid');
    expect(await fs.readdir(root)).toEqual([]);
  });
});
