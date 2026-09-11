import type { Agent } from '../types';
export function markIdleSuspended(agent: Agent, sessionId: string): Agent {
  return {...agent,lastSessionId:sessionId,idleResumeSessionId:sessionId,status:'idle',runtimeStatus:'idle',deferredStart:true,resumeEligible:true,activity:undefined};
}
