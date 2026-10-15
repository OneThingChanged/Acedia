// Real installed Qwen, isolated HOME/workspace and a loopback mock model only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { HookService } from '../electron/services/hook-service.mjs';
import { SessionService } from '../electron/services/session-service.mjs';
import { ownedQwenTranscript } from '../electron/services/qwen-chat.mjs';
import { parseChatTranscript, deriveTurnLifecycleDetails } from '../electron/services/chat-transcript.mjs';
import { ConversationStore } from '../electron/services/conversation-store.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-qwen-chat-cli-'));
let child,hook,model,store,stdout='',stderr='';
try {
  assert.ok(process.env.ACEDIA_QWEN_NODE&&process.env.ACEDIA_QWEN_ENTRY,'Set ACEDIA_QWEN_NODE and ACEDIA_QWEN_ENTRY');
  let requests=0;
  model=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    if(!req.url.includes('/chat/completions')){res.writeHead(200,{'content-type':'application/json'}).end('{}');return;}
    requests++;const body=JSON.parse(raw),answer='NATIVE_QWEN_CHAT_FIXTURE_OK';
    if(!body.stream){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({id:'fixture',object:'chat.completion',model:'probe',choices:[{index:0,message:{role:'assistant',content:answer},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:5,total_tokens:25}}));return;}
    res.writeHead(200,{'content-type':'text/event-stream'});
    res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',model:'probe',choices:[{index:0,delta:{role:'assistant',content:answer},finish_reason:null}]})+'\n\n');
    res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',model:'probe',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:5,total_tokens:25}})+'\n\ndata: [DONE]\n\n');res.end();
  });
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
  const sessions=new SessionService(path.join(root,'acedia'));
  hook=new HookService({baseDir:path.join(root,'hooks'),sessionService:sessions,sendEvent:()=>{}});await hook.start();
  const home=path.join(root,'home'),workspace=path.join(root,'workspace');await fs.mkdir(path.join(home,'.qwen'),{recursive:true});await fs.mkdir(workspace,{recursive:true});
  await hook.setupProject(workspace,'qwen');
  const base='http://127.0.0.1:'+model.address().port+'/v1',settings=path.join(home,'.qwen/settings.json');
  await fs.writeFile(settings,JSON.stringify({security:{auth:{selectedType:'openai',apiKey:'fixture-only',baseUrl:base},folderTrust:{enabled:false}},model:{name:'probe'},ui:{showWelcome:false},general:{enableAutoUpdate:false}}));
  const env={...process.env,HOME:home,USERPROFILE:home,APPDATA:path.join(home,'AppData/Roaming'),LOCALAPPDATA:path.join(home,'AppData/Local'),QWEN_HOME:path.join(home,'.qwen'),QWEN_RUNTIME_DIR:path.join(home,'.qwen'),QWEN_CODE_USER_SETTINGS_PATH:settings,QWEN_DEBUG_LOG_FILE:'1',OPENAI_API_KEY:'fixture-only',OPENAI_BASE_URL:base,MULTIAGENT_AGENT_ID:'fixture',MULTIAGENT_PORT:String(hook.port),MULTIAGENT_TOKEN:hook.token};
  for(const key of Object.keys(env))if(/TOKEN|API_KEY|AUTH|CODEX|CLAUDE|GEMINI/.test(key)&&!['OPENAI_API_KEY','MULTIAGENT_TOKEN'].includes(key))delete env[key];
  child=spawn(process.env.ACEDIA_QWEN_NODE,[process.env.ACEDIA_QWEN_ENTRY,'--debug','--model','probe','--approval-mode','yolo','--prompt','NATIVE_QWEN_CHAT_FIXTURE'],{cwd:workspace,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderr+=data});
  const timer=setTimeout(()=>child.kill(),45000);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)}).finally(()=>clearTimeout(timer));child=null;
  assert.equal(code,0,stderr.slice(-3000));assert.ok(stdout.includes('NATIVE_QWEN_CHAT_FIXTURE_OK'),stdout.slice(-1000));assert.ok(requests>0&&requests<=3,'Unexpected mock model requests');
  const note=sessions.notes.get('fixture');assert.ok(note?.sessionId,'Qwen SessionStart did not report an exact identity');
  const source=ownedQwenTranscript(note,{roots:[path.join(home,'.qwen/projects')],folder:workspace});assert.ok(source,'Native Qwen hook transcript is outside its isolated root');
  const text=await fs.readFile(source.path,'utf8'),blocks=parseChatTranscript(text,'qwen');
  assert.ok(blocks.some(b=>b.role==='user'&&b.text==='NATIVE_QWEN_CHAT_FIXTURE'));
  assert.ok(blocks.some(b=>b.role==='assistant'&&b.text?.includes('NATIVE_QWEN_CHAT_FIXTURE_OK')));
  assert.equal(deriveTurnLifecycleDetails(text,'qwen').lifecycle,'idle');
  store=new ConversationStore(path.join(root,'store'));
  await store.ingestTranscript({agentId:'fixture',provider:'qwen',sessionId:source.sessionId,projectPath:workspace,transcriptPath:source.path});
  const page=await store.listBlocks({agentId:'fixture',provider:'qwen',sessionId:source.sessionId,turnLimit:1});
  assert.ok(page.blocks.some(b=>b.text?.includes('NATIVE_QWEN_CHAT_FIXTURE_OK')));
  console.log('NATIVE_QWEN_CHAT_IDENTITY_AND_TRANSCRIPT_OK '+JSON.stringify({requests,blocks:blocks.length,lifecycle:'idle',hookIdentity:true,stored:true}));
} catch(error) {
  if(hook)console.error('Qwen hook diagnostics:',JSON.stringify({events:hook.recentEvents}));
  console.error('Qwen fixture output:',JSON.stringify({stdout:stdout.slice(-800),stderr:stderr.slice(-1400)}));
  console.error('Qwen hook debug:',stderr.split('\n').filter(line=>/HOOK|hook|settings|untrusted/i.test(line)).map(line=>line.slice(0,1000)).slice(-25).join('\n'));
  console.error('Qwen runtime paths:',(await fs.readdir(path.join(root,'home/.qwen'),{recursive:true})).filter(p=>/debug|log/.test(p)));
  for(const relative of ['hooks/hook.log',...((await fs.readdir(path.join(root,'home/.qwen'),{recursive:true})).filter(p=>/\.(log|txt)$/.test(p)).map(p=>'home/.qwen/'+p))]) {
    try { const log=await fs.readFile(path.join(root,relative),'utf8');console.error(relative,log.split('\n').filter(line=>/HOOK|hook|Error/.test(line)).slice(-10).join('\n').slice(-3500)); }catch{}
  }
  for(const file of (await fs.readdir(path.join(root,'home/.qwen'),{recursive:true})).filter(p=>p.endsWith('.jsonl')&&p.includes('chats'))) {
    const rows=(await fs.readFile(path.join(root,'home/.qwen',file),'utf8')).split('\n').flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}});
    console.error('Qwen final records:',JSON.stringify(rows.slice(-8).map(r=>({type:r.type,timestamp:r.timestamp,subtype:r.subtype,event:r.systemPayload?.uiEvent,parts:r.message?.parts?.map(p=>({text:p.text?.slice(0,100),thought:p.thought,call:p.functionCall?.name}))}))));
  }
  throw error;
} finally {
  child?.kill();store?.close();await hook?.stop();
  if(model){model.closeAllConnections();await new Promise(resolve=>model.close(resolve));}
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('acedia-qwen-chat-cli-'));
  await fs.rm(root,{recursive:true,maxRetries:5,retryDelay:100});
}
