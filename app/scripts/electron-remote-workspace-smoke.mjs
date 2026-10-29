import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalDashboardService, RemoteDashboardService } from '../electron/services/web-services.mjs';
import { SessionModelService } from '../electron/services/session-model-service.mjs';
import { SessionModelDefaults } from '../electron/services/session-model-defaults.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-remote-workspace-'));
app.setPath('userData', path.join(root, 'profile')); app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
const windows = [], services = [], submits = [], modelWrites = [], creates = [], closes = [];
const assert = (value, message) => { if (!value) throw Error(message); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const screenshots = path.resolve(import.meta.dirname, '../../output');
const project = path.join(root, 'project'); fs.mkdirSync(project);
for (const file of ['one.ts', 'two.cpp', 'three.md', 'four.json']) fs.writeFileSync(path.join(project, file), '// isolated fixture\n');
const png = fs.readFileSync(path.resolve(import.meta.dirname, '../electron/remote-pwa/icon-192.png'));
fs.writeFileSync(path.join(project, 'image.png'), png);
const bitmap = `data:image/png;base64,${png.toString('base64')}`;
const models = [
  { model: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', defaultEffort: 'low', efforts: ['low', 'xhigh'].map(effort => ({ effort })) },
  { model: 'gpt-6-astra', label: 'GPT-6-Astra', defaultEffort: 'medium', efforts: ['medium', 'max'].map(effort => ({ effort })) },
];
let agents, chat, imageReads = 0, exitCode = 0;
const initialAgents = () => [
  { id: 'codex', name: 'Codex fixture', aiToolId: 'codex', projectId: 'p', status: 'idle', runtimeStatus: 'running', lastSessionId: 'thread-codex', folder: project, modelSettings: { model: 'gpt-6.1-sol', effort: 'low' } },
  { id: 'claude', name: 'Claude fixture', aiToolId: 'claude', projectId: 'p', status: 'idle', runtimeStatus: 'running', lastSessionId: 'thread-claude' },
];
const initialChat = () => ({ sessionId: 'thread-codex', lifecycle: 'idle', blocks: [
  { sequence: 1, role: 'user', kind: 'text', text: 'Show my image and changed files' },
  { sequence: 2, role: 'user', kind: 'image' },
  { sequence: 3, role: 'assistant', kind: 'tool-call', name: 'edit', input: { file_path: 'one.ts' } },
  { sequence: 4, role: 'assistant', kind: 'tool-result', output: 'done' },
  { sequence: 5, role: 'assistant', kind: 'text', text: 'Changed one.ts and two.cpp. [Open source](one.ts)' },
], artifacts: ['one.ts', 'two.cpp', 'three.md', 'four.json', 'image.png'].map((file, index) => ({ path: file, sourceSequence: 5, usage: 'output', ...(index === 0 ? { change: { additions: 2, deletions: 1, diff: [{ type: 'add', text: 'new source' }] } } : {}) })) });
const snapshot = () => ({ language: 'en', agents, view: { language: 'en', agents, projects: [{ id: 'p', name: 'Workspace', folder: project }, { id: 'empty', name: 'Empty project', folder: 'G:/Empty/Project' }], aiTools: [{ id: 'codex', label: 'Codex', supportsDangerous: true }, { id: 'claude', label: 'Claude', supportsDangerous: true }], groups: [{ id: 'screen', name: 'Pair', layout: { type: 'split', direction: 'h', children: [{ type: 'leaf', id: 'left', tabs: ['codex'], activeIndex: 0 }, { type: 'leaf', id: 'right', tabs: ['claude'], activeIndex: 0 }], sizes: [.5, .5] } }] } });
const current = agent => ({ model: agent.aiToolId === 'codex' ? 'gpt-6-astra' : 'sonnet', effort: agent.aiToolId === 'codex' ? 'max' : 'medium', ...(agent.aiToolId === 'codex' ? { serviceTier: 'priority' } : {}) });
const claudeModels = [{ model: 'sonnet', label: 'Sonnet', defaultEffort: 'medium', efforts: [{ effort: 'medium' }, { effort: 'high' }] }];
const sessionModels = new SessionModelService({ agentFor: id => agents.find(agent => agent.id === id), active: id => agents.find(agent => agent.id === id)?.status !== 'offline', inputReady: () => true,
  catalog: async agent => ({ models: agent.aiToolId === 'codex' ? models : claudeModels, current: current(agent), currentSource: 'native', accountLabel: 'Fixture account' }),
  update: async body => { modelWrites.push(body); agents.find(agent => agent.id === body.id).modelSettings = body.settings; return { restarted: body.restart }; },
});
const defaults = new SessionModelDefaults(path.join(root, 'defaults.json'));
const providers = { sessionModels, usageProvider: async () => ({ limits: [], profiles: [] }),
  chatProvider: async id => id === 'codex' ? chat : { sessionId: 'thread-claude', lifecycle: 'idle', blocks: [{ sequence: 50, role: 'assistant', kind: 'text', text: 'Claude fixture' }] },
  chatImages: async (_id, sequence) => { imageReads++; return sequence === 2 ? [{ dataUrl: bitmap }] : []; },
  submitPty: async (id, message, options) => { submits.push({ id, message, options }); return true; },
  closeSession: async id => { closes.push(id); Object.assign(agents.find(agent => agent.id === id), { status: 'offline', runtimeStatus: 'idle' }); return true; },
  createSession: async body => { creates.push(body); return { id: 'created' }; },
  modelDefaults: { read: async provider => ({ ...defaults.get(provider), models: provider === 'codex' ? models : claudeModels }), save: async body => defaults.save(body.provider, body.settings, body.revision, body.provider === 'codex' ? models : claudeModels) },
};
async function evaluate(win, code) { return win.webContents.executeJavaScript(code); }
async function wait(win, expression) {
  for (let n = 0; n < 120; n++) { if (await evaluate(win, expression)) return; await pause(80); }
  console.error(await evaluate(win, "JSON.stringify({preview:document.querySelector('#filePreviewMessage').textContent,toast:document.querySelector('#toast').textContent,model:document.querySelector('#sessionModelMessage').textContent,queue:document.querySelector('#composerQueue').textContent})"));
  throw Error(`Workspace UI timed out: ${expression}`);
}
async function refresh(win) { await evaluate(win, "document.querySelector('#refreshButton').click()"); await pause(350); }
async function send(win, message) {
  await evaluate(win, `(() => { const input=document.querySelector('#messageInput'); input.value=${JSON.stringify(message)};input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#composerForm').requestSubmit(); })()`);
  await wait(win, "document.querySelector('#messageInput').value===''");
}
async function capture(win, name) {
  await evaluate(win, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  fs.writeFileSync(path.join(screenshots, `${name}.png`), (await win.webContents.capturePage()).toPNG());
}
const timer = setTimeout(() => { console.error('Workspace smoke timed out'); app.exit(1); }, 180000);
void app.whenReady().then(async () => {
  try {
    const remote = new RemoteDashboardService({ baseDir: path.join(root, 'remote'), stateProvider: snapshot, ...providers }); remote.config.server_port = 0;
    const dashboard = new LocalDashboardService({ baseDir: path.join(root, 'dashboard'), title: 'Fixture', defaultPort: 0, configName: 'dashboard.json', stateProvider: snapshot, providers });
    services.push(remote, dashboard);
    for (const [kind, service] of [['remote', remote], ['dashboard', dashboard]]) {
      const { url } = await service.start();
      for (const width of [1280, 390]) {
        agents = initialAgents(); chat = initialChat(); imageReads = 0; submits.length = 0; modelWrites.length = 0; creates.length = 0;
        if (kind === 'remote') { service.syncAgents(agents); service.syncView(snapshot().view); }
        const win = new BrowserWindow({ width, height: 900, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } }); windows.push(win);
        const errors = [];
        win.webContents.on('console-message', event => { if (event.level === 'error' && !event.message.includes('status of 501')) errors.push(event.message); });
        await win.loadURL(`${url}/?agent=codex`);
        await wait(win, "document.querySelector('#detailName').textContent==='Codex fixture'");
        await evaluate(win, "localStorage.removeItem('multiagent.remote.launchPreferences.v1');document.querySelector('#sessionMode [data-mode=chat]').click()");
        await wait(win, "document.querySelector('#chatView .chat-user img')?.complete && document.querySelector('#chatView .chat-user img')?.naturalWidth>0");
        await wait(win, "document.querySelector('#chatView .chat-related-files')");
        if (width === 390) {
          // Exercise actual touch targets and the compact editor, not just CSS
          // strings. A narrow phone must retain the same available actions.
          for (const phoneWidth of [320, 360, 390, 430]) {
            win.setContentSize(phoneWidth, 820); await pause(250);
            const layout = await evaluate(win, `(() => {
              const box=id=>document.querySelector(id).getBoundingClientRect();
              return {editor:box('#messageInput').width,composer:box('#composerForm').width,
                height:box('#composerForm').height,header:box('.session-head').height,
                more:box('#sessionToolsToggle').width,mode:box('#sessionMode').width,
                chat:box('#chatView').height,overflow:document.documentElement.scrollWidth>innerWidth+1,
                actions:getComputedStyle(document.querySelector('#sessionTools')).display};
            })()`);
            assert(!layout.overflow && layout.editor >= layout.composer - 22 && layout.height <= 120 && layout.header <= 120 && layout.chat >= 350 && layout.more >= 44 && layout.actions === 'none', `Phone layout ${phoneWidth}px: ${JSON.stringify(layout)}`);
          }
          win.setContentSize(390, 820); await pause(250);
          await evaluate(win, "document.querySelector('#sessionToolsToggle').click()");
          assert(await evaluate(win, "document.querySelector('#sessionToolsToggle').getAttribute('aria-expanded')==='true' && document.querySelector('#renameSessionButton').getBoundingClientRect().height>=44 && document.querySelector('#sessionTools .task-mode-button')"), 'More menu lost touch targets or task mode');
          await capture(win, `workspace-${kind}-390-mobile-more`);
          await evaluate(win, "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
          assert(await evaluate(win, "document.querySelector('#sessionToolsToggle').getAttribute('aria-expanded')==='false' && document.activeElement.id==='sessionToolsToggle'"), 'More menu Escape/focus failed');
          await evaluate(win, "document.querySelector('#sessionToolsToggle').click();document.querySelector('#renameSessionButton').click()");
          await wait(win, "!document.querySelector('#sessionEditorOverlay').hidden");
          assert(await evaluate(win, "document.querySelector('#sessionToolsToggle').getAttribute('aria-expanded')==='false'"), 'More menu did not close after action');
          await evaluate(win, "document.querySelector('#sessionEditorCancel').click();document.querySelector('#sessionToolsToggle').click();document.querySelector('#chatView').click()");
          assert(await evaluate(win, "document.querySelector('#sessionToolsToggle').getAttribute('aria-expanded')==='false'"), 'More menu outside dismissal failed');
          await capture(win, `workspace-${kind}-390-mobile-idle`);
          // Simulate Android's visual viewport shrinking while the layout
          // viewport stays fixed. This does not claim physical keyboard QA.
          await evaluate(win, `(() => {
            window.fixtureViewportHeight=820;
            Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>window.fixtureViewportHeight});
            document.querySelector('#messageInput').focus();visualViewport.dispatchEvent(new Event('resize'));
          })()`); await pause(100);
          await evaluate(win, "window.fixtureViewportHeight=450;visualViewport.dispatchEvent(new Event('resize'))"); await pause(250);
          assert(await evaluate(win, "document.documentElement.classList.contains('keyboard-visible') && getComputedStyle(document.querySelector('#sessionMode')).display==='none' && document.querySelector('#composerForm').getBoundingClientRect().bottom<=451 && document.querySelector('#chatView').clientHeight>=150"), 'Keyboard obscured the editor or conversation');
          await capture(win, `workspace-${kind}-390-mobile-keyboard`);
          await evaluate(win, "delete visualViewport.height;document.querySelector('#messageInput').blur();visualViewport.dispatchEvent(new Event('resize'))"); await pause(250);
          assert(await evaluate(win, "!document.documentElement.classList.contains('keyboard-visible') && getComputedStyle(document.querySelector('#sessionMode')).display==='none' && document.querySelector('.app-shell').dataset.sessionMode==='chat'"), 'Mobile did not remain chat-only after keyboard dismissal');
          win.setContentSize(390, 900); await pause(250);
          console.log(`MOBILE_WORKSPACE_UX_OK ${kind} 320/360/390/430px, More, keyboard`);
        }
        assert(await evaluate(win, "document.querySelector('#chatView .chat-related-files').querySelectorAll('.chat-file-card').length===3"), 'File cards exceeded inline limit');
        const reads = imageReads;
        await evaluate(win, "window.originalImage=document.querySelector('#chatView .chat-user img');document.querySelector('#chatView .chat-work').open=true");
        chat.blocks[4].text = 'Updated one.ts and two.cpp. [Open source](one.ts)';
        await refresh(win);
        await wait(win, "document.querySelector('#chatView').textContent.includes('Updated one.ts')");
        assert(await evaluate(win, "window.originalImage===document.querySelector('#chatView .chat-user img') && document.querySelector('#chatView .chat-work').open"), 'Image node or expanded work was lost during update');
        assert(imageReads === reads, 'Transcript update refetched stored images');
        await evaluate(win, "document.querySelector('#chatView .chat-related-files .small-button').click()");
        await wait(win, "document.querySelector('#chatFilesDialog').open");
        await evaluate(win, "document.querySelector('#chatFilesSearch').value='two.cpp';document.querySelector('#chatFilesSearch').dispatchEvent(new Event('input'))");
        assert(await evaluate(win, "document.querySelector('#chatFilesList').querySelectorAll('.chat-file-card').length===1"), 'All-files search failed');
        await evaluate(win, "document.querySelector('#chatFilesList .chat-file-card').click()");
        await wait(win, "!document.querySelector('#filePreviewOverlay').hidden && document.querySelector('#filePreviewMarkdown').textContent.includes('isolated fixture')");
        assert(await evaluate(win, "!document.querySelector('#chatFilesDialog').open"), 'All-files dialog covered preview');
        await evaluate(win, "document.querySelector('#filePreviewClose').click(); document.querySelector('#chatView .chat-image-button').click()");
        await wait(win, "!document.querySelector('#filePreviewCopy').hidden");
        await evaluate(win, `Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{window.copiedImage=await items[0].getType('image/png')}}});document.querySelector('#filePreviewCopy').click()`);
        await wait(win, "window.copiedImage?.type==='image/png' && window.copiedImage.size>0");
        await capture(win, `workspace-${kind}-${width}-image`);
        await evaluate(win, "document.querySelector('#filePreviewClose').click();document.querySelector('#composerModelButton').click()");
        await wait(win, "!document.querySelector('#sessionModelSave').disabled");
        assert(await evaluate(win, "document.querySelector('#sessionModelSelect').value==='gpt-6-astra' && document.querySelector('#sessionFastSelect').value==='fast' && !document.querySelector('#sessionModelRestart').disabled"), 'Current native model/Fast or authoritative readiness was replaced by saved settings');
        await evaluate(win, "document.querySelector('#sessionModelSelect').value='gpt-6.1-sol';document.querySelector('#sessionModelSelect').dispatchEvent(new Event('change'));document.querySelector('#sessionEffortSelect').value='xhigh';document.querySelector('#sessionFastSelect').value='default';document.querySelector('#sessionFastSelect').dispatchEvent(new Event('change'))");
        await pause(3200); await refresh(win);
        assert(await evaluate(win, "document.querySelector('#sessionModelSelect').value==='gpt-6.1-sol' && document.querySelector('#sessionEffortSelect').value==='xhigh'"), 'Readiness refresh reset the model draft');
        await capture(win, `workspace-${kind}-${width}-model`);
        await evaluate(win, "document.querySelector('#sessionModelRestart').click()"); await wait(win, "document.querySelector('#sessionModelOverlay').hidden");
        assert(modelWrites.at(-1)?.settings.serviceTier === 'default' && modelWrites.at(-1).settings.effort === 'xhigh', 'Explicit speed/model update was not sent');
        await evaluate(win, "document.querySelector('#defaultModelsButton').click()"); await wait(win, "!document.querySelector('#sessionModelSave').disabled");
        await evaluate(win, "document.querySelector('#sessionFastSelect').value='fast';document.querySelector('#sessionModelForm').requestSubmit()"); await wait(win, "document.querySelector('#sessionModelOverlay').hidden");
        assert(defaults.get('codex').settings.serviceTier === 'fast', 'Default model editor did not persist on host');
        await evaluate(win, "document.querySelector('.session-row[data-agent-id=claude] .session-select').click();document.querySelector('#composerModelButton').click()");
        await wait(win, "!document.querySelector('#sessionModelSave').disabled");
        assert(await evaluate(win, "document.querySelector('#sessionFastField').hidden"), 'Claude displayed unsupported Fast option');
        await evaluate(win, "document.querySelector('#sessionModelCancel').click();document.querySelector('.session-row[data-agent-id=codex] .session-select').click()");
        agents[0].status = 'working'; agents[0].hook = { event: 'working', session_id: 'thread-codex' }; chat.lifecycle = 'working'; chat.activeTool = 'Running command'; await refresh(win);
        await wait(win, "!document.querySelector('#chatWorking').hidden");
        assert(await evaluate(win, "!document.querySelector('#chatView').contains(document.querySelector('#chatWorking')) && !document.querySelector('#chatView .chat-thinking')"), 'Working was duplicated or inside conversation scroll');
        await send(win, 'queue this'); await wait(win, "!document.querySelector('#composerQueue').hidden");
        assert(submits.length === 0, 'Default queue injected into running turn');
        chat.pendingQuestion = { id: 'async-fixture', async: true, toolName: 'request_user_input_async', question: JSON.stringify({ questions: [{ title: 'Choose a path while work continues', options: ['Current path', 'Another path'] }] }) };
        await refresh(win); await wait(win, "!document.querySelector('#chatPrompt').hidden");
        assert(await evaluate(win, "!document.querySelector('#chatWorking').hidden"), 'Async question hid ongoing work');
        const space = await evaluate(win, "({chat:document.querySelector('#chatView').clientHeight,prompt:document.querySelector('#chatPrompt').clientHeight,composer:document.querySelector('#composerForm').clientHeight,viewport:innerHeight,card:document.querySelector('#chatPrompt .chat-prompt').className,cardMax:getComputedStyle(document.querySelector('#chatPrompt .chat-prompt')).maxHeight})");
        assert(space.chat >= 80, `Async question left no readable conversation space: ${JSON.stringify(space)}`);
        assert(await evaluate(win, "document.querySelector('#chatPrompt .question-fields').clientHeight>=75"), 'Question choices had no usable scroll area');
        await evaluate(win, "document.querySelector('#messageInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))");
        await send(win, 'steer this');
        assert(submits.at(-1)?.options.steering === true && submits.at(-1).options.sessionId === 'thread-codex', 'Tab steering payload was incorrect');
        await capture(win, `workspace-${kind}-${width}-chat`);
        chat.pendingQuestion.async = false; await refresh(win);
        await wait(win, "document.querySelector('#chatWorking').hidden"); await send(win, 'after blocking answer');
        assert(submits.length === 1, 'Steering bypassed a blocking question');
        chat.pendingQuestion = null;
        // Reproduce the real host: the renderer still says working after the
        // newer completion hook and idle transcript have arrived.
        agents[0].lastSessionId = 'changed-thread'; agents[0].hook = { event: 'done', session_id: 'changed-thread', lastTs: Date.now() }; agents[0].status = 'working'; chat.lifecycle = 'idle'; chat.sessionId = 'changed-thread'; await refresh(win);
        await wait(win, "document.querySelector('.session-row[data-agent-id=codex]').dataset.status==='done' && document.querySelector('#detailStatus').textContent==='Done'");
        await wait(win, "document.querySelector('#composerQueue').textContent.includes('conversation changed')");
        assert(submits.length === 1, 'Queue crossed into another conversation');
        await wait(win, "document.querySelector('.session-row[data-agent-id=codex]').classList.contains('unread-completion')");
        await win.reload();
        await wait(win, "document.querySelector('.session-row[data-agent-id=codex]')?.classList.contains('unread-completion')");
        await evaluate(win, "document.querySelector('.session-row[data-agent-id=codex] .session-select').click()");
        await refresh(win);
        assert(await evaluate(win, "!document.querySelector('.session-row[data-agent-id=codex]').classList.contains('unread-completion')"), 'Completion read acknowledgment did not persist');
        agents[0].status = 'done'; agents[0].hook = { event: 'working', session_id: 'changed-thread', lastTs: Date.now() }; chat.lifecycle = 'working'; await refresh(win);
        await wait(win, "document.querySelector('.session-row[data-agent-id=codex]').dataset.status==='working' && document.querySelector('#detailStatus').textContent==='Working' && !document.querySelector('#chatWorking').hidden");
        const logos = await evaluate(win, "[...document.querySelectorAll('.session-select svg')].map(node=>node.getAttribute('aria-label')).join(',')");
        assert(logos.includes('Codex') && logos.includes('Claude'), 'Provider logos were missing');
        const color = await evaluate(win, "document.querySelector('.session-row[data-agent-id=codex]').style.getPropertyValue('--screen-color')");
        await evaluate(win, `document.querySelector('#searchInput').value=${JSON.stringify(project)};document.querySelector('#searchInput').dispatchEvent(new Event('input'))`);
        assert(await evaluate(win, "document.querySelector('.session-row[data-agent-id=codex]')"), 'Windows path search missed session');
        assert(await evaluate(win, "document.querySelector('.session-row[data-agent-id=codex]').style.getPropertyValue('--screen-color')") === color, 'Screen color changed after filtering');
        await evaluate(win, "document.querySelector('#searchInput').value='G:/Empty/Project';document.querySelector('#searchInput').dispatchEvent(new Event('input'))");
        assert(await evaluate(win, "document.querySelector('[data-project-id=empty]')"), 'Empty project path search failed');
        await evaluate(win, "document.querySelector('#searchInput').value='';document.querySelector('#searchInput').dispatchEvent(new Event('input'));document.querySelector('.project-toggle[data-project-id=p]').click()");
        assert(await evaluate(win, "!document.querySelector('.session-row[data-agent-id=codex]')"), 'Project did not fold');
        await evaluate(win, "document.querySelector('.project-toggle[data-project-id=p]').click();document.querySelector('#newSessionButton').click()");
        await wait(win, "!document.querySelector('#sessionEditorOverlay').hidden");
        assert(await evaluate(win, "document.querySelector('#sessionEditorDangerous').checked"), 'Unconfigured remote session did not default Dangerous ON');
        await evaluate(win, "document.querySelector('#sessionEditorTool').value='claude';document.querySelector('#sessionEditorTool').dispatchEvent(new Event('change'))");
        assert(await evaluate(win, "document.querySelector('#sessionEditorDangerous').checked"), 'Unconfigured provider switch did not default Dangerous ON');
        await evaluate(win, "document.querySelector('#sessionEditorForm').requestSubmit()");
        await wait(win, "document.querySelector('#sessionEditorOverlay').hidden");
        assert(creates.at(-1)?.aiToolId === 'claude' && creates.at(-1).dangerous, 'New session payload lost tool or Dangerous');
        await evaluate(win, "document.querySelector('#newSessionButton').click()");
        await wait(win, "!document.querySelector('#sessionEditorOverlay').hidden");
        assert(await evaluate(win, "document.querySelector('#sessionEditorTool').value==='claude' && document.querySelector('#sessionEditorDangerous').checked"), 'Successful launch choices were not restored');
        await evaluate(win, "document.querySelector('#sessionEditorDangerous').click();document.querySelector('#sessionEditorForm').requestSubmit()");
        await wait(win, "document.querySelector('#sessionEditorOverlay').hidden");
        assert(creates.at(-1)?.aiToolId === 'claude' && creates.at(-1).dangerous === false, 'Remote explicit Dangerous OFF was lost');
        await evaluate(win, "document.querySelector('#newSessionButton').click()");
        await wait(win, "!document.querySelector('#sessionEditorOverlay').hidden");
        assert(await evaluate(win, "!document.querySelector('#sessionEditorDangerous').checked"), 'Remote explicit Dangerous OFF was not remembered');
        await evaluate(win, "document.querySelector('#sessionEditorCancel').click();document.querySelector('.session-row[data-agent-id=claude] .session-close').click()");
        await wait(win, "document.querySelector('.session-row[data-agent-id=claude]').dataset.status==='offline'");
        assert(closes.at(-1) === 'claude', 'Close targeted a different session');
        const overflow = await evaluate(win, "document.documentElement.scrollWidth>innerWidth+1 || document.querySelector('#composerForm').getBoundingClientRect().bottom>innerHeight");
        assert(!overflow, 'Responsive composer overflowed the viewport');
        assert(await evaluate(win, "document.querySelector('#messageInput').clientWidth >= document.querySelector('.composer-input-column').clientWidth-2"), 'Textarea did not fill the available input column');
        assert(errors.length === 0, errors.join('\n'));
        console.log(`Remote workspace passed: ${kind} ${width}px; images=${imageReads}`);
        win.destroy();
      }
    }
  } catch (error) { console.error(error); exitCode = 1; }
  finally {
    clearTimeout(timer); for (const win of windows) if (!win.isDestroyed()) win.destroy(); await Promise.all(services.map(service => service.stop()));
    if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('acedia-remote-workspace-')) {
      try { fs.rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Profile locks release on exit. */ }
    }
    app.exit(exitCode);
  }
});
