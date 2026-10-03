// Isolated real TUI, mock model transport, no login or billable model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { QuestionResponder, codexQuestionFrame } from '../electron/services/question-responder.mjs';
import { CodexScrollbackFilter } from '../electron/services/terminal-stream.mjs';
import { ActiveQuestions } from '../electron/services/active-questions.mjs';
const require = createRequire(import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const questions = { questions: [
  { id: 'color', header: 'Color', question: 'Choose a color?', options: [{ label: 'Blue', description: 'First' }, { label: 'Green', description: 'Second' }] },
  { id: 'place', header: 'Place', question: 'Choose a place?', options: [{ label: 'Here', description: 'Current' }, { label: 'There', description: 'New' }] },
] };
if (process.env.ACEDIA_QUESTION_CASE === 'single') questions.questions = questions.questions.slice(0, 1);

async function exercise(root) {
  const binary = process.env.ACEDIA_CODEX_BINARY;
  assert.ok(binary && path.isAbsolute(binary), 'Set ACEDIA_CODEX_BINARY to the installed Codex executable');
  let answered = null, questionSent = false, output = '', child;
  const screen = new CodexScrollbackFilter(40, 110);
  const server = http.createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    if (!request.url.endsWith('/responses')) { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"models":[]}'); return; }
    const input = JSON.parse(raw);
    const answer = input.input?.find(item => item.type === 'function_call_output' && item.call_id === 'fixture-call');
    if (answer) { try { answered = JSON.parse(answer.output); } catch { console.error('Native tool result:', answer.output); } }
    const ask = !questionSent && input.tools?.some(t => t.name === 'request_user_input');
    if (ask) questionSent = true;
    const item = ask ? { type: 'function_call', id: 'fixture-fc', call_id: 'fixture-call', name: 'request_user_input', arguments: JSON.stringify(questions) }
      : { type: 'message', id: 'fixture-message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'QUESTION_FLOW_OK', annotations: [] }] };
    const result = { id: 'fixture-response', object: 'response', status: 'completed', model: input.model, output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const event of [{ type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item }, { type: 'response.output_item.done', output_index: 0, item }, { type: 'response.completed', response: result }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const cliHome = path.join(root, 'cli'); await fs.mkdir(cliHome);
    await fs.writeFile(path.join(cliHome, 'config.toml'), `model="gpt-5.4"\nmodel_provider="fixture"\n[windows]\nsandbox="unelevated"\n[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n[model_providers.fixture]\nname="Fixture"\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nwire_api="responses"\n`);
    const env = { ...process.env, CODEX_HOME: cliHome, TERM: 'xterm-256color' };
    for (const key of Object.keys(env)) if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
    child = require('node-pty').spawn(binary, ['--no-daemon', '--disable', 'plugins', '--no-alt-screen', '--sandbox', 'read-only', '-C', root], { cwd: root, env, cols: 110, rows: 40 });
    child.onData(data => {
      output += data;
      screen.push(data);
      if (data.includes('\x1b[6n')) child.write('\x1b[1;1R');
      if (data.includes('\x1b[c')) child.write('\x1b[?1;2c');
    });
    const waitUntil = async predicate => { for (let n = 0; n < 150; n++) { if (await predicate()) return; await sleep(100); } throw new Error('Native form timeout'); };
    await sleep(3500);
    child.write('/plan'); await sleep(500); child.write('\r'); await sleep(800);
    child.write('Ask the fixture questions.'); await sleep(500); child.write('\r');
    await waitUntil(() => codexQuestionFrame(screen.viewportText())?.index === 1);
    const transcriptRoot = path.join(cliHome, 'sessions');
    const files = (await fs.readdir(transcriptRoot, { recursive: true })).filter(file => file.endsWith('.jsonl'));
    assert.equal(files.length, 1);
    const transcriptPath = path.join(transcriptRoot, files[0]);
    const sessionId = files[0].match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
    const monitor = new ActiveQuestions();
    const current = () => monitor.read({ id: 'fixture', tool: 'codex', root: transcriptRoot, transcriptPath, sessionId });
    assert.equal((await current()).question?.id, 'fixture-call', 'Question must be detected without opening Chat');
    const entry = { aiToolId: 'codex', process: child };
    const responder = new QuestionResponder({ entry: () => entry, snapshot: () => screen.viewportText(),
      current });
    const request = { sessionId, questionId: 'fixture-call', answers: [
      { id: 'color', optionIndex: 1 }, { id: 'place', optionIndex: null, text: '직접 입력한 답변' },
    ].slice(0, questions.questions.length) };
    await responder.answer('fixture', request);
    await waitUntil(() => answered !== null);
    await waitUntil(async () => (await current()).question === null);
    assert.deepEqual(answered.answers.color.answers, ['Green']);
    if (questions.questions.length > 1) assert.ok(answered.answers.place.answers.some(value => value.includes('직접 입력한 답변')));
    assert.deepEqual(await responder.answer('fixture', request), { status: 'sent' });
    console.log('CODEX_QUESTION_SELECTION_FREE_TEXT_MULTI_QUESTION_AND_RESUME_OK');
  } catch (error) {
    await fs.writeFile(path.join(root, 'native-fixture-output.txt'), output);
    console.error('Fixture output:', path.join(root, 'native-fixture-output.txt'));
    throw error;
  } finally {
    if (child) { child.write('\x03'); await sleep(400); child.write('\x03'); await sleep(500); try { child.kill(); } catch {} }
    server.close();
    screen.dispose();
  }
}

if (process.versions.electron) {
  const { app } = require('electron');
  const root = process.env.ACEDIA_QUESTION_CLI_FIXTURE;
  app.setPath('userData', path.join(root, 'electron'));
  app.disableHardwareAcceleration();
  app.whenReady().then(() => exercise(root)).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-question-cli-'));
  const env = { ...process.env, ACEDIA_QUESTION_CLI_FIXTURE: root }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => child.kill(), 75000);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }).finally(() => clearTimeout(timeout));
  if (code !== 0) throw new Error(`Native question check failed (${code}); fixture: ${root}`);
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-question-cli-')) throw new Error('Invalid fixture cleanup path');
  await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 200 });
}
