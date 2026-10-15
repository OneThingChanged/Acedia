// Installed Claude TUI + loopback mock model, isolated credentials and workspace.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TrackedTerminalFilter} from '../electron/services/terminal-stream.mjs';
import {QuestionResponder} from '../electron/services/question-responder.mjs';
import {claudeQuestionFrame} from '../electron/services/claude-question-responder.mjs';
import {ActiveQuestions} from '../electron/services/active-questions.mjs';
import {devElectronEnvironment} from './electron-dev-environment.mjs';
const require=createRequire(import.meta.url),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cases=[
  {name:'three',form:{questions:[
    {header:'Scope',question:'어느 범위로 구현할까요?',options:[{label:'A+B+C (권장)',description:'세 가지'},{label:'A+B',description:'두 가지'}],multiSelect:false},
    {header:'Period',question:'기간 기본값은?',options:[{label:'7일',description:'최근 일주일'},{label:'30일',description:'최근 한 달'}],multiSelect:false},
    {header:'Backend',question:'백엔드도 변경할까요?',options:[{label:'ComfyUI만',description:'한 화면'},{label:'둘 다',description:'두 화면'}],multiSelect:false},
  ]},answers:[{id:'claude-0',optionIndex:1},{id:'claude-1',optionIndex:null,text:'최근 14일'},{id:'claude-2',optionIndex:0}],expected:['A+B','최근 14일','ComfyUI만']},
  {name:'checkbox',form:{questions:[{header:'Features',question:'Which file kinds?',multiSelect:true,options:[{label:'Images',description:'Image results'},{label:'ZIP',description:'Archives'},{label:'Docs',description:'Documents'}]}]},
    answers:[{id:'claude-0',optionIndex:null,optionIndices:[0,2],text:'추가 항목'}],expected:['Images','Docs','추가 항목']},
  {name:'single',form:{questions:[{header:'Scope',question:'Choose a scope?',multiSelect:false,options:[{label:'One',description:'First'},{label:'Both',description:'Second'}]}]},
    answers:[{id:'claude-0',optionIndex:1}],expected:['Both']},
];
async function exercise(root){
  const binary=process.env.ACEDIA_CLAUDE_BINARY;
  assert.ok(binary&&path.isAbsolute(binary),'Set ACEDIA_CLAUDE_BINARY to the installed Claude executable');
  const screen=new TrackedTerminalFilter(45,110),asked=new Set(),answered=new Map();
  let phase=0,child,raw='',modelRequests=0,debugTranscript;
  const toolId=()=>`toolu_acedia_question_${phase}`;
  const server=http.createServer(async(request,response)=>{
    let rawBody='';for await(const chunk of request)rawBody+=chunk;
    if(request.url.includes('count_tokens')){response.writeHead(200,{'content-type':'application/json'});response.end('{"input_tokens":100}');return;}
    if(!request.url.startsWith('/v1/messages')){response.writeHead(200,{'content-type':'application/json'});response.end('{}');return;}
    const body=JSON.parse(rawBody);modelRequests++;
    for(const message of body.messages||[])for(const item of Array.isArray(message.content)?message.content:[]){
      if(item.type==='tool_result'&&item.tool_use_id?.startsWith('toolu_acedia_question_'))answered.set(item.tool_use_id,item);
    }
    const ask=!asked.has(phase)&&body.tools?.some(tool=>tool.name==='AskUserQuestion');if(ask)asked.add(phase);
    const block=ask?{type:'tool_use',id:toolId(),name:'AskUserQuestion',input:cases[phase].form}:{type:'text',text:'CLAUDE_QUESTION_FLOW_OK'};
    const message={id:'msg_fixture_'+modelRequests,type:'message',role:'assistant',model:body.model,content:[block],stop_reason:ask?'tool_use':'end_turn',stop_sequence:null,usage:{input_tokens:100,output_tokens:30}};
    if(!body.stream){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(message));return;}
    response.writeHead(200,{'content-type':'text/event-stream'});
    for(const event of [{type:'message_start',message:{...message,content:[],stop_reason:null}},
      {type:'content_block_start',index:0,content_block:ask?{...block,input:{}}:{type:'text',text:''}},
      {type:'content_block_delta',index:0,delta:ask?{type:'input_json_delta',partial_json:JSON.stringify(cases[phase].form)}:{type:'text_delta',text:block.text}},
      {type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:message.stop_reason,stop_sequence:null},usage:{output_tokens:30}},{type:'message_stop'}])response.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');
    response.end();
  });
  const until=async(predicate,label)=>{for(let n=0;n<200;n++){if(await predicate())return;await pause(75);}throw Error('Native Claude timeout: '+label);};
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const home=path.join(root,'home'),config=path.join(home,'.claude');await fs.mkdir(config,{recursive:true});
    await fs.writeFile(path.join(config,'.claude.json'),JSON.stringify({hasCompletedOnboarding:true,theme:'dark'}));
    const settings=path.join(root,'settings.json');await fs.writeFile(settings,JSON.stringify({permissions:{allow:['AskUserQuestion']}}));
    const env={...process.env,HOME:home,USERPROFILE:home,APPDATA:path.join(home,'AppData/Roaming'),LOCALAPPDATA:path.join(home,'AppData/Local'),CLAUDE_CONFIG_DIR:config,TERM:'xterm-256color',ANTHROPIC_API_KEY:'fixture-only',ANTHROPIC_BASE_URL:'http://127.0.0.1:'+server.address().port,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1'};
    for(const key of Object.keys(env))if(/TOKEN|API_KEY|AUTH|CODEX|MULTIAGENT|GEMINI/.test(key)&&key!=='ANTHROPIC_API_KEY')delete env[key];
    child=require('node-pty').spawn(binary,['--setting-sources','','--settings',settings,'--model','sonnet'],{cwd:root,env,cols:110,rows:45,useConpty:true});
    screen.shadow.onData(data=>child.write(data));child.onData(data=>{raw+=data;screen.push(data);});
    await until(()=>screen.viewportText().includes('Yes, I trust this folder'),'isolated workspace trust');
    await pause(800);child.write('\x1b[B');
    await until(()=>/❯\s+Yes, I trust this folder/.test(screen.viewportText()),'fixture trust selection');child.write('\r');
    await until(()=>screen.viewportText().includes('Detected a custom API key'),'fixture key confirmation');
    await pause(500);child.write('\x1b[A');
    await until(()=>/❯\s+Yes/.test(screen.viewportText()),'fixture key selection');child.write('\r');
    await until(()=>screen.viewportText().includes('auto mode on'),'fixture composer');
    const monitor=new ActiveQuestions(),entry={aiToolId:'claude',process:child};let transcriptPath,sessionId;
    const current=()=>monitor.read({id:'fixture',tool:'claude',root:config,transcriptPath,sessionId});
    const responder=new QuestionResponder({entry:()=>entry,current,snapshot:()=>screen.viewportText()});
    for(phase=0;phase<cases.length;phase++){
      child.write(`Ask fixture questions ${phase}.`);await pause(300);child.write('\r');
      await until(()=>!!claudeQuestionFrame(screen.viewportText()),cases[phase].name+' form');
      const transcripts=(await fs.readdir(config,{recursive:true})).filter(file=>/[0-9a-f-]{36}\.jsonl$/i.test(file));
      assert.equal(transcripts.length,1,'Unexpected user or peer transcript in fixture');
      transcriptPath=path.join(config,transcripts[0]);debugTranscript=transcriptPath;sessionId=path.basename(transcriptPath,'.jsonl');
      await until(async()=>(await current())?.question?.id===toolId(),'transcript call identity');
      const request={sessionId,questionId:toolId(),answers:cases[phase].answers};
      assert.deepEqual(await responder.answer('fixture',request),{status:'sent'});
      await until(()=>answered.has(toolId()),cases[phase].name+' tool result');
      const result=JSON.stringify(answered.get(toolId()));
      for(const expected of cases[phase].expected)assert.ok(result.includes(expected),'Missing native Claude answer: '+expected);
      await until(async()=>(await current())?.question===null,'native question cleared');
      assert.deepEqual(await responder.answer('fixture',request),{status:'sent'});
      await until(()=>screen.viewportText().includes('auto mode on')&&!claudeQuestionFrame(screen.viewportText()),'resumed composer');
      console.log('NATIVE_CLAUDE_CHAT_ANSWER_AND_RESUME_OK '+JSON.stringify({case:cases[phase].name,fields:cases[phase].answers.length}));
    }
  }catch(error){
    const directory=path.resolve(import.meta.dirname,'../../output/claude-question-cli-smoke');await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'screen.txt'),screen.viewportText());await fs.writeFile(path.join(directory,'raw.txt'),raw);
    if(debugTranscript)await fs.copyFile(debugTranscript,path.join(directory,'transcript.jsonl'));throw error;
  }finally{
    if(child){child.write('\x03');await pause(200);child.write('\x03');await pause(300);try{child.kill();}catch{}}
    screen.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
if(process.versions.electron){
  const {app}=require('electron'),root=process.argv[2];app.setPath('userData',path.join(root,'electron'));
  void app.whenReady().then(async()=>{try{await exercise(root);app.exit(0);}catch(error){console.error(error);app.exit(1);}});
}else{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-claude-question-cli-'));
  try{
    const env=devElectronEnvironment(process.env);delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve,reject)=>{const child=spawn(require('electron'),[fileURLToPath(import.meta.url),root],{env,windowsHide:true,stdio:'inherit'});
      const timer=setTimeout(()=>child.kill(),90000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Claude question smoke failed: '+code));});});
  }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('acedia-claude-question-cli-'));await fs.rm(root,{recursive:true,maxRetries:5,retryDelay:100});}
}
