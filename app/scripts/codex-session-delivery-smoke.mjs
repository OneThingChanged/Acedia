import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as pty from 'node-pty';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { ActiveQuestions } from '../electron/services/active-questions.mjs';
import { SessionDeliveries, deliveryComposerReady } from '../electron/services/session-delivery.mjs';
import { WorkspaceManagement } from '../electron/services/workspace-management.mjs';
import { HookService } from '../electron/services/hook-service.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';
import { codexRetryPromptReady } from '../electron/services/codex-capacity-retry.mjs';
import { submitPtyMessage, encodeConptyUnicode } from '../electron/services/pty-submit.mjs';

// Installed native Codex, fake credentials, isolated profile and loopback model
// fixtures only. This never sends work to a user's existing session/account.
const binary = process.env.ACEDIA_CODEX_BINARY;
assert.ok(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set ACEDIA_CODEX_BINARY to the installed Codex executable.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-delivery-cli-'));
const home = path.join(root, 'cli'); fs.mkdirSync(home);
fs.writeFileSync(path.join(home, 'config.toml'), `[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n`);
const calls = [], updates = [];
let terminal, service, hook, mcp, transcript, conversationId, polling;
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const pool = new AccountPool(path.join(root, 'pool'), { port: 0, safeStorage, fetchImpl: async (url, options) => {
  if (url.includes('/models')) return new Response('{"models":[]}', { headers: { 'content-type': 'application/json' } });
  const request = JSON.parse(options.body); calls.push(request);
  const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'SESSION_DELIVERY_FIXTURE_OK', annotations: [] }] };
  const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: request.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } },
    { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
  return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
} });
const filter = new CodexScrollbackFilter(34, 140), questions = new ActiveQuestions();
const wait = delay => new Promise(resolve => setTimeout(resolve, delay));
const waitFor = async (condition, label) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) { if (await condition()) return; await wait(100); }
  const buffer = filter.shadow.buffer.active, line = buffer.getLine(buffer.baseY + buffer.cursorY);
  const cells = Array.from({ length: 32 }, (_, i) => { const c = line?.getCell(i); return c ? { chars: c.getChars(), color: c.getFgColor(), palette: c.isFgPalette(), rgb: c.isFgRGB(), dim: c.isDim() } : null; });
  throw new Error(`Timed out: ${label}\n${filter.viewportText()}\nCursor: ${buffer.cursorX},${buffer.cursorY}\n${JSON.stringify(cells)}`);
};
try {
  const a = pool.account(pool.create('local fixture'));
  a.auth = pool.seal(JSON.stringify({ tokens: { access_token: 'x.' + Buffer.from(JSON.stringify({ exp: Date.now()/1000 + 3600 })).toString('base64url') + '.x', refresh_token: 'fixture', account_id: 'fixture' } }));
  a.status = 'ready'; pool.update(a.id, true); await pool.setEnabled(true);
  const launch = await pool.launch('target');
  const env = { ...process.env, CODEX_HOME: home, ...launch.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
  terminal = pty.spawn(binary, ['--no-alt-screen', '-m', 'gpt-6.1-sol', ...launch.args, '-c', 'model_reasoning_effort="high"',
    '-c', 'features.daemon_auto_start=false', '-c', 'features.hooks=false', '-c', 'features.plugins=false', '-c', 'analytics.enabled=false'],
    { cwd: root, env, cols: 140, rows: 34, name: 'xterm-256color', useConpty: true });
  const entry = { id: 'target', aiToolId: 'codex', startedAt: Date.now(), lastInputAt: 0, process: terminal, filter }, caller = {};
  terminal.onData(data => { if (data.includes('\x1b[6n')) terminal.write('\x1b[1;1R'); filter.push(data); });
  const read = async () => {
    if (!transcript) {
      const folder = path.join(home, 'sessions'); if (!fs.existsSync(folder)) return null;
      const file = fs.readdirSync(folder, { recursive: true }).find(file => file.endsWith('.jsonl')); if (!file) return null;
      transcript = path.join(folder, file); conversationId = path.basename(file).match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
    }
    return questions.read({ id: entry.id, tool: 'codex', root: path.join(home, 'sessions'), transcriptPath: transcript, sessionId: conversationId, startedAt: entry.startedAt });
  };
  await waitFor(() => codexRetryPromptReady(filter.viewportText()), 'initial composer');
  await submitPtyMessage({ ptyProcess: terminal, message: 'Remember ORIGINAL_CONTEXT_MARKER. Reply SESSION_DELIVERY_FIXTURE_OK. Do not call tools.' });
  await waitFor(async () => (await read())?.turn?.status === 'done' && deliveryComposerReady(entry), 'completed native composer');
  const options = { file: path.join(root, 'deliveries.json'), read,
    context: id => id === 'caller' ? { entry: caller, name: 'ProjectWitch', projectName: 'Fixture' }
      : id === 'target' ? { entry, name: 'UI', conversationId } : null,
    ready: () => deliveryComposerReady(entry), publish: payload => updates.push(payload),
    submit: (_id, _entry, message, isCurrent) => submitPtyMessage({ ptyProcess: terminal, message, isCurrent, encodeInput: encodeConptyUnicode }) };
  service = new SessionDeliveries(options);
  let busy = false;
  polling = setInterval(async () => {
    if (busy) return; busy = true;
    try { service.poll(); const result = await read(); if (result) service.observe(entry.id, entry, result); } finally { busy = false; }
  }, 100);
  const workspace = new WorkspaceManagement({ catalog: () => ({ projects: [{ id: 'p', name: 'Fixture', folder: root }],
    agents: [{ id: 'caller', name: 'ProjectWitch', projectId: 'p', aiToolId: 'codex' }, { id: 'target', name: 'UI', projectId: 'p', aiToolId: 'codex' }] }),
    isActive: id => ['caller', 'target'].includes(id), deliveries: service, sessionState: id => ({ conversationId: id === 'target' ? conversationId : null }) });
  hook = new HookService({ baseDir: path.join(root, 'hook'), workspaceProvider: request => workspace.handle(request) }); await hook.start();
  mcp = spawn(process.execPath, [path.resolve(import.meta.dirname, '../electron/services/browser-mcp-server.mjs')], { windowsHide: true,
    env: { ...process.env, MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token, MULTIAGENT_AGENT_ID: 'caller' }, stdio: ['pipe', 'pipe', 'ignore'] });
  let nextId = 0, buffer = ''; const pending = new Map();
  mcp.stdout.on('data', chunk => { buffer += chunk; let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) { const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); pending.get(message.id)?.(message.result); pending.delete(message.id); }
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(Error('MCP response timeout')); }, 15000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); }); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await rpc('initialize');
  assert.ok((await rpc('tools/list')).tools.some(t => t.name === 'acedia_session_send'));
  const listed = await rpc('tools/call', { name: 'acedia_projects' }); assert.equal(listed.structuredContent.sessions[1].conversationId, conversationId);
  const message = '노드 선택 UI 초안: 인벤토리·캐릭터·지도 A02 → 확인! 🚀\n1~3개 후보, 준비 중/실패 상태를 HTML로 보여 주세요. 원래 작업 문맥을 유지해 주세요.';
  const body = { sessionId: 'target', expectedConversationId: conversationId, message, requestKey: 'node-ui-1', waitMs: 10000 };
  assert.equal((await rpc('tools/call', { name: 'acedia_session_send', arguments: { ...body, message: 'tab\tinput', requestKey: 'invalid-tab' } })).isError, true);
  const sent = await rpc('tools/call', { name: 'acedia_session_send', arguments: body });
  assert.ok(!sent.isError, JSON.stringify(sent)); const receipt = sent.structuredContent;
  if (receipt.status !== 'started') {
    console.log('DELIVERY_DIAGNOSTIC', JSON.stringify({ receipt, evidence: await read(), updates, screen: filter.viewportText(),
      userMessages: fs.readFileSync(transcript, 'utf8').split('\n').flatMap(line => { try { const r = JSON.parse(line); return r.type === 'response_item' && r.payload?.type === 'message' && r.payload.role === 'user' ? [r.payload.content] : []; } catch { return []; } }).slice(-2) }));
  }
  assert.equal(receipt.status, 'started'); assert.ok(receipt.sentAt && receipt.receivedAt && receipt.startedAt && receipt.turnId);
  await waitFor(async () => (await read())?.turn?.status === 'done', 'completed handoff task');
  const generations = () => calls.filter(c => !JSON.stringify(c.input).includes('Generate a concise, single-line task title'));
  const last = generations().at(-1);
  assert.ok(last.input.some(item => JSON.stringify(item).includes('ORIGINAL_CONTEXT_MARKER')));
  assert.ok(last.input.some(item => item.role === 'user' && item.content.some(c => c.text?.includes(message))));
  const count = generations().length;
  const again = await rpc('tools/call', { name: 'acedia_session_send', arguments: body });
  assert.equal(again.structuredContent.deliveryId, receipt.deliveryId); assert.equal(again.structuredContent.status, 'started');
  assert.equal((await rpc('tools/call', { name: 'acedia_session_delivery', arguments: { requestKey: 'node-ui-1' } })).structuredContent.status, 'started');
  const restarted = new SessionDeliveries(options); assert.equal((await restarted.handle({ action: 'send', agentId: 'caller', body })).deliveryId, receipt.deliveryId);
  await wait(800); assert.equal(generations().length, count);
  assert.ok(generations().every(c => c.model === 'gpt-6.1-sol' && c.reasoning.effort === 'high'));
  assert.ok(updates.some(u => u.status === 'received')); assert.ok(updates.some(u => u.status === 'started'));
  console.log('SESSION_DELIVERY_REAL_MCP_CODEX_RECEIPT_START_UNICODE_CONTEXT_AND_NO_REPLAY_OK');
} finally {
  clearInterval(polling); service?.dispose();
  if (mcp) { mcp.stdin.end(); mcp.kill(); }
  if (hook) await new Promise(resolve => { hook.server.closeAllConnections(); hook.server.close(resolve); });
  if (terminal) { const closed = new Promise(resolve => { const timer = setTimeout(resolve, 2000); terminal.onExit(() => { clearTimeout(timer); resolve(); }); }); terminal.kill(); await closed; }
  filter.dispose(); pool.close();
  assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('acedia-delivery-cli-'));
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
