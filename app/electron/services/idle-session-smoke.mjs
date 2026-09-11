import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function verifyIdleSessions(window,{ptys,hooks,transcripts,accounts}) {
  const call=(command,args={})=>window.webContents.executeJavaScript('window.multiAgentElectron.invoke('+JSON.stringify(command)+','+JSON.stringify(args)+')');
  const original=await call('idle_preferences_get'), id=randomUUID(), sid=randomUUID();
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-idle-smoke-'));
  const account=accounts.create('Idle fixture'), transcript=path.join(accounts.home(account),'sessions',sid+'.jsonl');
  fs.mkdirSync(path.dirname(transcript),{recursive:true});
  fs.writeFileSync(transcript,JSON.stringify({type:'session_meta',payload:{id:sid,cwd:folder}}));
  try {
    await call('spawn_pty',{id,shell:'powershell.exe',cwd:folder,aiToolId:'none',initCommand:null,cols:80,rows:24});
    await new Promise(resolve=>setTimeout(resolve,900));
    const entry=ptys.get(id), old=Date.now()-600000;
    Object.assign(entry,{aiToolId:'codex',codexAccountId:account,startedAt:old-1000,lastInputAt:old,lastOutputAt:old,lastViewedAt:old});
    hooks.set(id,{id,event:'done',session_id:sid,lastTs:old});transcripts.set(id,transcript);
    await call('idle_preferences_set',{revision:original.revision,patch:{enabled:true,minutes:5}});
    await call('idle_view_update',{ids:[id]});
    assert.equal(await call('idle_session_suspend',{id}),null);assert.ok(ptys.has(id));
    await call('idle_view_update',{ids:[]});
    assert.deepEqual(await call('idle_session_suspend',{id}),{id,sessionId:sid});assert.equal(ptys.has(id),false);
    const resume={aiToolId:'codex',folder,preferredSessionId:sid,codexAccountId:account,agentId:id,strictExact:true};
    assert.equal(await call('resolve_cli_session',resume),sid);
    fs.rmSync(transcript);
    assert.equal(await call('resolve_cli_session',resume),null);
    console.log('IDLE_NATIVE_SUSPEND_AND_EXACT_RECOVERY_OK');
  } finally {
    if(ptys.has(id))await call('kill_pty',{id});
    hooks.delete(id);transcripts.delete(id);
    const current=await call('idle_preferences_get');await call('idle_preferences_set',{revision:current.revision,patch:original});
    await new Promise(resolve=>setTimeout(resolve,350));
    if(path.dirname(folder)!==path.resolve(os.tmpdir()) || !path.basename(folder).startsWith('acedia-idle-smoke-'))throw Error('Unexpected cleanup directory');
    try{fs.rmSync(folder,{recursive:true,force:true});}catch{console.warn('Idle fixture cleanup deferred.');}
  }
}
