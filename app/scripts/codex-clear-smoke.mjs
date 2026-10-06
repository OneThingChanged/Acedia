import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as pty from 'node-pty';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';
import { codexRetryPromptReady } from '../electron/services/codex-capacity-retry.mjs';
import { submitPtyMessage } from '../electron/services/pty-submit.mjs';
import { HookService } from '../electron/services/hook-service.mjs';
import { confirmCodexConversationReset } from '../electron/services/codex-conversation-reset.mjs';
import { deliveryComposerReady } from '../electron/services/session-delivery.mjs';

// Native CLI with isolated credentials and a loopback response fixture only.
const binary = process.env.ACEDIA_CODEX_BINARY;
assert.ok(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set ACEDIA_CODEX_BINARY.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-clear-cli-'));
const home = path.join(root, 'cli'); fs.mkdirSync(home);
fs.writeFileSync(path.join(home, 'config.toml'), `[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n`);
const calls = [];
const pool = new AccountPool(path.join(root, 'pool'), { port: 0,
  safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() },
  fetchImpl: async (url, options) => {
    if (url.includes('/models')) return new Response('{"models":[]}', { headers: { 'content-type': 'application/json' } });
    const request = JSON.parse(options.body); calls.push(request);
    const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'CLEAR_FIXTURE_OK', annotations: [] }] };
    const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: request.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } },
      { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
    return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  } });
const filter = new CodexScrollbackFilter(34, 140);
let terminal, hook, exited = false;
const hooks = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (check, label) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await check()) return; await wait(100); }
  throw new Error(`Timeout: ${label}\n${filter.viewportText()}`);
};
const files = () => fs.existsSync(path.join(home, 'sessions'))
  ? fs.readdirSync(path.join(home, 'sessions'), { recursive: true }).filter(f => f.endsWith('.jsonl')) : [];
try {
  hook = new HookService({ baseDir: path.join(root, 'hook'), onHook: event => hooks.push(event),
    sessionService: { noteHook: async () => {} }, sendEvent: () => {} });
  await hook.start(); await hook.setupProject(root, 'codex');
  const account = pool.account(pool.create('local fixture'));
  account.auth = pool.seal(JSON.stringify({ tokens: { access_token: 'x.' + Buffer.from(JSON.stringify({ exp: Date.now()/1000 + 3600 })).toString('base64url') + '.x', refresh_token: 'fixture', account_id: 'fixture' } }));
  account.status = 'ready'; pool.update(account.id, true); await pool.setEnabled(true);
  const launch = await pool.launch('target');
  const env = { ...process.env, CODEX_HOME: home, ...launch.env, TERM: 'xterm-256color', COLORTERM: 'truecolor',
    MULTIAGENT_AGENT_ID: 'target', MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token };
  for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
  terminal = pty.spawn(binary, ['--no-alt-screen', '-m', 'gpt-6.1-sol', ...launch.args,
    '-c', 'features.daemon_auto_start=false', '-c', 'features.hooks=true', '-c', 'features.plugins=false', '-c', 'analytics.enabled=false'],
    { cwd: root, env, cols: 140, rows: 34, name: 'xterm-256color', useConpty: true });
  terminal.onData(data => { if (data.includes('\x1b[6n')) terminal.write('\x1b[1;1R'); filter.push(data); });
  terminal.onExit(() => { exited = true; });
  await waitFor(() => /trust all/i.test(filter.viewportText()) || hooks.some(e => e.event === 'session-start'), 'startup hook review');
  if (filter.viewportText().includes('Trust all and continue')) {
    terminal.write('\x1b[B'); await wait(250); terminal.write('\r');
  } else if (filter.viewportText().includes('trust all')) {
    terminal.write('t'); await wait(500); terminal.write('\x1b');
  }
  await waitFor(() => codexRetryPromptReady(filter.viewportText()) && !filter.viewportText().includes('Lifecycle hooks from config'), 'initial composer');
  await submitPtyMessage({ ptyProcess: terminal, message: 'Remember ORIGINAL_CONTEXT_MARKER. Reply CLEAR_FIXTURE_OK. Do not call tools.' });
  await waitFor(() => files().some(f => fs.readFileSync(path.join(home, 'sessions', f), 'utf8').includes('"type":"task_complete"'))
    && codexRetryPromptReady(filter.viewportText()), 'first completed turn');
  const original = files();
  await waitFor(() => hooks.some(e => e.session_id), 'first turn identity');
  const beforeSessionId = hooks.findLast(e => e.session_id)?.session_id;
  assert.ok(beforeSessionId, 'initial session hook missing');
  let freshSessionId;
  const entry = { process: terminal, filter };
  assert.ok(deliveryComposerReady(entry), 'original composer is not empty');
  await submitPtyMessage({ ptyProcess: terminal, message: '/clear', confirm: async () => {
    freshSessionId = await confirmCodexConversationReset({ entry, previousSessionId: beforeSessionId,
      sessionId: () => hooks.findLast(e => e.session_id)?.session_id, isCurrent: () => true });
    return true;
  } });
  assert.ok(freshSessionId && freshSessionId !== beforeSessionId);
  await waitFor(() => codexRetryPromptReady(filter.viewportText()) && !filter.viewportText().includes('ORIGINAL_CONTEXT_MARKER'), 'clear accepted');
  await submitPtyMessage({ ptyProcess: terminal, message: 'Reply AFTER_CLEAR_FIXTURE. Do not call tools.' });
  await waitFor(() => calls.some(c => JSON.stringify(c.input).includes('AFTER_CLEAR_FIXTURE')) && files().some(f => !original.includes(f)), 'fresh conversation');
  const last = calls.findLast(c => JSON.stringify(c.input).includes('AFTER_CLEAR_FIXTURE'));
  assert.ok(!JSON.stringify(last.input).includes('ORIGINAL_CONTEXT_MARKER'), 'clear retained old model context');
  assert.ok(files().some(f => f.includes(freshSessionId)), 'status identity does not match new transcript');
  assert.ok(original.every(f => files().includes(f)), 'clear deleted a saved conversation');
  await waitFor(() => files().some(f => f.includes(freshSessionId) && fs.readFileSync(path.join(home,'sessions',f),'utf8').includes('"type":"task_complete"'))
    && deliveryComposerReady(entry), 'completed new turn');
  console.log('CODEX_NATIVE_CLEAR_NEW_CONVERSATION_AND_CONTEXT_OK');
} finally {
  if (terminal && !exited) { const closed = new Promise(r => { const timer = setTimeout(r, 2000); terminal.onExit(() => { clearTimeout(timer); r(); }); }); terminal.kill(); await closed; }
  filter.dispose(); pool.close();
  if (hook) await new Promise(r => { hook.server.closeAllConnections(); hook.server.close(r); });
  assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('acedia-clear-cli-'));
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
