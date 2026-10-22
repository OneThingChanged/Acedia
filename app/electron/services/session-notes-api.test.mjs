import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionNotes } from './session-notes.mjs';
import { LocalDashboardService, RemoteDashboardService } from './web-services.mjs';
const roots=[],services=[],stores=[];
afterEach(async()=>{
  await Promise.all(services.splice(0).map(service=>service.stop()));for(const store of stores.splice(0))store.close();
  for(const directory of roots.splice(0)){if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('acedia-notes-api-'))throw Error('Unexpected cleanup target');fs.rmSync(directory,{recursive:true});}
});
describe.each(['remote','dashboard'])('%s session notes',kind=>{
  it('shares durable notes for offline sessions, rejects unauthorized/stale writes, and never includes them in state polling',async()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-notes-api-'));roots.push(directory);
    const notes=new SessionNotes(directory);stores.push(notes);
    const providers={sessionNotes:{read:id=>notes.read(id),save:body=>notes.save(body)}};
    const stateProvider=()=>({agents:[{id:'offline',name:'Offline',runtimeStatus:'offline'}],view:{agents:[{id:'offline'}]}});
    const service=kind==='remote'?new RemoteDashboardService({baseDir:directory,stateProvider,...providers}):new LocalDashboardService({baseDir:directory,configName:'fixture.json',title:'Fixture',defaultPort:0,stateProvider,providers});
    if(kind==='remote')service.config.server_port=0;services.push(service);const {url}=await service.start();
    const post=(body,origin=url,type='application/json')=>fetch(url+'/api/session/notes',{method:'POST',headers:{origin,'content-type':type},body:JSON.stringify(body)});
    expect((await fetch(url+'/api/session/notes?id=offline').then(response=>response.json())).text).toBe('');
    const body={id:'offline',text:'사람만 참고할 메모\n  공백 보존',revision:0};
    expect((await post(body,'https://other.invalid')).status).toBe(403);
    expect((await post(body,url,'text/plain')).status).toBe(415);
    expect((await post({...body,id:'other'})).status).toBe(404);
    expect((await post({...body,text:'가'.repeat(22000)})).status).toBe(400);
    expect((await post({...body,text:'x'.repeat(410*1024)})).status).toBe(413);
    expect((await post(body)).status).toBe(200);
    expect((await post({...body,text:'stale'})).status).toBe(409);
    expect(await fetch(url+'/api/session/notes?id=offline&revision=1').then(response=>response.json())).toEqual({unchanged:true});
    expect((await fetch(url+'/api/session/notes?id=offline').then(response=>response.json())).text).toBe(body.text);
    expect(JSON.stringify(await fetch(url+'/api/state').then(response=>response.json()))).not.toContain(body.text);
    expect((await fetch(url+'/api/session/notes?id=other')).status).toBe(404);
    for(const asset of ['session-notes.js','session-notes.css','session-notes-client.js'])expect((await fetch(url+'/pwa/'+asset)).status).toBe(200);
    if(kind==='remote')expect((await fetch(url+'/api/session/notes?id=offline',{headers:{'cf-connecting-ip':'203.0.113.3'}})).status).toBe(401);
  });
});
