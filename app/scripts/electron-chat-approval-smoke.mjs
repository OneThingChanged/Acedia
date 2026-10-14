import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { RemoteDashboardService, LocalDashboardService } from '../electron/services/web-services.mjs';
import { CommandApprovalResponder } from '../electron/services/command-approval.mjs';
import { QuestionResponder } from '../electron/services/question-responder.mjs';

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const command = 'git status --short --branch -- ' + 'nested-project-folder/'.repeat(8) + 'README.md';
const base = { sessionId: 'approval-session', blocks: [
  { sequence: 1, role: 'user', kind: 'text', text: 'Git 상태를 확인해 주세요.' },
  { sequence: 2, role: 'assistant', kind: 'text', text: '연결된 저장소를 확인하겠습니다.\n'.repeat(40) },
], lifecycle: 'working', pendingQuestion: null };
const frame = (selected = 0, cmd = command) => [
  'Would you like to run the following command?', '', 'Environment: local', '',
  'Reason: May the isolated fixture read the Git status?', '', '$ ' + cmd, '',
  ...['Yes, proceed (y)', `Yes, and don't ask again for commands that start with \`${cmd}\` (p)`,
    'No, and tell Codex what to do differently (esc)'].map((label, index) => `${index === selected ? '›' : ' '} ${index + 1}. ${label}`),
  '', 'Press enter to confirm or esc to cancel',
].join('\n');

function harness() {
  let screen = frame(), selection = 0;
  const writes = [];
  const entry = { aiToolId: 'codex', process: { write(key) {
    writes.push(key);
    if (key === '\r') screen = '› Ask Codex to do anything\nGPT-6.1-Sol high';
    else { selection += key === '\x1b[B' ? 1 : -1; screen = frame(selection); }
  } } };
  const approvals = new CommandApprovalResponder({ entry: () => entry, snapshot: () => screen, sessionId: () => base.sessionId });
  const responder = new QuestionResponder({ entry: () => entry, snapshot: () => screen, current: () => approvals.read('fixture'), approvals });
  return { writes, approvals, responder, reset() { screen = frame(); selection = 0; approvals.forget('fixture'); },
    change() { screen = frame(0, 'git diff --stat'); } };
}
async function waitFor(win, expression) {
  for (let i = 0; i < 150; i++) { if (await win.webContents.executeJavaScript(expression)) return; await sleep(80); }
  throw Error('UI timeout: ' + expression);
}
async function layout(win, selector) {
  const geometry = await win.webContents.executeJavaScript(`(() => {
    const card=document.querySelector(${JSON.stringify(selector)}), r=card.getBoundingClientRect();
    return { top:r.top,bottom:r.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,
      labels:[...card.querySelectorAll('.chat-prompt-option')].map(el=>el.textContent),
      scope:card.querySelector('.chat-prompt-approval-scope').textContent,
      buttons:[...card.querySelectorAll('.chat-prompt-option')].map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}),text:card.textContent };
  })()`);
  assert.ok(geometry.top >= 0 && geometry.bottom <= geometry.height + 1 && !geometry.overflow, JSON.stringify(geometry));
  assert.equal(geometry.labels.length, 4);
  assert.ok(geometry.text.includes(command) && geometry.text.includes('Environment: local') && geometry.text.includes('May the isolated fixture'));
  assert.ok(geometry.scope.includes(command), 'Approval scope was truncated');
  assert.ok(geometry.buttons.every(button => button.top >= geometry.top && button.bottom <= geometry.bottom + 1), 'Approval controls were clipped: ' + JSON.stringify(geometry));
}
async function desktop(BrowserWindow, root) {
  const win = new BrowserWindow({ width: 800, height: 850, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const host = harness();
  try {
    await win.loadFile(path.join(root, 'index.html'));
    for (const [index, choice] of [0, 1, 2].entries()) {
      host.reset();
      const pending = host.approvals.read('fixture').question;
      win.setSize(index === 1 ? 420 : 800, 850);
      await win.webContents.executeJavaScript(`window.questionFixture.patch(${JSON.stringify({ chat: { ...base, pendingQuestion: pending },
        state: { agentStatus: 'waiting', sessionId: base.sessionId, provider: 'codex' } })})`);
      await waitFor(win, "document.querySelector('.chat-prompt-command .chat-prompt-heading')?.textContent.includes('승인 필요') && !document.querySelector('.chat-prompt-option').disabled");
      await win.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop=0");
      await layout(win, '.chat-prompt-command');
      assert.equal(await win.webContents.executeJavaScript('window.questionFixture.answers.length'), index, 'Approval sent itself');
      if (index === 1) await fs.writeFile(path.resolve(appRoot, '../output/chat-approval-desktop.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript(`document.querySelectorAll('.chat-prompt-option')[${choice}].click()`);
      await waitFor(win, `window.questionFixture.answers.length===${index + 1}`);
      const request = await win.webContents.executeJavaScript(`window.questionFixture.answers[${index}]`);
      assert.deepEqual(request, { id: 'fixture', sessionId: base.sessionId, questionId: pending.id, approvalChoice: choice });
      assert.deepEqual(await host.responder.answer(request.id, request), { status: 'sent' });
      assert.equal(await win.webContents.executeJavaScript('window.questionFixture.writes.length'), 0, 'Renderer sent unverified approval keys');
    }
    console.log('DESKTOP_CHAT_APPROVAL_THREE_CHOICES_IDENTITY_SCOPE_AND_MOBILE_LAYOUT_OK');
  } finally { win.destroy(); }
}
async function remote(BrowserWindow, root, dashboard, width) {
  const host = harness(), received = [], rawWrites = [];
  const agent = { id: 'fixture', name: 'Approval fixture', projectId: 'p', aiToolId: 'codex', status: 'waiting',
    hook: { event: 'waiting', session_id: base.sessionId, received_at: 1 } };
  const view = { language: 'ko', projects: [{ id: 'p', name: 'Fixture project', folder: root }], agents: [agent] };
  const providers = { chatProvider: async () => ({ ...base, pendingQuestion: host.approvals.read('fixture')?.question || null }),
    answerQuestion: async (id, request) => { received.push(request); return host.responder.answer(id, request); },
    writePty: async (_id, value) => { rawWrites.push(value); } };
  const web = dashboard ? new LocalDashboardService({ title: 'Approval fixture', baseDir: path.join(root, `dashboard-${width}`),
    defaultPort: 0, configName: 'fixture.json', stateProvider: () => ({ view, agents: [agent] }), providers })
    : new RemoteDashboardService({ baseDir: path.join(root, `remote-${width}`), ...providers });
  if (!dashboard) { web.config.server_port = 0; web.syncView(view); web.syncAgents([agent]); }
  const status = await web.start();
  const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  try {
    await win.loadURL(`${status.url}/?agent=fixture`);
    await waitFor(win, "document.querySelector('#chatPrompt .chat-prompt-command') && !document.querySelector('#chatPrompt button').disabled");
    await win.webContents.executeJavaScript("document.querySelector('#chatView').scrollTop=0");
    await layout(win, '#chatPrompt .chat-prompt-command');
    assert.equal(received.length, 0, 'Approval sent itself');
    await fs.writeFile(path.resolve(appRoot, `../output/chat-approval-${dashboard ? 'dashboard' : 'remote'}-${width}.png`), (await win.webContents.capturePage()).toPNG());
    const previous = host.approvals.read('fixture').question.id;
    // Change the live CLI after rendering. The old choice must fail without keys.
    host.change();
    await win.webContents.executeJavaScript("document.querySelectorAll('#chatPrompt .chat-prompt-option')[0].click()");
    await waitFor(win, "!!document.querySelector('#chatPrompt .chat-prompt-error')");
    assert.equal(host.writes.length, 0, 'Changed command received approval keys');
    assert.equal(received[0].questionId, previous);
    host.reset();
    await waitFor(win, "document.querySelector('#chatPrompt .chat-prompt-command') && !document.querySelector('#chatPrompt .chat-prompt-option').disabled && document.querySelector('#chatPrompt').textContent.includes('nested-project-folder')");
    const current = host.approvals.read('fixture').question.id;
    await win.webContents.executeJavaScript("document.querySelectorAll('#chatPrompt .chat-prompt-option')[2].click()");
    await waitFor(win, 'document.querySelector("#chatPrompt").hidden || document.querySelector("#chatPrompt .chat-prompt-hint")?.textContent.includes("답변을 보냈습니다")');
    assert.equal(received.at(-1).approvalChoice, 2);
    assert.equal(received.at(-1).questionId, current);
    assert.equal(received.at(-1).sessionId, base.sessionId);
    assert.equal(received.at(-1).id, 'fixture');
    assert.deepEqual(host.writes, ['\x1b[B', '\x1b[B', '\r']);
    assert.equal(rawWrites.length, 0, 'Remote used the unverified input endpoint');
    // Deliberate stale HTTP response is an expected browser console error.
    assert.ok(errors.every(error => error.includes('409')), errors.join('\n'));
    console.log(`${dashboard ? 'DASHBOARD' : 'REMOTE'}_CHAT_APPROVAL_STALE_COMMAND_REJECTED_AND_DENY_${width}_OK`);
  } finally { win.destroy(); await web.stop(); }
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  const root = process.env.ACEDIA_APPROVAL_UI_FIXTURE;
  app.setPath('userData', path.join(root, 'profile')); app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    await fs.mkdir(path.resolve(appRoot, '../output'), { recursive: true });
    await desktop(BrowserWindow, root);
    for (const dashboard of [false, true]) for (const width of [1024, 390]) await remote(BrowserWindow, root, dashboard, width);
  }).then(() => app.exit(0), error => { console.error(error); app.exit(1); });
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-approval-ui-'));
  try {
    const { build } = await import('esbuild');
    await build({ entryPoints: [path.join(appRoot, 'scripts/fixtures/chat-question-renderer.tsx')], bundle: true,
      define: { 'import.meta.env': '{}' }, jsx: 'automatic', outfile: path.join(root, 'renderer.js') });
    await fs.writeFile(path.join(root, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    await fs.copyFile(path.join(appRoot, 'public/app-icon.png'), path.join(root, 'app-icon.png'));
    const env = { ...process.env, ACEDIA_APPROVAL_UI_FIXTURE: root }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { env, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill(), 120000);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw Error(`Approval UI smoke failed (${code})`);
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-approval-ui-')) throw Error('Invalid fixture cleanup path');
    await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
}
