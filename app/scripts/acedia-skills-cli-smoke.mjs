import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { AcediaSkills } from '../electron/services/acedia-skills.mjs';
import { AccountPoolRpc } from '../electron/services/account-pool-rpc.mjs';
import { findExecutableOnPath } from '../electron/services/executable-path.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-skill-cli-'));
let rpc;
try {
  const home = path.join(root, 'codex'), executable = process.env.ACEDIA_CODEX_BINARY || findExecutableOnPath(process.platform === 'win32' ? 'codex.exe' : 'codex');
  assert.ok(executable, 'Installed Codex CLI required for the native skill-discovery check');
  const installed = await new AcediaSkills().install(home); assert.equal(installed.ready, true);
  const env = { ...process.env, CODEX_HOME: home };
  for (const name of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_BASE_URL']) delete env[name];
  rpc = new AccountPoolRpc({ file: executable, args: ['app-server'] }, env, root);
  await rpc.initialize();
  // This is a read-only skill catalog request: no thread, turn, login or model
  // generation is started and no existing account configuration is copied.
  const result = await rpc.call('skills/list', { cwds: [root], forceReload: true }, 10000);
  const skills = (result.data || []).flatMap(item => item.skills || []);
  const expected = installed.skills.map(skill => skill.name);
  for (const name of expected) assert.ok(skills.some(skill => skill.name === name), 'Codex did not discover ' + name);
  console.log('ACEDIA_BUNDLED_SKILLS_NATIVE_CODEX_DISCOVERY_NO_MODEL_REQUEST_OK ' + expected.join(','));
} finally {
  rpc?.close();
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-skill-cli-')) throw new Error('Unexpected cleanup path');
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
