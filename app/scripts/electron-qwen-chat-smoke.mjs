import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ConversationStore} from '../electron/services/conversation-store.mjs';
import {deriveTurnLifecycleDetails} from '../electron/services/chat-transcript.mjs';
import {RemoteDashboardService,LocalDashboardService} from '../electron/services/web-services.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-qwen-chat-ui-'));
app.setPath('userData',path.join(root,'profile'));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const evaluate=(win,code)=>win.webContents.executeJavaScript(code);
async function wait(win,code){for(let i=0;i<180;i++){if(await evaluate(win,code))return;await pause(60)}throw Error('Qwen UI timeout: '+code)}
const timer=setTimeout(()=>{console.error('Qwen UI timed out');app.exit(1)},120000);
const records=[],row=(type,parts)=>({type,timestamp:new Date().toISOString(),message:{role:type==='assistant'?'model':'user',parts}});
const bitmap='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=';
let win,service,store;
void app.whenReady().then(async()=>{let exitCode=0;
try{
 const workspace=path.join(root,'workspace');await fs.mkdir(workspace);await fs.writeFile(path.join(workspace,'result.md'),'# Qwen file preview');
 const source=path.join(root,'qwen-session.jsonl');
 for(let i=0;i<30;i++){
  records.push(row('user',[{text:'Qwen question '+i},...(i===29?[{inlineData:{mimeType:'image/png',data:bitmap}}]:[])]));
  if(i===29){
   records.push(row('assistant',[{text:'Checking two files.'},{functionCall:{id:'first',name:'read_file',args:{file_path:path.join(workspace,'result.md')}}},{functionCall:{id:'second',name:'edit',args:{file_path:path.join(workspace,'code.ts'),old_string:'old',new_string:'new'}}}]));
   records.push(row('tool_result',[{functionResponse:{id:'first',name:'read_file',response:{output:'FIRST_QWEN_RESULT'}}}]),row('tool_result',[{functionResponse:{id:'second',name:'edit',response:{output:'SECOND_QWEN_RESULT'}}}]));
  }
  records.push(row('assistant',[{text:`# Qwen answer ${i}\n\n`+'Readable Qwen history.\n\n'.repeat(15)+(i===29?'[결과 문서](result.md)':'')} ]));
 }
 records.push({type:'system',subtype:'ui_telemetry',timestamp:new Date().toISOString(),systemPayload:{uiEvent:{kind:'request',phase:'started',subagentId:'managed-auto-memory-extractor'}}});
 await fs.writeFile(source,records.map(JSON.stringify).join('\n')+'\n');
 store=new ConversationStore(path.join(root,'store'));
 const input={agentId:'qwen',provider:'qwen',sessionId:'qwen-session',projectPath:workspace,transcriptPath:source};await store.ingestTranscript(input);
 const imageSequence=(await store.listBlocks({...input,turnLimit:5})).blocks.find(block=>block.kind==='image').sequence;
 const lifecycle=deriveTurnLifecycleDetails(await fs.readFile(source,'utf8'),'qwen');assert.equal(lifecycle.lifecycle,'idle');
 const submissions=[],reads=[],details=[];
 const providers={chatProvider:async(id,options)=>{reads.push(options);return {...await store.listBlocks({...input,...options,agentId:id}),...lifecycle,sessionId:'qwen-session',tool:'qwen'}},
  chatImages:async(id,sequence)=>store.readImages({agentId:id,sequence}),
  chatDetails:async(id,options)=>{details.push(options);return store.readBlockDetails({...options,agentId:id})},
  submitPty:async(id,message,options)=>{submissions.push({id,message,options});await fs.appendFile(source,[row('user',[{text:message}]),row('assistant',[{text:'Qwen sent successfully'}])].map(JSON.stringify).join('\n')+'\n');await store.ingestTranscript(input);return true},
  terminalSnapshot:()=>({data:'Qwen terminal fallback'}),terminalSize:()=>({cols:80,rows:24}),subscribeTerminal:()=>()=>{},writePty:()=>true};
 const view={language:'en',projects:[{id:'project',name:'Qwen project',folder:workspace}],agents:[{id:'qwen',projectId:'project',aiToolId:'qwen'}]};
 const agents=[{id:'qwen',projectId:'project',folder:workspace,name:'Qwen fixture',aiToolId:'qwen',status:'running'}];
 const output=path.resolve(import.meta.dirname,'../../output');await fs.mkdir(output,{recursive:true});
 for(const channel of ['remote','dashboard']){
  service=channel==='remote'?new RemoteDashboardService({baseDir:path.join(root,channel),...providers}):new LocalDashboardService({baseDir:path.join(root,channel),title:'Qwen',defaultPort:0,configName:'dashboard.json',providers});
  if(channel==='remote'){service.config.server_port=0;service.syncView(view);service.syncAgents(agents)}else{service.config.enabled=true;service.config.serverPort=0;service.sync({view,agents})}
  const status=await service.start();
  for(const width of [1100,390]){
   const before=submissions.length;
   win=new BrowserWindow({show:false,width,height:850,webPreferences:{offscreen:true,backgroundThrottling:false}});
   await win.loadURL(status.url+'/?agent=qwen&view=chat');await wait(win,"document.querySelector('#chatView').textContent.includes('Qwen answer 29')");
   assert(await evaluate(win,"[...document.querySelectorAll('.chat-role')].some(n=>n.textContent.includes('Qwen'))&&!document.querySelector('#chatWorking').offsetHeight"),'Qwen label or completion state incorrect');
   assert(await evaluate(win,"!document.querySelector('#chatView').textContent.includes('Qwen answer 24')"),'Loaded all Qwen history at once');
   await evaluate(win,`document.querySelector('[data-image-key="qwen:${imageSequence}"]').scrollIntoView({block:'center'})`);
   await wait(win,"document.querySelector('.chat-inline-images img')?.naturalWidth>0");
   await evaluate(win,"document.querySelector('.chat-md [data-chat-file-kind=markdown]').click()");
   await wait(win,"document.querySelector('#filePreviewMarkdown').textContent.includes('Qwen file preview')");await evaluate(win,"document.querySelector('#filePreviewClose').click()");
   await evaluate(win,"[...document.querySelectorAll('.chat-work')].at(-1).open=true");
   await wait(win,"document.querySelectorAll('.chat-tool').length===2");
   await evaluate(win,"[...document.querySelectorAll('.chat-tool')].forEach(n=>n.open=true)");
   await wait(win,"[...document.querySelectorAll('.chat-tool')].every(n=>n.querySelector('pre'))");
   assert(await evaluate(win,"(()=>{const a=[...document.querySelectorAll('.chat-tool')];return a[0].textContent.includes('read_file')&&a[0].textContent.includes('FIRST_QWEN_RESULT')&&!a[0].textContent.includes('SECOND_QWEN_RESULT')&&a[1].textContent.includes('SECOND_QWEN_RESULT')})()"),'Parallel Qwen results attached to the wrong tool');
   await evaluate(win,"document.querySelector('#chatView').scrollTop=0");await wait(win,"document.querySelector('#chatView').textContent.includes('Qwen answer 24')");
   assert(!await evaluate(win,"document.querySelector('#chatView').textContent.includes('Qwen answer 0')"),'Older history was not paged');
   await fs.writeFile(path.join(output,`qwen-chat-${channel}-${width}.png`),(await win.webContents.capturePage()).toPNG());
   const message='Qwen remote send '+channel+' '+width;
   await evaluate(win,`(()=>{const i=document.querySelector('#messageInput');i.value=${JSON.stringify(message)};i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#sendButton').click()})()`);
   for(let i=0;i<100&&submissions.length===before;i++)await pause(50);
   await wait(win,"document.querySelector('#chatView').textContent.includes('Qwen sent successfully')");
   assert.equal(submissions.length,before+1);assert.equal(submissions.at(-1).id,'qwen');assert.equal(submissions.at(-1).message,message);
   await evaluate(win,"document.querySelector('#sessionMode [data-mode=term]').click()");await wait(win,"document.querySelector('#terminalMount').textContent.includes('Qwen terminal fallback')");
   console.log('QWEN_CHAT_UI_OK '+JSON.stringify({channel,width,role:true,completion:true,images:true,files:true,parallelTools:true,historyPaging:true,send:true,terminal:true}));
   win.destroy();win=null;
  }
  await service.stop();service=null;
 }
 assert.ok(reads.some(r=>r.turnLimit)&&reads.some(r=>r.beforeSequence));assert.ok(details.length>=8);
}catch(error){console.error(error);exitCode=1}
finally{clearTimeout(timer);win?.destroy();await service?.stop();store?.close();app.exit(exitCode)}
});
