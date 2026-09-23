import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Immutable, content-addressed role layers: concurrent sessions cannot overwrite
// one another and resuming a session can reuse the exact same model settings.
export async function prepareWorkerRoleFiles(directory, roles) {
  const result = {};
  for (const kind of ['documents', 'html']) {
    const config = roles?.[kind];
    if (!config) continue;
    if (config.provider !== 'codex' || typeof config.model !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(config.model) ||
        !['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(config.effort)) {
      throw new Error('Invalid worker model or reasoning effort');
    }
    const content = `model = ${JSON.stringify(config.model)}\nmodel_reasoning_effort = ${JSON.stringify(config.effort)}\n`;
    const digest = createHash('sha256').update(content).digest('hex');
    const root = path.join(directory, 'worker-roles');
    await fs.mkdir(root, { recursive: true });
    const file = path.join(root, `${digest}.toml`);
    // Publish complete files atomically, including simultaneous first launches.
    const temporary = path.join(root, `${digest}-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      try { await fs.rename(temporary, file); }
      catch (error) {
        if (await fs.readFile(file, 'utf8').catch(() => null) !== content) throw error;
      }
    } finally { await fs.rm(temporary, { force: true }); }
    result[kind] = file;
  }
  return result;
}
