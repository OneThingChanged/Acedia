// Real Codex TUI with an isolated profile and local mock model transport.
// Only the harmless marker command runs; no user sessions or credentials are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CommandApprovalResponder, codexCommandApprovalFrame } from '../electron/services/command-approval.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';

const require = createRequire(import.meta.url);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function exercise(root, choice) {
  const binary = process.env.ACEDIA_CODEX_BINARY;
  assert.ok(binary && path.isAbsolute(binary), 'Set ACEDIA_CODEX_BINARY to the installed Codex executable');
  await fs.mkdir(root);
  let resultOutput = null, sent = false, output = '', child, childExited = false;
  const screen = new CodexScrollbackFilter(40, 110);
  const server = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    if (!request.url.endsWith('/responses')) {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"models":[]}'); return;
    }
    const input = JSON.parse(raw);
    const answer = input.input?.find(item => item.type === 'function_call_output' && item.call_id === 'approval-fixture-call');
    if (answer) resultOutput = answer.output;
    const ask = !sent && input.tools?.some(tool => tool.name === 'exec_command');
    if (ask) sent = true;
    const item = ask ? { type: 'function_call', id: 'approval-fixture-fc', call_id: 'approval-fixture-call', name: 'exec_command',
      arguments: JSON.stringify({ cmd: 'Write-Output ACEDIA_APPROVAL_FIXTURE_OK', sandbox_permissions: 'require_escalated',
        justification: 'May the isolated fixture print its test marker?' }) }
      : { type: 'message', id: 'approval-fixture-message', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'APPROVAL_FLOW_OK', annotations: [] }] };
    const result = { id: 'approval-fixture-response', object: 'response', status: 'completed', model: input.model, output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const event of [{ type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item }, { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: result }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const cliHome = path.join(root, 'cli'); await fs.mkdir(cliHome);
    await fs.writeFile(path.join(cliHome, 'config.toml'), `model="gpt-5.4"\nmodel_provider="fixture"\n[windows]\nsandbox="unelevated"\n[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n[model_providers.fixture]\nname="Fixture"\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nwire_api="responses"\n`);
    const env = { ...process.env, CODEX_HOME: cliHome, TERM: 'xterm-256color' };
    for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
    child = require('node-pty').spawn(binary, ['--no-daemon', '--disable', 'plugins', '--no-alt-screen', '--sandbox', 'read-only',
      '--ask-for-approval', 'on-request', '-C', root], { cwd: root, env, cols: 110, rows: 40 });
    child.onExit(() => { childExited = true; });
    child.onData(data => {
      output += data; screen.push(data);
      if (data.includes('\x1b[6n')) child.write('\x1b[1;1R');
      if (data.includes('\x1b[c')) child.write('\x1b[?1;2c');
    });
    const waitUntil = async predicate => {
      for (let n = 0; n < 200; n++) { if (await predicate()) return; await sleep(100); }
      throw new Error('Native approval timeout');
    };
    await sleep(3500);
    child.write('Run the isolated fixture command.'); await sleep(500); child.write('\r');
    await waitUntil(() => codexCommandApprovalFrame(screen.viewportText()));
    const files = (await fs.readdir(path.join(cliHome, 'sessions'), { recursive: true })).filter(file => file.endsWith('.jsonl'));
    assert.equal(files.length, 1);
    const sessionId = files[0].match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
    assert.ok(sessionId);
    const entry = { aiToolId: 'codex', process: child };
    const responder = new CommandApprovalResponder({ entry: () => entry, snapshot: () => screen.viewportText(), sessionId: () => sessionId });
    const pending = responder.read('fixture');
    assert.ok(pending.question.question.includes('Write-Output ACEDIA_APPROVAL_FIXTURE_OK'));
    const request = { sessionId, questionId: pending.question.id, approvalChoice: choice };
    assert.deepEqual(await responder.answer('fixture', request), { status: 'sent' });
    assert.deepEqual(await responder.answer('fixture', request), { status: 'sent' });
    if (choice === 2) {
      // Reject cancels the turn rather than asking the model for another response.
      await waitUntil(async () => {
        const rows = (await fs.readFile(path.join(cliHome, 'sessions', files[0]), 'utf8')).split('\n');
        const record = rows.filter(Boolean).map(row => JSON.parse(row)).find(row =>
          row.payload?.type === 'function_call_output' && row.payload.call_id === 'approval-fixture-call');
        if (record) resultOutput = record.payload.output;
        return resultOutput !== null;
      });
      assert.match(resultOutput, /aborted by user/);
      assert.match(screen.viewportText(), /You canceled the request/);
    } else {
      await waitUntil(() => resultOutput !== null);
      assert.match(resultOutput, /ACEDIA_APPROVAL_FIXTURE_OK/);
    }
    assert.equal(responder.read('fixture'), null);
    console.log(`CODEX_NATIVE_COMMAND_APPROVAL_${choice === 2 ? 'DENY' : 'ALLOW_ONCE'}_AND_RESUME_OK`);
  } catch (error) {
    await fs.writeFile(path.join(root, 'native-fixture-output.txt'), output);
    console.error('Fixture output:', path.join(root, 'native-fixture-output.txt'));
    throw error;
  } finally {
    if (child && !childExited) {
      child.write('\x03'); await sleep(400);
      if (!childExited) { child.write('\x03'); await sleep(500); }
      if (!childExited) try { child.kill(); } catch {}
    }
    server.close(); screen.dispose();
  }
}

if (process.versions.electron) {
  const { app } = require('electron');
  const root = process.env.ACEDIA_APPROVAL_CLI_FIXTURE;
  app.setPath('userData', path.join(root, 'electron'));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    await exercise(path.join(root, 'allow'), 0);
    await exercise(path.join(root, 'deny'), 2);
  }).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-approval-cli-'));
  const env = { ...process.env, ACEDIA_APPROVAL_CLI_FIXTURE: root }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => child.kill(), 75000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }).finally(() => clearTimeout(timeout));
  if (code !== 0) throw new Error(`Native approval check failed (${code}); fixture: ${root}`);
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-approval-cli-')) throw new Error('Invalid fixture cleanup path');
  await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 200 });
}
