import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RemoteDashboardService } from '../electron/services/web-services.mjs';
import { SessionModelService } from '../electron/services/session-model-service.mjs';

process.on('uncaughtException', error => { console.error(error); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); app.exit(1); });
const temporary = mkdtempSync(path.join(os.tmpdir(), 'acedia-mobile-chat-layout-'));
const output = path.resolve(import.meta.dirname, '../../output/mobile-chat-device-review');
app.setPath('userData', path.join(temporary, 'profile'));
app.disableHardwareAcceleration(); app.on('window-all-closed', () => {});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = (win, source) => win.webContents.executeJavaScript(source);
const wait = async (win, source) => {
  for (let n = 0; n < 120; n++) { if (await evaluate(win, source)) return; await pause(50); }
  throw Error('Mobile chat layout timed out: ' + source);
};
const devices = [
  { id: 'fold-cover', label: '폴드 · 접힌 화면', width: 344, height: 882 },
  { id: 'fold-open', label: '폴드 · 펼친 화면', width: 768, height: 920 },
  { id: 'pad-portrait', label: '패드 · 세로', width: 820, height: 1180 },
  { id: 'pad-landscape', label: '패드 · 가로', width: 1180, height: 820 },
  { id: 'pad-wide', label: '대형 패드', width: 1366, height: 1024 },
];
const agents = ['RnDHub', 'ShaderLevelUp', 'ShaderNoiseBall', 'ShaderSkinner', 'MeshMotion'].map((name, i) => ({
  id: 'agent-' + i, name, projectId: 'project', aiToolId: 'codex', status: i === 2 ? 'working' : 'idle',
  runtimeStatus: 'running', lastSessionId: 'fixture-thread-' + i,
}));
const state = () => ({ language: 'ko', agents, view: { language: 'ko', agents,
  projects: [{ id: 'project', name: 'RnDHub', folder: temporary }], aiTools: [{ id: 'codex', label: 'Codex', supportsDangerous: true }],
} });
const response = '## 진행 상황\n\n모바일 화면은 채팅에 집중할 수 있도록 정리했어요. 화면 크기가 바뀌어도 같은 대화를 이어서 볼 수 있습니다.\n\n'
  + '- **휴대폰·접힌 폴드:** 세션 목록은 왼쪽 위 메뉴에서 열어요.\n- **펼친 폴드:** 넓어진 공간을 대화와 이미지에 사용해요.\n- **패드:** 세션 목록과 대화를 나란히 볼 수 있어요.\n\n'
  + '## 다음 확인\n\n1. 다른 세션을 열어 대화가 유지되는지 확인해요.\n2. 아래 입력창에서 모델과 예약 전송 방식을 선택해요.\n3. 이름 변경과 개인 메모는 오른쪽 위 **⋯**에서 열어요.\n\n'
  + '입력 중에도 대화와 전송 버튼이 가려지지 않도록 화면 높이에 맞춰 배치합니다.';
const chat = { sessionId: 'fixture-thread-0', lifecycle: 'idle', blocks: [
  { sequence: 1, role: 'user', kind: 'text', text: '휴대폰, 폴드, 패드에서도 대화를 편하게 읽고 싶어. 지금 진행 상황과 다음 할 일을 정리해 줘.' },
  { sequence: 2, role: 'assistant', kind: 'text', text: response },
] };
let terminalReads = 0;
const sessionModels = new SessionModelService({ agentFor: id => agents.find(agent => agent.id === id), active: () => true, inputReady: () => true,
  catalog: async () => ({ current: { model: 'gpt-6.1-sol', effort: 'xhigh' }, currentSource: 'native', accountLabel: '검증용 계정',
    models: [{ model: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', defaultEffort: 'low', efforts: ['low', 'high', 'xhigh'].map(effort => ({ effort })) }] }),
  update: async () => ({ restarted: false }),
});
let service;
const providers = { baseDir: path.join(temporary, 'service'), stateProvider: state, sessionModels,
  chatProvider: async () => chat, usageProvider: async () => ({ limits: [], profiles: [] }),
  terminalSnapshot: () => { terminalReads++; return { data: 'DESKTOP_TERMINAL_FIXTURE' }; },
  terminalSize: () => ({ cols: 80, rows: 24 }), subscribeTerminal: () => () => {},
};
const windows = [], results = [];
const capture = async (win, name) => {
  await evaluate(win, 'document.fonts.ready');
  await evaluate(win, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
};
const timer = setTimeout(() => { console.error('Mobile device layout timed out'); app.exit(1); }, 120_000);
void app.whenReady().then(async () => {
console.log('MOBILE_CHAT_DEVICE_FIXTURE_READY');
let exitCode = 0;
try {
  service = new RemoteDashboardService(providers); service.config.server_port = 0;
  await fs.mkdir(output, { recursive: true }); service.syncAgents(agents); service.syncView(state().view);
  const { url } = await service.start();
  for (const device of devices) {
    const win = new BrowserWindow({ width: device.width, height: device.height, useContentSize: true, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } }); windows.push(win);
    // Emulation commands need a live renderer target before navigation.
    await win.loadURL('about:blank');
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await win.loadURL(url + '/?agent=agent-0');
    await wait(win, "document.querySelector('#chatView').textContent.includes('진행 상황')");
    await evaluate(win, "localStorage.setItem('multiagent.remote.sessionMode','term')");
    await win.loadURL(url + '/?agent=agent-0');
    await wait(win, "document.querySelector('#chatView').textContent.includes('진행 상황')");
    const layout = await evaluate(win, `(() => {
      const box=selector=>document.querySelector(selector).getBoundingClientRect();
      return { viewport:[innerWidth,innerHeight], coarse:matchMedia('(any-pointer: coarse)').matches,
        native:window.__MULTIAGENT_NATIVE_APP__===true, mode:document.querySelector('.app-shell').dataset.sessionMode,
        tabs:getComputedStyle(document.querySelector('#sessionMode')).display, header:box('.session-head').height,
        chat:box('#chatView').height, editor:box('#messageInput').width, composer:box('#composerForm').width,
        bottom:box('#composerForm').bottom, overflow:document.documentElement.scrollWidth>innerWidth+1,
        sidebar:box('#navigationPane').right>0, terminal:!!document.querySelector('.xterm'),
        stored:localStorage.getItem('multiagent.remote.sessionMode') };
    })()`);
    assert(layout.coarse || layout.native, 'Fixture did not emulate a touch/native device');
    assert.equal(layout.mode, 'chat'); assert.equal(layout.tabs, 'none'); assert.equal(layout.stored, 'term');
    assert.equal(layout.terminal, false); assert.equal(layout.overflow, false);
    assert(layout.header <= 70 && layout.chat >= 350 && layout.editor >= layout.composer - 22 && layout.bottom <= device.height + 1,
      device.id + ': clipped chat/editor ' + JSON.stringify(layout));
    assert.equal(layout.sidebar, device.width > 800, device.id + ': incorrect drawer/sidebar layout');
    await evaluate(win, "document.querySelector('#sessionMode [data-mode=browser]').click()");
    assert.equal(await evaluate(win, "document.querySelector('.app-shell').dataset.sessionMode"), 'chat');
    await evaluate(win, "document.querySelector('#sessionToolsToggle').click()");
    assert.equal(await evaluate(win, "document.querySelector('#sessionToolsToggle').getAttribute('aria-expanded')"), 'true');
    await evaluate(win, "document.querySelector('#chatView').click();document.querySelector('#chatView').scrollTop=0");
    await capture(win, device.id); results.push({ ...device, ...layout });
    console.log('MOBILE_CHAT_DEVICE_OK', device.id, JSON.stringify(layout));
    if (device.id === 'fold-cover') {
      await evaluate(win, "document.querySelector('#messageInput').value='접었다 펼쳐도 유지할 초안';document.querySelector('#messageInput').dispatchEvent(new Event('input',{bubbles:true}))");
      for (const [width, height] of [[768, 920], [1180, 820], [344, 882]]) {
        win.setContentSize(width, height); await pause(250);
        assert.equal(await evaluate(win, "document.querySelector('.app-shell').dataset.sessionMode==='chat' && document.querySelector('#sessionMode').hidden && document.querySelector('#messageInput').value==='접었다 펼쳐도 유지할 초안' && document.querySelector('#detailName').textContent==='RnDHub'"), true, 'Fold resize lost its chat, session or draft');
      }
      console.log('FOLD_RESIZE_CHAT_AND_DRAFT_PRESERVED');
    }
    win.destroy();
  }
  assert.equal(terminalReads, 0, 'Chat-only devices opened a terminal stream');
  const transition = new BrowserWindow({ width: 344, height: 882, useContentSize: true, show: false,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } }); windows.push(transition);
  await transition.loadURL(url + '/?agent=agent-0');
  await wait(transition, "document.querySelector('.app-shell').dataset.sessionMode==='chat'");
  transition.setContentSize(1280, 900);
  await wait(transition, "document.querySelector('.app-shell').dataset.sessionMode==='term'");
  assert.equal(await evaluate(transition, "document.querySelector('#sessionMode').hidden"), false);
  // Verify APK layout detection without simulating native authentication or
  // sending bridge messages to a real Android client.
  await evaluate(transition, "window.__MULTIAGENT_NATIVE_APP__=true;window.dispatchEvent(new Event('resize'))");
  await wait(transition, "document.querySelector('.app-shell').dataset.sessionMode==='chat' && document.querySelector('#sessionMode').hidden");
  assert.equal(await evaluate(transition, "localStorage.getItem('multiagent.remote.sessionMode')"), 'term');
  await evaluate(transition, "delete window.__MULTIAGENT_NATIVE_APP__;window.dispatchEvent(new Event('resize'))");
  await wait(transition, "document.querySelector('.app-shell').dataset.sessionMode==='term'");
  transition.setContentSize(344, 882);
  await wait(transition, "document.querySelector('.app-shell').dataset.sessionMode==='chat' && !document.querySelector('.xterm')");
  console.log('DESKTOP_MODE_RESTORE_AND_PHONE_CHAT_ONLY_OK'); transition.destroy();
  const cards = await Promise.all(devices.map(async device => ({ ...device,
    image: 'data:image/png;base64,' + (await fs.readFile(path.join(output, device.id + '.png'))).toString('base64') })));
  const makeGallery = (title, subset) => `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#e9eef5;color:#172c3d;font:16px/1.55 "Segoe UI",system-ui,sans-serif;padding:32px}h1{margin:0;font-size:28px}p{color:#52677b;margin:8px 0 26px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}article{min-width:0;background:white;border:1px solid #ced8e4;border-radius:18px;padding:18px}h2{font-size:20px;margin:0}small{display:block;color:#52677b;margin:4px 0 14px}a{display:block;text-align:center}img{display:block;max-width:100%;max-height:850px;width:auto;height:auto;margin:0 auto;border:1px solid #263744;border-radius:12px}footer{margin-top:24px;color:#52677b;font-size:13px}@media(max-width:760px){body{padding:16px}.grid{grid-template-columns:1fr}}@media(min-width:1200px){body{padding:32px 42px}}</style>
    <h1>${title}</h1><p>상단 모드 탭을 없앤 채팅 전용 화면입니다. 이미지를 누르면 원본 크기로 볼 수 있습니다.</p><main class="grid">${subset.map(device => `<article><h2>${device.label}</h2><small>${device.width} × ${device.height} CSS px · ${device.width > 800 ? '세션 목록 + 채팅' : '메뉴형 세션 목록 + 채팅'}</small><a href="${device.id}.png" target="_blank"><img src="${device.image}" alt="${device.label} 채팅 화면"></a></article>`).join('')}</main><footer>실제 제품 코드를 검증용 데이터로 렌더링한 캡처입니다. 특정 기기의 실물 화면을 촬영한 결과는 아닙니다.</footer></html>`;
  await fs.writeFile(path.join(output, 'index.html'), makeGallery('Acedia 모바일 화면 비교', cards));
  for (const [name, title, selected] of [
    ['fold-comparison', '폴드 화면 비교', cards.filter(card => card.id.startsWith('fold-'))],
    ['tablet-comparison', '패드 화면 비교', cards.filter(card => ['pad-portrait', 'pad-landscape'].includes(card.id))],
  ]) {
    const html = path.join(output, name + '.html'); await fs.writeFile(html, makeGallery(title, selected));
    const gallery = new BrowserWindow({ width: 1440, height: 1280, useContentSize: true, show: false, webPreferences: { backgroundThrottling: false } });
    windows.push(gallery); await gallery.loadFile(html); await capture(gallery, name); gallery.destroy();
  }
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ devices: results, terminalReadsOnTouchDevices: 0, desktopPreferenceRestored: true, physicalDeviceTest: false }, null, 2));
  console.log('MOBILE_CHAT_FOLD_TABLET_GALLERY_OK', output);
} catch (error) { console.error(error); exitCode = 1; }
finally {
  clearTimeout(timer); for (const win of windows) if (!win.isDestroyed()) win.destroy(); await service?.stop();
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir())); assert(path.basename(temporary).startsWith('acedia-mobile-chat-layout-'));
  await fs.rm(temporary, { recursive: true, maxRetries: 5, retryDelay: 100 }).catch(() => {}); app.exit(exitCode);
}
}).catch(error => { console.error(error); app.exit(1); });
