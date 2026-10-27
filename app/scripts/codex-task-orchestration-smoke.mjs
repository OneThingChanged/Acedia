import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pty from 'node-pty';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';
import { ActiveQuestions } from '../electron/services/active-questions.mjs';
import { SessionDeliveries, deliveryComposerReady } from '../electron/services/session-delivery.mjs';
import { submitPtyMessage, encodeConptyUnicode } from '../electron/services/pty-submit.mjs';
import { lastTurnModel } from '../electron/services/session-model-service.mjs';
import { nativeCodexModel } from '../electron/services/session-model-memory.mjs';
import { TaskOrchestration } from '../electron/services/task-orchestration.mjs';
import { HookService } from '../electron/services/hook-service.mjs';
import { StartupAutomation, startupPrompt } from '../electron/services/startup-automation.mjs';
import { WorkspaceManagement } from '../electron/services/workspace-management.mjs';

// Installed Codex, temporary homes, fake credentials, loopback Responses fixture.
// This never calls a live model or sends a prompt to an existing user session.
const binary = process.env.ACEDIA_CODEX_BINARY;
assert.ok(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set ACEDIA_CODEX_BINARY to the installed Codex executable.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-task-native-')), calls = [], live = new Map([['a', { cwd: root }]]), workers = new Map();
const model = { model: 'gpt-6.1-sol', effort: 'high' };
const catalog = { projects: [{ id: 'p', folder: root }], agents: [{ id: 'a', projectId: 'p', aiToolId: 'codex' }], availableTools: [{ id: 'codex' }] };
const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
const pool = new AccountPool(path.join(root, 'pool'), { port: 0, safeStorage, fetchImpl: async (url, options) => {
  if (url.includes('/models')) return new Response('{"models":[]}', { headers: { 'content-type': 'application/json' } });
  const request = JSON.parse(options.body); calls.push(request);
  const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'TASK_NATIVE_FIXTURE_OK', annotations: [] }] };
  const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now() / 1000), status: 'completed', model: request.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
  const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } }, { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } }, { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
  return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
} });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (fn, label, timeout = 40000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await wait(100); } throw Error('Native task timeout: ' + label); };
const questions = new ActiveQuestions(); let engine, deliveries, polling, hook;
const freshRead = id => {
  const w = workers.get(id), entry = live.get(id);
  return w && deliveryComposerReady(entry) && nativeCodexModel(entry)
    ? { sessionId: w.conversationId ?? null, turn: null, lifecycle: 'idle', question: null, startupTrust: entry.startupTrustConfirmation } : null;
};
const read = async id => {
  const w = workers.get(id); if (!w) return null;
  if (!w.file) {
    const sessions = path.join(w.home, 'sessions'); if (!fs.existsSync(sessions)) return freshRead(id);
    const relative = fs.readdirSync(sessions, { recursive: true }).find(p => p.endsWith('.jsonl')); if (!relative) return freshRead(id);
    w.file = path.join(sessions, relative); w.conversationId = path.basename(relative).match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
  }
  return questions.read({ id, tool: 'codex', root: path.join(w.home, 'sessions'), transcriptPath: w.file, sessionId: w.conversationId, startedAt: live.get(id).startedAt });
};
try {
  hook = new HookService({ baseDir: path.join(root, 'hooks'), sessionService: { noteHook: async () => {} }, sendEvent: () => {}, onHook: event => {
    const w = workers.get(event.id); if (w && event.event === 'session-start') { w.conversationId = event.session_id; w.startedHook = true; }
  } });
  await hook.start(); await hook.setupProject(root, 'codex');
  const account = pool.account(pool.create('native task fixture'));
  account.auth = pool.seal(JSON.stringify({ tokens: { access_token: 'x.' + Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 3600 })).toString('base64url') + '.x', refresh_token: 'fixture', account_id: 'fixture' } }));
  account.status = 'ready'; pool.update(account.id, true); await pool.setEnabled(true);
  deliveries = new SessionDeliveries({ file: path.join(root, 'deliveries.json'), read, freshRead,
    context: id => live.has(id) ? { entry: live.get(id), name: id, conversationId: workers.get(id)?.conversationId ?? null } : null,
    ready: target => deliveryComposerReady(target.entry),
    submit: (id, entry, message, isCurrent) => submitPtyMessage({ ptyProcess: entry.process, message, isCurrent, encodeInput: process.platform === 'win32' ? encodeConptyUnicode : undefined }),
  });
  const options = { file: path.join(root, 'tasks.json'), catalog: () => catalog, runtime: id => live.get(id), read, delivery: deliveries,
    defaults: () => model, models: async () => ({ models: [{ model: model.model, efforts: [{ effort: model.effort }] }] }),
    launchedModel: id => nativeCodexModel(live.get(id)), actualModel: async (id, since) => lastTurnModel(workers.get(id)?.file, 'codex', since),
    answer: async () => {}, stop: async id => { live.get(id)?.process.kill(); live.delete(id); },
    createSession: async payload => {
      const home = path.join(root, payload.id); fs.mkdirSync(home); fs.writeFileSync(path.join(home, 'config.toml'), '[windows]\nsandbox="unelevated"\n');
      const launch = await pool.launch(payload.id), filter = new CodexScrollbackFilter(34, 140);
      const env = { ...process.env, CODEX_HOME: home, ...launch.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', MULTIAGENT_AGENT_ID: payload.id, MULTIAGENT_PORT: String(hook.port), MULTIAGENT_TOKEN: hook.token };
      for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
      const terminal = pty.spawn(binary, ['--no-alt-screen', '-m', payload.modelSettings.model, ...launch.args,
        '-c', `model_reasoning_effort=${JSON.stringify(payload.modelSettings.effort)}`, '-c', 'features.daemon_auto_start=false', '-c', 'features.hooks=true', '-c', 'features.plugins=false', '-c', 'analytics.enabled=false'],
      { cwd: root, env, cols: 140, rows: 34, name: 'xterm-256color', useConpty: true });
      const entry = { id: payload.id, cwd: root, aiToolId: 'codex', startedAt: Date.now(), lastInputAt: 0, process: terminal, filter };
      live.set(payload.id, entry); workers.set(payload.id, { home, filter, terminal }); catalog.agents.push({ id: payload.id, projectId: payload.projectId, aiToolId: 'codex', sessionHierarchy: payload.sessionHierarchy });
      terminal.onData(data => { const w = workers.get(payload.id); if (w) w.rawBytes = (w.rawBytes || 0) + Buffer.byteLength(data); if (data.includes('\x1b[6n')) terminal.write('\x1b[1;1R'); filter.push(data); });
      terminal.onExit(() => { const worker = workers.get(payload.id); if (worker) worker.exited = true; });
      await until(() => startupPrompt(entry)?.startupKind === 'folder-trust', 'native untrusted folder screen');
      const writes = [];
      const automation = new StartupAutomation({ entry: id => live.get(id), allowedRoot: id => engine.startupTrustRoot(id),
        write: (_id, key) => { writes.push(key); terminal.write(key); } });
      assert.equal(automation.check(payload.id), true, 'API-created project folder was not confirmed');
      assert.equal(automation.check(payload.id), false, 'Duplicate folder confirmation'); assert.deepEqual(writes, ['\r']);
      console.log('TASK_STARTUP_INSTALLED_CODEX_API_FOLDER_AUTO_TRUST_WITHOUT_OPT_IN_ONCE_OK');
      // These six hooks were generated above inside this disposable fixture.
      // Exercise their explicit startup review rather than bypassing trust.
      await until(() => /3\. Continue without trusting/.test(filter.viewportText()), 'fixture hook trust screen');
      if (/Hooks need review/.test(filter.viewportText())) {
        await wait(250); terminal.write('\x1b[B');
        await until(() => /› 2\. Trust all/.test(filter.viewportText()), 'fixture hook trust selection');
        terminal.write('\r');
      }
      return { id: payload.id };
    },
  };
  const workspace = new WorkspaceManagement({ catalog: () => catalog, isActive: id => live.has(id), create: options.createSession });
  options.createSession = payload => workspace.createTaskSession(payload);
  engine = new TaskOrchestration(options);
  assert.equal(engine.startupTrust('a').enabled, false, 'Manual-session project opt-in must remain off');
  polling = setInterval(async () => { for (const [id] of workers) deliveries.observe(id, live.get(id), await read(id)); await engine.tick(); }, 100);
  const planned = await engine.handle({ agentId: 'a', action: 'plan', body: { requestKey: 'native', title: 'Native Codex fixture', request: 'local fixture only', tasks: [{ id: 'native', title: 'Native worker', goal: 'Reply TASK_NATIVE_FIXTURE_OK. Do not call tools.', acceptance: 'native model and turn validated', dependsOn: [], writeScopes: [] }] } });
  await until(() => engine.data.runs[0].tasks[0].state === 'running', 'fresh worker first dispatch');
  const attempt = engine.data.runs[0].tasks[0].attempts[0];
  await until(async () => (await read(attempt.sessionId))?.turn?.status === 'done', 'native task completion');
  assert.equal(engine.data.runs[0].tasks[0].state, 'running');
  await engine.handle({ agentId: attempt.sessionId, action: 'result', body: { runId: planned.run.id, taskId: 'native', attemptId: attempt.id, conversationId: attempt.conversationId, turnId: attempt.turnId,
    result: { summary: 'Native Codex returned fixture response', changedFiles: [], checks: [{ command: 'loopback Responses request model/effort and exact native turn', passed: true, output: 'native transcript/task_complete validated' }] } } });
  await engine.handle({ agentId: 'a', action: 'review', body: { runId: planned.run.id, taskId: 'native', attemptId: attempt.id, accept: true, note: 'Actual model and turn checked against fixture upstream' } });
  assert.ok(calls.length > 0 && calls.every(c => c.model === model.model && c.reasoning.effort === model.effort));
  engine.close(); engine = new TaskOrchestration(options); await engine.tick(); assert.equal(engine.data.runs[0].tasks[0].state, 'completed');
  console.log('TASK_ORCHESTRATION_INSTALLED_CODEX_FIRST_TURN_MODEL_EFFORT_RESULT_REVIEW_RESTART_OK');
} catch (error) {
  console.error('Native task diagnostics', JSON.stringify(engine?.data.runs.map(r => r.tasks.map(t => ({ state: t.state, reason: t.reason })))));
  console.error('Fixture hooks:', JSON.stringify(hook?.recentEvents));
  for (const [id, w] of workers) console.error('Fixture evidence:', JSON.stringify({ rawBytes: w.rawBytes, exited: w.exited, startedHook: w.startedHook, conversationId: w.conversationId, model: nativeCodexModel(live.get(id)), ready: deliveryComposerReady(live.get(id)), files: fs.readdirSync(w.home, { recursive: true }).filter(f => f.endsWith('.jsonl')) }));
  for (const w of workers.values()) console.error('Fixture screen:', w.filter.viewportText()); throw error;
} finally {
  clearInterval(polling); engine?.close(); deliveries?.dispose();
  for (const w of workers.values()) {
    if (!w.exited && deliveryComposerReady({ filter: w.filter })) {
      await submitPtyMessage({ ptyProcess: w.terminal, message: '/quit' }).catch(() => {});
      for (let n = 0; n < 20 && !w.exited; n++) await wait(100);
    }
    // node-pty retains its ConPTY handles after the shell exits normally.
    // Release the terminal in both cases so the fixture process can finish.
    w.terminal.kill();
    w.filter.dispose();
  }
  pool.close(); assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('acedia-task-native-'));
  if (hook) await hook.stop();
  await fs.promises.rm(root, { recursive: true, maxRetries: 10, retryDelay: 200 });
}
