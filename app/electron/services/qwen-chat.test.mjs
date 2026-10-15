import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { normalizeQwenRecord, ownedQwenTranscript, qwenTranscriptRoots } from './qwen-chat.mjs';
import { parseChatTranscript, deriveTurnLifecycleDetails, derivePendingQuestion } from './chat-transcript.mjs';
import { transcriptImages } from './chat-images.mjs';
import { SessionService } from './session-service.mjs';
import { ConversationStore } from './conversation-store.mjs';

const roots=[];
afterEach(()=>{for(const root of roots.splice(0)){if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('acedia-qwen-chat-'))throw Error('Invalid fixture root');fs.rmSync(root,{recursive:true});}});
const temporary=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-qwen-chat-'));roots.push(root);return root;};
const at=n=>new Date(n*1000).toISOString();
const record=(type,parts,timestamp=at(1))=>({type,timestamp,message:{role:type==='assistant'?'model':'user',parts}});
const serialized=records=>records.map(JSON.stringify).join('\n')+'\n';
const tool=(id,name,args={})=>({functionCall:{id,name,args}});
const result=(id,output)=>record('tool_result',[{functionResponse:{id,name:'read_file',response:{output}}}]);

it('decodes Qwen users, reasoning, multiple tool IDs, failures and final replies without telemetry noise',()=>{
 const rows=[record('user',[{text:'프로젝트를 확인해줘'}]),{type:'system',subtype:'attribution_snapshot',systemPayload:{secret:'hidden'}},
  record('assistant',[{text:'Inspect files',thought:true},{text:'확인하겠습니다'},tool('one','read_file',{file_path:'README.md'}),tool('two','edit',{file_path:'code.ts',old_string:'old',new_string:'new'})]),
  result('two','edited'),{...result('one','failed'),toolCallResult:{status:'error'}},record('assistant',[{text:'완료했습니다'}])];
 const blocks=parseChatTranscript(serialized(rows),'qwen');
 expect(blocks.map(b=>b.kind)).toEqual(['text','reasoning','text','tool-call','tool-call','tool-result','tool-result','text']);
 expect(blocks.filter(b=>b.callId).map(b=>b.callId)).toEqual(['one','two','two','one']);
 expect(blocks[4].diff).toEqual(expect.arrayContaining([expect.objectContaining({type:'del',text:'old'}),expect.objectContaining({type:'add',text:'new'})]));
 expect(blocks[6].isError).toBe(true);expect(JSON.stringify(blocks)).not.toContain('hidden');
 expect(parseChatTranscript('null\n{}\npartial JSON\n','qwen')).toEqual([]);
});

it('uses the final answer and failed request events for completion while tool calls/results keep work active',()=>{
 const rows=[record('user',[{text:'Run'}],at(1)),record('assistant',[tool('one','run_shell_command',{command:'echo ok'})],at(2))];
 expect(deriveTurnLifecycleDetails(serialized(rows),'qwen')).toEqual({lifecycle:'working',lifecycleAt:2000,activeTool:'run_shell_command'});
 rows.push({...result('one','ok'),timestamp:at(3)});
 expect(deriveTurnLifecycleDetails(serialized(rows),'qwen')).toMatchObject({lifecycle:'working',activeTool:undefined});
 rows.push(record('assistant',[{text:'Done'}],at(4)),{type:'system',timestamp:at(5),subtype:'file_history_snapshot'});
 expect(deriveTurnLifecycleDetails(serialized(rows),'qwen')).toEqual({lifecycle:'idle',lifecycleAt:4000,activeTool:undefined});
 rows.push({type:'system',timestamp:at(5),subtype:'ui_telemetry',systemPayload:{uiEvent:{kind:'request',phase:'started',subagentId:'managed-auto-memory-extractor'}}});
 expect(deriveTurnLifecycleDetails(serialized(rows),'qwen')).toMatchObject({lifecycle:'idle',lifecycleAt:4000});
 rows.push({type:'system',timestamp:at(6),subtype:'ui_telemetry',systemPayload:{uiEvent:{kind:'request',phase:'started'}}});
 expect(deriveTurnLifecycleDetails(serialized(rows),'qwen').lifecycle).toBe('working');
 rows.push({type:'system',timestamp:at(7),subtype:'ui_telemetry',systemPayload:{uiEvent:{kind:'request',phase:'ended',outcome:'error'}}});
 expect(deriveTurnLifecycleDetails(serialized(rows),'qwen')).toMatchObject({lifecycle:'idle',lifecycleAt:7000});
 expect(deriveTurnLifecycleDetails(serialized([{type:'system',subtype:'attribution_snapshot'}]),'qwen').lifecycle).toBeUndefined();
});

it('retains Qwen questions until their matching response or cancellation without inventing native answer support',()=>{
 const input={questions:[{question:'어느 범위?',options:[{label:'A'},{label:'B'}]}]};
 const rows=[record('assistant',[tool('question','ask_user_question',input)],at(2)),record('user',[{text:'시작해줘'}],at(1))];
 expect(derivePendingQuestion(serialized(rows),'qwen')).toMatchObject({id:'question',question:JSON.stringify(input)});
 rows.push({...result('other','not the answer'),timestamp:at(3)});
 expect(derivePendingQuestion(serialized(rows),'qwen')?.id).toBe('question');
 rows.push({...result('question','A'),timestamp:at(4)});expect(derivePendingQuestion(serialized(rows),'qwen')).toBeNull();
 rows.pop();rows.push({type:'system',timestamp:at(5),subtype:'ui_telemetry',systemPayload:{uiEvent:{kind:'request',phase:'ended',outcome:'cancelled'}}});
 expect(derivePendingQuestion(serialized(rows),'qwen')).toBeNull();
});

it('extracts image ordinals and rejects non-image sources',()=>{
 const row=record('user',[{text:'그림 확인'},{inlineData:{mimeType:'image/png',data:'YQ=='}},{fileData:{mimeType:'image/jpeg',fileUri:'G:/shots/two.jpg'}},{inlineData:{mimeType:'text/html',data:'YQ=='}}]);
 expect(parseChatTranscript(serialized([row]),'qwen').map(b=>b.kind)).toEqual(['text','image','image']);
 expect(transcriptImages(row,'qwen',0)).toEqual([{dataUrl:'data:image/png;base64,YQ=='}]);
 expect(transcriptImages(row,'qwen',1)).toEqual([{path:'G:/shots/two.jpg'}]);
 expect(transcriptImages(row,'qwen',2)).toEqual([]);
 expect(normalizeQwenRecord(row).message.content).toHaveLength(3);
});

it('restores only the exact agent note inside a Qwen root and never chooses a neighbouring session',()=>{
 const root=temporary(),project=path.join(root,'workspace'),qwen=path.join(root,'.qwen/projects'),id='11111111-1111-4111-8111-111111111111';
 fs.mkdirSync(project,{recursive:true});fs.mkdirSync(qwen,{recursive:true});const file=path.join(qwen,id+'.jsonl');fs.writeFileSync(file,'{}\n');
 const note={sessionId:id,transcriptPath:file,cwd:project};
 expect(ownedQwenTranscript(note,{roots:[qwen],folder:project})).toEqual({sessionId:id,path:file,tool:'qwen'});
 for(const changes of [{cwd:path.join(root,'other')},{transcriptPath:path.join(root,id+'.jsonl')},{sessionId:'other'}])expect(ownedQwenTranscript({...note,...changes},{roots:[qwen],folder:project})).toBeNull();
 expect(ownedQwenTranscript(note,{roots:[qwen],folder:project,sessionId:'22222222-2222-4222-8222-222222222222'})).toBeNull();
 const service=new SessionService(path.join(root,'state'));service.qwenRoots=()=>[qwen];expect(service.transcriptRoots('qwen')).toEqual([qwen]);
 expect(qwenTranscriptRoots({},root)).toEqual([path.join(root,'.qwen/projects')]);
 expect(qwenTranscriptRoots({QWEN_HOME:path.join(root,'config'),QWEN_RUNTIME_DIR:path.join(root,'runtime')},root)).toEqual([path.join(root,'runtime/projects')]);
});

it('ingests Qwen incrementally with older-history pages, deferred tool details and image reads',async()=>{
 const root=temporary(),source=path.join(root,'session.jsonl'),store=new ConversationStore(path.join(root,'store'));
 const input={agentId:'a',sessionId:'s',provider:'qwen',projectPath:root,transcriptPath:source};
 const rows=[record('user',[{text:'old request'}]),record('assistant',[{text:'old reply'}]),
 record('user',[{text:'image request'},{inlineData:{mimeType:'image/png',data:'YQ=='}}]),record('assistant',[tool('one','read_file',{file_path:'README.md'})]),result('one','content'),record('assistant',[{text:'new reply'}])];
 fs.writeFileSync(source,serialized(rows));
 try{
  await store.ingestTranscript(input);const page=await store.listBlocks({...input,turnLimit:1});
  expect(page.hasOlder).toBe(true);expect(page.blocks.filter(b=>b.kind==='text').map(b=>b.text)).toEqual(['image request','new reply']);
  const image=page.blocks.find(b=>b.kind==='image');expect(await store.readImages({agentId:'a',sequence:image.sequence})).toEqual([{dataUrl:'data:image/png;base64,YQ=='}]);
  const older=await store.listBlocks({...input,beforeSequence:page.firstSequence,turnLimit:1});expect(older.blocks.map(b=>b.text)).toEqual(['old request','old reply']);
  fs.appendFileSync(source,serialized([record('user',[{text:'next'}]),record('assistant',[{text:'last'}])]));await store.ingestTranscript(input);
  const delta=await store.listBlocks({...input,afterSequence:page.blocks.at(-1).sequence,turnLimit:1});expect(delta.blocks.map(b=>b.text)).toEqual(['next','last']);
  await store.ingestTranscript(input);expect((await store.listBlocks({...input,turnLimit:1})).blocks.map(b=>b.text)).toEqual(['next','last']);
 }finally{store.close();}
});
