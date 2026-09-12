import fs from 'node:fs/promises';
import path from 'node:path';
const metadataCache = new Map();
export async function listSubagents(entries, parentId, roots) {
  if (!parentId) return [];
  const allowed = await Promise.all(roots.map(r=>fs.realpath(r).catch(()=>null)));
  const result=[];
  for(const entry of entries) {
    try {
      const file=await fs.realpath(entry.path);
      if(!allowed.some(r=>r && !path.relative(r,file).startsWith('..') && !path.isAbsolute(path.relative(r,file))))continue;
      let cached=metadataCache.get(file);
      if(cached?.mtimeMs===entry.mtimeMs && cached.size===entry.size) {if(cached.value?.parentSessionId===parentId)result.push(cached.value);continue;}
      const handle=await fs.open(file,'r');let text;
      try {const buffer=Buffer.alloc(65536);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);text=buffer.subarray(0,bytesRead).toString('utf8');}finally{await handle.close();}
      const line=text.split('\n').find(l=>{try{return JSON.parse(l).type==='session_meta';}catch{return false;}});
      if(!line)continue;const meta=JSON.parse(line).payload, spawn=meta?.source?.subagent?.thread_spawn;
      const value=spawn?.parent_thread_id ? {sessionId:meta.id,parentSessionId:spawn.parent_thread_id,name:meta.agent_role || meta.agent_nickname || spawn.agent_path || meta.id,path:file,updatedAt:entry.mtimeMs} : null;
      if(value) {
        const h=await fs.open(file,'r');try {
          const stat=await h.stat(),buffer=Buffer.alloc(Math.min(stat.size,65536));
          const {bytesRead}=await h.read(buffer,0,buffer.length,Math.max(0,stat.size-buffer.length));
          for(const line of buffer.subarray(0,bytesRead).toString('utf8').split('\n'))try {
            const item=JSON.parse(line);
            if(item.type==='turn_context'){value.model=item.payload?.model||null;value.effort=item.payload?.effort||item.payload?.reasoning_effort||null;}
            if(item.type==='event_msg'&&['task_started','task_complete','turn_aborted'].includes(item.payload?.type))value.activity=item.payload.type;
          }catch{}
        }finally{await h.close();}
      }
      if(metadataCache.size>10000)metadataCache.clear();
      metadataCache.set(file,{mtimeMs:entry.mtimeMs,size:entry.size,value});
      if(value?.parentSessionId===parentId)result.push(value);
    }catch{}
  }
  return result.sort((a,b)=>b.updatedAt-a.updatedAt);
}
