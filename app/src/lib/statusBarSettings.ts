export const LS_STATUS_BAR = 'multiagent.statusBar.v1';
const CHANGED = 'multiagent:status-bar-changed';
import type { UsageProviderGroup } from './usageRateLimits';
export type StatusBarSettings = { codex: boolean; claude: boolean; gemini: boolean; agy: boolean; other: boolean; resources: boolean; ports: boolean; display: 'used' | 'remaining'; selectedAccount: string | null; selectedAccounts: string[] | null };
export const DEFAULT_STATUS_BAR: StatusBarSettings = {codex:true,claude:true,gemini:true,agy:true,other:true,resources:true,ports:true,display:'used',selectedAccount:null,selectedAccounts:null};
export function normalizeStatusBar(value: unknown): StatusBarSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<StatusBarSettings> : {};
  return Object.fromEntries(Object.entries(DEFAULT_STATUS_BAR).map(([key,fallback]) => [key,
    key === 'selectedAccounts' ? Array.isArray(source.selectedAccounts) ? [...new Set(source.selectedAccounts.filter((key): key is string => typeof key === 'string' && key.trim().length > 0 && key.length <= 256).map(key => key.trim()))] : typeof source.selectedAccount === 'string' && source.selectedAccount.trim().length > 0 && source.selectedAccount.length <= 256 ? [source.selectedAccount.trim()] : null
    : key === 'selectedAccount' ? typeof source.selectedAccount === 'string' && source.selectedAccount.trim().length > 0 && source.selectedAccount.length <= 256 ? source.selectedAccount.trim() : null
    : key === 'display' ? source.display === 'remaining' ? 'remaining' : 'used'
    : typeof source[key as keyof StatusBarSettings] === 'boolean' ? source[key as keyof StatusBarSettings] : fallback])) as StatusBarSettings;
}
export function loadStatusBar() { try { return normalizeStatusBar(JSON.parse(localStorage.getItem(LS_STATUS_BAR) || 'null')); } catch { return {...DEFAULT_STATUS_BAR}; } }
export function updateStatusBar(patch: Partial<StatusBarSettings>) {
  const next = normalizeStatusBar({...loadStatusBar(), ...patch, ...(Object.prototype.hasOwnProperty.call(patch, 'selectedAccount') && !Object.prototype.hasOwnProperty.call(patch, 'selectedAccounts') ? { selectedAccounts: null } : {})});
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
  return settings[base === 'codex' || base === 'claude' || base === 'gemini' || base === 'agy' ? base : 'other'];
}
export function canSelectStatusAccount(group: UsageProviderGroup, settings: StatusBarSettings) {
  return group.profile?.visible !== false && group.profile?.registered !== false && showUsageProvider(group.key, settings);
}
export function selectStatusAccount(groups: UsageProviderGroup[], settings: StatusBarSettings): UsageProviderGroup | null {
  const available = groups.filter(group => canSelectStatusAccount(group, settings));
  const selected = available.find(group => group.key === settings.selectedAccount);
  if (selected) return selected;
  const previousProvider = settings.selectedAccount?.split(':')[0];
  const isDefault = (group: UsageProviderGroup) => group.profile?.id === 'default' || !group.key.includes(':');
  return available.find(group => isDefault(group) && group.key.split(':')[0] === previousProvider)
    ?? available.find(isDefault) ?? available[0] ?? null;
}
// null retains the legacy automatic default; [] explicitly hides all accounts.
export function selectStatusAccounts(groups: UsageProviderGroup[], settings: StatusBarSettings): UsageProviderGroup[] {
  if (settings.selectedAccounts === null) {
    const initial = selectStatusAccount(groups, settings);
    return initial ? [initial] : [];
  }
  return settings.selectedAccounts.flatMap(key => {
    const group = groups.find(group => group.key === key && canSelectStatusAccount(group, settings));
    return group ? [group] : [];
  });
}
export function toggleStatusAccount(groups: UsageProviderGroup[], key: string) {
  const latest = loadStatusBar();
  const keys = latest.selectedAccounts ?? selectStatusAccounts(groups, latest).map(group => group.key);
  return updateStatusBar({ selectedAccounts: keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key] });
}
export function displayUsagePercent(used: number, mode: StatusBarSettings['display']) {
  const clamped = Number.isFinite(used) ? Math.max(0,Math.min(100,used)) : 0;
  return mode === 'remaining' ? 100 - clamped : clamped;
}
