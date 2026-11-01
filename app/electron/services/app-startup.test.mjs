import { expect, it, vi } from 'vitest';
import { RemoteAppStartup, WindowsLoginStartup } from './app-startup.mjs';

function loginFixture(patch={}) {
  let native={openAtLogin:false,executableWillLaunchAtLogin:false,launchItems:[]};
  const app={isPackaged:true,getLoginItemSettings:vi.fn(()=>native),setLoginItemSettings:vi.fn(value=>{
    native={openAtLogin:value.openAtLogin,executableWillLaunchAtLogin:value.openAtLogin,launchItems:[{name:value.name,enabled:value.enabled}]};
  })};
  const options={app,platform:'win32',executable:'C:/Program Files/Acedia/Acedia.exe',variant:{id:'standard',appUserModelId:'com.jintae.multiagent.electron'},...patch};
  return {app,service:new WindowsLoginStartup(options),native:value=>{native=value;}};
}
it('reads the actual Windows entry without registering, and applies only explicit user choices',()=>{
  const f=loginFixture();expect(f.service.read()).toMatchObject({enabled:false,supported:true});expect(f.app.setLoginItemSettings).not.toHaveBeenCalled();
  expect(f.service.set(true)).toMatchObject({enabled:true,registered:true});
  expect(f.app.setLoginItemSettings).toHaveBeenCalledWith({openAtLogin:true,enabled:true,path:'C:/Program Files/Acedia/Acedia.exe',args:[],name:'com.jintae.multiagent.electron'});
  expect(f.app.getLoginItemSettings).toHaveBeenCalledWith({path:'C:/Program Files/Acedia/Acedia.exe',args:[]});
  expect(f.service.set(false)).toMatchObject({enabled:false,registered:false});
});
it('reflects Windows-disabled startup without re-enabling it or modifying another channel',()=>{
  const f=loginFixture();f.native({openAtLogin:true,executableWillLaunchAtLogin:false,launchItems:[{name:'com.jintae.multiagent.electron',enabled:false}]});
  expect(f.service.read()).toMatchObject({enabled:false,registered:true,windowsDisabled:true});expect(f.app.setLoginItemSettings).not.toHaveBeenCalled();
  expect(f.service.set(true).enabled).toBe(true);
  const company=loginFixture({variant:{id:'company',appUserModelId:'com.jintae.multiagent.company.electron'}});company.service.set(true);
  expect(company.app.setLoginItemSettings.mock.calls[0][0].name).toContain('.company.');
});
it.each([{platform:'linux'},{isolated:true},{windowsStore:true},{app:{isPackaged:false}},{variant:{id:'store'}}])('does not register unsupported/development profiles %#',patch=>{
  const f=loginFixture(patch);expect(f.service.read().supported).toBe(false);expect(()=>f.service.set(true)).toThrow();expect(f.app.setLoginItemSettings).not.toHaveBeenCalled();
});
it('reports OS errors and readback failures instead of claiming an unsaved toggle worked',()=>{
  const f=loginFixture();f.app.setLoginItemSettings.mockImplementation(()=>{});expect(()=>f.service.set(true)).toThrow('did not apply');
  f.app.setLoginItemSettings.mockImplementation(()=>{throw Error('registry unavailable');});expect(()=>f.service.set(true)).toThrow('registry unavailable');
  expect(()=>f.service.set('yes')).toThrow();
});
function remoteFixture(config={auto_start:true}) {
  if(config.auto_start_tunnel)config={tunnel_token:'fake-token',public_hostname:'fixture.example.com',server_port:18800,...config};
  const options={enabled:true,config:()=>config,validate:vi.fn(),startServer:vi.fn(async()=>{}),startTunnel:vi.fn(async()=>{})};
  return {options,config,service:new RemoteAppStartup(options)};
}
it('defaults to no network start and respects channel/smoke gates',async()=>{
  const f=remoteFixture({});await f.service.run();expect(f.options.startServer).not.toHaveBeenCalled();
  const g=remoteFixture();g.service.enabled=false;await g.service.run();expect(g.options.startServer).not.toHaveBeenCalled();
});
it('starts Remote once without implicitly creating a quick tunnel; saved named tunnel is an independent choice',async()=>{
  const f=remoteFixture();await Promise.all([f.service.run(),f.service.run()]);expect(f.options.startServer).toHaveBeenCalledTimes(1);expect(f.options.startTunnel).not.toHaveBeenCalled();
  expect(f.service.status()).toEqual({phase:'started',error:null});
  const g=remoteFixture({auto_start:true,auto_start_tunnel:true});await g.service.run();expect(g.options.startTunnel).toHaveBeenCalledTimes(1);
  expect(g.options.startServer.mock.invocationCallOrder[0]).toBeLessThan(g.options.startTunnel.mock.invocationCallOrder[0]);
});
it('leaves failures visible without leaking credentials or retrying automatically',async()=>{
  const f=remoteFixture();f.options.validate.mockImplementation(()=>{throw Error('secret token');});
  await f.service.run();expect(f.options.startServer).not.toHaveBeenCalled();expect(f.service.status().phase).toBe('failed');expect(f.service.status().error).not.toContain('secret token');
  await f.service.run();expect(f.options.validate).toHaveBeenCalledTimes(1);f.service.clear();expect(f.service.status().error).toBe(null);
  const g=remoteFixture({auto_start:true,auto_start_tunnel:true});g.options.startTunnel.mockRejectedValue(Error('offline'));await g.service.run();expect(g.service.status().phase).toBe('failed');
});
it('shows startup progress without blocking its caller and skips automatic tunnel after manual stop',async()=>{
  const f=remoteFixture({auto_start:true,auto_start_tunnel:true});let done;f.options.startServer.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));
  const pending=f.service.run();expect(f.service.status().phase).toBe('starting');f.service.cancel();done();await pending;
  expect(f.options.startTunnel).not.toHaveBeenCalled();expect(f.service.status()).toEqual({phase:'idle',error:null});
});
it('never starts a public quick tunnel from a malformed persisted startup configuration',async()=>{
  const f=remoteFixture({auto_start:true,auto_start_tunnel:true,tunnel_token:''});await f.service.run();
  expect(f.options.startServer).toHaveBeenCalledTimes(1);expect(f.options.startTunnel).not.toHaveBeenCalled();expect(f.service.status().phase).toBe('failed');
});
