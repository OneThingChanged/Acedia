import {it,expect} from 'vitest';
import http from 'node:http';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {serveRemoteDocumentApi} from './remote-documents.mjs';
import {chatFileKind,inlineMd} from '../remote-pwa/chat-markup.js';
it('streams large video ranges and rejects invalid paths',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'acedia-video-'));const f=await fs.open(path.join(root,'demo.mp4'),'w');await f.write('0123456789');await f.truncate(31457280);await f.close();
 const server=http.createServer((req,res)=>void serveRemoteDocumentApi(req,res,new URL(req.url,'http://localhost'),{snapshot:()=>({projects:[{id:'p',folder:root}]}),previews:new Map()}).then(ok=>{if(!ok)res.writeHead(404).end();}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const url=base+'/api/files/video?projectId=p&path=demo.mp4';
 try {
 expect((await(await fetch(base+'/api/docs?projectId=p')).json()).documents[0].kind).toBe('video');
 const head=await fetch(url,{method:'HEAD'});expect(head.headers.get('content-length')).toBe('31457280');
 const part=await fetch(url,{headers:{Range:'bytes=2-5'}});expect(part.status).toBe(206);expect(await part.text()).toBe('2345');
 for(const range of ['bytes=-4','bytes=31457276-']){const r=await fetch(url,{headers:{Range:range}});expect(r.status).toBe(206);expect((await r.arrayBuffer()).byteLength).toBe(4);}
 for(const range of ['bytes=999999999-','bytes=5-2','bytes=0-1,4-5','bytes=-0'])expect((await fetch(url,{headers:{Range:range}})).status).toBe(416);
 expect((await fetch(base+'/api/files/video?projectId=p&path=../outside.mp4')).status).toBe(403);
 expect((await fetch(base+'/api/docs/read?projectId=p&path=demo.mp4')).status).toBe(415);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
});
it('links MP4 and WebM from chat',()=>{expect(chatFileKind('demo.webm')).toBe('video');expect(inlineMd('(exports/demo.mp4)',{id:'a',projectId:'p'})).toContain('data-chat-file-kind="video"');});
