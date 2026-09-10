import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "multiagent-terminal-settings-"));
try {
  await build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React, { useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { PaneSlot } from './src/components/PaneSlot';
    import { TerminalSettingsPanel } from './src/components/TerminalSettingsPanel';
    import { useTerminalSettingsSync } from './src/hooks/useTerminalSettingsSync';
    import { applyAgentRuntimeStatus } from './src/lib/agentActivity';
    import { createEntry } from './src/lib/terminal';
    import { loadTerminalSettings } from './src/lib/terminalSettings';
    import './src/App.css';
    import '@xterm/xterm/css/xterm.css';
    window.calls = [];
    window.multiAgentElectron = {
      invoke: async (command, args) => {
        window.calls.push({ command, args });
        if (command === 'spawn_pty') return { reattached: false };
        if (command === 'attach_terminal') return { data: '', sequenceStart: 0, sequenceEnd: 0 };
        if (command === 'clipboard_read_text') return 'PASTE_FIXTURE';
        return null;
      }, onEvent: () => () => {}, emit: async () => {},
    };
    const noop = () => {};
    function Harness() {
      const [agents, setAgents] = useState(['one', 'two'].map(id => ({
        id, name: id, projectId: 'project', folder: 'C:/fixture', aiToolId: 'none',
        aiLabel: 'Shell', dangerous: false, createdAt: 1, status: 'idle',
        runtimeStatus: 'idle', deferredStart: id === 'two', resumeEligible: true,
      })));
      const termsRef = useRef(new Map());
      if (!termsRef.current.has('parked')) termsRef.current.set('parked', createEntry('parked'));
      useTerminalSettingsSync(termsRef);
      window.entries = termsRef.current;
      window.readSettings = loadTerminalSettings;
      const select = (path, id) => setAgents(current => current.map(agent => agent.id === id ? { ...agent, deferredStart: undefined } : agent));
      const ctx = { agents, projects: [], theme: 'soft', sessionPins: null,
        activePath: [0], dragState: null, dropTarget: null, termsRef,
        setAgentStatus: (id, status) => setAgents(current => current.map(agent => agent.id === id ? applyAgentRuntimeStatus(agent, status) : agent)),
        setAgentSessionId: noop, setActivePath: path => select(path, agents[path[0]].id),
        onCloseTab: noop, onSelectTab: select, onResizeAt: noop, onDragStart: noop,
        onDragEnd: noop, onDropTargetChange: noop, onDrop: noop, onTabContextMenu: noop,
        chatModeAgents: new Set(), onToggleChat: noop, getDocumentOwner: () => null,
        fallbackDocumentAgentId: null, onOpenBrowser: noop, onOpenMarkdownPath: noop,
        onOpenImagePath: noop, onOpenFolderPath: noop, onOpenTerminalPath: noop };
      return <><div className="settings-fixture"><TerminalSettingsPanel /></div><div className="panes-fixture">
        {agents.map((agent, index) => <PaneSlot key={agent.id}
          leaf={{type:'leaf', id:agent.id, tabs:[agent.id], activeIndex:0}} path={[index]} ctx={ctx} />)}
      </div></>;
    }
    if (!location.search.includes('writer')) {
      if (!localStorage.getItem('multiagent.terminalSettings.v1')) localStorage.setItem('multiagent.terminalFontSize.v1', '18');
      createRoot(document.getElementById('root')).render(<Harness />);
    }
  ` }, bundle: true, define: { "import.meta.env": "{}" }, jsx: "automatic", outfile: path.join(temporary, "renderer.js") });
  await fs.writeFile(path.join(temporary, "index.html"), `
    <link rel="stylesheet" href="renderer.css"><style>
      html,body,#root{height:100%;margin:0}#root{display:flex;background:var(--app-bg);color:var(--app-text)}
      .settings-fixture{width:540px;padding:20px;overflow:auto;flex-shrink:0}.panes-fixture{flex:1;display:flex;flex-direction:column;min-width:0}
      .pane-slot{height:50%;min-height:0;display:flex;flex-direction:column}.pane-body{flex:1;min-height:0}
    </style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>`);
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const { app, BrowserWindow } = require('electron');
    const fs = require('node:fs');
    app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
    app.whenReady().then(async () => {
      const options = { show:false, width:1280, height:950, webPreferences:{backgroundThrottling:false, offscreen:true} };
      const win = new BrowserWindow(options);
      win.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); });
      try {
        await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
        console.log(await win.webContents.executeJavaScript(\`(async () => {
          const wait = () => new Promise(resolve => setTimeout(resolve, 400));
          const check = (ok, message) => { if (!ok) throw new Error(message); };
          const input = label => document.querySelector('[aria-label="'+label+'"]');
          const change = async (label, value) => {
            const el = input(label); check(el, 'Missing field '+label);
            el.focus();
            if (el.tagName === 'SELECT') { el.value = value; el.dispatchEvent(new Event('change',{bubbles:true})); }
            else {
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, value);
              el.dispatchEvent(new Event('input',{bubbles:true})); await wait(); el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
            }
            await wait();
          };
          const calls = name => window.calls.filter(call => call.command === name);
          await wait(); await wait();
          check(calls('spawn_pty').length === 1 && !window.entries.has('two'), 'Initial standby session started');
          const first = window.entries.get('one');
          check(first.term.options.fontSize === 18 && input('글자 크기').value === '18', 'Legacy font size lost');
          const esc = String.fromCharCode(27);
          await new Promise(resolve => first.term.write('KEEP_TRANSCRIPT'+String.fromCharCode(13,10)+esc+'[31mRED'+esc+'[32mGREEN'+esc+'[38;2;18;171;239mRGB'+esc+'[0m', resolve));
          const colors = term => [0, 3, 8].map(x => {
            const cell = term.buffer.active.getLine(1).getCell(x);
            return { color:cell.getFgColor(), palette:cell.isFgPalette(), rgb:cell.isFgRGB() };
          });
          const originalColors = colors(first.term);
          check(originalColors[0].color === 1 && originalColors[0].palette && originalColors[1].color === 2 && originalColors[2].color === 0x12abef && originalColors[2].rgb, 'ANSI color fixture failed');
          const originalTheme = JSON.stringify(first.term.options.theme);
          const originalCols = first.term.cols;
          await change('글자 크기', '22');
          await change('줄 간격', '1.5');
          await change('커서 모양', 'bar');
          input('커서 깜빡임').click(); await wait();
          await change('스크롤 이력 행 수', '10000');
          check(first.term.options.fontSize === 22 && first.term.options.lineHeight === 1.5 && first.term.options.cursorStyle === 'bar' && !first.term.options.cursorBlink && first.term.options.scrollback === 10000, 'Live options did not update: '+JSON.stringify({saved:window.readSettings(),font:first.term.options.fontSize,line:first.term.options.lineHeight,cursor:first.term.options.cursorStyle,blink:first.term.options.cursorBlink,scrollback:first.term.options.scrollback}));
          check(first.term.cols < originalCols && calls('resize_pty').some(call => call.args.cols === first.term.cols && call.args.rows === first.term.rows), 'PTY geometry not updated');
          check(first.term.buffer.active.getLine(0).translateToString().includes('KEEP_TRANSCRIPT'), 'Settings erased output');
          check(JSON.stringify(colors(first.term)) === JSON.stringify(originalColors) && JSON.stringify(first.term.options.theme) === originalTheme, 'Settings erased ANSI colors or theme');
          const restored = window.entries.get('parked');
          await new Promise(resolve => restored.term.write(first.serialize.serialize(), resolve));
          check(JSON.stringify(colors(restored.term)) === JSON.stringify(originalColors), 'Transcript restore lost ANSI colors');
          check(window.entries.get('parked').term.options.fontSize === 22 && !window.entries.get('parked').opened, 'Parked terminal not updated safely');
          check(calls('spawn_pty').length === 1, 'Settings spawned standby session');
          first.el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-1})); await wait();
          check(input('글자 크기').value === '23' && window.readSettings().fontSize === 23, 'Ctrl+wheel settings drift');
          first.term.select(0,0,4); await wait();
          check(calls('clipboard_write_text').length === 0, 'Copy on select changed the default');
          input('선택하면 복사').click(); await wait(); first.term.clearSelection(); await wait(); first.term.select(0,0,5); await wait();
          check(calls('clipboard_write_text').some(call => call.args.text === 'KEEP_'), 'Copy on select did not copy: '+JSON.stringify({prefs:window.readSettings(),selected:first.term.getSelection(),calls:calls('clipboard_write_text')}));
          const right = ctrlKey => new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,ctrlKey});
          first.el.dispatchEvent(right(false)); await wait();
          check(calls('clipboard_read_text').length === 0, 'Right-click paste changed the default');
          const baselineRight = right(true); first.el.dispatchEvent(baselineRight); await wait(); input('우클릭으로 붙여넣기').click(); await wait();
          const bypass = right(true); first.el.dispatchEvent(bypass); await wait();
          check(bypass.defaultPrevented === baselineRight.defaultPrevented && calls('clipboard_read_text').length === 0, 'Ctrl+right-click was consumed');
          const paste = right(false); first.el.dispatchEvent(paste); await wait();
          check(paste.defaultPrevented && calls('write_pty').some(call => call.args.data.includes('PASTE_FIXTURE')), 'Right-click did not paste');
          document.querySelector('.session-standby button').click(); await wait(); await wait();
          check(calls('spawn_pty').length === 2 && window.entries.get('two').term.options.fontSize === 23, 'New terminal did not inherit preferences');
          [...document.querySelectorAll('button')].find(button => button.textContent === '기본값 복원').click(); await wait();
          check(first.term.options.fontSize === 13 && first.term.options.scrollback === 5000 && !window.readSettings().copyOnSelect, 'Reset did not apply');
          return 'TERMINAL_SETTINGS_UI_OK';
        })()\`));
        const writer = new BrowserWindow(options);
        await writer.loadFile(${JSON.stringify(path.join(temporary, "index.html"))}, { query:{ writer:'1' } });
        await writer.webContents.executeJavaScript("const key='multiagent.terminalSettings.v1'; const next=JSON.parse(localStorage.getItem(key)); next.fontSize=17; localStorage.setItem(key,JSON.stringify(next));");
        await new Promise(resolve => setTimeout(resolve, 700));
        console.log(await win.webContents.executeJavaScript("if(window.entries.get('one').term.options.fontSize!==17) throw new Error('Cross-window update missing'); 'TERMINAL_SETTINGS_CROSS_WINDOW_OK'"));
        writer.destroy();
        await win.reload();
        await new Promise(resolve => setTimeout(resolve, 1200));
        console.log(await win.webContents.executeJavaScript("if(window.entries.get('one').term.options.fontSize!==17) throw new Error('Reload persistence missing'); 'TERMINAL_SETTINGS_RELOAD_OK'"));
        if (${JSON.stringify(process.env.MULTIAGENT_TERMINAL_SETTINGS_SCREENSHOT || "")}) {
          win.webContents.invalidate(); await new Promise(resolve => setTimeout(resolve, 400));
          fs.writeFileSync(${JSON.stringify(process.env.MULTIAGENT_TERMINAL_SETTINGS_SCREENSHOT || "")}, (await win.webContents.capturePage()).toPNG());
        }
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], { env, stdio: "inherit", windowsHide: true });
  const timer = setTimeout(() => child.kill(), 45000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
  if (code !== 0) throw new Error(`Terminal settings smoke failed: ${code}`);
} finally {
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("multiagent-terminal-settings-")) throw new Error("Unexpected cleanup path");
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
