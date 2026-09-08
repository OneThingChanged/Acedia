import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multiagent-account-ui-"));
try {
  await build({ stdin: { resolveDir: appRoot, sourcefile: "account-smoke.tsx", loader: "tsx", contents: `
    import './src/App.css';
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { CodexAccountsPanel } from './src/components/CodexAccounts';
    import { AgentsSettings } from './src/components/AgentsSettings';
    import { SettingsModal } from './src/components/SettingsModal';
    import { AppLanguageProvider } from './src/lib/appLanguage';
    import { NewAgentModal } from './src/components/NewAgentModal';
    import { SessionPropertiesModal } from './src/components/SessionPropertiesModal';
    window.multiAgentElectron = { invoke: (command, args) => window.require('electron').ipcRenderer.invoke(command, args),
      onEvent: () => () => {}, window: {} };
    const root = createRoot(document.getElementById('root'));
    const project = { id: 'p', name: 'Project', folder: 'project', createdAt: 0 };
    window.showSettings = () => root.render(<AgentsSettings disabledTools={[]} onToggleTool={() => {}} showUsageBar={true} onShowUsageBarChange={() => {}} />);
    window.showAccounts = () => root.render(<CodexAccountsPanel />);
    window.showAppSettings = () => root.render(<AppLanguageProvider><SettingsModal
      theme="github" onThemeChange={() => {}} desktopPetEnabled={false} desktopPetAvailable={true}
      onDesktopPetEnabledChange={() => {}} onResetDesktopPetPosition={() => {}}
      commandShortcuts={{}} onCommandShortcutsChange={() => {}} disabledTools={[]} onToggleTool={() => {}}
      showUsageBar={true} onShowUsageBarChange={() => {}} buildVariant="standard" updateProvider="local-developer" onClose={() => {}}
    /></AppLanguageProvider>);
    window.showNew = () => root.render(<NewAgentModal project={project} defaultName="Session" onCancel={() => {}}
      onCreate={value => window.created = value} disabledTools={['claude']} />);
    window.showProperties = (running) => root.render(<SessionPropertiesModal
      agent={{ id:'a', projectId:'p', name:'Session', folder:'project', aiToolId:'codex', aiLabel:'Codex', dangerous:false,
        status: running ? 'running' : 'idle', createdAt:0 }} project={project} onUpdateAgent={() => {}}
      onClose={() => {}} onAccountChange={async id => { window.switched = id; }} />);
    window.showAccounts();
  ` }, bundle: true, define: { "import.meta.env": "{}", __MULTIAGENT_APP_VERSION__: JSON.stringify("0.0.0.0") }, outfile: path.join(temporary, "renderer.js"), jsx: "automatic" });
  await fs.writeFile(path.join(temporary, "index.html"), '<link rel="stylesheet" href="renderer.css"><style>#root{display:block;height:100vh;padding:20px;overflow:auto;box-sizing:border-box}.agent-settings-tabs{margin:auto;padding:20px;background:var(--app-panel)}.agent-settings-tablist{top:-20px}</style><div id="root" class="app"></div><script src="renderer.js"></script>');
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const {app, BrowserWindow, ipcMain} = require('electron');
    const fs = require('node:fs');
    const path = require('node:path');
    app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
    app.whenReady().then(async () => {
      const {CodexAccounts} = await import(${JSON.stringify(new URL("../electron/services/codex-accounts.mjs", import.meta.url).href)});
      const accounts = new CodexAccounts(${JSON.stringify(temporary)}, { baseEnv: {}, startLogin: env => ({
        onData() {}, kill() {}, onExit(fn) {
          fs.writeFileSync(path.join(env.CODEX_HOME, 'auth.json'), '{"fixture":true}');
          setTimeout(() => fn({exitCode:0}), 50);
        }
      }) });
      ipcMain.handle('codex_accounts_list', () => accounts.list());
      ipcMain.handle('codex_accounts_create', (_event,args) => accounts.create(args.label));
      ipcMain.handle('codex_accounts_login', (_event,args) => accounts.beginLogin(args.accountId));
      ipcMain.handle('codex_accounts_cancel_login', () => accounts.cancelLogin());
      ipcMain.handle('check_tools', () => ({codex:{available:true},claude:{available:true},qwen:{available:true},cline:{available:true}}));
      ipcMain.handle('qwen_region_get', () => ({available:true, region:'international', regions:[{id:'international',label:'International'}]}));
      ipcMain.handle('session_storage_list', () => ({sessions:[]}));
      ipcMain.handle('conversation_storage_get', () => ({path:'fixture', custom:false, conversations:0, blocks:0, artifacts:0, bytes:0}));
      ipcMain.handle('get_developer_update_settings', () => ({directory:null, source:'none'}));
      ipcMain.handle('remote_config_get', () => ({}));
      ipcMain.handle('monitor_config_get', () => ({}));
      for (const command of ['monitor_server_status', 'remote_server_status', 'tunnel_status']) ipcMain.handle(command, () => ({running:false}));
      ipcMain.handle('remote_access_list', () => ({pending:[],approved:[]}));
      const win = new BrowserWindow({show:false, width:1100, height:900,
        webPreferences:{nodeIntegration:true, contextIsolation:false, backgroundThrottling:false, offscreen: true}});
      win.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); });
      try {
        await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
        console.log(await win.webContents.executeJavaScript(\`(async () => {
          const wait = ms => new Promise(resolve => setTimeout(resolve, ms || 250));
          const check = (value, message) => { if (!value) throw new Error(message); };
          const click = text => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text); check(b && !b.disabled, 'Missing/enabled button: '+text); b.click(); };
          await wait();
          click('＋ 계정 추가'); await wait();
          const input = document.querySelector('input');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, 'Work');
          input.dispatchEvent(new Event('input', {bubbles:true})); await wait();
          click('계정 추가'); await wait();
          check(document.body.textContent.includes('Work'), 'Account was not listed');
          click('브라우저 로그인'); await wait(2300);
          check(document.body.textContent.includes('로그인 저장됨'), 'Login completion was not shown');
          const account = (await window.multiAgentElectron.invoke('codex_accounts_list'))[1];
          window.showSettings(); await wait();
          const tabs = [...document.querySelectorAll('[role=tab]')];
          check(tabs.length === 5, 'Expected five tool tabs');
          tabs[2].click(); await wait();
          check(document.body.textContent.includes('여러 계정 등록'), 'Claude support note missing');
          check(!document.querySelector('.codex-account-management'), 'Codex accounts leaked into Claude tab');
          tabs[3].click(); await wait();
          check(document.body.textContent.includes('Qwen 리전'), 'Qwen region missing');
          tabs[1].click(); await wait();
          const defaults = document.querySelector('.agent-defaults');
          const accountDefault = defaults.querySelector('select'); accountDefault.value = account.id;
          accountDefault.dispatchEvent(new Event('change', {bubbles:true})); await wait();
          defaults.querySelector('summary').click(); await wait();
          const switches = [...defaults.querySelectorAll('input[role=switch]')];
          switches[0].click(); await wait(); switches[1].click(); await wait();
          for (const select of defaults.querySelectorAll('.session-worker-fields select')) {
            select.value = ''; select.dispatchEvent(new Event('change', {bubbles:true})); await wait();
          }
          window.showAccounts(); await wait(); window.showSettings(); await wait();
          check(document.querySelector('.agent-defaults select').value === account.id, 'Default account did not persist');
          window.showNew(); await wait();
          check(document.querySelector('.field-check input').checked, 'Dangerous default missing from new session');

          const select = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === account.id));
          check(select && !select.disabled, 'Missing account selector');
          select.value = account.id; select.dispatchEvent(new Event('change', {bubbles:true})); await wait();
          click('만들기'); await wait();
          check(window.created.codexAccountId === account.id, 'New session lost account binding');
          check(window.created.useAltScreen === true && window.created.dangerous === true, 'Launch defaults not applied');
          check(window.created.workerSettings === undefined, 'Disabled worker defaults lost');
          window.showProperties(true); await wait();
          click('실행 옵션'); await wait();
          check(document.querySelector('select').disabled, 'Running session allowed account switching');
          window.showProperties(false); await wait();
          const idle = document.querySelector('select'); check(!idle.disabled, 'Inactive session cannot switch');
          idle.value = account.id; idle.dispatchEvent(new Event('change', {bubbles:true})); await wait();
          check(window.switched === account.id, 'Inactive account switch not delivered');
          localStorage.setItem('multiagent.appLanguage.v1', 'ko');
          window.showAppSettings(); await wait();
          click('언어'); await wait();
          check(document.querySelectorAll('[role=radio]').length === 7, 'Expected system and six languages');
          const locales = [
            ['简体中文', 'zh-CN', '设置', '智能体', '登录账号'],
            ['繁體中文（台灣）', 'zh-TW', '設定', '代理程式', '登入帳號'],
            ['日本語', 'ja', '設定', 'エージェント', 'ログインアカウント'],
            ['Español', 'es', 'Configuración', 'Agentes', 'Cuentas de inicio de sesión']
          ];
          for (const [label, locale, heading, agentsLabel, accountsLabel] of locales) {
            click(label); await wait();
            check(document.documentElement.lang === locale, 'Document language did not change: '+locale);
            check(localStorage.getItem('multiagent.appLanguage.v1') === locale, 'Language not saved: '+locale);
            check(document.querySelector('.app-settings-title')?.textContent.includes(heading) || document.body.textContent.includes(heading), 'Settings not translated: '+locale);
            click(agentsLabel); await wait();
            check(document.body.textContent.includes(accountsLabel), 'Accounts not translated: '+locale);
            check(document.body.textContent.includes('Work'), 'Custom account label was changed');
            const nav = [...document.querySelectorAll('.app-settings-nav button')];
            const language = nav.find(button => ['语言','語言','言語','Idioma'].includes(button.textContent.trim()));
            check(language, 'Missing language tab: '+locale); language.click(); await wait();
          }
          window.showAccounts(); await wait(); window.showAppSettings(); await wait();
          check(document.documentElement.lang === 'es' && document.body.textContent.includes('Configuración'), 'Language did not persist across remount');
          click('Idioma'); await wait(); click('한국어'); await wait();
          check(document.documentElement.lang === 'ko', 'Could not return to Korean');
          return 'CODEX_ACCOUNT_UI_SMOKE_OK';
        })()\`));
        if (${JSON.stringify(process.env.MULTIAGENT_SETTINGS_SCREENSHOT || "")}) {
          await win.webContents.executeJavaScript('window.showSettings()');
          await win.webContents.executeJavaScript("new Promise(resolve => { const timer = setInterval(() => { if (document.querySelector('.agent-settings-tabs')) { clearInterval(timer); resolve(true); } }, 50); })");
          win.webContents.invalidate();
          await new Promise(resolve => setTimeout(resolve, 600));
          fs.writeFileSync(${JSON.stringify(process.env.MULTIAGENT_SETTINGS_SCREENSHOT || "")}, (await win.webContents.capturePage()).toPNG());
        }
        if (${JSON.stringify(process.env.MULTIAGENT_LANGUAGE_SCREENSHOT || "")}) {
          await win.webContents.executeJavaScript("localStorage.setItem('multiagent.appLanguage.v1','es'); window.showAccounts()");
          await new Promise(resolve => setTimeout(resolve, 100));
          await win.webContents.executeJavaScript('window.showAppSettings()');
          await new Promise(resolve => setTimeout(resolve, 300));
          await win.webContents.executeJavaScript("[...document.querySelectorAll('.app-settings-nav button')].find(b => b.textContent.trim() === 'Idioma').click()");
          win.webContents.invalidate();
          await new Promise(resolve => setTimeout(resolve, 300));
          fs.writeFileSync(${JSON.stringify(process.env.MULTIAGENT_LANGUAGE_SCREENSHOT || "")}, (await win.webContents.capturePage()).toPNG());
        }
        accounts.cancelLogin(); app.exit(0);
      } catch(error) { console.error(error); accounts.cancelLogin(); app.exit(1); }
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], { env, stdio: "inherit", windowsHide: true });
  const timer = setTimeout(() => child.kill(), 30_000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
  if (code !== 0) throw new Error(`Codex account UI smoke failed: ${code}`);
} finally {
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("multiagent-account-ui-")) throw new Error("Unexpected cleanup path");
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
