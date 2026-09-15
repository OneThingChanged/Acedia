import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-extension-smoke-'));
try {
  await build({ stdin: { resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { BrowserExtensionsPanel } from './src/components/BrowserExtensionsPanel';
    createRoot(document.getElementById('root')).render(<BrowserExtensionsPanel profiles={[{id:'a',label:'A'},{id:'b',label:'B'}]}/>);
  ` }, bundle: true, jsx: 'automatic', outfile: path.join(root, 'renderer.js'), plugins: [{ name: 'host', setup(bundler) {
    bundler.onResolve({ filter: /platform\/(runtime|electronBridge)$/ }, args => ({ path: args.path, namespace: 'host' }));
    bundler.onLoad({ filter: /.*/, namespace: 'host' }, () => ({ contents: `export const invoke = (...args) => window.host.invoke(...args); export const listen = async () => () => {}; export const getElectronBridge = () => null; export const isElectronRuntime = () => true;` }));
  } }] });
  await fs.writeFile(path.join(root, 'index.html'), '<div id="root"></div><script src="renderer.js"></script>');
  await fs.writeFile(path.join(root, 'preload.cjs'), "const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('host',{invoke:(...args)=>ipcRenderer.invoke('fixture',...args)});");
  const serviceUrl = new URL('../electron/services/browser-extensions.mjs', import.meta.url).href;
  const contractPath = new URL('../electron/ipc-contract.cjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
  await fs.writeFile(path.join(root, 'main.cjs'), `
const { app, session, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
app.setPath('userData', path.join(__dirname, 'profile'));
const timeout = setTimeout(() => app.exit(2), 30000);
app.whenReady().then(async () => {
 const { BrowserExtensions } = await import(${JSON.stringify(serviceUrl)});
 const { assertInvokeRequest } = require(${JSON.stringify(contractPath)});
 const directory = path.join(__dirname, 'extension'); fs.mkdirSync(directory);
 fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({manifest_version:3,name:'Acedia smoke',version:'1.0',content_scripts:[{matches:['http://127.0.0.1/*'],js:['content.js'],run_at:'document_end'}]}));
 fs.writeFileSync(path.join(directory, 'content.js'), "document.documentElement.dataset.extensionSmoke = 'yes';");
 const server = http.createServer((req,res) => res.end('<html><body>Fixture</body></html>'));
 await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
 const url = 'http://127.0.0.1:' + server.address().port;
 const getSession = p => session.fromPartition('persist:ext-' + p.id);
 const service = new BrowserExtensions(__dirname, getSession), profile = {id:'a'};
 const request = assertInvokeRequest('browser_extensions_change', {profileId:'a',action:'add',directory});
 const [entry] = await service.change(profile, request.action, request);
 assert.equal(entry.status,'loaded',entry.error);
 const win = new BrowserWindow({show:false,webPreferences:{session:getSession(profile),sandbox:true}});
 await win.loadURL(url);
 assert.equal(await win.webContents.executeJavaScript('document.documentElement.dataset.extensionSmoke'), 'yes');
 const other = new BrowserWindow({show:false,webPreferences:{session:getSession({id:'b'}),sandbox:true}});
 await other.loadURL(url);
 assert.equal(await other.webContents.executeJavaScript('document.documentElement.dataset.extensionSmoke'), undefined);
 await service.change(profile,'toggle',{id:entry.id,enabled:false});
 await win.loadURL(url + '/disabled');
 assert.equal(await win.webContents.executeJavaScript('document.documentElement.dataset.extensionSmoke'), undefined);
 await service.change(profile,'toggle',{id:entry.id,enabled:true});
 await win.loadURL(url + '/enabled');
 assert.equal(await win.webContents.executeJavaScript('document.documentElement.dataset.extensionSmoke'), 'yes');
 await service.change(profile,'remove',{id:entry.id});
 assert.equal(fs.existsSync(directory),true);
 ipcMain.handle('fixture', async (event, command, args) => {
   if (command === 'show_open_dialog') return directory;
   args = assertInvokeRequest(command, args);
   return command === 'browser_extensions_list' ? service.list({id:args.profileId}) : service.change({id:args.profileId},args.action,args);
 });
 const ui = new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs')}});
 await ui.loadFile(path.join(__dirname,'index.html'));
 await ui.webContents.executeJavaScript(\`(async () => {
   const wait = async test => { for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,30));}throw new Error('UI condition timed out: '+document.body.innerText); };
   await wait(() => document.querySelector('button') && !document.querySelector('fieldset').disabled);
   document.querySelector('button').click();
   await wait(() => document.querySelector('strong')?.textContent.includes('Acedia smoke'));
   await wait(() => !document.querySelector('fieldset').disabled);
   document.querySelector('input[type=checkbox]').click();
   await wait(() => !document.querySelector('fieldset').disabled && !document.querySelector('input').checked);
   const select = document.querySelector('select'); select.value='b'; select.dispatchEvent(new Event('change',{bubbles:true}));
   await wait(() => !document.querySelector('strong') && !document.querySelector('fieldset').disabled);
   select.value='a'; select.dispatchEvent(new Event('change',{bubbles:true}));
   await wait(() => document.querySelector('strong') && !document.querySelector('fieldset').disabled);
   [...document.querySelectorAll('button')].at(-1).click();
   await wait(() => !document.querySelector('strong') && !document.querySelector('fieldset').disabled);
 })()\`);
 ui.destroy();
 win.destroy(); other.destroy(); server.close(); clearTimeout(timeout);
 console.log('BROWSER_EXTENSIONS_SMOKE_OK'); app.exit(0);
}).catch(error => {console.error(error);app.exit(1);});
`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [path.join(root, 'main.cjs')], { env, windowsHide: true, stdio: 'inherit' });
  const code = await new Promise(resolve => child.on('exit', resolve));
  if (code !== 0) throw new Error('Extension smoke failed: ' + code);
} finally { await fs.rm(root, { recursive: true, force: true }); }
