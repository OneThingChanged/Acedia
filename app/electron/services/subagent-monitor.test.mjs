import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {listSubagents} from './subagent-monitor.mjs';
it('lists only direct children under allowed roots and refreshes changed metadata',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'worker-monitor-'));
 try{
  const entries=[];
  for(const [id,parent] of [['child','main'],['other','elsewhere'],['grandchild','child']]){
   const file=path.join(root,id+'.jsonl');await fs.writeFile(file,JSON.stringify({type:'session_meta',payload:{id,source:{subagent:{thread_spawn:{parent_thread_id:parent}}},agent_role:'docs'}})+'\n');entries.push({path:file,mtimeMs:1,size:100});
  }
  expect((await listSubagents(entries,'main',[root])).map(r=>r.sessionId)).toEqual(['child']);
  expect(await listSubagents(entries,'main',[path.join(root,'not-allowed')])).toEqual([]);
  expect(await listSubagents(entries,'',[root])).toEqual([]);
  expect((await listSubagents(entries,'child',[root]))[0].sessionId).toBe('grandchild');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
