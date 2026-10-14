import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AccountPool } from '../electron/services/account-pool.mjs';
import { createChatMessageSubmitter } from '../electron/services/chat-message-submission.mjs';
import { deliveryComposerReady } from '../electron/services/session-delivery.mjs';
import { TerminalSessionService } from '../electron/services/terminal-session-service.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';
import { RemoteDashboardService } from '../electron/services/web-services.mjs';

const require = createRequire(import.meta.url), sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
if (!process.versions.electron) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-chat-submit-'));
  try {
    const env = { ...process.env, ACEDIA_CHAT_SUBMIT_FIXTURE: root }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill(), 60000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    assert.equal(code, 0, 'Native chat submission smoke failed');
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-chat-submit-')) throw Error('Invalid fixture cleanup path');
    fs.rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
} else {
  const { app } = require('electron'), root = process.env.ACEDIA_CHAT_SUBMIT_FIXTURE;
  app.setPath('userData', path.join(root, 'electron')); app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const binary = process.env.ACEDIA_CODEX_BINARY;
    assert.ok(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Set ACEDIA_CODEX_BINARY to the installed native Codex executable');
    const home = path.join(root, 'home'); fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, 'config.toml'), `[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n`);
    const filter = new CodexScrollbackFilter(34, 140), writes = [];
    const pool = new AccountPool(path.join(root, 'pool'), { port: 0,
      safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() },
      fetchImpl: async (url, options) => {
        if (url.includes('/models')) return new Response('{"models":[]}');
        const request = JSON.parse(options.body);
        const item = { id: 'msg_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'CHAT_SUBMIT_OK', annotations: [] }] };
        const response = { id: 'resp_fixture', object: 'response', created_at: Math.floor(Date.now()/1000), status: 'completed', model: request.model,
          output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
        const events = [{ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
          { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress' } },
          { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response }];
        return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
      },
    });
    let terminal, web;
    try {
      const account = pool.account(pool.create('isolated fixture'));
      account.auth = pool.seal(JSON.stringify({ tokens: { access_token: 'x.' + Buffer.from(JSON.stringify({ exp: Date.now()/1000 + 3600 })).toString('base64url') + '.x', refresh_token: 'fixture', account_id: 'fixture' } }));
      account.status = 'ready'; pool.update(account.id, true); await pool.setEnabled(true);
      const launch = await pool.launch('fixture'), env = { ...process.env, CODEX_HOME: home, ...launch.env, TERM: 'xterm-256color' };
      for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/.test(key)) delete env[key];
      terminal = require('node-pty').spawn(binary, ['--no-alt-screen', '-m', 'gpt-6.1-sol', ...launch.args,
        '-c', 'features.daemon_auto_start=false', '-c', 'features.hooks=false', '-c', 'features.plugins=false', '-c', 'analytics.enabled=false'],
        { cwd: root, env, cols: 140, rows: 34, useConpty: true });
      terminal.onData(data => { if (data.includes('\x1b[6n')) terminal.write('\x1b[1;1R'); filter.push(data); });
      const entry = { id: 'fixture', aiToolId: 'codex', filter, process: {
        write(value) { writes.push(value); terminal.write(value); },
        onData(listener) {
          const subscription = terminal.onData(listener);
          // Reproduce the failing output-quiescence condition while exercising
          // the real native composer and transcript, with no paid model call.
          const timer = setInterval(() => listener('idle footer repaint'), 80);
          return { dispose() { clearInterval(timer); subscription.dispose(); } };
        },
      } };
      const transcript = () => { const folder = path.join(home, 'sessions'); if (!fs.existsSync(folder)) return null;
        const file = fs.readdirSync(folder, { recursive: true }).find(file => file.endsWith('.jsonl')); return file ? path.join(folder, file) : null; };
      const sessionId = () => transcript()?.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0];
      const userMessages = () => (transcript() ? fs.readFileSync(transcript(), 'utf8') : '').split('\n').flatMap(line => {
        try { const r = JSON.parse(line); return r.type === 'response_item' && r.payload?.role === 'user' ? [r.payload.content.map(c => c.text || '').join('\n')] : []; } catch { return []; }
      });
      const waitFor = async (condition, label) => { for (let i = 0; i < 250; i++) { if (condition()) return; await sleep(60); } throw Error('Timed out: ' + label + '\n' + filter.viewportText()); };
      const submit = createChatMessageSubmitter({ terminalSessions: new TerminalSessionService({ sessions: new Map([['fixture', entry]]) }),
        isClosing: () => false, questionResponder: { isBusy: () => false }, currentQuestion: async () => null,
        getSessionId: sessionId, composerReady: deliveryComposerReady, cancelRetry() {}, confirmReset() { throw Error('Unexpected reset'); }, onReset() {} });
      web = new RemoteDashboardService({ baseDir: path.join(root, 'web'), stateProvider: () => ({ agents: [{ id: 'fixture' }] }),
        submitPty: (id, message, options) => submit({ id, message, ...options }) });
      web.config.server_port = 0; const { url } = await web.start();
      let serial = 0;
      const requestId = () => `${Date.now()}-${String(++serial).padStart(32, '0')}`;
      const post = (message, id = requestId()) => fetch(url + '/api/session/submit', { method: 'POST',
        headers: { origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'fixture', message, requestId: id, sessionId: sessionId() }) });
      await waitFor(() => deliveryComposerReady(entry), 'native empty composer');
      const message = '원격 한 줄 메시지를 한 번만 전달해 주세요';
      assert.equal((await post(message)).status, 200);
      await waitFor(() => userMessages().includes(message) && deliveryComposerReady(entry), 'single-line receipt and completion');
      assert.deepEqual(writes, [message, '\r']); assert.equal(userMessages().filter(text => text === message).length, 1);
      const receivedBeforeRejection = userMessages().length;
      console.log('NATIVE_CODEX_SINGLE_LINE_ONCE_WITH_CONTINUOUS_REPAINT_OK');
      terminal.write('EXISTING_DRAFT'); await waitFor(() => filter.viewportText().includes('EXISTING_DRAFT'), 'parked terminal draft');
      const retryId = requestId(), rejected = await post('Reviewed retry message', retryId);
      assert.equal(rejected.status, 409); assert.equal((await rejected.json()).outcome, 'not-sent');
      assert.equal(writes.length, 2); assert.equal(userMessages().length, receivedBeforeRejection);
      terminal.write('\x15'); await waitFor(() => deliveryComposerReady(entry), 'manually cleared terminal draft');
      assert.equal((await post('Reviewed retry message', retryId)).status, 200);
      await waitFor(() => userMessages().includes('Reviewed retry message'), 'reviewed retry receipt');
      assert.deepEqual(writes, [message, '\r', 'Reviewed retry message', '\r']);
      assert.equal(userMessages().filter(text => text === 'Reviewed retry message').length, 1);
      console.log('NATIVE_CODEX_REMOTE_DRAFT_BLOCKED_WITHOUT_PASTE_AND_REVIEWED_RETRY_ONCE_OK');
    } finally { await web?.stop(); terminal?.kill(); filter.dispose(); pool.close(); }
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}
