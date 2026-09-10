import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sharedProfileRoot, initializeSharedProfile, discoverLegacyProfiles, acquireSharedProfileLease } from './shared-profile.mjs';

const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const projectKey = 'multiagent.projects.v1';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-shared-test-'));
function seed(base, id, name, time) {
  const c = { id, profile: path.join(base, id, 'profile'), local: path.join(base, id, 'local') };
  write(path.join(c.profile, 'Preferences'), { theme: name });
  const snapshot = path.join(c.local, 'storage-export.json');
  write(snapshot, { version: 2, values: { [projectKey]: JSON.stringify([{ id, name }, { id: 'same', name }]) } });
  for (const f of [snapshot, path.join(c.profile, 'Preferences')]) fs.utimesSync(f, time, time);
  return c;
}
describe('EXE/Store shared profile', () => {
  it('shares production data but isolates Company and explicit development/smoke profiles', () => {
    const home = path.resolve('home');
    const standard = sharedProfileRoot({ home, variant: 'standard' });
    expect(sharedProfileRoot({ home, variant: 'store' })).toBe(standard);
    expect(standard).not.toContain('AppData');
    expect(sharedProfileRoot({ home, variant: 'company' })).toBeNull();
    expect(sharedProfileRoot({ home, variant: 'store', userDataOverride: 'test' })).toBeNull();
    expect(sharedProfileRoot({ home, variant: 'standard', localDataOverride: 'test' })).toBeNull();
  });
  it('migrates once, unions catalogs, retains secondary settings and leaves originals untouched', () => {
    const base = temp();
    try {
      const a = seed(base, 'exe', 'older', 1000), b = seed(base, 'store', 'newer', 2000);
      const original = fs.readFileSync(path.join(a.local, 'storage-export.json'), 'utf8');
      const root = path.join(base, 'shared');
      expect(initializeSharedProfile(root, [a, b])).toEqual({ migrated: true, secondaryCount: 1 });
      expect(read(path.join(root, 'profile', 'Preferences')).theme).toBe('newer');
      const snapshot = read(path.join(root, 'local', 'storage-export.json'));
      expect(snapshot.version).toBe(1);
      expect(JSON.parse(snapshot.values[projectKey])).toEqual([{ id: 'exe', name: 'older' }, { id: 'same', name: 'newer' }, { id: 'store', name: 'newer' }]);
      expect(read(path.join(root, 'legacy', 'exe', 'profile', 'Preferences')).theme).toBe('older');
      expect(fs.readFileSync(path.join(a.local, 'storage-export.json'), 'utf8')).toBe(original);
      write(path.join(root, 'local', 'storage-export.json'), { deleted: true });
      expect(initializeSharedProfile(root, [a, b])).toEqual({ migrated: false });
      expect(read(path.join(root, 'local', 'storage-export.json'))).toEqual({ deleted: true });
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
  it('preserves both account homes and rewrites an archive pointer into the new shared local directory', () => {
    const base = temp();
    try {
      const a = seed(base, 'exe', 'a', 1000), b = seed(base, 'store', 'b', 2000);
      for (const [c, id] of [[a,'00000000-0000-0000-0000-000000000001'],[b,'00000000-0000-0000-0000-000000000002']]) {
        write(path.join(c.profile, 'codex-accounts', 'accounts.json'), [{ id, label: c.id }]);
        write(path.join(c.profile, 'codex-accounts', id, '.codex', 'config.json'), { test: true });
      }
      fs.mkdirSync(path.join(b.local, 'archive'));
      write(path.join(b.profile, 'conversation-store-config.json'), { version: 1, customRoot: path.join(b.local, 'archive') });
      write(path.join(b.profile, 'session-storage-catalog.json'), { obsolete: true });
      const root = path.join(base, 'shared');
      initializeSharedProfile(root, [a,b]);
      const accounts = read(path.join(root, 'profile', 'codex-accounts', 'accounts.json'));
      expect(accounts).toHaveLength(2);
      for (const a of accounts) expect(fs.existsSync(path.join(root, 'profile', 'codex-accounts', a.id, '.codex', 'config.json'))).toBe(true);
      expect(read(path.join(root, 'profile', 'conversation-store-config.json')).customRoot).toBe(path.join(root,'local','archive'));
      expect(fs.existsSync(path.join(root, 'profile', 'session-storage-catalog.json'))).toBe(false);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
  it('does not activate a partial migration when source JSON is damaged', () => {
    const base = temp();
    try {
      const c = seed(base, 'exe', 'old', 1000), root = path.join(base,'shared');
      fs.writeFileSync(path.join(c.local,'storage-export.json'), '{broken');
      expect(() => initializeSharedProfile(root, [c])).toThrow('공유 데이터 이전 실패');
      expect(fs.existsSync(root)).toBe(false);
      expect(fs.readFileSync(path.join(c.local,'storage-export.json'),'utf8')).toBe('{broken');
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
  it('discovers Store physical LocalCache separately from EXE data', () => {
    const base = temp();
    try {
      const roaming = path.join(base,'Roaming'), local = path.join(base,'Local');
      fs.mkdirSync(path.join(roaming,'MultiAgent'), { recursive: true });
      fs.mkdirSync(path.join(local,'Packages','test-package','LocalCache','Roaming','MultiAgent Store'), { recursive: true });
      expect(discoverLegacyProfiles({roaming,local})).toHaveLength(2);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
  it('rejects a corrupt copied database before activating the shared root', () => {
    const base = temp();
    try {
      const c = seed(base, 'exe', 'old', 1000), root = path.join(base,'shared');
      fs.writeFileSync(path.join(c.local,'usage.db'), 'not a sqlite database');
      expect(() => initializeSharedProfile(root, [c])).toThrow('공유 데이터 이전 실패');
      expect(fs.existsSync(root)).toBe(false);
      expect(fs.readFileSync(path.join(c.local,'usage.db'),'utf8')).toBe('not a sqlite database');
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
  });
  it('blocks a second channel until the first exits and notifies the active app', async () => {
    const base = temp(), root = path.join(base,'shared');
    let first, next, activations = 0;
    try {
      first = await acquireSharedProfileLease(root, () => activations++);
      expect(await acquireSharedProfileLease(root)).toBeNull();
      expect(activations).toBe(1);
      await new Promise(resolve => first.close(resolve)); first = null;
      next = await acquireSharedProfileLease(root);
      expect(next).toBeTruthy();
    } finally {
      if (first) await new Promise(resolve => first.close(resolve));
      if (next) await new Promise(resolve => next.close(resolve));
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
