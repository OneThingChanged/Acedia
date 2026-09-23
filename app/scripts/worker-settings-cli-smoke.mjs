import { build } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { AccountPoolRpc } from '../electron/services/account-pool-rpc.mjs';
import { prepareWorkerRoleFiles } from '../electron/services/worker-role-config.mjs';
const binary = process.env.ACEDIA_CODEX_BINARY;
if (!binary || !path.isAbsolute(binary)) throw new Error('Set ACEDIA_CODEX_BINARY to the installed Codex executable.');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-worker-cli-'));
let rpc;
try {
  const bundle = path.join(root, 'workers.mjs');
  await build({ entryPoints: [new URL('../src/lib/sessionWorkers.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], bundle: true, platform: 'node', format: 'esm', outfile: bundle });
  const { addSessionWorkerArgs, workerRoles } = await import(pathToFileURL(bundle));
  const settings = { documents: { provider: 'codex', model: 'gpt-6-sol', effort: 'xhigh' }, html: { provider: 'codex', model: 'gpt-6-luna', effort: 'max' } };
  const files = await prepareWorkerRoleFiles(root, workerRoles(settings));
  const command = addSessionWorkerArgs('codex', 'codex', settings, files);
  const args = ['app-server', '--strict-config'];
  for (const match of command.matchAll(/ -c '([^']*)'/g)) args.push('-c', match[1]);
  const home = path.join(root, 'home'); await fs.mkdir(home);
  const env = { ...process.env, CODEX_HOME: home };
  for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
  rpc = new AccountPoolRpc({ file: binary, args }, env, home);
  await rpc.initialize();
  const { config } = await rpc.call('config/read', { includeLayers: false });
  assert.equal(config.agents.multiagent_docs_writer.config_file, files.documents);
  assert.equal(config.agents.multiagent_html_builder.config_file, files.html);
  assert.match(config.developer_instructions, /model=gpt-6-sol, reasoning_effort=xhigh/);
  assert.match(config.developer_instructions, /model=gpt-6-luna, reasoning_effort=max/);
  assert.equal((await rpc.call('account/read', { refreshToken: false })).account, null);
  console.log('WORKER_INSTALLED_CLI_STRICT_CONFIG_OK (no login or model request)');
} finally {
  rpc?.close();
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
