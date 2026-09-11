import path from 'node:path';
import { PreferencesStore } from './preferences-store.mjs';
export const DEFAULT_BROWSER_PROFILE = 'multiagent-browser';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateProfiles(profiles, defaultProfile) {
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 32) throw new Error('Use 1–32 browser profiles.');
  const ids = new Set();
  const result = profiles.map(p => {
    if (!p || (p.id !== DEFAULT_BROWSER_PROFILE && !uuid.test(p.id)) || ids.has(p.id) || typeof p.label !== 'string' || !p.label.trim() || p.label.trim().length > 60) throw new Error('Invalid browser profile.');
    ids.add(p.id); return { id: p.id, label: p.label.trim() };
  });
  if (!ids.has(DEFAULT_BROWSER_PROFILE) || !ids.has(defaultProfile)) throw new Error('The default browser profile must exist.');
  return result;
}
export function browserProfile(settings, id = settings.defaultProfile) {
  const profile = settings.profiles.find(p => p.id === id);
  if (!profile) throw new Error('Browser profile not found.');
  return { ...profile, partition: id === DEFAULT_BROWSER_PROFILE ? 'persist:multiagent-browser' : 'persist:multiagent-browser-' + id };
}
export function restorableBrowserUrl(raw) {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 8192 || /\/(?:preview|auth)\//i.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(k => /^(?:code|state|token|access_token|id_token|password|secret)$/i.test(k)) || /(?:token|code|secret|password)=/i.test(url.hash)) return null;
    return url.href;
  } catch { return null; }
}
export class BrowserTabStore {
  constructor(directory) {
    this.store = new PreferencesStore(path.join(directory, 'browser-tabs.json'), { revision: 0, tabs: [] }, value => {
      if (!Number.isSafeInteger(value.revision) || !Array.isArray(value.tabs)) throw new Error('Invalid saved browser tabs.');
      const ids = new Set();
      return { revision: value.revision, tabs: value.tabs.filter(t => {
        if (!t || !uuid.test(t.id) || ids.has(t.id) || !restorableBrowserUrl(t.url) || (t.profileId !== DEFAULT_BROWSER_PROFILE && !uuid.test(t.profileId))) return false;
        ids.add(t.id); return true;
      }).slice(0, 50).map(t => ({ id: t.id, url: restorableBrowserUrl(t.url), profileId: t.profileId })) };
    });
  }
  get(profiles) { return this.store.get().tabs.filter(t => profiles.some(p => p.id === t.profileId)); }
  save(tabs) {
    const current = this.store.get();
    if (JSON.stringify(current.tabs) === JSON.stringify(tabs)) return;
    this.store.set({ tabs }, current.revision);
  }
}

export async function restoreBrowserTabs(settings, store, create) {
  if (!settings.restoreTabs) return;
  for (const tab of store.get(settings.profiles)) await create(tab);
}
