import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RemoteDashboardService } from "../electron/services/web-services.mjs";
import { UsageService } from "../electron/services/usage-service.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiagent-remote-ui-"));
app.setPath("userData", path.join(root, "profile"));
const windows = [];
let service;
let usage;
let exitCode = 0;
const quotaProfileId = "22222222-2222-4222-8222-222222222222";
const quotaFixture = () => ["default", quotaProfileId].map((id,index) => ({limitId:id==="default"?"codex":`codex:${id}`,limitName:index?"Codex · 보관 프로필":"Codex",primary:{usedPercent:25,windowMinutes:300,resetsAt:1789228000},secondary:{usedPercent:40,windowMinutes:10080,resetsAt:1789328000},credits:{},updatedAt:Date.now(),profile:{key:`codex:${id}`,provider:"codex",id,label:index?"보관 프로필":"Codex",current:!index,registered:true,visible:!index,hidden:false}}));
let quota = quotaFixture();
let profiles = [];
const registeredProfiles = () => ["codex", "claude"].flatMap(provider => ["default", quotaProfileId, "33333333-3333-4333-8333-333333333333"].map((id, index) => ({
  key: `${provider}:${id}`, provider, id, label: [provider === "codex" ? "Codex" : "Claude", "개인", "업무"][index],
  current: index === 0, registered: true, visible: true, hidden: false,
})));
app.on("window-all-closed", () => {});
const assert = (value, message) => { if (!value) throw new Error(message); };
const timer = setTimeout(() => { console.error("Remote PWA smoke timed out"); app.exit(1); }, 60000);

async function waitFor(win, expression) {
  for (let i = 0; i < 50; i++) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Remote UI condition failed: ${expression}`);
}

void app.whenReady().then(async () => {
  try {
    const project = path.join(root, "project"); fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, "guide.md"), "# Remote document fixture");
    usage = new UsageService(path.join(root, "usage.db"), { scan: async () => [] });
    const now = new Date();
    const event = usage.db().prepare("INSERT INTO usage_events (source_key, ts, tool, input_tokens, output_tokens, total_tokens, raw_kind, model) VALUES (?, ?, 'codex', ?, ?, ?, 'codex_token_count_v2', 'gpt-6-astra')");
    for (let day = 1; day <= now.getDate(); day++) {
      const total = 73_000_000 + day * 12_000_000;
      event.run(`day-${day}`, Math.floor(new Date(now.getFullYear(), now.getMonth(), day, 0).getTime() / 1000), total - 12345, 12345, total);
    }
    service = new RemoteDashboardService({
      baseDir: path.join(root, "service"),
      usageProvider: (_refresh, selection) => ({updatedAt:Date.now(),limits:quota,profiles,tokens:usage.tokenTotals(),history:usage.usageHistory(selection)}),
      usageProfileVisibility: (key,hidden) => {
        quota = quota.map(limit => limit.profile.key===key?{...limit,profile:{...limit.profile,hidden,visible:!hidden}}:limit);
        profiles = profiles.map(profile => profile.key===key?{...profile,hidden,visible:!hidden}:profile);
        return {updatedAt:Date.now(),limits:quota,profiles};
      },
      chatProvider: async () => ({ sessionId: "fixture", blocks: [
        { sequence: 1, role: "user", kind: "text", text: "Read guide.md · 사용량 · 문서" },
        { sequence: 2, role: "assistant", kind: "text", text: "**Module rendering works**\n\n" + "Scroll fixture paragraph.\n\n".repeat(60) },
      ] }),
    });
    service.config.server_port = 0;
    service.syncAgents([{ id: "agent-1", name: "Fixture session", projectId: "p1", aiToolId: "codex", status: "running" }]);
    service.syncView({ language: "ko", projects: [{ id: "p1", name: "Fixture project", folder: project }], agents: [{ id: "agent-1", projectId: "p1", aiToolId: "codex" }] });
    const status = await service.start();
    for (const width of [1920, 1280, 390]) {
      service.syncView({ ...service.view, language: "ko" });
      quota = quotaFixture();
      profiles = [];
      const win = new BrowserWindow({ width, height: 850, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: true } });
      windows.push(win);
      const errors = [];
      win.webContents.on("console-message", event => { if (event.level === "error") { errors.push(event.message); console.error(event.message); } });
      await win.loadURL(`${status.url}/?agent=agent-1`);
      await waitFor(win, "document.querySelector('#detailName')?.textContent.includes('Fixture session')");
      await win.webContents.executeJavaScript("document.querySelector('#sessionMode [data-mode=chat]').click()");
      await waitFor(win, "document.querySelector('#chatView')?.textContent.includes('Module rendering works')");
      assert(await win.webContents.executeJavaScript("!!document.querySelector('#chatView .chat-file-link[data-chat-file-path=\"guide.md\"]')"), "Chat file links did not render");
      await win.webContents.executeJavaScript("document.querySelector('#chatView .chat-file-link').click()");
      await waitFor(win, "document.querySelector('#filePreviewMarkdown')?.textContent.includes('Remote document fixture')");
      const moduleState = await win.webContents.executeJavaScript(`(async () => {
        const history = await import('/pwa/chat-history.js');
        const merged = history.mergeChatPages([{sequence:2,text:'b'}], [{sequence:1,text:'a'}], {prepend:true});
        return { order: merged.map(block => block.text).join(''), worker: !!(await navigator.serviceWorker.ready).active };
      })()`);
      assert(moduleState.order === "ab" && moduleState.worker, "History module or service worker failed");
      const composerCheck = await win.webContents.executeJavaScript(`(async () => {
        const originalFetch = window.fetch;
        let finish;
        let sends = 0;
        window.fetch = (url, options) => {
          if (url === '/api/session/submit') {
            sends++;
            return new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({ok:true}), {status:200})); });
          }
          return originalFetch(url, options);
        };
        const input = document.querySelector('#messageInput');
        const form = input.closest('form');
        const type = value => { input.value = value; input.dispatchEvent(new Event('input', {bubbles:true})); };
        const submit = () => form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
        try {
          const chat = document.querySelector('#chatView');
          const atBottom = () => chat.scrollHeight - chat.scrollTop - chat.clientHeight < 3;
          chat.scrollTop = chat.scrollHeight;
          type(Array(10).fill('multiline composer fixture').join('\\n'));
          if (!atBottom()) throw new Error('Composer growth lost chat bottom');
          type('first message');
          if (!atBottom()) throw new Error('Composer shrink lost chat bottom');
          chat.scrollTop = 200;
          const readingTop = chat.scrollTop;
          type(Array(10).fill('history reading fixture').join('\\n'));
          if (Math.abs(chat.scrollTop - readingTop) > 2) throw new Error('Composer growth moved history reader');
          chat.scrollTop = chat.scrollHeight;
          type('first message'); submit(); submit();
          const locked = document.querySelector('#sendButton').disabled;
          type('next draft');
          if (!finish) throw new Error('Composer did not start a submission');
          finish();
          await new Promise(resolve => setTimeout(resolve, 50));
          if (!atBottom()) throw new Error('Submission lost chat bottom');
          return { sends, locked, draft: input.value, queue: document.querySelector('#composerQueue').textContent };
        } finally { window.fetch = originalFetch; }
      })()`);
      assert(composerCheck.sends === 1 && composerCheck.locked, "Concurrent submission was not blocked");
      assert(composerCheck.draft === "next draft", "Pending response erased the newer draft");
      assert(!composerCheck.queue.includes("first message"), "Duplicate submission entered the queue");
      // Change the source setting through the service; do not directly set the
      // browser language. The ordinary state poll must update this open page.
      service.syncView({ ...service.view, language: "en" });
      await waitFor(win, "document.documentElement.lang==='en' && document.querySelector('#documentsButton strong').textContent==='Documents'");
      if (width < 800) assert(await win.webContents.executeJavaScript("document.querySelector('#searchInput').placeholder==='Search projects and sessions'"), "Language change lost mobile search wording");
      assert(await win.webContents.executeJavaScript("document.querySelector('#messageInput').value==='next draft' && document.querySelector('#chatView').textContent.includes('사용량 · 문서')"), "Language change altered the draft or user content");
      assert(await win.webContents.executeJavaScript("const chat=document.querySelector('#chatView');chat.scrollHeight-chat.scrollTop-chat.clientHeight<3"), "Chat rerender lost bottom position");
      await win.webContents.executeJavaScript("document.querySelector('#chatView').scrollTop=200");
      service.syncView({ ...service.view, language: "ko" });
      await waitFor(win, "document.documentElement.lang==='ko'");
      assert(await win.webContents.executeJavaScript("Math.abs(document.querySelector('#chatView').scrollTop-200)<3"), "Chat rerender moved history reader");
      await win.webContents.executeJavaScript("document.querySelector('#filePreviewClose').click();document.querySelector('#usageButton').click()");
      await waitFor(win, "document.querySelector('#filePreviewOverlay').hidden && document.querySelector('#usageProviderGrid').getClientRects().length>0");
      await waitFor(win, "document.querySelector('#usageProviderGrid > .usage-provider-card') && document.querySelector('.usage-profile-review')");
      assert(await win.webContents.executeJavaScript("document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===1 && !document.querySelector('.usage-profile-review').open"), "Unused quota profile was not collapsed");
      await win.webContents.executeJavaScript("document.querySelector('.usage-profile-review').open=true;document.querySelector('.usage-profile-review .usage-profile-toggle').click()");
      await waitFor(win, "document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===2");
      await win.webContents.executeJavaScript(`document.querySelector('[data-provider="codex:${quotaProfileId}"] .usage-profile-toggle').click()`);
      await waitFor(win, "document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===1 && document.querySelector('.usage-profile-review')");
      assert(quota.find(limit=>limit.profile.id===quotaProfileId).profile.hidden, "PWA hide did not reach shared backend");
      await win.webContents.executeJavaScript("document.querySelector('#refreshUsageButton').click()");
      await waitFor(win, "!document.querySelector('#refreshUsageButton').disabled");
      assert(await win.webContents.executeJavaScript("document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===1 && document.documentElement.scrollWidth<=innerWidth"), "Quota refresh lost visibility or overflowed");
      profiles = registeredProfiles();
      quota = profiles.filter(profile => profile.label !== "업무").map(profile => ({
        ...quotaFixture()[0], limitId: profile.id === "default" ? profile.provider : profile.key,
        limitName: (profile.provider === "codex" ? "Codex" : "Claude") + (profile.id === "default" ? "" : ` · ${profile.label}`), profile,
      }));
      await win.webContents.executeJavaScript("document.querySelector('#refreshUsageButton').click()");
      await waitFor(win, "document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===6");
      assert(await win.webContents.executeJavaScript("[...document.querySelectorAll('#usageProviderGrid > .usage-provider-card')].filter(card=>card.textContent.includes('한도 확인 전')).length===2 && document.documentElement.scrollWidth<=innerWidth"), "Registered accounts without snapshots were missing or overflowed");
      const pendingKey = "codex:33333333-3333-4333-8333-333333333333";
      await win.webContents.executeJavaScript(`document.querySelector('[data-provider="${pendingKey}"] .usage-profile-toggle').click()`);
      await waitFor(win, "document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===5");
      assert(profiles.find(profile => profile.key === pendingKey).hidden, "Pending account visibility was not saved");
      await win.webContents.executeJavaScript("document.querySelector('.usage-profile-review').open=true;document.querySelector('.usage-profile-review .usage-profile-toggle').click()");
      await waitFor(win, "document.querySelectorAll('#usageProviderGrid > .usage-provider-card').length===6");
      await win.webContents.executeJavaScript("document.querySelector('#usageProviderGrid').scrollIntoView({block:'start'})");
      assert(await win.webContents.executeJavaScript("document.querySelector('#usageProviderGrid').scrollWidth<=document.querySelector('#usageProviderGrid').clientWidth"), "Account cards overflowed");
      service.syncView({ ...service.view, language: "en" });
      await waitFor(win, "document.documentElement.lang==='en' && document.querySelector('#usageHistoryTitle').textContent==='Monthly token usage'");
      await win.webContents.executeJavaScript("document.querySelector('[data-measure=usd]').click()");
      await waitFor(win,"document.querySelector('#usageHistoryTitle').textContent==='API baseline value (USD)'");
      assert(await win.webContents.executeJavaScript("/^\\$[\\d,]+\\.\\d{2}$/.test(document.querySelector('#usageSelectedTotal').textContent) && document.querySelector('#usageChart rect') !== null && document.querySelector('#usageSelectedTotal').textContent !== '$0.00' && !document.querySelector('#usageCostNote').hidden && document.querySelector('#usageCostNote').textContent.includes('excluded')"), "USD format/coverage missing");
      await win.webContents.executeJavaScript("document.querySelector('[data-measure=tokens]').click()");
      const metrics = await win.webContents.executeJavaScript(`(() => {
        document.querySelector('#usageView').scrollTop=0;
        const view=document.querySelector('#usageView');
        const font=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
        return { heading:font('#usageHistoryTitle'), labels:font('.usage-period-grid span'), axis:font('.usage-chart-axis-label'),
          refresh:document.querySelector('#refreshUsageButton').getBoundingClientRect().height,
          fits:view.scrollWidth<=view.clientWidth, title:document.querySelector('#usageChartTitle').textContent,
          korean:[...view.querySelectorAll('h2,h3,.usage-history-controls,.usage-chart,.usage-period-grid,.usage-breakdown-head,.usage-token-grid')].some(node=>/[가-힣]/.test(node.textContent)),
          total:document.querySelector('#usageSelectedTotal').textContent };
      })()`);
      assert(metrics.heading>=16 && metrics.labels>=12 && metrics.axis>=12 && metrics.refresh>=40, `Unreadable controls at ${width}: ${JSON.stringify(metrics)}`);
      assert(metrics.fits && !metrics.korean, `Usage layout/English failed at ${width}: ${JSON.stringify(metrics)}`);
      console.log(`REMOTE_READABILITY ${width} ${JSON.stringify(metrics)}`);
      if (width === 1920) {
        for (const [language, heading] of [
          ["zh-CN", "每月令牌用量"], ["zh-TW", "每月 Token 用量"],
          ["ja", "月間トークン使用量"], ["es", "Uso mensual de tokens"],
        ]) {
          service.syncView({ ...service.view, language });
          await waitFor(win, `document.documentElement.lang===${JSON.stringify(language)} && document.querySelector('#usageHistoryTitle').textContent===${JSON.stringify(heading)}`);
          assert(await win.webContents.executeJavaScript("document.querySelector('#usageView').scrollWidth<=document.querySelector('#usageView').clientWidth"), `Localized layout overflowed: ${language}`);
        }
        service.syncView({ ...service.view, language: "en" });
        await waitFor(win, "document.documentElement.lang==='en'");
      }
      if(process.env.ACEDIA_PROPERTIES_SCREENSHOTS) { await new Promise(resolve=>setTimeout(resolve,250)); fs.mkdirSync(process.env.ACEDIA_PROPERTIES_SCREENSHOTS,{recursive:true}); fs.writeFileSync(path.join(process.env.ACEDIA_PROPERTIES_SCREENSHOTS,`remote-usage-${width}.png`),(await win.webContents.capturePage()).toPNG()); }
      assert(errors.length === 0, `Renderer errors: ${errors.join("; ")}`);
      if (width === 1920) {
        await win.loadURL(`${status.url}/login`);
        await waitFor(win, "document.querySelector('#loginTitle').textContent==='Set a GitHub Client ID on your PC'");
        assert(await win.webContents.executeJavaScript("document.documentElement.lang==='en' && !/[가-힣]/.test(document.body.textContent)"), "Sign-in did not follow the desktop language");
      }
      win.destroy();
    }
    console.log("MULTIAGENT_REMOTE_PWA_SMOKE_OK desktop/mobile chat, document preview, modules, service worker, account visibility, readable usage history, six display locales, preserved drafts and localized sign-in");
  } catch (error) {
    console.error(error.stack || error); exitCode = 1;
  } finally {
    clearTimeout(timer);
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    await service?.stop();
    usage?.close();
    // Only this smoke's freshly created directory is removed.
    if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith("multiagent-remote-ui-")) {
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chromium may retain its temporary profile until process exit. */ }
    }
    app.exit(exitCode);
  }
});
