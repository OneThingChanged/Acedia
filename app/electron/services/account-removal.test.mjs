import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderAccounts } from './provider-accounts.mjs';
import { removeProviderAccount } from './account-removal.mjs';
import { TerminalSessionService } from './terminal-session-service.mjs';

const temporary = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporary.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-account-removal-')) throw Error('Unexpected test path');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
function fixture(provider) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-account-removal-')); temporary.push(root);
  let finish;
  const kill=vi.fn();
  const accounts=new ProviderAccounts(root,provider,{baseEnv:{},startLogin:()=>({onData(){},onExit(fn){finish=fn;},kill})});
  const id=accounts.create('Work'), other=accounts.create('Other');
  const home=accounts.home(id), transcript=path.join(home,accounts.transcriptDirectory,'fixture.jsonl');
  fs.mkdirSync(path.dirname(transcript)); fs.writeFileSync(transcript,'conversation fixture');
  fs.writeFileSync(path.join(home,accounts.credentialFile),'credential fixture');
  return {accounts,id,other,root,home,transcript,kill,finish:()=>finish({exitCode:0})};
}
describe.each(['codex','claude'])('%s account removal',provider=>{
  it('renames the registered identity without moving credentials, history or an ongoing login',()=>{
    const f=fixture(provider); f.accounts.beginLogin(f.id);
    f.accounts.rename(f.id,'  Renamed  ');
    expect(f.accounts.list().find(a=>a.id===f.id)).toMatchObject({label:'Renamed',state:'pending'});
    expect(f.accounts.home(f.id)).toBe(f.home); expect(f.kill).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(f.home,f.accounts.credentialFile),'utf8')).toBe('credential fixture');
    expect(new ProviderAccounts(f.root,provider).accounts[0].label).toBe('Renamed');
    f.accounts.cancelLogin();
  });
  it('cancels pending login, persists deletion, preserves transcript attribution and rejects reuse',()=>{
    const f=fixture(provider); f.accounts.beginLogin(f.id); f.accounts.remove(f.id); f.finish();
    expect(f.kill).toHaveBeenCalledOnce();
    const restored=new ProviderAccounts(f.root,provider);
    expect(restored.list().map(a=>a.id)).toEqual(['default',f.other]);
    expect(()=>restored.environment(f.id)).toThrow();
    expect(restored.removedAccounts.map(a=>a.id)).toEqual([f.id]);
    expect(restored.accountForPath(f.transcript).id).toBe(f.id);
    expect(restored.roots()).toContain(path.dirname(f.transcript));
    expect(fs.readFileSync(f.transcript,'utf8')).toBe('conversation fixture');
    restored.create('New'); expect(new ProviderAccounts(f.root,provider).removedAccounts).toHaveLength(1);
    expect(()=>restored.remove(f.id)).not.toThrow();
  });
  it('stops only matching local sessions and invalidates pending starts before binding them to default',()=>{
    const f=fixture(provider), sessions=new TerminalSessionService(), bindings=new Map();
    const stops={};
    for(const [id,accountId] of [['active',f.id],['other',f.other]]) {
      const kill=stops[id]=vi.fn();
      sessions.register({id,aiToolId:provider,[`${provider}AccountId`]:accountId,filter:{dispose(){}},process:{onData(){},onExit(){},kill}},sessions.beginSpawn(id));
    }
    const pending=sessions.beginSpawn('starting'); bindings.set('starting',{toolId:provider,accountId:f.id});
    bindings.set('other',{toolId:provider,accountId:f.other});
    const clearSession=vi.fn();
    const ids=removeProviderAccount({provider,accountId:f.id,accounts:f.accounts,sessions,bindings,clearSession,catalog:[{id:'inactive',aiToolId:provider,[`${provider}AccountId`]:f.id},{id:'ssh',aiToolId:provider,[`${provider}AccountId`]:f.id,sshHostId:'remote'}]});
    expect(new Set(ids)).toEqual(new Set(['active','inactive','starting']));
    expect(stops.active).toHaveBeenCalledOnce(); expect(stops.other).not.toHaveBeenCalled();
    expect(sessions.has('other')).toBe(true); expect(sessions.generations.get('starting')).toBeGreaterThan(pending);
    for(const id of ids) expect(bindings.get(id)).toEqual({toolId:provider,accountId:'default',sessionId:null});
    expect(bindings.get('other').accountId).toBe(f.other);
  });
  it('rejects default/unknown IDs and invalid names and does not stop sessions on a registry write failure',()=>{
    const f=fixture(provider), close=vi.fn(), bindings=new Map([['active',{toolId:provider,accountId:f.id}]]);
    for(const id of ['default','../outside','00000000-0000-0000-0000-000000000000']) { expect(()=>f.accounts.remove(id)).toThrow(); expect(()=>f.accounts.rename(id,'Name')).toThrow(); }
    for(const name of ['', '  ', 'x'.repeat(81)]) expect(()=>f.accounts.rename(f.id,name)).toThrow();
    vi.spyOn(fs,'renameSync').mockImplementation(()=>{throw Error('fixture write failure');});
    expect(()=>f.accounts.rename(f.id,'New name')).toThrow();
    expect(()=>removeProviderAccount({provider,accountId:f.id,accounts:f.accounts,sessions:{values:()=>[],close},bindings,clearSession:vi.fn()})).toThrow();
    expect(close).not.toHaveBeenCalled(); expect(bindings.get('active').accountId).toBe(f.id);
    expect(f.accounts.list().find(a=>a.id===f.id).label).toBe('Work');
  });
});
