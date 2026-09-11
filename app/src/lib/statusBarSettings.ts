export const LS_STATUS_BAR = 'multiagent.statusBar.v1';
const CHANGED = 'multiagent:status-bar-changed';
export type StatusBarSettings = { codex: boolean; claude: boolean; gemini: boolean; other: boolean; resources: boolean; ports: boolean; display: 'used' | 'remaining' };
export const DEFAULT_STATUS_BAR: StatusBarSettings = {codex:true,claude:true,gemini:true,other:true,resources:true,ports:true,display:'used'};
export function normalizeStatusBar(value: unknown): StatusBarSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<StatusBarSettings> : {};
  return Object.fromEntries(Object.entries(DEFAULT_STATUS_BAR).map(([key,fallback]) => [key, key === 'display' ? source.display === 'remaining' ? 'remaining' : 'used' : typeof source[key as keyof StatusBarSettings] === 'boolean' ? source[key as keyof StatusBarSettings] : fallback])) as StatusBarSettings;
}
export function loadStatusBar() { try { return normalizeStatusBar(JSON.parse(localStorage.getItem(LS_STATUS_BAR) || 'null')); } catch { return {...DEFAULT_STATUS_BAR}; } }
export function updateStatusBar(patch: Partial<StatusBarSettings>) {
  const next = normalizeStatusBar({...loadStatusBar(), ...patch});
  localStorage.setItem(LS_STATUS_BAR, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGED));
  return next;
}
export function subscribeStatusBar(listener: (value: StatusBarSettings) => void) {
  const change = () => listener(loadStatusBar());
  const storage = (e: StorageEvent) => { if ((e.key === null || e.key === LS_STATUS_BAR) && (!e.storageArea || e.storageArea === localStorage)) change(); };
  window.addEventListener(CHANGED,change); window.addEventListener('storage',storage);
  return () => { window.removeEventListener(CHANGED,change); window.removeEventListener('storage',storage); };
}
export function showUsageProvider(key: string, settings: StatusBarSettings) {
  const base = key.toLowerCase().split(':')[0];
  return settings[base === 'codex' || base === 'claude' || base === 'gemini' ? base : 'other'];
}
export function displayUsagePercent(used: number, mode: StatusBarSettings['display']) {
  const clamped = Number.isFinite(used) ? Math.max(0,Math.min(100,used)) : 0;
  return mode === 'remaining' ? 100 - clamped : clamped;
}
