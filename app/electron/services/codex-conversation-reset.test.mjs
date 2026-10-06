import { afterEach, expect, it } from 'vitest';
import { CodexScrollbackFilter } from './terminal-stream.mjs';
import { confirmCodexConversationReset, codexStatusSessionId } from './codex-conversation-reset.mjs';
const before='11111111-1111-4111-8111-111111111111', after='22222222-2222-4222-8222-222222222222';
const filters=[];
afterEach(()=>filters.splice(0).forEach(f=>f.dispose()));
async function fixture(ready=true) {
 const filter=new CodexScrollbackFilter(12,100);filters.push(filter);
 const paint=async text=>{filter.push('\x1b[2J\x1b[1;1H'+text);await new Promise(r=>setTimeout(r,20));};
 await paint(ready?'› \x1b[90mAsk Codex\x1b[0m\x1b[1;3H':'› user draft\x1b[1;3H');
 let clock=0,current=true;const writes=[];
 const entry={filter,process:{write:value=>writes.push(value)}};
 return {entry,writes,paint,options:{entry,previousSessionId:before,sessionId:()=>before,isCurrent:()=>current,
   now:()=>clock,wait:async ms=>{clock+=ms;if(writes.includes('\r'))await paint(`Session: ${after}\r\n› \x1b[90mAsk Codex\x1b[0m\x1b[2;3H`);}},
   lose:()=>{current=false;} };
}
it('reads only native status rows, preferring the last complete UUID',()=>{
 expect(codexStatusSessionId(`Session: ${before}\nSession: ${after}`)).toBe(after);
 expect(codexStatusSessionId(`quoted Session: ${after}\nSession: partial`)).toBeNull();
});
it('reads the fresh session with one status command when reset emits no hook',async()=>{
 const f=await fixture();expect(await confirmCodexConversationReset(f.options)).toBe(after);
 expect(f.writes).toEqual(['/status','\r']);
});
it('uses a confirmed new hook without extra terminal input',async()=>{
 const f=await fixture();expect(await confirmCodexConversationReset({...f.options,sessionId:()=>after})).toBe(after);
 expect(f.writes).toEqual([]);
});
it('leaves an existing draft untouched and treats lost sessions as uncertain',async()=>{
 const f=await fixture(false);await expect(confirmCodexConversationReset(f.options)).rejects.toThrow('outcome unknown');expect(f.writes).toEqual([]);
 const g=await fixture();g.lose();await expect(confirmCodexConversationReset(g.options)).rejects.toThrow('outcome unknown');expect(g.writes).toEqual([]);
});
it('never accepts an old identity or repeats the status command on timeout',async()=>{
 const f=await fixture();let clock=0;
 await expect(confirmCodexConversationReset({...f.options,now:()=>clock,wait:async ms=>{clock+=ms;}})).rejects.toThrow('outcome unknown');
 expect(f.writes).toEqual(['/status','\r']);
});
