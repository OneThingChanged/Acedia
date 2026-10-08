import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function waitFor(win, expression) {
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 70));
  }
  throw Error(`Chat file UI timed out: ${expression}`);
}

async function exercise(win, directory) {
  const patch = payload => win.webContents.executeJavaScript(`window.questionFixture.patch(${JSON.stringify(payload)})`);
  await win.loadFile(path.join(directory, "index.html"));
  await waitFor(win, "!!window.questionFixture");
  const bitmaps = await win.webContents.executeJavaScript(`(() => {
    const make = (width,height) => {const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');const gradient=c.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#356ec5');gradient.addColorStop(1,'#eb995f');c.fillStyle=gradient;c.fillRect(0,0,width,height);c.fillStyle='#ffffff';c.font='48px sans-serif';c.fillText(width+' × '+height,48,80);return canvas.toDataURL('image/png');};
    return {wide:make(1800,600),portrait:make(500,1400)};
  })()`);
  const files = [
    { kind: "html", path: "G:/project/output/result.html", usage: "output" },
    { kind: "mp4", path: "G:/project/output/scene.mp4", usage: "output" },
    ...Array.from({ length: 148 }, (_, i) => ({ kind: "ts", path: `G:/project/src/reference-${i}.ts`, usage: "reference" })),
  ].map(file => ({ ...file, size: 2048, modifiedAt: 1, sourceSequence: 202 }));
  const demo = { tool: "codex", sessionId: "fixture-session", lifecycle: "idle", hasOlder: false, artifacts: files, blocks: [
    { sequence: 201, role: "user", kind: "text", text: "[Image #1] [Image #2] 이미지와 파일을 확인해줘." },
    { sequence: 202, role: "assistant", kind: "text", text: "확인한 이미지입니다.\n\n[도시 콘셉트](/G:/project/output/city.png)\n\n생성한 파일과 참고한 파일을 답변에 모았습니다." },
    { sequence: 203, role: "user", kind: "text", text: "다음 질문입니다." },
    { sequence: 204, role: "assistant", kind: "text", text: "다음 답변은 별도로 표시합니다." },
  ] };
  await patch({ previewDataUrl: bitmaps.wide, imagesBySequence: { 201: [{ dataUrl: bitmaps.wide }, { dataUrl: bitmaps.portrait }] },
    chat: demo, state: { agentStatus: "running", question: null, folder: "G:/project", projectName: "Acedia" } });
  await waitFor(win, "document.querySelectorAll('.chat-artifact').length===3 && document.querySelectorAll('.chat-turn.assistant').length===2");
  await win.webContents.executeJavaScript("document.querySelector('.chat-user-images').scrollIntoView({block:'center'})");
  await waitFor(win, "[...document.querySelectorAll('.chat-user-images img')].every(img=>img.naturalWidth>1)");
  await win.webContents.executeJavaScript("document.querySelector('.chat-md .chat-image-preview').scrollIntoView({block:'center'})");
  await waitFor(win, "document.querySelector('.chat-md .chat-image-preview img')?.naturalWidth===1800");
  assert(await win.webContents.executeJavaScript("document.querySelectorAll('.chat-turn.assistant')[0].querySelector('.chat-artifacts') && !document.querySelectorAll('.chat-turn.assistant')[1].querySelector('.chat-artifacts') && ![...document.querySelector('.chat-thread').children].some(el=>el.matches('.chat-artifacts'))"), "Files followed a later request or appeared outside their answer");
  assert(await win.webContents.executeJavaScript("document.querySelector('.chat-files-output')?.textContent.includes('생성·수정 파일') && document.querySelector('.chat-files-reference')?.textContent.includes('관련 파일') && document.querySelector('.chat-files-more')?.textContent.includes('150')"), "Outputs, references or full file count missing");
  await win.webContents.executeJavaScript("window.savedChatImage=document.querySelector('.chat-md .chat-image-preview img');window.savedReadCount=window.questionFixture.resolvedPaths.length");

  for (const [width, theme] of [[1440, "soft"], [390, "soft"], [300, "light"]]) {
    win.setContentSize(width, 900);
    await win.webContents.executeJavaScript(`document.getElementById('root').className='app app-theme-${theme}'`);
    await new Promise(resolve => setTimeout(resolve, 180));
    const layout = await win.webContents.executeJavaScript(`(() => {
      const previews=[...document.querySelectorAll('.chat-image-preview')];
      return {overflow:document.documentElement.scrollWidth>innerWidth,images:previews.map(p=>{
        const image=p.querySelector('img'),button=p.querySelector('button'),i=image.getBoundingClientRect(),b=button.getBoundingClientRect(),r=p.getBoundingClientRect(),u=p.closest('.chat-user')?.getBoundingClientRect();
        return {fits:Math.abs(b.width-i.width-2)<1.1 && Math.abs(b.height-i.height-2)<1.1 && i.right<=r.right+1 && (!u || r.right<u.right),width:i.width,height:i.height,ratio:image.naturalWidth/image.naturalHeight,displayRatio:i.width/i.height};
      })};
    })()`);
    assert(!layout.overflow && layout.images.every(image => image.fits && Math.abs(image.ratio - image.displayRatio) < 0.02), `Image or background overflowed ${width}px ${theme}: ${JSON.stringify(layout)}`);
    assert(layout.images.slice(0, 2).every(image => image.height <= 160), "User attachments exceeded thumbnail height");
    await win.webContents.executeJavaScript("(() => {const scroll=document.querySelector('.chat-scroll');scroll.scrollTop=0;scroll.dispatchEvent(new Event('scroll',{bubbles:true}));})()");
    await fs.writeFile(path.resolve(appRoot, `../output/chat-files-ui/images-${width}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.querySelector('.chat-files-more').focus();document.querySelector('.chat-files-more').click()");
    await waitFor(win, "!!document.querySelector('.chat-files-dialog') && document.activeElement===document.querySelector('.chat-files-search')");
    assert(await win.webContents.executeJavaScript("document.querySelectorAll('.chat-files-dialog .chat-artifact').length===150 && document.querySelectorAll('.chat-files-dialog .chat-file-path').length===150"), "Full popup omitted files or their paths");
    const popup = await win.webContents.executeJavaScript("(() => {const d=document.querySelector('.chat-files-dialog'),r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && d.scrollWidth<=d.clientWidth+1 && document.querySelector('.chat-files-body').scrollHeight>document.querySelector('.chat-files-body').clientHeight})()");
    assert(popup, `File popup did not fit or scroll at ${width}px`);
    await fs.writeFile(path.resolve(appRoot, `../output/chat-files-ui/popup-${width}-${theme}.png`), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("(() => {const el=document.querySelector('.chat-files-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'reference-147');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await waitFor(win, "document.querySelectorAll('.chat-files-dialog .chat-artifact').length===1");
    await patch({ chat: { ...demo, artifacts: files.map(file => ({ ...file, size: 3072 })) } });
    await waitFor(win, "document.querySelector('.chat-files-dialog .chat-artifact-caption')?.textContent.includes('3 KB')");
    assert(await win.webContents.executeJavaScript("document.querySelector('.chat-files-search').value==='reference-147' && document.activeElement===document.querySelector('.chat-files-search')"), "Refreshing files erased the popup search or moved focus");
    await win.webContents.executeJavaScript("document.querySelector('.chat-files-close').focus()");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab", modifiers: ["shift"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab", modifiers: ["shift"] });
    await waitFor(win, "document.activeElement===document.querySelector('.chat-files-dialog .chat-artifact')");
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
    await waitFor(win, "document.activeElement===document.querySelector('.chat-files-close')");
    await win.webContents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    await waitFor(win, "!document.querySelector('.chat-files-dialog') && document.activeElement===document.querySelector('.chat-files-more')");
  }
  await patch({ chat: { ...demo, artifacts: files.map(file => ({ ...file })) } });
  await new Promise(resolve => setTimeout(resolve, 250));
  assert(await win.webContents.executeJavaScript("window.savedChatImage.isConnected && window.savedChatImage===document.querySelector('.chat-md .chat-image-preview img') && window.savedReadCount===window.questionFixture.resolvedPaths.length"), "File polling remounted or reread the image");
  const older = { ...demo, blocks: [{ sequence: 101, role: "user", kind: "text", text: "이전 요청" }, { sequence: 102, role: "assistant", kind: "text", text: "이전 답변" }], artifacts: [{ ...files[0], path: "G:/project/old.html", sourceSequence: 102 }], hasOlder: false };
  await patch({ olderChat: older, chat: { ...demo, hasOlder: true } });
  await waitFor(win, "!!document.querySelector('.chat-more') || document.querySelectorAll('.chat-turn.assistant').length===3");
  await win.webContents.executeJavaScript("document.querySelector('.chat-more')?.click()");
  await waitFor(win, "document.querySelectorAll('.chat-turn.assistant').length===3");
  assert(await win.webContents.executeJavaScript("document.querySelectorAll('.chat-turn.assistant')[0].querySelector('.chat-artifact-name')?.textContent==='old.html' && document.querySelectorAll('.chat-turn.assistant')[1].querySelector('.chat-files-more')?.textContent.includes('150') && window.savedChatImage.isConnected"), "Older page replaced current files or moved them to another answer");
  await win.webContents.executeJavaScript("document.querySelector('.chat-files-more').click()");
  await waitFor(win, "!!document.querySelector('.chat-files-dialog')");
  await win.webContents.executeJavaScript("document.querySelector('.chat-files-dialog .chat-artifact').click()");
  await waitFor(win, "!document.querySelector('.chat-files-dialog') && window.questionFixture.openedPaths.length===1");
  assert(await win.webContents.executeJavaScript("window.questionFixture.openedPaths[0]==='G:/project/output/result.html' && window.questionFixture.writes.length===0"), "Popup bypassed workspace preview or sent terminal input");
  await patch({ chat: { ...demo, artifacts: files.slice(0, 3) } });
  await waitFor(win, "!document.querySelector('.chat-files-more')");
  await patch({ chat: { ...demo, artifacts: files.slice(0, 4) } });
  await waitFor(win, "document.querySelector('.chat-files-more')?.textContent.includes('4')");
  await patch({ chat: { ...demo, blocks: [], artifacts: [] }, state: { sessionId: "another-session" } });
  await waitFor(win, "!document.querySelector('.chat-artifacts') && !document.querySelector('.chat-files-dialog')");
  console.log("CHAT_FILES_UI_OK: image/frame bounds, aspect ratios, response ownership, 3/4 threshold, 150-file popup, search, preview, Esc/focus, pagination, image stability, session isolation");
}

if (process.versions.electron) {
  const { app, BrowserWindow } = require("electron");
  const directory = process.env.ACEDIA_CHAT_FILES_SMOKE_DIR;
  app.setPath("userData", path.join(directory, "profile"));
  app.disableHardwareAcceleration();
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    try {
      await fs.mkdir(path.resolve(appRoot, "../output/chat-files-ui"), { recursive: true });
      await exercise(win, directory);
      await fs.writeFile(path.join(directory, "passed.json"), JSON.stringify({ passed: true }));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-chat-files-smoke-"));
  try {
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(appRoot, "scripts/fixtures/chat-question-renderer.tsx")], bundle: true, define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;height:100%;width:100%}#root{display:flex;background:var(--app-bg);color:var(--app-text)}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>');
    await fs.copyFile(path.join(appRoot, "public/app-icon.png"), path.join(directory, "app-icon.png"));
    const env = { ...process.env, ACEDIA_CHAT_FILES_SMOKE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
    const timer = setTimeout(() => child.kill(), 90000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
    if (code !== 0) throw Error(`Chat files smoke failed: ${code}`);
    assert(JSON.parse(await fs.readFile(path.join(directory, "passed.json"), "utf8")).passed);
  } finally {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-chat-files-smoke-")) throw Error("Unexpected fixture path");
    await fs.rm(directory, { recursive: true, maxRetries: 5, retryDelay: 200 });
  }
}
