import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GithubExeUpdateService, selectExeRelease, validateExeManifest } from './github-exe-update.mjs';
const makeRelease = (v='1.8.0.3') => ({ tag_name:`v${v}`, draft:false, prerelease:false, assets:[
  { name:'latest-exe.json', browser_download_url:`https://github.com/OneThingChanged/Multiagent/releases/download/v${v}/latest-exe.json` },
  { name:`Acedia-Setup-${v}-x64.exe`, size:3, browser_download_url:`https://github.com/OneThingChanged/Multiagent/releases/download/v${v}/Acedia-Setup-${v}-x64.exe` },
] });
const manifest = () => ({schemaVersion:1, channel:'exe', version:'1.8.0.3', fileName:'Acedia-Setup-1.8.0.3-x64.exe', size:3, sha256:createHash('sha256').update('exe').digest('hex')});
describe('GitHub EXE updates', () => {
  it('compares fourth version component, ignores drafts, prereleases and other channels', () => {
    expect(selectExeRelease([makeRelease('1.8.0.3'),makeRelease('1.8.0.12')],'1.8.0.2').tag_name).toBe('v1.8.0.12');
    expect(selectExeRelease([{...makeRelease(),draft:true},{...makeRelease(),prerelease:true},{...makeRelease('1.9.0.0'),assets:[]}],'1.8.0.2')).toBeNull();
    expect(selectExeRelease([makeRelease()],'1.8.0.3')).toBeNull();
  });
  it('rejects cross-repository URLs, mismatched filenames/versions and invalid digests', () => {
    expect(validateExeManifest(manifest(),makeRelease()).version).toBe('1.8.0.3');
    for (const patch of [{channel:'store'},{version:'1.8.0.4'},{fileName:'../evil.exe'},{sha256:'bad'},{size:4}]) {
      expect(()=>validateExeManifest({...manifest(),...patch},makeRelease())).toThrow();
    }
    const release=makeRelease();release.assets[1].browser_download_url='https://example.com/evil.exe';
    expect(()=>validateExeManifest(manifest(),release)).toThrow();
  });
  it('checks release, downloads verified bytes and rejects modification before install', async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-exe-test-'));
    try {
      const service=new GithubExeUpdateService({currentVersion:'1.8.0.2',cacheDir:dir,fetchImpl:async url=>
        new Response(url.includes('api.github.com')?JSON.stringify([makeRelease()]):url.endsWith('.json')?JSON.stringify(manifest()):'exe')});
      expect((await service.check()).version).toBe('1.8.0.3');
      const events=[]; const result=await service.download(e=>events.push(e.event));
      expect(events).toEqual(['Started','Progress','Finished']);
      expect(service.validatedInstaller()).toBe(result.path);
      fs.writeFileSync(result.path,'bad');expect(()=>service.validatedInstaller()).toThrow();
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });
  it('does not leave an installable file after a corrupt download', async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'acedia-exe-corrupt-'));
    try {
      const service=new GithubExeUpdateService({currentVersion:'1.8.0.2',cacheDir:dir,fetchImpl:async()=>new Response('bad')});
      service.available={...manifest(),url:'https://github.com/test'};
      await expect(service.download()).rejects.toThrow(/SHA-256/);
      expect(service.prepared).toBeNull();expect(fs.readdirSync(dir)).toEqual([]);
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
  });
});
