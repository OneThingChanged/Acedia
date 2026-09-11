import { expect, it, vi } from 'vitest';
import { IdleSessionPolicy } from './idle-session-policy.mjs';
function fixture() {
  const settings={revision:0,enabled:true,minutes:5};
  const entry={aiToolId:'codex',startedAt:1,lastInputAt:2,lastOutputAt:3,lastViewedAt:4,subscribers:new Set()};
  const hooks=new Map([['a',{event:'done',session_id:'conversation',lastTs:10}]]), sessions=new Map([['a',entry]]);
  const suspend=vi.fn(()=>{sessions.delete('a');return true;});
  const policy=new IdleSessionPolicy({settings:{get:()=>settings},sessions,hooks,isOwner:(_id,owner)=>owner===1,isVisible:()=>false,resolve:async()=> 'conversation',suspend,now:()=>600000});
  return {settings,entry,hooks,sessions,suspend,policy};
}
it('suspends an idle completed conversation only once',async()=>{
  const f=fixture();expect(await f.policy.trySuspend('a',1)).toEqual({id:'a',sessionId:'conversation'});
  expect(await f.policy.trySuspend('a',1)).toBeNull();expect(f.suspend).toHaveBeenCalledTimes(1);
});
it.each(['disabled','working','waiting','blocked','unknown','ssh','shell','visible','subscribed','input','output','viewed','startup','old-hook','wrong-owner','missing-conversation'])("preserves %s sessions",async reason=>{
  const f=fixture();let owner=1;
  if(reason==='disabled')f.settings.enabled=false;
  if(['working','waiting','blocked','unknown'].includes(reason))f.hooks.get('a').event=reason;
  if(reason==='ssh')f.entry.ssh={host:'unknown'};
  if(reason==='shell')f.entry.aiToolId='none';
  if(reason==='visible')f.policy.isVisible=()=>true;
  if(reason==='subscribed')f.entry.subscribers.add(1);
  if(reason==='input')f.entry.lastInputAt=599999;
  if(reason==='output')f.entry.lastOutputAt=599999;
  if(reason==='viewed')f.entry.lastViewedAt=599999;
  if(reason==='startup')f.entry.initTimer=1;
  if(reason==='old-hook')f.entry.startedAt=20;
  if(reason==='wrong-owner')owner=2;
  if(reason==='missing-conversation')f.policy.resolve=async()=>null;
  expect(await f.policy.trySuspend('a',owner)).toBeNull();expect(f.suspend).not.toHaveBeenCalled();
});
it.each(['input','hook','visibility','generation','settings','owner'])('rechecks %s after asynchronous transcript validation',async reason=>{
  const f=fixture();let release;
  f.policy.resolve=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.policy.trySuspend('a',1);
  expect(await f.policy.trySuspend('a',1)).toBeNull();
  if(reason==='input')f.entry.lastInputAt=599999;
  if(reason==='hook')f.hooks.set('a',{event:'working',lastTs:599999});
  if(reason==='visibility')f.policy.isVisible=()=>true;
  if(reason==='generation')f.sessions.set('a',{...f.entry});
  if(reason==='settings')f.settings.revision++;
  if(reason==='owner')f.policy.isOwner=()=>false;
  release('conversation');expect(await pending).toBeNull();expect(f.suspend).not.toHaveBeenCalled();
});
