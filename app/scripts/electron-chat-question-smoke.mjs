import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";

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
  await waitFor(win, "document.querySelector('.question-form')?.textContent.includes('어느 폴더') && !!document.querySelector('.chat-thinking')");
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
        assert(errors.length === 0, errors.join("\n"));
        console.log(`Remote chat questions passed: ${width}px`);
      } finally { win.destroy(); }
    }
  } finally { await web.stop(); }
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
      desktop.destroy();
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
