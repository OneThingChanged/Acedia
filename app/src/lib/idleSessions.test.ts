import { expect, it } from 'vitest';
import type { Agent } from '../types';
import { markIdleSuspended } from './idleSessions';
import { loadStoredAgents } from './persistence';
import { applyAgentHookEvent } from './agentActivity';
it('preserves account, launch options and exact conversation across suspended persistence',()=>{
  const original={id:'a',projectId:'p',name:'A',folder:'C:/fixture',aiToolId:'codex',aiLabel:'Codex',status:'running',createdAt:0,codexAccountId:'work',launchOptions:{executable:'',args:['--profile','work'],env:[]},dangerous:true} as Agent;
  const suspended=markIdleSuspended(original,'session-a');
  expect(applyAgentHookEvent(suspended,{id:'a',event:'done',session_id:'session-a'})).toBe(suspended);
  expect(suspended).toMatchObject({deferredStart:true,resumeEligible:true,runtimeStatus:'idle',codexAccountId:'work',idleResumeSessionId:'session-a',launchOptions:original.launchOptions,dangerous:true});
  const restored=loadStoredAgents([JSON.parse(JSON.stringify(suspended))],[{id:'p',folder:'C:/fixture',name:'P',createdAt:0}]);
  expect(restored[0]).toMatchObject({idleResumeSessionId:'session-a',lastSessionId:'session-a',codexAccountId:'work',launchOptions:original.launchOptions});
});
