import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRemovedAccounts, clearAccountPins, removedAccounts, resetRemovedAccount, REMOVED_ACCOUNTS_KEY } from "./removedAccounts";
import { loadAgentDefaults, saveAgentDefaults } from "./agentDefaults";
import { LS_AGENTS, LS_GROUPS, LS_PROJECTS, type Agent, type Group } from "../types";

const id="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
function fixture() {
  const storage: Record<string, unknown> = {};
  Object.defineProperties(storage,{getItem:{value:(key:string)=>storage[key] ?? null},setItem:{value:(key:string,value:string)=>{storage[key]=value;}},removeItem:{value:(key:string)=>{delete storage[key];}}});
  vi.stubGlobal("localStorage",storage);
  return storage;
}
afterEach(()=>vi.unstubAllGlobals());
describe("deleted account references",()=>{
  it.each(["codex","claude"] as const)("resets all %s references without changing other provider/account options",provider=>{
    fixture();
    const field=`${provider}AccountId` as const, sessions=`${provider}AccountSessions` as const;
    const selected={id:'one',projectId:'p',aiToolId:provider,[field]:id,[sessions]:{[id]:'old-chat',default:'default-chat',[other]:'other-chat'},lastSessionId:'old-chat',idleResumeSessionId:'old-chat',status:'running',dangerous:true};
    const untouched={...selected,id:'two',[field]:other,[sessions]:{[other]:'other-chat'},lastSessionId:'other-chat'};
    const ssh={...selected,id:'ssh',projectId:'remote',lastSessionId:'remote-chat'};
    localStorage.setItem(LS_PROJECTS,JSON.stringify([{id:'p'},{id:'remote',sshHostId:'ssh'}]));
    localStorage.setItem(LS_AGENTS,JSON.stringify([selected,untouched,ssh]));
    localStorage.setItem('multiagent.agentDefaults.v1',JSON.stringify({[provider]:{[field]:id,dangerous:true},other:{value:42}}));
    for(const key of [LS_GROUPS,'multiagent.workspace.peer.groups.v1']) localStorage.setItem(key,JSON.stringify([{id:'g',sessionPins:{one:'old-chat',two:'other-chat'}}]));
    applyRemovedAccounts({codex:provider==='codex'?[id]:[],claude:provider==='claude'?[id]:[]});
    const [reset,kept,remote]=JSON.parse(localStorage.getItem(LS_AGENTS)!);
    expect(reset).toMatchObject({[field]:'default',deferredStart:true,resumeEligible:false,status:'idle',dangerous:true});
    expect(reset.lastSessionId).toBeUndefined(); expect(reset.idleResumeSessionId).toBeUndefined();
    expect(reset[sessions]).toEqual({default:'default-chat',[other]:'other-chat'});
    expect(kept).toEqual(untouched); expect(remote.lastSessionId).toBe('remote-chat');
    expect(loadAgentDefaults(provider)[field]).toBe('default');
    for(const key of [LS_GROUPS,'multiagent.workspace.peer.groups.v1']) expect(JSON.parse(localStorage.getItem(key)!)[0].sessionPins).toEqual({two:'other-chat'});
    const defaults=JSON.parse(localStorage.getItem('multiagent.agentDefaults.v1')!);
    expect(defaults.other).toEqual({value:42}); expect(defaults[provider].dangerous).toBe(true);
    expect(saveAgentDefaults(provider,{...loadAgentDefaults(provider),[field]:id})[field]).toBe('default');
    expect(resetRemovedAccount(selected as unknown as Agent)[field]).toBe('default'); // stale window cannot reintroduce the binding
    const once=localStorage.getItem(LS_AGENTS); applyRemovedAccounts(removedAccounts()); expect(localStorage.getItem(LS_AGENTS)).toBe(once);
  });
  it("records recovery before storage failure so a restart can finish resetting sessions",()=>{
    const storage=fixture();
    localStorage.setItem(LS_AGENTS,JSON.stringify([{id:'a',projectId:'p',aiToolId:'codex',codexAccountId:id,lastSessionId:'old'}]));
    const original=localStorage;
    vi.stubGlobal('localStorage',{getItem:original.getItem,setItem:(key:string,value:string)=>{if(key===LS_AGENTS)throw Error('full');original.setItem(key,value);}});
    expect(()=>applyRemovedAccounts({codex:[id],claude:[]})).toThrow('full');
    expect(JSON.parse(storage[REMOVED_ACCOUNTS_KEY] as string).codex).toEqual([id]);
    vi.stubGlobal('localStorage',original); applyRemovedAccounts(removedAccounts());
    expect(JSON.parse(localStorage.getItem(LS_AGENTS)!)[0].codexAccountId).toBe('default');
  });
  it("clears affected group pins without changing layout or unrelated pins",()=>{
    const group={id:'g',name:'Group',layout:{type:'leaf'},sessionPins:{a:'old',b:'keep'}} as unknown as Group;
    const [next]=clearAccountPins([group],new Set(['a']));
    expect(next.layout).toBe(group.layout); expect(next.sessionPins).toEqual({b:'keep'});
  });
  it("keeps known removals when a later registry read is incomplete and tolerates damaged optional preferences",()=>{
    fixture();
    applyRemovedAccounts({codex:[id],claude:[]});
    localStorage.setItem(LS_GROUPS,'invalid JSON'); localStorage.setItem('multiagent.agentDefaults.v1','invalid JSON');
    expect(()=>applyRemovedAccounts({codex:[],claude:[]})).not.toThrow();
    expect(removedAccounts().codex).toEqual([id]);
    expect(localStorage.getItem(LS_GROUPS)).toBe('invalid JSON');
  });
  it("preserves a session and its group pin when only an unused provider field references the removed account",()=>{
    fixture();
    localStorage.setItem(LS_AGENTS,JSON.stringify([{id:'a',aiToolId:'claude',claudeAccountId:other,codexAccountId:id,lastSessionId:'claude-chat'}]));
    localStorage.setItem(LS_GROUPS,JSON.stringify([{id:'g',sessionPins:{a:'claude-chat'}}]));
    expect(applyRemovedAccounts({codex:[id],claude:[]}).size).toBe(0);
    expect(JSON.parse(localStorage.getItem(LS_AGENTS)!)[0].lastSessionId).toBe('claude-chat');
    expect(JSON.parse(localStorage.getItem(LS_GROUPS)!)[0].sessionPins.a).toBe('claude-chat');
  });
});
