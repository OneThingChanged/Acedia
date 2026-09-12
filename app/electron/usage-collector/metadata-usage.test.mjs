import { it, expect } from 'vitest';
import { parseUsage } from './parser.mjs';
import { validateEvent } from './protocol.mjs';
it('collects explicit skill reads and turn settings without paths or command text', () => {
 const state={provider:'codex'}, timestamp=new Date().toISOString();
 parseUsage({type:'session_meta',payload:{id:'session'}},state,0);
 parseUsage({type:'turn_context',payload:{model:'model-a',effort:'high',service_tier:'priority'}},state,1);
 parseUsage({type:'response_item',timestamp,payload:{type:'message',content:'cat /private/skills/fake/SKILL.md'}},state,2);
 parseUsage({type:'response_item',timestamp,payload:{type:'function_call',name:'exec_command',call_id:'call1',arguments:JSON.stringify({cmd:'Get-Content /private/skills/real/SKILL.md'})}},state,3);
 const token=n=>({type:'event_msg',timestamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:10,output_tokens:2,total_tokens:12},total_token_usage:{total_tokens:n}}}});
 const first=parseUsage(token(12),state,4);
 expect(first).toMatchObject({model:'model-a',effort:'high',fast:true});expect(first.skills).toHaveLength(1);expect(first.skills[0].name).toBe('real');
 expect(JSON.stringify(first)).not.toContain('/private');expect(JSON.stringify(first)).not.toContain('Get-Content');
 expect(validateEvent({...first,accountId:'account'}).skills).toHaveLength(1);
 expect(parseUsage(token(12),state,5)).toBeNull();
 parseUsage({type:'turn_context',payload:{model:'model-b'}},state,6);
 expect(parseUsage(token(24),state,7)).toMatchObject({model:'model-b',effort:null,fast:null,skills:[]});
});
