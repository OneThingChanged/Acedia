import http from 'node:http';
import { expect, it } from 'vitest';
import { sessionWebServers } from './session-web-servers.mjs';
it('finds responding session/project servers, deduplicates and excludes unrelated/app ports', async () => {
 const server = http.createServer((req,res)=>res.writeHead(404).end());
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const base={port:server.address().port,connect_host:'127.0.0.1',process_name:'node',own_app:false};
  expect(await sessionWebServers([{...base,terminal_id:'other'}],'session','project')).toEqual([]);
  expect(await sessionWebServers([{...base,terminal_id:'session',own_app:true}],'session','project')).toEqual([]);
  const result=await sessionWebServers([{...base,terminal_id:'session'},{...base,project_id:'project'}],'session','project');
  expect(result).toHaveLength(1);expect(result[0].url).toBe(`http://127.0.0.1:${base.port}/`);
 } finally { await new Promise(r=>server.close(r)); }
});
