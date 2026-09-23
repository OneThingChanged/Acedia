import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-worker-ui-'));
const artifact = path.resolve(root, '../.acedia/worker-settings.png');
try {
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { SessionWorkerFields } from './src/components/SessionWorkerFields';
    import { normalizeSessionWorkerSettings, defaultSessionWorkerSettings } from './src/lib/sessionWorkers';
    import './src/App.css';
    function Harness() {
      const [settings, setSettings] = useState(() => normalizeSessionWorkerSettings(JSON.parse(localStorage.getItem('fixture') || 'null')) || defaultSessionWorkerSettings('codex'));
      window.settings = settings;
      return <SessionWorkerFields settings={settings} disabledTools={[]} onChange={next => { setSettings(next); localStorage.setItem('fixture', JSON.stringify(next)); }} />;
    }
    createRoot(document.getElementById('root')).render(<Harness />);
  ` }, bundle: true, define: { 'import.meta.env': '{}' }, jsx: 'automatic', outfile: path.join(temporary, 'renderer.js') });
  await fs.writeFile(path.join(temporary, 'index.html'), `<link rel="stylesheet" href="renderer.css"><style>body{margin:0;background:#111722}#root{padding:24px;width:460px;max-width:100vw;box-sizing:border-box;height:auto;display:block;background:var(--app-bg);color:var(--app-text)}.field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}input,select{padding:7px}</style><div id="root" class="app app-theme-soft"></div><script src="renderer.js"></script>`);
  await fs.writeFile(path.join(temporary, 'main.cjs'), `
    const {app,BrowserWindow}=require('electron');
    const fs=require('node:fs');
    app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))});
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({show:false,width:500,height:750,webPreferences:{backgroundThrottling:false}});
      try {
        await win.loadFile(${JSON.stringify(path.join(temporary, 'index.html'))});
        console.log(await win.webContents.executeJavaScript(\`(async()=>{
          const wait=()=>new Promise(r=>setTimeout(r,80));
          const check=(ok,msg)=>{if(!ok)throw Error(msg)};
          await wait();
          const fields=()=>Array.from(document.querySelectorAll('fieldset'));
          const change=async(el,value)=>{el.focus();if(el.tagName==='SELECT'){el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}else{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}await wait();};
          check(['gpt-6-luna','gpt-6-sol','gpt-6-astra'].every(model=>Array.from(fields()[0].querySelector('[data-worker-model]').options).some(o=>o.value===model)),'full model list while Luna selected');
          check(fields()[0].querySelector('[data-worker-model]').value==='gpt-6-luna','legacy default');
          await change(fields()[0].querySelector('[data-worker-model]'),'gpt-6-sol');
          await change(fields()[0].querySelector('[data-worker-effort]'),'xhigh');
          check(window.settings.documents.model==='gpt-6-sol' && window.settings.documents.effort==='xhigh','document model effort');
          check(fields()[1].querySelector('[data-worker-model]').value==='gpt-6-luna','HTML unchanged');
          await change(fields()[1].querySelector('[data-worker-model]'),'gpt-5.5');
          check(window.settings.html.effort==='xhigh','unsupported max adjusted');
          check(!Array.from(fields()[1].querySelector('[data-worker-effort]').options).some(o=>o.value==='max'),'unsupported max hidden');
          await change(fields()[1].querySelector('[data-worker-model]'),'custom');
          await change(fields()[1].querySelector('input'),'my-custom-model');
          await change(fields()[1].querySelector('[data-worker-effort]'),'high');
          check(window.settings.html.model==='my-custom-model','custom ID saved');
          await change(fields()[1].querySelector('input'),'');
          check(fields()[1].querySelector('input').getAttribute('aria-invalid')==='true','invalid empty field');
          fields()[1].querySelector('input').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));await wait();
          check(fields()[1].querySelector('input').value==='my-custom-model','invalid reset');
          await change(fields()[1].querySelector('select'),'claude-opus');
          await change(fields()[1].querySelector('[data-worker-model]'),'sonnet');
          await change(fields()[1].querySelector('[data-worker-effort]'),'high');
          check(window.settings.html.provider==='claude' && window.settings.html.model==='sonnet','Claude selection');
          await change(fields()[1].querySelector('select'),'');
          check(!window.settings.html && !fields()[1].querySelector('input'),'disabled clears config');
          await change(fields()[1].querySelector('select'),'codex-luna-max');
          check(fields()[1].querySelector('[data-worker-model]').value==='gpt-6-luna','enable preserves default');
          return 'WORKER_UI_INTERACTION_OK';
        })()\`));
        await win.webContents.reload();
        await new Promise(r=>setTimeout(r,700));
        console.log(await win.webContents.executeJavaScript(\`(()=>{if(window.settings.documents.model!=='gpt-6-sol'||window.settings.documents.effort!=='xhigh')throw Error('roundtrip');return 'WORKER_SETTINGS_RELOAD_OK';})()\`));
        fs.mkdirSync(${JSON.stringify(path.dirname(artifact))},{recursive:true});
        fs.writeFileSync(${JSON.stringify(artifact)},(await win.webContents.capturePage()).toPNG());
        win.setSize(320,750);await new Promise(r=>setTimeout(r,150));
        console.log(await win.webContents.executeJavaScript(\`(()=>{if(document.documentElement.scrollWidth>innerWidth)throw Error('narrow overflow');return 'WORKER_NARROW_LAYOUT_OK';})()\`));
        app.exit(0);
      }catch(error){console.error(error);app.exit(1);}
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [path.join(temporary, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Worker UI smoke timed out')); }, 45000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve(code); });
  });
  if (code !== 0) throw new Error('Worker UI smoke failed');
} finally { await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5 }); }
