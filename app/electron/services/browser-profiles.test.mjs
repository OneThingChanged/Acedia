import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { browserPreferences } from './browser-preferences.mjs';
import { browserProfile, BrowserTabStore, restoreBrowserTabs } from './browser-profiles.mjs';

it('preserves the original partition and persists isolated profiles and restorable tabs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-profiles-'));
  try {
    const prefs = browserPreferences(root), old = prefs.get(), id = randomUUID();
    const settings = prefs.set({ profiles: [...old.profiles, { id, label: 'Work' }], defaultProfile: id, restoreTabs: true }, 0);
    expect(browserProfile(settings, 'multiagent-browser').partition).toBe('persist:multiagent-browser');
    expect(browserProfile(settings).partition).not.toBe('persist:multiagent-browser');
    expect(() => browserProfile(settings, '../invalid')).toThrow();
    expect(() => prefs.set({ profiles: [] }, settings.revision)).toThrow();
    const tabs = new BrowserTabStore(root), tabId = randomUUID();
    tabs.save([{ id: tabId, profileId: id, url: 'https://example.com/work' },
      { id: randomUUID(), profileId: id, url: 'https://example.com/?code=secret' },
      { id: randomUUID(), profileId: id, url: 'file:///private' }]);
    const restored = [];
    await restoreBrowserTabs(browserPreferences(root).get(), new BrowserTabStore(root), async t => restored.push(t));
    expect(restored).toEqual([{ id: tabId, profileId: id, url: 'https://example.com/work' }]);
    await restoreBrowserTabs({ ...settings, restoreTabs: false }, tabs, () => { throw Error('disabled'); });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
