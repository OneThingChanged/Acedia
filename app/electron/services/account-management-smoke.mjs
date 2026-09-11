import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
export async function verifyAccountManagement(window, { ptys, stores, bindings }) {
  const call = (command,args={}) => window.webContents.executeJavaScript('window.multiAgentElectron.invoke('+JSON.stringify(command)+','+JSON.stringify(args)+')');
  const ids = [];
  for (const provider of ['codex','claude']) {
    const store=stores[provider], account=await call(provider+'_accounts_create',{label:'Removal fixture'});
    const other=await call(provider+'_accounts_create',{label:'Other fixture'});
    const home=store.home(account);
    fs.writeFileSync(path.join(home,store.credentialFile),'fixture credential');
    const transcript=path.join(home,store.transcriptDirectory,'fixture.jsonl');
    fs.mkdirSync(path.dirname(transcript),{recursive:true}); fs.writeFileSync(transcript,'fixture conversation');
    const affected=[];
    try {
      for(const accountId of [account,account,other]) {
        const id=randomUUID(); ids.push(id);
        await call('spawn_pty',{id,shell:'powershell.exe',cwd:os.tmpdir(),aiToolId:'none',initCommand:null,cols:80,rows:24});
        Object.assign(ptys.get(id),{aiToolId:provider,[`${provider}AccountId`]:accountId});
        if(accountId===account) affected.push(id);
      }
      await call(provider+'_accounts_rename',{accountId:account,label:'Renamed fixture'});
      assert.equal((await call(provider+'_accounts_list')).find(a=>a.id===account).label,'Renamed fixture');
      assert.ok(affected.every(id=>ptys.has(id)));
      const result=await call(provider+'_accounts_remove',{accountId:account});
      assert.deepEqual(new Set(result.agentIds),new Set(affected));
      assert.ok(affected.every(id=>!ptys.has(id)));
      assert.ok(ptys.has(ids.at(-1)));
      assert.ok(result.removed[provider].includes(account));
      assert.ok(!(await call(provider+'_accounts_list')).some(a=>a.id===account));
      for(const id of affected) assert.deepEqual(bindings.get(id),{toolId:provider,accountId:'default',sessionId:null});
      assert.equal(fs.readFileSync(transcript,'utf8'),'fixture conversation');
      assert.equal(fs.readFileSync(path.join(home,store.credentialFile),'utf8'),'fixture credential');
      console.log('ACCOUNT_MANAGEMENT_NATIVE_OK '+provider);
    } finally {
      for(const id of ids) if(ptys.has(id)) await call('kill_pty',{id});
    }
  }
}
