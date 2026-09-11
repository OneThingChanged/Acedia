import { DEFAULT_BROWSER_PROFILE, validateProfiles } from "./browser-profiles.mjs";
import path from 'node:path';
import { PreferencesStore } from './preferences-store.mjs';

export const BROWSER_DEFAULTS = { revision: 0, home: 'https://www.google.com/', search: 'google', zoom: 100, links: 'external', profiles: [{ id: DEFAULT_BROWSER_PROFILE, label: 'Default' }], defaultProfile: DEFAULT_BROWSER_PROFILE, restoreTabs: false };
const engines = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=' };
export function webUrl(value) {
  const url = new URL(String(value));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 8192) throw new Error('Use an HTTP or HTTPS URL without credentials.');
  return url.href;
}
export function browserAddress(value, settings) {
  const raw = String(value).trim();
  if (!raw || raw.length > 8192) throw new Error('Enter an address or search phrase.');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) return webUrl(raw);
  if (/^(?:localhost|\[[\da-f:]+\]|[^\s/:]+\.[^\s/:]+)(?::\d+)?(?:[/?#]|$)/i.test(raw)) return webUrl('https://' + raw);
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) throw new Error('Unsupported address scheme.');
  return engines[settings.search] + encodeURIComponent(raw);
}
function validate(value) {
  if (!Object.hasOwn(engines, value.search) || !['internal', 'external'].includes(value.links) || !Number.isInteger(value.zoom) || value.zoom < 50 || value.zoom > 200 || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid browser settings.');
  return { revision: value.revision, home: webUrl(value.home), search: value.search, zoom: value.zoom, links: value.links, profiles: validateProfiles(value.profiles, value.defaultProfile), defaultProfile: value.defaultProfile, restoreTabs: value.restoreTabs === true };
}
export function browserPreferences(directory) { return new PreferencesStore(path.join(directory, 'browser-preferences.json'), BROWSER_DEFAULTS, validate); }
