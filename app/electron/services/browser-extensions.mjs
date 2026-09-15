import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PreferencesStore } from './preferences-store.mjs';

export class BrowserExtensions {
  constructor(directory, getSession) {
    this.getSession = getSession;
    this.loaded = new Map();
    this.errors = new Map();
    this.queue = Promise.resolve();
    this.store = new PreferencesStore(path.join(directory, 'browser-extensions.json'), { revision: 0, entries: [] }, value => {
      if (!Array.isArray(value.entries) || value.entries.length > 128 || value.entries.some(e => !e || typeof e.id !== 'string' || typeof e.profileId !== 'string' || !path.isAbsolute(e.directory) || typeof e.enabled !== 'boolean')) throw new Error('Invalid extension settings');
      return value;
    });
  }
  serial(fn) { const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next; }
  async sync(profile) {
    const api = this.getSession(profile).extensions;
    const wanted = this.store.get().entries.filter(e => e.profileId === profile.id && e.enabled);
    for (const [id, loaded] of this.loaded) {
      if (loaded.profileId === profile.id && !wanted.some(e => e.id === id)) {
        api.removeExtension(loaded.extension.id); this.loaded.delete(id); this.errors.delete(id);
      }
    }
    for (const entry of wanted) {
      if (this.loaded.has(entry.id)) continue;
      try {
        const extension = await api.loadExtension(entry.directory);
        this.loaded.set(entry.id, { profileId: profile.id, extension }); this.errors.delete(entry.id);
      } catch (error) { this.errors.set(entry.id, String(error.message || error)); }
    }
    return this.store.get().entries.filter(e => e.profileId === profile.id).map(e => {
      const extension = this.loaded.get(e.id)?.extension;
      return { ...e, name: extension?.name || e.name, version: extension?.version || '', status: !e.enabled ? 'disabled' : extension ? 'loaded' : 'error', error: e.enabled ? this.errors.get(e.id) || '' : '' };
    });
  }
  list(profile) { return this.serial(() => this.sync(profile)); }
  removeProfile(profile) {
    return this.serial(async () => {
      const current = this.store.get();
      this.store.set({ entries: current.entries.filter(e => e.profileId !== profile.id) }, current.revision);
      await this.sync(profile);
    });
  }
  change(profile, action, args) {
    return this.serial(async () => {
      const current = this.store.get();
      let entries = current.entries;
      if (action === 'add') {
        if (typeof args.directory !== 'string' || !path.isAbsolute(args.directory)) throw new Error('Select an extension folder.');
        const directory = fs.realpathSync(args.directory);
        const manifestFile = path.join(directory, 'manifest.json');
        if (fs.statSync(manifestFile).size > 1024 * 1024) throw new Error('Extension manifest is too large.');
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        if (![2, 3].includes(manifest.manifest_version) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw new Error('Invalid extension manifest.');
        const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
        if (entries.some(e => e.profileId === profile.id && key(e.directory) === key(directory))) throw new Error('This extension folder is already added.');
        entries = [...entries, { id: randomUUID(), profileId: profile.id, directory, name: manifest.name, enabled: true }];
      } else {
        const entry = entries.find(e => e.id === args.id && e.profileId === profile.id);
        if (!entry) throw new Error('Extension not found. Reload the list.');
        if (action === 'remove') entries = entries.filter(e => e !== entry);
        else if (action === 'toggle' && typeof args.enabled === 'boolean') entries = entries.map(e => e === entry ? { ...e, enabled: args.enabled } : e);
        else throw new Error('Invalid extension action.');
      }
      this.store.set({ entries }, current.revision);
      return this.sync(profile);
    });
  }
}
