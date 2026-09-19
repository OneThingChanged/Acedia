import { build } from "esbuild";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-terminal-links-"));
try {
  await build({ stdin: { resolveDir: root, loader: "ts", contents: `
    import { createEntry, findTerminalLinkAtMouseEvent } from './src/lib/terminal';
    import '@xterm/xterm/css/xterm.css';
    window.multiAgentElectron = { invoke: async () => null, onEvent: () => () => {} };
    window.opened = [];
    const open = (_, file) => window.opened.push(file);
    const entry = createEntry('fixture', open, open, open, open);
    document.body.appendChild(entry.el); entry.term.open(entry.el); entry.term.resize(80, 20);
    window.seed = async (file, hard) => {
      entry.term.reset(); window.opened = [];
      const output = hard ? 'report (' + file.slice(0,70) + '\\r\\n  ' + file.slice(70) + ')' : 'report (' + file + ')';
      await new Promise(resolve => entry.term.write(output, resolve));
    };
    window.point = (row, col) => {
      const rect = entry.el.querySelector('.xterm-screen').getBoundingClientRect();
      return {x: Math.floor(rect.left + (col + .5) * rect.width / entry.term.cols), y: Math.floor(rect.top + (row + .5) * rect.height / entry.term.rows)};
    };
    window.hit = (row, col) => {
      const p = window.point(row,col);
      return findTerminalLinkAtMouseEvent(entry.term, new MouseEvent('click', {clientX:p.x, clientY:p.y}));
    };
  ` }, bundle: true, define: { "import.meta.env": "{}" }, outfile: path.join(temporary, "renderer.js") });
  await fs.writeFile(path.join(temporary, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>body{margin:10px;background:#0d1117}.term-host{width:1100px;height:600px}</style><body><script src="renderer.js"></script></body>');
  await fs.writeFile(path.join(temporary, "main.cjs"), `
    const { app, BrowserWindow } = require('electron');
    const assert = require('node:assert/strict');
    app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
    app.whenReady().then(async () => { try {
      const win = new BrowserWindow({show:false,width:1200,height:700,webPreferences:{offscreen:true,backgroundThrottling:false}});
      win.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message); });
      await win.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
      const wait = () => new Promise(resolve=>setTimeout(resolve,200));
      for (const file of ['docs/dev/images/ui-concepts/v9/very-long-inventory-directory-name/inventory-prefab-synergy.png', 'ProjectA/Docs/RnD/ToonShader/Source/Reports/EXP_OutlineComparison/EXP_OutlineComparison_Report.md']) {
        for (const hard of [true,false]) {
          await win.webContents.executeJavaScript('window.seed('+JSON.stringify(file)+','+hard+')'); await wait();
          for (const [row,col] of [[0,12],[1,5]]) {
            assert.equal((await win.webContents.executeJavaScript('window.hit('+row+','+col+')')).text,file);
            const point = await win.webContents.executeJavaScript('window.point('+row+','+col+')');
            win.webContents.sendInputEvent({type:'mouseMove',...point}); await wait();
            win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
            win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point}); await wait();
            assert.equal(await win.webContents.executeJavaScript('window.opened.at(-1)'),file);
          }
          assert.equal(await win.webContents.executeJavaScript('window.opened.length'),2);
        }
      }
      console.log('TERMINAL_WRAPPED_PATH_POINTER_AND_HIT_TEST_OK'); app.exit(0);
    } catch(error) { console.error(error); app.exit(1); } });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [path.join(temporary, "main.cjs")], { env, stdio: "inherit", windowsHide: true });
  const timer = setTimeout(() => child.kill(), 25_000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }).finally(() => clearTimeout(timer));
  if (code !== 0) throw new Error("Terminal links smoke failed: " + code);
} finally {
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith("acedia-terminal-links-")) throw new Error("Unexpected smoke cleanup path");
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
