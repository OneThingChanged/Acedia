import { afterEach, expect, it } from 'vitest';
import { firstMessageSession, noteFirstMessageInput } from './session-first-message.mjs';
import { CodexScrollbackFilter } from './terminal-stream.mjs';

const filters=[];
afterEach(()=>{for(const f of filters.splice(0)) f.dispose();});
async function fixture() {
  const filter=new CodexScrollbackFilter(20,100);filters.push(filter);
  const entry={aiToolId:'codex',startedAt:100,filter};
  const state={entry,agent:{id:'fresh'},conversationId:null,hook:null};
  const screen=async value=>{filter.push('\x1b[2J\x1b[H'+value);await new Promise(resolve=>setTimeout(resolve,20));};
  const empty='› \x1b[90mAsk Codex to do anything\x1b[0m\x1b[1;3H';
  await screen(empty);
  return {entry,state,screen,empty,read:()=>firstMessageSession(state)};
}
it('identifies a pristine native launch before its conversation ID exists, and after its own SessionStart',async()=>{
  const f=await fixture();expect(f.read()).toMatchObject({sessionId:null,turn:null,lifecycle:'idle'});
  f.state.conversationId='first';expect(f.read()).toBe(null);
  f.state.hook={event:'session-start',session_id:'first',lastTs:100};
  f.state.agent.lastSessionId='first';expect(f.read()?.sessionId).toBe('first');
  f.state.hook.lastTs=99;expect(f.read()).toBe(null);
});
it('never treats resumed, previously typed, already submitted, SSH or unknown launches as a first message',async()=>{
  for(const patch of [{resumeContext:{sessionId:'old'}},{firstMessageSubmitted:true},{ssh:{}},{aiToolId:'claude'},{startedAt:undefined}]) {
    const f=await fixture();Object.assign(f.entry,patch);expect(f.read()).toBe(null);
  }
  const f=await fixture();noteFirstMessageInput(f.entry,'draft');noteFirstMessageInput(f.entry,'\x7f');
  await f.screen(f.empty);expect(f.read()).toBe(null);
  const g=await fixture();g.state.agent.lastSessionId='old';expect(g.read()).toBe(null);
  g.state.agent=null;expect(g.read()).toBe(null);
});
it('observes manual startup dialog choices without confusing them with chat input or approving anything',async()=>{
  const f=await fixture();
  await f.screen('Folder access\r\nC:/fixture\r\nTrust this folder?\r\n› 1. Trust and continue\r\n  2. Quit\r\nenter continue · esc quit');
  expect(f.read()).toBe(null);noteFirstMessageInput(f.entry,'\r');
  expect(f.entry.firstMessageInput).toBeUndefined();await f.screen(f.empty);expect(f.read()).not.toBe(null);
  noteFirstMessageInput(f.entry,'typed');
  await f.screen('Hooks need review\r\nHooks can run outside the sandbox after you trust them.\r\n› 1. Review hooks\r\n2. Trust all and continue\r\n3. Continue without trusting (hooks won\'t run)\r\nenter confirm · esc skip');
  noteFirstMessageInput(f.entry,'\r');await f.screen(f.empty);expect(f.read()).toBe(null);
});
it('rejects existing drafts and working composers even on a fresh process',async()=>{
  const f=await fixture();await f.screen('› draft\x1b[1;3H');expect(f.read()).toBe(null);
  await f.screen('› \x1b[2;1Hesc to interrupt\x1b[1;3H');expect(f.read()).toBe(null);
});
it('does not mistake real xterm cursor/device reports for the first user input',async()=>{
  const f=await fixture(),replies=[];
  const listener=f.entry.filter.shadow.onData(value=>{replies.push(value);noteFirstMessageInput(f.entry,value);});
  try{
    f.entry.filter.push('\x1b[6n\x1b[c\x1b[>c');await new Promise(resolve=>setTimeout(resolve,30));
    expect(replies.length).toBeGreaterThan(0);expect(f.entry.firstMessageInput).toBeUndefined();expect(f.read()).not.toBe(null);
    noteFirstMessageInput(f.entry,'\x1b[I\x1b[O');expect(f.read()).not.toBe(null);
    noteFirstMessageInput(f.entry,'\x1b[1;1Ractual draft');expect(f.read()).toBe(null);
  }finally{listener.dispose();}
});
it('marks a pasted chat body as input even if it arrives at a startup menu',async()=>{
  const f=await fixture();await f.screen('Folder access\r\nC:/fixture\r\nTrust this folder?\r\n› 1. Trust and continue\r\n  2. Quit\r\nenter continue · esc quit');
  noteFirstMessageInput(f.entry,'1\ractual chat\r');await f.screen(f.empty);expect(f.read()).toBe(null);
});
