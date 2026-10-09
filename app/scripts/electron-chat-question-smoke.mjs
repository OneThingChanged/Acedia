import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";
import { startupTrust, startupHooks } from "./fixtures/codex-startup-screens.mjs";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(import.meta.dirname, "..");
const assert = (value, message) => { if (!value) throw new Error(message); };
const questions = JSON.stringify({ questions: [
  { id: 'model', question: "어느 모델을 사용할까요?", options: [{ label: "Codex", description: "코딩 작업" }, { label: "Claude", description: "문서 작업" }] },
  { id: 'project', question: "어느 프로젝트에서 진행할까요?", options: [{ label: "현재 프로젝트" }, { label: "새 프로젝트" }] },
] });
const singleQuestion = JSON.stringify({ questions: [{ question: "선택해 주세요", options: [{ label: "A" }, { label: "B" }] }] });
const blocks = [
  { sequence: 1, role: "user", kind: "text", text: "Question visibility fixture" },
  { sequence: 2, role: "assistant", kind: "text", text: "스크롤을 확인하는 대화 기록입니다.\n\n".repeat(80) },
];
const baseChat = { sessionId: "fixture-session", blocks, lifecycle: "working", pendingQuestion: null };

async function waitFor(win, expression) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(`UI timed out: ${expression}`);
}

async function exerciseDesktop(win, directory) {
  const patch = payload => win.webContents.executeJavaScript(`window.questionFixture.patch(${JSON.stringify(payload)})`);
  await win.loadFile(path.join(directory, "index.html"));
  await waitFor(win, "document.querySelector('.chat-prompt-heading')?.textContent.includes('답변 대기 중')");
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-empty')?.textContent.includes('불러오는 중')"), "Question fallback was not visible while loading");
  await patch({ chat: baseChat, state: { question: "어떤 경로인가요?\n전체 경로를 알려주세요." } });
  await waitFor(win, "document.querySelector('.chat-prompt-text')?.textContent.includes('전체 경로')");
  await patch({ state: { question: questions, questionToken: 2 } });
  await waitFor(win, "document.querySelector('.question-form')?.textContent.includes('어느 프로젝트')");
  assert(await win.webContents.executeJavaScript("document.querySelector('.question-form').textContent.includes('코딩 작업') && document.querySelectorAll('.question-form input[type=radio]').length===6"), "Codex question fields or descriptions missing");
  await win.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop=0");
  const layout = await win.webContents.executeJavaScript(`(() => { const p=document.querySelector('.chat-prompt').getBoundingClientRect(); return { visible:p.top>=0 && p.bottom<=innerHeight, scroll:document.querySelector('.chat-scroll').scrollTop }; })()`);
  assert(layout.visible && layout.scroll === 0, "Desktop question was hidden while reading old messages");
  await new Promise(resolve => setTimeout(resolve, 300));
  await fs.writeFile(path.resolve(appRoot, "../output/chat-question-desktop.png"), (await win.webContents.capturePage()).toPNG());
  await patch({ state: { agentStatus: "working" } });
  await waitFor(win, "!document.querySelector('.chat-prompt')");
  await patch({ chat: { ...baseChat, pendingQuestion: { id: "native-1", toolName: "functions.request_user_input", question: questions } } });
  await waitFor(win, "document.querySelector('.question-form') && !document.querySelector('.question-form input').disabled");
  await win.webContents.executeJavaScript(`document.querySelectorAll('.question-form input')[1].click(); document.querySelectorAll('.question-form input')[5].click(); const input=document.querySelector('.question-form .question-text-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'직접 지정'); input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor(win, "!document.querySelector('.question-submit').disabled");
  await win.webContents.executeJavaScript("document.querySelector('.question-submit').click()");
  await waitFor(win, "window.questionFixture.answers.length===1");
  assert(await win.webContents.executeJavaScript("window.questionFixture.answers[0].questionId==='native-1' && window.questionFixture.answers[0].answers[1].text==='직접 지정'"), 'Desktop structured answer or call identity lost');
  await patch({ chat: baseChat });
  await waitFor(win, "!document.querySelector('.chat-prompt')");
  const asyncQuestion = JSON.stringify({ questions: [{ title: '어느 폴더를 사용할까요?', options: ['현재 폴더', '다른 폴더'] }, { title: '추가 경로를 알려주세요' }] });
  await patch({ chat: { ...baseChat, lifecycle: 'working', pendingQuestion: { id: 'async-live', toolName: 'request_user_input_async', question: asyncQuestion, async: true } }, state: { agentStatus: 'working' } });
  await waitFor(win, "document.querySelector('.question-form')?.textContent.includes('어느 폴더') && !!document.querySelector('.chat-work-status')");
  assert(await win.webContents.executeJavaScript("document.querySelectorAll('.chat-work-status').length===1 && !document.querySelector('.chat-thread .chat-thinking')"), 'Async question duplicated the ongoing work indicator');
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-prompt-heading').textContent.includes('작업 중 질문') && !document.querySelector('.question-form input').disabled"), 'Async question missing during ongoing work');
  await win.webContents.executeJavaScript("(() => { document.querySelector('.question-form input[type=radio]').click();const input=document.querySelector('.question-text-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'G:/reference');input.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await waitFor(win, "!document.querySelector('.question-submit').disabled");
  await win.webContents.executeJavaScript("document.querySelector('.question-submit').click()");
  await waitFor(win, "window.questionFixture.answers.length===2");
  assert(await win.webContents.executeJavaScript("window.questionFixture.answers[1].questionId==='async-live' && window.questionFixture.answers[1].answers[1].text==='G:/reference'"), 'Async title/string options/free text answer lost');
  await patch({ chat: baseChat });
  await waitFor(win, "!document.querySelector('.chat-prompt')");
  await patch({ chat: { ...baseChat, unsupported: true }, state: { agentStatus: "waiting", question: null, questionToken: 3 } });
  await waitFor(win, "document.querySelector('.chat-prompt-text')?.textContent.includes('질문 또는 승인')");
  await patch({ chat: baseChat, failWrites: true, state: { provider: "claude", question: singleQuestion, questionToken: 4 } });
  await waitFor(win, "document.querySelectorAll('.chat-prompt-option').length===3");
  await win.webContents.executeJavaScript("document.querySelectorAll('.chat-prompt-option')[1].click()");
  await waitFor(win, "!!document.querySelector('.chat-prompt-error')");
  assert(await win.webContents.executeJavaScript("window.questionFixture.writes.length===1 && !document.querySelectorAll('.chat-prompt-option')[2].disabled"), "Failed answer hid the question or continued writing keys");
  await patch({ failWrites: false, state: { questionToken: 5 } });
  await waitFor(win, "!document.querySelector('.chat-prompt-option').disabled");
  await win.webContents.executeJavaScript("document.querySelector('.chat-prompt-option').click()");
  await waitFor(win, "document.querySelector('.chat-prompt-hint')?.textContent.includes('답변을 보냈습니다')");
  await patch({ state: { questionToken: 6 } });
  await waitFor(win, "!document.querySelector('.chat-prompt-option').disabled");
  await win.webContents.executeJavaScript("[...document.querySelectorAll('.chat-prompt-option')].at(-1).click()");
  assert(await win.webContents.executeJavaScript("window.questionTerminalOpened===true"), "Desktop terminal action failed");
  await patch({ state: { provider: "claude", question: "Login expired · Please run /login", questionToken: 8 } });
  await waitFor(win, "document.querySelector('.chat-prompt.authentication .chat-prompt-heading')?.textContent.includes('Claude 로그인 필요')");
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-prompt-hint').textContent.includes('/login') && document.querySelectorAll('.chat-prompt-option').length===1 && document.querySelector('.chat-prompt-option').textContent.includes('로그인할 터미널')"), 'Desktop login failure still presented as an answer');
  const authWrites = await win.webContents.executeJavaScript("window.questionFixture.writes.length");
  await win.webContents.executeJavaScript("document.querySelector('.chat-prompt-option').click()");
  assert(await win.webContents.executeJavaScript("window.questionFixture.writes.length") === authWrites, 'Opening auth terminal submitted input automatically');
  await patch({ state: { agentStatus: "running", question: null } });
  await waitFor(win, "!document.querySelector('.chat-prompt')");
  const startupWrites = await win.webContents.executeJavaScript("window.questionFixture.writes.length");
  await patch({ chat: { sessionId: null, blocks: [], pendingQuestion: null }, terminalScreen: startupTrust, state: { provider: "codex", agentStatus: "starting", question: null } });
  await waitFor(win, "document.querySelector('.chat-prompt-startup .chat-prompt-text')?.textContent.includes('K:\\\\AI\\\\Nogari')");
  assert(await win.webContents.executeJavaScript("window.questionFixture.writes.length") === startupWrites, "Startup dialog approved itself");
  assert(await win.webContents.executeJavaScript("document.querySelectorAll('.chat-prompt-option').length===3 && document.querySelector('.chat-prompt-text').textContent.includes('run code automatically')"), "Folder trust options or warning missing during startup");
  await fs.writeFile(path.resolve(appRoot, "../output/chat-startup-trust.png"), (await win.webContents.capturePage()).toPNG());
  // Choose Quit, rather than trusting, and ensure one movement then confirmation.
  await win.webContents.executeJavaScript("document.querySelectorAll('.chat-prompt-option')[1].click();document.querySelectorAll('.chat-prompt-option')[1].click()");
  await waitFor(win, "document.querySelector('.chat-prompt-hint')?.textContent.includes('답변을 보냈습니다')");
  const trustKeys = await win.webContents.executeJavaScript(`window.questionFixture.writes.slice(${startupWrites})`);
  assert(JSON.stringify(trustKeys) === JSON.stringify(["\x1b[B", "\r"]), `Folder trust used the wrong choice or sent duplicate answers: ${JSON.stringify(trustKeys)}`);
  await patch({ terminalScreen: startupHooks });
  await waitFor(win, "document.querySelector('.chat-prompt-heading')?.textContent.includes('시작 훅') && !document.querySelector('.chat-prompt-option').disabled");
  await fs.writeFile(path.resolve(appRoot, "../output/chat-startup-hooks.png"), (await win.webContents.capturePage()).toPNG());
  const beforeHooks = await win.webContents.executeJavaScript("window.questionFixture.writes.length");
  await win.webContents.executeJavaScript("document.querySelectorAll('.chat-prompt-option')[2].click()");
  await waitFor(win, "document.querySelector('.chat-prompt-hint')?.textContent.includes('답변을 보냈습니다')");
  const hookKeys = await win.webContents.executeJavaScript(`window.questionFixture.writes.slice(${beforeHooks})`);
  assert(JSON.stringify(hookKeys) === JSON.stringify(["\x1b[B", "\r"]), `Hook skip did not move from default option 2 to option 3: ${JSON.stringify(hookKeys)}`);
  await patch({ terminalScreen: "" });
  await waitFor(win, "!document.querySelector('.chat-prompt')");
  await patch({ terminalScreen: startupTrust, changeScreenOnWrite: startupHooks });
  await waitFor(win, "document.querySelector('.chat-prompt-heading')?.textContent.includes('프로젝트 폴더')");
  const beforeChanged = await win.webContents.executeJavaScript("window.questionFixture.writes.length");
  await win.webContents.executeJavaScript("document.querySelectorAll('.chat-prompt-option')[1].click()");
  await waitFor(win, "window.questionFixture.writes.length>" + beforeChanged);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert(await win.webContents.executeJavaScript(`window.questionFixture.writes.length===${beforeChanged + 1}`), "Changed startup screen received an unintended Enter");
  await patch({ state: { agentStatus: "exited" } });
  await waitFor(win, "!document.querySelector('.chat-prompt')");
  await patch({ terminalScreen: "", state: { agentStatus: "running" } });
  console.log("Desktop chat questions passed");
}

async function exerciseRemote(BrowserWindow, directory) {
  let chat = baseChat;
  const answers = [];
  let notifications = { enabled: true, revision: 0 };
  const web = new RemoteDashboardService({ baseDir: path.join(directory, "remote"), chatProvider: async () => chat,
    answerQuestion: async (id, answer) => { answers.push(answer); return { status: 'sent' }; },
    sessionNotifications: (id, change) => { if (change) notifications = { enabled: change.enabled, revision: notifications.revision + 1 }; agent.notifications = notifications; sync(); return notifications; } });
  const agent = { id: "fixture", name: "Question fixture", projectId: "p", aiToolId: "codex", status: "waiting", notifications, hook: { event: "waiting", received_at: 1 } };
  const sync = () => web.syncAgents([{ ...agent, hook: { ...agent.hook } }]);
  web.config.server_port = 0;
  web.syncView({ language: "ko", projects: [{ id: "p", name: "Question project", folder: directory }], agents: [{ id: "fixture", projectId: "p", aiToolId: "codex" }] });
  sync();
  const status = await web.start();
  try {
    for (const width of [1024, 390]) {
      chat = baseChat; agent.status = "waiting"; agent.aiToolId = "codex"; agent.hook = { event: "waiting", received_at: 1 }; sync();
      const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true, backgroundThrottling: false } });
      const errors = [];
      win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
      try {
        await win.loadURL(`${status.url}/?agent=fixture`);
        await waitFor(win, "!document.querySelector('#chatPrompt').hidden");
        if (width === 390) assert(await win.webContents.executeJavaScript("document.querySelector('#detailStatus').getBoundingClientRect().height<=30 && document.querySelector('#detailName').getBoundingClientRect().width>=50"), "Mobile Question status or session title was squeezed by header actions");
        assert(await win.webContents.executeJavaScript("document.querySelector('#chatPrompt').textContent.includes('질문 또는 승인')"), "Remote missing-details fallback failed");
        agent.hook = { event: "waiting", received_at: 2, interactive_question: "어떤 경로인가요?\n전체 경로를 알려주세요." }; sync();
        await waitFor(win, "document.querySelector('#chatPrompt').textContent.includes('전체 경로')");
        await win.webContents.executeJavaScript("document.querySelector('#chatView').scrollTop=0");
        agent.hook = { event: "waiting", received_at: 3, interactive_question: questions }; sync();
        await waitFor(win, "document.querySelector('#chatPrompt').textContent.includes('어느 프로젝트')");
        const layout = await win.webContents.executeJavaScript(`(() => { const p=document.querySelector('#chatPrompt').getBoundingClientRect(), b=document.querySelector('#chatPrompt button').getBoundingClientRect();return {visible:p.top>=0&&p.bottom<=innerHeight,actionVisible:b.top>=p.top&&b.bottom<=p.bottom+1,scroll:document.querySelector('#chatView').scrollTop,overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:document.querySelectorAll('#chatPrompt button').length}; })()`);
        assert(layout.visible && layout.actionVisible && layout.scroll === 0 && !layout.overflow && layout.buttons === 2, `Remote pinned question layout failed: ${JSON.stringify(layout)}`);
        await new Promise(resolve => setTimeout(resolve, 300));
        await fs.writeFile(path.resolve(appRoot, `../output/chat-question-${width}.png`), (await win.webContents.capturePage()).toPNG());
        await win.webContents.executeJavaScript("[...document.querySelectorAll('#chatPrompt button')].at(-1).click()");
        await waitFor(win, "document.querySelector('.app-shell').dataset.sessionMode==='term' && document.querySelector('#chatPrompt').hidden");
        await win.webContents.executeJavaScript("document.querySelector('#sessionMode [data-mode=chat]').click()");
        agent.status = "working"; agent.hook = { event: "tool-end", interactive_question: questions }; sync();
        await waitFor(win, "document.querySelector('#chatPrompt').hidden");
        chat = { ...baseChat, pendingQuestion: { id: "native-1", toolName: "functions.request_user_input", question: questions } };
        await waitFor(win, "!document.querySelector('#chatPrompt').hidden && document.querySelector('#chatPrompt').textContent.includes('어느 프로젝트')");
        await win.webContents.executeJavaScript("document.querySelectorAll('#chatPrompt input[type=radio]')[1].click(); document.querySelectorAll('#chatPrompt input[type=radio]')[3].click(); document.querySelector('#chatPrompt .question-submit').click()");
        await waitFor(win, "document.querySelector('#chatPrompt .chat-prompt-hint').textContent.includes('답변을 보냈습니다')");
        assert(answers.at(-1).answers[0].optionIndex === 1 && answers.at(-1).questionId === 'native-1', 'Remote answer changed choices or identity');
        await win.webContents.executeJavaScript("document.querySelector('#sessionNotifications').click()");
        await waitFor(win, `document.querySelector('#sessionNotifications').getAttribute('aria-pressed')==='${!notifications.enabled}'`);
        chat = baseChat;
        await waitFor(win, "document.querySelector('#chatPrompt').hidden");
        chat = { ...baseChat, lifecycle:'working', pendingQuestion:{ id:'remote-async', toolName:'request_user_input_async', async:true, question:JSON.stringify({ questions:[{ title:'작업 중 경로를 선택해 주세요', options:['현재 경로','다른 경로'] }] }) } };
        await waitFor(win, "document.querySelector('#chatPrompt').textContent.includes('작업 중 경로') && !!document.querySelector('#chatView .chat-thinking')");
        await win.webContents.executeJavaScript("document.querySelector('#chatPrompt input[type=radio]').click();document.querySelector('#chatPrompt .question-submit').click()");
        await waitFor(win, "document.querySelector('#chatPrompt .chat-prompt-hint').textContent.includes('답변을 보냈습니다')");
        assert(answers.at(-1).questionId==='remote-async' && answers.at(-1).answers[0].id==='async-0', 'Remote async question schema or identity missing');
        chat = baseChat;
        await waitFor(win, "document.querySelector('#chatPrompt').hidden");
        chat = { ...baseChat, unsupported: true }; agent.status = "waiting"; agent.hook = { event: "waiting", received_at: 4 }; sync();
        await waitFor(win, "!document.querySelector('#chatPrompt').hidden && document.querySelector('#chatView').textContent.includes('지원하지 않습니다')");
        chat = baseChat; agent.aiToolId = "claude"; agent.hook = { event: "waiting", received_at: 5, interactive_question: singleQuestion }; sync();
        await waitFor(win, "document.querySelectorAll('#chatPrompt button').length===3");
        await win.webContents.executeJavaScript(`window.questionInputWrites=[];window.originalQuestionFetch=window.fetch;window.fetch=(url,options)=>url==='/api/input'?(window.questionInputWrites.push(JSON.parse(options.body).data),Promise.resolve(new Response('{"error":"fixture failure"}',{status:500,headers:{'content-type':'application/json'}}))):window.originalQuestionFetch(url,options);document.querySelectorAll('#chatPrompt button')[1].click()`);
        await waitFor(win, "!!document.querySelector('#chatPrompt .chat-prompt-error')");
        assert(await win.webContents.executeJavaScript("window.questionInputWrites.length===1 && ![...document.querySelectorAll('#chatPrompt button')].at(-1).disabled"), "Remote answer failure hid the question or continued writes");
        await win.webContents.executeJavaScript("window.fetch=(url,options)=>url==='/api/input'?Promise.resolve(new Response('{\"ok\":true}',{status:200,headers:{'content-type':'application/json'}})):window.originalQuestionFetch(url,options);void 0");
        agent.hook = { ...agent.hook, received_at: 6 }; sync();
        await waitFor(win, "!document.querySelector('#chatPrompt button').disabled");
        await win.webContents.executeJavaScript("document.querySelector('#chatPrompt button').click()");
        await waitFor(win, "document.querySelector('#chatPrompt .chat-prompt-hint')?.textContent.includes('답변을 보냈습니다')");
        agent.hook = { ...agent.hook, received_at: 7 }; sync();
        await waitFor(win, "!document.querySelector('#chatPrompt button').disabled");
        agent.hook = { event: "waiting", received_at: 8, interactive_question: "Login expired · Please run /login" }; sync();
        await waitFor(win, "document.querySelector('#chatPrompt .chat-prompt.authentication .chat-prompt-heading')?.textContent.includes('Claude 로그인 필요')");
        assert(await win.webContents.executeJavaScript("document.querySelector('#chatPrompt .chat-prompt-hint').textContent.includes('/login') && document.querySelectorAll('#chatPrompt button').length===1 && document.querySelector('#chatPrompt button').textContent.includes('로그인할 터미널')"), 'Remote login failure still presented as an answer');
        agent.status = 'running'; agent.hook = { event: 'done', received_at: 9 }; sync();
        await waitFor(win, "document.querySelector('#chatPrompt').hidden");
        assert(errors.length === 0, errors.join("\n"));
        console.log(`Remote chat questions passed: ${width}px`);
      } finally { win.destroy(); }
    }
  } finally { await web.stop(); }
}

async function exerciseChatUX(win, directory) {
  const patch = payload => win.webContents.executeJavaScript(`window.questionFixture.patch(${JSON.stringify(payload)})`);
  const input = value => win.webContents.executeJavaScript(`(() => { const el=document.querySelector('.chat-composer-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const code = 'const sidebar = "Acedia";\nconsole.log(sidebar);';
  const narrative = '# 대화는 빠르게. 작업은 한눈에.\n\n본문에 집중하고, 필요한 작업만 펼쳐 볼 수 있도록 정리했습니다.\n\n1. **읽기 편한 대화** — 본문과 입력창의 폭을 맞추고 여백을 늘렸습니다.\n2. **필요한 순간에 작업 확인** — 명령과 파일 변경은 펼쳐서 확인합니다.\n\n```javascript\n' + code + '\n```';
  const demo = { sessionId: 'fixture-session', tool: 'codex', lifecycle: 'idle', pendingQuestion: null, blocks: [
    { sequence: 1, role: 'user', kind: 'text', text: '채팅도 초안처럼 정리해 보자.\n작업 내역과 복사는 계속 쉽게 찾고 싶어.' },
    { sequence: 2, role: 'assistant', kind: 'text', text: '채팅 영역을 확인하고 있습니다.' },
    { sequence: 3, role: 'assistant', kind: 'tool-call', name: 'read_file', summary: 'src/components/ChatView.tsx' },
    { sequence: 4, role: 'tool', kind: 'tool-result', output: 'ChatView source inspected' },
    { sequence: 5, role: 'assistant', kind: 'text', text: narrative },
  ] };
  await win.loadFile(path.join(directory, 'index.html'));
  win.setContentSize(1280, 900);
  await patch({ chat: demo, state: { agentStatus: 'running', provider: 'codex', question: null, projectName: 'Acedia', folder: 'G:/AI/Acedia/source', connectionLabel: '이 컴퓨터' } });
  await waitFor(win, "document.querySelector('.chat-codeblock') && !document.querySelector('.chat-prompt')");
  assert(await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.chat-turn.assistant')).borderTopWidth==='0px' && document.querySelector('.chat-composer-context').textContent.includes('Acedia')"), 'Conversation hierarchy or composer context missing');
  await win.webContents.executeJavaScript("document.querySelector('.chat-codeblock .chat-copy-button').click()");
  await waitFor(win, "window.questionFixture.clipboard.length===1");
  assert(await win.webContents.executeJavaScript('window.questionFixture.clipboard[0]') === code, 'Code copy included markup, header, or controls');
  await win.webContents.executeJavaScript("document.querySelector('.chat-message-actions .chat-copy-button').click()");
  await waitFor(win, "window.questionFixture.clipboard.length===2");
  assert(await win.webContents.executeJavaScript('window.questionFixture.clipboard[1]') === '채팅 영역을 확인하고 있습니다.\n\n' + narrative, 'Answer copy omitted narrative or included tool output');
  await patch({ failClipboard: true });
  await win.webContents.executeJavaScript("document.querySelector('.chat-user-actions .chat-copy-button').click()");
  await waitFor(win, "document.querySelector('.chat-user-actions .chat-copy-button.error') && window.questionFixture.clipboard.length===2");
  await patch({ failClipboard: false });
  await win.webContents.executeJavaScript("document.querySelector('.chat-work-tools > summary').click()");
    await waitFor(win, "!!document.querySelector('.chat-tool > summary')");
    await win.webContents.executeJavaScript("document.querySelector('.chat-tool > summary').click()");
    await waitFor(win, "document.querySelector('.chat-tool pre')?.textContent.includes('source inspected')");
  await win.webContents.executeJavaScript("document.querySelector('.chat-work-tools > summary').click()");
  await new Promise(resolve => setTimeout(resolve, 2000));
  for (const [width, height, theme] of [[1280, 900, 'soft'], [1280, 900, 'light'], [800, 640, 'soft'], [420, 640, 'soft']]) {
    win.setContentSize(width, height);
    await win.webContents.executeJavaScript(`document.getElementById('root').className='app app-theme-${theme}'`);
    await new Promise(resolve => setTimeout(resolve, 200));
    const layout = await win.webContents.executeJavaScript(`(() => {
      const t=document.querySelector('.chat-thread').getBoundingClientRect(),c=document.querySelector('.chat-composer').getBoundingClientRect(),i=document.querySelector('.chat-composer-input');
      const button=document.querySelector('.chat-composer-send').getBoundingClientRect();i.focus();
      return {overflow:document.documentElement.scrollWidth>innerWidth,thread:t.width,aligned:Math.abs((t.left+t.right-c.left-c.right)/2)<2,visible:button.bottom<=innerHeight,outline:getComputedStyle(i).outlineStyle};
    })()`);
    assert(!layout.overflow && layout.thread <= 760 && layout.aligned && layout.visible && layout.outline === 'none', `Chat column/composer layout failed ${width} ${theme}: ${JSON.stringify(layout)}`);
    await fs.writeFile(path.resolve(appRoot, `../output/chat-workspace-${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  await input('줄바꿈 확인');
  const newline = await win.webContents.executeJavaScript(`(() => {
    const el=document.querySelector('.chat-composer-input'), e=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});
    el.dispatchEvent(e);return !e.defaultPrevented && window.questionFixture.writes.length===0;
  })()`);
  assert(newline, 'Shift+Enter sent the message instead of allowing a newline');
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}))");
  await waitFor(win, "document.querySelector('.chat-composer-input').value.includes('\\n') && window.questionFixture.writes.length===0");
  await input('메시지 전송 확인');
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-send').click()");
  await waitFor(win, "window.questionFixture.writes.length===2");
  const sent = await win.webContents.executeJavaScript('window.questionFixture.writes');
  assert(JSON.stringify(sent) === JSON.stringify(['메시지 전송 확인', '\r']), 'Send button changed PTY delivery');
  await patch({ state: { agentStatus: 'working' }, chat: { ...demo, lifecycle: 'working' } });
  await waitFor(win, "!!document.querySelector('.chat-composer-stop')");
  await input('예약 작업');
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-send').click()");
  await waitFor(win, "!!document.querySelector('.chat-queue')");
  assert(await win.webContents.executeJavaScript('window.questionFixture.writes.length===2'), 'Queued message sent during ongoing work');
  await win.webContents.executeJavaScript("document.querySelector('.chat-queue-cancel').click();document.querySelector('.chat-composer-stop').click()");
  await waitFor(win, "!document.querySelector('.chat-queue') && window.questionFixture.writes.length===3");
  assert(await win.webContents.executeJavaScript('window.questionFixture.writes[2]') === '\x1b', 'Stop action did not interrupt the PTY');
  await patch({ filesToSelect: ['K:/Assets/My README.md', 'K:/Assets/reference.png'], state: { agentStatus: 'running' }, chat: demo });
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-attach').click()");
  await waitFor(win, "document.querySelector('.chat-attachment img') && document.querySelector('.chat-composer-input').value.includes('My README.md')");
  assert(await win.webContents.executeJavaScript('window.questionFixture.writes.length===3'), 'Attaching a file sent input automatically');
  await input('/mod');
  await waitFor(win, "document.querySelector('.chat-ac')?.textContent.includes('/model')");
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-ac').getBoundingClientRect().bottom<=document.querySelector('.chat-composer').getBoundingClientRect().top && document.querySelector('.chat-ac').getBoundingClientRect().top>=0"), 'Autocomplete was hidden behind the new composer');
  await input('로그인 뒤 요청');
  await patch({ state: { provider: 'claude', agentStatus: 'waiting', question: 'Login expired · Please run /login' } });
  await waitFor(win, "document.querySelector('.chat-composer-send').disabled && !!document.querySelector('.chat-prompt.authentication')");
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  assert(await win.webContents.executeJavaScript('window.questionFixture.writes.length===3'), 'Sign-in required composer still submitted a request');
  console.log('Desktop chat UX passed (columns, themes, copy, files, newline, queue, stop, auth)');
}

async function exerciseChatMediaAndWork(win, directory) {
  const patch = payload => win.webContents.executeJavaScript(`window.questionFixture.patch(${JSON.stringify(payload)})`);
  const previewDataUrl = `data:image/png;base64,${(await fs.readFile(path.resolve(appRoot, '../output/chat-workspace-soft-1280.png'))).toString('base64')}`;
  const started = Date.now() - 3000;
  const media = { sessionId: 'fixture-session', tool: 'codex', lifecycle: 'working', lifecycleAt: started, activeTool: 'functions.exec_command', pendingQuestion: null, blocks: [
    { sequence: 31, role: 'user', kind: 'text', text: '[Image #1] 채팅에서 이미지와 작업 진행을 확인해 줘.' },
    { sequence: 32, role: 'assistant', kind: 'text', text: '[화면 미리보기](/G:/My%20Project/%EC%B4%88%EC%95%88%20%2520.html)\n\nG:/My Project/literal%20.html\n\n![결과 이미지](./output/result.png)' },
  ] };
  await win.loadFile(path.join(directory, 'index.html'));
  win.setContentSize(1280, 1000);
  await patch({ previewDataUrl, imagesBySequence: { 31: [{ dataUrl: previewDataUrl }] }, chat: media,
    state: { agentStatus: 'running', provider: 'codex', question: null, folder: 'G:/My Project', projectName: 'Acedia' } });
  await waitFor(win, "!!document.querySelector('.chat-work-status') && !!document.querySelector('.chat-composer-stop')");
  await win.webContents.executeJavaScript("document.querySelector('.chat-scroll').scrollTop=0");
  await waitFor(win, "document.querySelector('.chat-user img')?.naturalWidth>1");
  assert(await win.webContents.executeJavaScript("!document.querySelector('.chat-user-text').textContent.includes('[Image #1]')"), 'Native attachment still displayed only as an image placeholder');
  await win.webContents.executeJavaScript("document.querySelector('.chat-md .chat-image-preview').scrollIntoView({block:'center'})");
  await waitFor(win, "document.querySelector('.chat-md .chat-image-preview img')?.naturalWidth>1");
  assert(await win.webContents.executeJavaScript("window.questionFixture.resolvedPaths.some(p=>p.path==='./output/result.png' && p.folder==='G:/My Project')"), 'Markdown image did not resolve relative to the session project');
  await win.webContents.executeJavaScript(`window.chatImageBeforeRefresh=document.querySelector('.chat-md .chat-image-preview img');window.chatImageReadsBeforeRefresh=window.questionFixture.resolvedPaths.length;`);
  for (let tick = 0; tick < 3; tick += 1) {
    await patch({ state: { questionToken: 100 + tick } });
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  assert(await win.webContents.executeJavaScript("window.chatImageBeforeRefresh.isConnected && document.querySelector('.chat-md .chat-image-preview img')===window.chatImageBeforeRefresh && window.questionFixture.resolvedPaths.length===window.chatImageReadsBeforeRefresh"), 'Existing image remounted or reread during conversation refresh');
  media.blocks.push({ sequence: 33, role: 'assistant', kind: 'text', text: '다음 파일도 확인하고 있습니다.' });
  await patch({ chat: media });
  await waitFor(win, "document.querySelector('.chat-thread').textContent.includes('다음 파일도')");
  assert(await win.webContents.executeJavaScript("window.chatImageBeforeRefresh.isConnected && document.querySelector('.chat-md .chat-image-preview img')===window.chatImageBeforeRefresh"), 'Streaming assistant text replaced a loaded image');
  await patch({ olderChat: { ...media, blocks: [
    { sequence: 1, role: 'user', kind: 'text', text: '이전 요청' },
    { sequence: 2, role: 'assistant', kind: 'text', text: '이전 답변' },
  ], hasOlder: false }, chat: { ...media, hasOlder: true } });
  await waitFor(win, "!!document.querySelector('.chat-more') || document.querySelector('.chat-thread').textContent.includes('이전 답변')");
  await win.webContents.executeJavaScript("document.querySelector('.chat-more')?.click()");
  await waitFor(win, "document.querySelector('.chat-thread').textContent.includes('이전 답변')");
  assert(await win.webContents.executeJavaScript("window.chatImageBeforeRefresh.isConnected && document.querySelector('.chat-md .chat-image-preview img')===window.chatImageBeforeRefresh && window.questionFixture.imageReads.filter(p=>p.sequence===31).length===1"), 'Prepending older turns replaced the existing image or reloaded native attachments');
  await win.webContents.executeJavaScript("document.querySelectorAll('.chat-md .chat-path-link').forEach(link=>link.click())");
  const targets = await win.webContents.executeJavaScript('window.questionFixture.openedPaths');
  assert(JSON.stringify(targets) === JSON.stringify(['G:/My Project/초안 %20.html', 'G:/My Project/literal%20.html']), `Local Markdown targets did not decode exactly once: ${JSON.stringify(targets)}`);
  await win.webContents.executeJavaScript("document.querySelector('.chat-user .chat-image-open').click()");
  await waitFor(win, "document.querySelector('.image-viewer-body img')?.naturalWidth>1");
  const beforeZoom = await win.webContents.executeJavaScript("document.querySelector('.image-viewer-body img').style.transform");
  await win.webContents.executeJavaScript("document.querySelectorAll('.image-viewer-actions button')[2].click()");
  await waitFor(win, `document.querySelector('.image-viewer-body img').style.transform!==${JSON.stringify(beforeZoom)}`);
  await win.webContents.executeJavaScript("document.querySelectorAll('.image-viewer-actions button')[3].click()");
  await waitFor(win, "window.questionFixture.imageClipboard.length===1 && document.querySelector('.image-viewer-status')?.textContent.includes('복사했습니다')");
  await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
  await waitFor(win, "!document.querySelector('.image-viewer')");
  assert(await win.webContents.executeJavaScript('window.questionFixture.writes.length===0 && !!document.querySelector(".chat-work-status")'), 'Closing the image viewer interrupted the running agent');
  for (const [width, height, theme] of [[1280, 1000, 'soft'], [1280, 1000, 'light'], [420, 740, 'soft']]) {
    win.setContentSize(width, height);
    await win.webContents.executeJavaScript(`document.getElementById('root').className='app app-theme-${theme}';document.querySelector('.chat-scroll').scrollTop=0`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const layout = await win.webContents.executeJavaScript(`(() => {
      const status=document.querySelector('.chat-work-status').getBoundingClientRect(),composer=document.querySelector('.chat-composer-area').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth,visible:status.top>=0 && status.bottom<=composer.top && composer.bottom<=innerHeight,
        singleWorkStatus:document.querySelectorAll('.chat-work-status').length===1 && !document.querySelector('.chat-thread .chat-thinking'),
        previews:[...document.querySelectorAll('.chat-image-preview img')].every(img=>img.getBoundingClientRect().width<=document.querySelector('.chat-thread').getBoundingClientRect().width)};
    })()`);
    assert(!layout.overflow && layout.visible && layout.previews, `Images or persistent work status overflowed ${width}px ${theme}: ${JSON.stringify(layout)}`);
    assert(layout.singleWorkStatus, `Ongoing work displayed duplicate status indicators at ${width}px ${theme}`);
    await fs.writeFile(path.resolve(appRoot, `../output/chat-media-work-${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
  }
  assert(await win.webContents.executeJavaScript('window.questionFixture.imageReads.filter(p=>p.sequence===31).length===1'), 'Clock updates or history polling reloaded native bitmap data');
  await patch({ state: { agentStatus: 'working', workStartedAt: started }, chat: { ...media, lifecycle: 'idle', lifecycleAt: started - 1000 } });
  await waitFor(win, "!!document.querySelector('.chat-work-status')");
  await patch({ chat: { ...media, lifecycle: 'idle', lifecycleAt: Date.now() } });
  await waitFor(win, "!document.querySelector('.chat-work-status') && !document.querySelector('.chat-composer-stop')");
  await patch({ state: { agentStatus: 'working', workStartedAt: Date.now() - 120000 }, chat: { ...media, lifecycle: 'idle', lifecycleAt: Date.now() } });
  await win.webContents.executeJavaScript(`(() => { const el=document.querySelector('.chat-composer-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'작업 시작 표시 확인');el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await waitFor(win, "!document.querySelector('.chat-composer-send').disabled");
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-send').click()");
  await waitFor(win, "window.questionFixture.writes.length===2 && !!document.querySelector('.chat-work-status')");
  assert(await win.webContents.executeJavaScript("/^0:0[0-2]$/.test(document.querySelector('.chat-work-elapsed').textContent)"), 'New work reused the elapsed time of a previously completed turn');
  await patch({ chat: { ...media, lifecycle: 'idle', lifecycleAt: Date.now() } });
  await waitFor(win, "!document.querySelector('.chat-work-status')");
  console.log('Desktop chat media and live work passed (paths, native images, viewer, copy, progress, completion, themes, responsive layout)');
}

async function exerciseConversationActions(win, directory) {
  const patch = payload => win.webContents.executeJavaScript(`window.questionFixture.patch(${JSON.stringify(payload)})`);
  const input = value => win.webContents.executeJavaScript(`(() => { const el=document.querySelector('.chat-composer-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const demo = { sessionId: 'fixture-session', tool: 'codex', lifecycle: 'idle', pendingQuestion: null, blocks: [
    { sequence: 71, role: 'user', kind: 'text', text: '원래 요청을 확인해줘.' },
    { sequence: 72, role: 'assistant', kind: 'text', text: '확인한 답변입니다.' },
  ], artifacts: [{ kind: 'html', path: 'G:/Acedia/output/layout.html', size: 1024, modifiedAt: null, sourceSequence: 72, usage: 'output' }] };
  await win.loadFile(path.join(directory, 'index.html'));
  win.setContentSize(1280, 900);
  await patch({ chat: demo, state: { agentStatus: 'running', provider: 'codex', question: null, projectName: 'Acedia' } });
  await waitFor(win, "!!document.querySelector('.chat-user-reuse') && !!document.querySelector('.chat-quote-button')");
  const roles = await win.webContents.executeJavaScript(`(() => { const u=document.querySelector('.chat-user').getBoundingClientRect(),a=document.querySelector('.chat-turn.assistant').getBoundingClientRect(),t=document.querySelector('.chat-thread').getBoundingClientRect();return {right:Math.abs(u.right-t.right)<2,left:Math.abs(a.left-t.left)<2,separated:u.left>a.left+100,font:getComputedStyle(document.querySelector('.chat-md')).fontFamily}; })()`);
  assert(roles.right && roles.left && roles.separated && roles.font.includes('Segoe UI'), `Message roles or body font not distinct: ${JSON.stringify(roles)}`);
  await input('작성 중인 요청');
  await win.webContents.executeJavaScript("document.querySelector('.chat-user-reuse').click()");
  await waitFor(win, "document.querySelector('.chat-composer-reference')?.textContent.includes('새 메시지')");
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-composer-input').value.includes('작성 중인 요청') && document.querySelector('.chat-composer-input').value.includes('원래 요청') && window.questionFixture.writes.length===0 && document.querySelector('.chat-user-text').textContent==='원래 요청을 확인해줘.'"), 'Reusing a request erased the draft, edited history, or sent automatically');
  await win.webContents.executeJavaScript("document.querySelector('.chat-reference-clear').click()");
  await input('');
  await win.webContents.executeJavaScript("document.querySelector('.chat-quote-button').click()");
  await waitFor(win, "document.querySelector('.chat-composer-reference')?.textContent.includes('답변 인용')");
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-composer-send').disabled && window.questionFixture.writes.length===0"), 'Quote without a request submitted automatically');
  await input('새로운 질문');
  await patch({ state: { sessionId: 'other-fixture-session' }, chat: { ...demo, blocks: [], artifacts: [] } });
  await waitFor(win, "document.querySelector('.chat-composer-input').value==='' && !document.querySelector('.chat-composer-reference')");
  await input('다른 세션 초안');
  await patch({ state: { sessionId: 'fixture-session' }, chat: demo });
  await waitFor(win, "document.querySelector('.chat-composer-input').value==='새로운 질문' && !!document.querySelector('.chat-composer-reference')");
  await win.webContents.executeJavaScript("document.querySelector('.chat-artifact').click()");
  await waitFor(win, "window.questionFixture.openedPaths.length===1");
  assert(await win.webContents.executeJavaScript("window.questionFixture.openedPaths[0]==='G:/Acedia/output/layout.html'"), 'Artifact bypassed workspace preview path');
  await fs.writeFile(path.resolve(appRoot, '../output/chat-conversation-actions.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript("document.querySelector('.chat-composer-send').click()");
  await waitFor(win, "window.questionFixture.writes.length===2");
  assert(JSON.stringify(await win.webContents.executeJavaScript('window.questionFixture.writes')) === JSON.stringify(['> 확인한 답변입니다.\n\n새로운 질문','\r']), 'Quoted request changed PTY delivery');
  assert(await win.webContents.executeJavaScript("!document.querySelector('.chat-composer-reference') && document.querySelector('.chat-composer-input').value===''"), 'Sent quote stayed in the composer');
  console.log('Desktop conversation actions passed (role alignment, request reuse, quote, draft isolation, artifact preview)');
}

async function exerciseStartupPane(BrowserWindow, directory) {
  const win = new BrowserWindow({ width: 1024, height: 760, show: false, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try {
    await win.loadFile(path.join(directory, "startup.html"));
    await waitFor(win, "!!document.querySelector('.chat-prompt-startup')");
    assert(await win.webContents.executeJavaScript(`(() => {
      const host = document.querySelector('.pane-body');
      const calls = window.startupFixture.calls;
      return getComputedStyle(host).visibility === 'hidden' && host.clientWidth > 0 && host.clientHeight > 0
        && calls.filter(c => c.command === 'spawn_pty').length === 1 && calls.filter(c => c.command === 'attach_terminal').length === 1
        && !calls.some(c => c.command === 'write_pty') && !document.activeElement?.classList.contains('xterm-helper-textarea');
    })()`), "First launch in chat did not fit and attach its hidden terminal, or sent input automatically");
    await fs.writeFile(path.resolve(appRoot, "../output/chat-startup-pane.png"), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`window.startupFixture.patchScreen(${JSON.stringify(startupHooks)})`);
    await waitFor(win, "document.querySelector('.chat-prompt-heading')?.textContent.includes('시작 훅')");
    win.setContentSize(500, 600);
    await new Promise(resolve => setTimeout(resolve, 200));
    await win.webContents.executeJavaScript(`window.startupFixture.patchScreen(${JSON.stringify(startupHooks)})`);
    await waitFor(win, "document.querySelector('.chat-prompt-text')?.textContent.includes('outside the sandbox')");
    assert(await win.webContents.executeJavaScript(`(() => {
      const options = document.querySelector('.chat-prompt-options').getBoundingClientRect();
      return options.bottom <= innerHeight && options.top >= 0 && document.documentElement.scrollWidth === innerWidth;
    })()`), "Wrapped startup prompt clipped its actions or overflowed");
    await win.webContents.executeJavaScript("document.querySelectorAll('.chat-prompt-option')[2].click()");
    await waitFor(win, "document.querySelector('.chat-prompt-hint')?.textContent.includes('답변을 보냈습니다')");
    const keys = await win.webContents.executeJavaScript("window.startupFixture.calls.filter(c=>c.command==='write_pty').map(c=>c.args.data)");
    assert(JSON.stringify(keys) === JSON.stringify(["\x1b[B", "\r"]), `Native startup choices used wrong keys: ${JSON.stringify(keys)}`);
    await win.webContents.executeJavaScript("(() => { const el=document.querySelector('.chat-composer-input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'입력 중인 초안');el.dispatchEvent(new Event('input',{bubbles:true})); })()");
    await win.webContents.executeJavaScript("window.startupFixture.toggleChat()");
    await waitFor(win, "!document.querySelector('.chat-view') && getComputedStyle(document.querySelector('.pane-body')).visibility==='visible'");
    await win.webContents.executeJavaScript("window.startupFixture.toggleChat()");
    await waitFor(win, "!!document.querySelector('.chat-prompt-startup')");
    assert(await win.webContents.executeJavaScript("document.querySelector('.chat-composer-input').value==='입력 중인 초안'"), 'Chat draft lost when toggling the terminal');
    assert(await win.webContents.executeJavaScript("window.startupFixture.calls.filter(c=>c.command==='spawn_pty').length===1 && !window.startupFixture.calls.some(c=>c.command==='kill_pty' || c.command==='detach_terminal')"), "Chat switching changed the PTY lifecycle");
    await win.webContents.executeJavaScript("window.startupFixture.patchScreen('Codex is ready')");
    await waitFor(win, "!document.querySelector('.chat-prompt')");
    if (errors.length) throw Error(errors.join("\n"));
    console.log("Native chat startup prompts passed (initial attach, wrapping, choices, lifecycle)");
  } finally { win.destroy(); }
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require("electron");
  const directory = process.env.ACEDIA_QUESTION_SMOKE_DIR;
  app.setPath("userData", path.join(directory, "profile"));
  app.disableHardwareAcceleration();
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
    const desktop = new BrowserWindow({ width: 1024, height: 850, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    try {
      await fs.mkdir(path.resolve(appRoot, "../output"), { recursive: true });
      await exerciseDesktop(desktop, directory);
      await exerciseChatUX(desktop, directory);
      await exerciseChatMediaAndWork(desktop, directory);
      await exerciseConversationActions(desktop, directory);
      desktop.destroy();
      await exerciseStartupPane(BrowserWindow, directory);
      await exerciseRemote(BrowserWindow, directory);
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-question-smoke-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/chat-question-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    await fs.copyFile(path.join(appRoot, "public/app-icon.png"), path.join(directory, "app-icon.png"));
    await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/chat-startup-renderer.tsx")], bundle: true,
      define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "startup-renderer.js") });
    await fs.writeFile(path.join(directory, "startup.html"), '<meta charset="utf-8"><link rel="stylesheet" href="startup-renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text);overflow:hidden}</style><div id="root" class="app app-theme-soft"></div><script src="startup-renderer.js"></script>');
    const env = { ...process.env, ACEDIA_QUESTION_SMOKE_DIR: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 150000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error(`Question smoke failed: ${code}`);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-question-smoke-")) throw new Error("Unexpected fixture path");
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
}
