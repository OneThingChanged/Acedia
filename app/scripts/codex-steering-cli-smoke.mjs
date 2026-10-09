// Real installed TUI, isolated profile, loopback-only model fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {CodexScrollbackFilter} from '../electron/services/terminal-stream.mjs';

const require=createRequire(import.meta.url);
const appRoot=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(appRoot,'../output/chat-steering-cli');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function exercise(root) {
  const binary=process.env.ACEDIA_CODEX_BINARY;
  assert.ok(binary && path.isAbsolute(binary),'Set ACEDIA_CODEX_BINARY to the installed executable');
  const calls=[];
  const filter=new CodexScrollbackFilter(40,120);
  let child, responseStarted=false, firstResponseFinished=false, steeredDuringResponse=false, terminalOutput='';
  const server=http.createServer(async (request,response)=>{
    let raw='';for await(const chunk of request) raw+=chunk;
    if (!request.url.endsWith('/responses')) {response.writeHead(200,{'content-type':'application/json'});response.end('{"models":[]}');return;}
    const body=JSON.parse(raw); calls.push(body);
    const first=calls.length===1;
    const steering=JSON.stringify(body.input).includes('STEER_CURRENT_WORK');
    if(steering && !firstResponseFinished) steeredDuringResponse=true;
    const item={type:'message',id:'fixture-message-'+calls.length,role:'assistant',status:'completed',content:[{type:'output_text',text:steering?'STEER_APPLIED':'TURN_FINISHED',annotations:[]}]};
    const result={id:'fixture-response-'+calls.length,object:'response',status:'completed',model:body.model,output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
    response.writeHead(200,{'content-type':'text/event-stream'});
    for(const event of [{type:'response.created',response:{...result,status:'in_progress',output:[]}},
      {type:'response.output_item.added',output_index:0,item}, {type:'response.output_item.done',output_index:0,item}, {type:'response.completed',response:result}]) {
      if(response.destroyed) return;
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      // Hold a live native response while the user steers. No shell commands,
      // API credentials, or unrelated tool capabilities are needed.
      if(first && event.type==='response.created') {responseStarted=true;await wait(4000);}
    }
    response.end();
    if(first) firstResponseFinished=true;
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const cliHome=path.join(root,'cli'); await fs.mkdir(cliHome);
    await fs.writeFile(path.join(cliHome,'config.toml'),`model="gpt-5.4"\nmodel_provider="fixture"\n[windows]\nsandbox="unelevated"\n[projects.${JSON.stringify(root)}]\ntrust_level="trusted"\n[model_providers.fixture]\nname="Fixture"\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nwire_api="responses"\n`);
    const env={...process.env,CODEX_HOME:cliHome,TERM:'xterm-256color'};
    for(const key of Object.keys(env)) if(/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN)$/i.test(key)) delete env[key];
    child=require('node-pty').spawn(binary,['--no-daemon','--disable','plugins','--no-alt-screen','--sandbox','read-only','--ask-for-approval','never','-C',root],{cwd:root,env,cols:120,rows:40});
    child.onData(data=>{terminalOutput+=data;filter.push(data);if(data.includes('\x1b[6n'))child.write('\x1b[1;1R');if(data.includes('\x1b[c'))child.write('\x1b[?1;2c');});
    const until=async(test,label)=>{for(let n=0;n<250;n++){if(await test())return;await wait(100);}throw Error('Timeout: '+label+'\n'+filter.viewportText());};
    const rows=async()=>{
      const sessions=path.join(cliHome,'sessions'); let files=[];
      try {files=(await fs.readdir(sessions,{recursive:true})).filter(file=>file.endsWith('.jsonl'));}catch{return [];}
      const result=[];
      for(const file of files) for(const line of (await fs.readFile(path.join(sessions,file),'utf8')).split('\n')) {try{result.push(JSON.parse(line));}catch{}}
      return result;
    };
    // Same separate text + Enter writes as the desktop composer.
    const send=async text=>{child.write(text);await wait(80);child.write('\r');};
    await wait(3500);
    await send('BEGIN_CURRENT_WORK. Reply to the fixture.');
    await until(()=>responseStarted,'ongoing native response');
    await until(()=>/esc to interrupt/i.test(filter.viewportText()),'ongoing tool work');
    assert.equal((await rows()).filter(row=>row.payload?.type==='task_complete').length,0,'Initial work already finished');
    await send('STEER_CURRENT_WORK');
    await until(()=>calls.some(call=>JSON.stringify(call.input).includes('STEER_CURRENT_WORK')),'steer reached native response');
    await until(async()=> (await rows()).some(row=>row.payload?.type==='task_complete'),'current turn completed');
    const current=await rows();
    assert.equal(current.filter(row=>row.payload?.type==='task_started').length,1,'Steering created a separate turn');
    assert.ok(current.some(row=>row.type==='response_item' && row.payload?.role==='user' && row.payload.content?.some(content=>content.text?.includes('STEER_CURRENT_WORK'))),'Steering missing from native transcript');
    assert.ok(steeredDuringResponse,'Steering waited for the current response to finish');
    assert.ok(!calls.some(call=>JSON.stringify(call.input).includes('QUEUE_AFTER_COMPLETION')),'Reserved message was delivered early');
    await wait(1200);await send('QUEUE_AFTER_COMPLETION');
    await until(()=>calls.some(call=>JSON.stringify(call.input).includes('QUEUE_AFTER_COMPLETION')),'follow-up after completion');
    await until(async()=> (await rows()).filter(row=>row.payload?.type==='task_complete').length===2,'follow-up completed');
    assert.equal((await rows()).filter(row=>row.payload?.type==='task_started').length,2);
    console.log('CODEX_NATIVE_STEERING_OK text + Enter steer during an ongoing native response, same turn/transcript, completion follow-up starts a separate turn; loopback fixture only');
  } finally {
    await fs.writeFile(path.join(root,'terminal-output.txt'),terminalOutput);
    if(child){child.write('\x03');await wait(200);try{child.kill();}catch{}}
    server.close();filter.dispose();
  }
}

if(process.versions.electron){
  const {app}=require('electron');app.disableHardwareAcceleration();app.setPath('userData',path.join(process.env.ACEDIA_STEERING_FIXTURE,'electron'));
  app.whenReady().then(()=>exercise(process.env.ACEDIA_STEERING_FIXTURE)).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
}else{
  await fs.mkdir(output,{recursive:true});const root=await fs.mkdtemp(path.join(output,'profile-'));
  const env={...process.env,ACEDIA_STEERING_FIXTURE:root};delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{const child=spawn(require('electron'),[fileURLToPath(import.meta.url)],{cwd:appRoot,env,stdio:'inherit',windowsHide:true});
    const timer=setTimeout(()=>{child.kill();reject(Error('Native steering smoke timed out'));},65000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native steering smoke failed: '+code+'; fixture: '+root));});});
}
