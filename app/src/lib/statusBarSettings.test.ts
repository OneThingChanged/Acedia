import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_STATUS_BAR, displayUsagePercent, loadStatusBar, normalizeStatusBar, selectStatusAccount, showUsageProvider, updateStatusBar } from './statusBarSettings';
import type { UsageProviderGroup } from './usageRateLimits';
afterEach(() => vi.unstubAllGlobals());
it('filters all account groups of a provider and keeps quota colors independent of inversion', () => {
  expect(showUsageProvider('codex:account-id', {...DEFAULT_STATUS_BAR,codex:false})).toBe(false);
  expect(showUsageProvider('unknown', {...DEFAULT_STATUS_BAR,other:false})).toBe(false);
  expect(displayUsagePercent(95,'remaining')).toBe(5);
  expect(displayUsagePercent(120,'remaining')).toBe(0);
  expect(normalizeStatusBar({resources:false,display:'broken'})).toMatchObject({resources:false,display:'used',ports:true});
});
it('merges the latest values and never publishes a failed save', () => {
  const dispatchEvent=vi.fn(), setItem=vi.fn();
  vi.stubGlobal('window',{dispatchEvent});vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({ports:false}),setItem});
  expect(updateStatusBar({resources:false})).toMatchObject({ports:false,resources:false});
  expect(dispatchEvent).toHaveBeenCalledTimes(1);
  setItem.mockImplementation(()=>{throw Error('disk');});
  expect(()=>updateStatusBar({ports:true})).toThrow('disk');
  expect(dispatchEvent).toHaveBeenCalledTimes(1);
});
const account = (provider: string, id = 'default', patch = {}): UsageProviderGroup => ({
  key: id === 'default' ? provider : `${provider}:${id}`, label: provider, icon: '', iconColor: '', limits: [],
  profile: {key:`${provider}:${id}`,provider,id,label:id,registered:true,current:false,hidden:false,visible:true,...patch},
});
it('keeps one account by identity across rename, ordering, reload and unavailable quotas', () => {
  const selected = account('claude','work');
  const groups = [account('codex'), account('claude'), selected];
  let saved = JSON.stringify({ports:false});
  vi.stubGlobal('localStorage',{getItem:()=>saved,setItem:(_key:string,value:string)=>{saved=value;}});
  vi.stubGlobal('window',{dispatchEvent:vi.fn()});
  updateStatusBar({selectedAccount:selected.key});
  expect(loadStatusBar()).toMatchObject({selectedAccount:'claude:work',ports:false});
  expect(selectStatusAccount(groups,loadStatusBar())).toBe(selected);
  selected.label = 'Renamed';
  expect(selectStatusAccount([...groups].reverse(),loadStatusBar())?.label).toBe('Renamed');
  expect(normalizeStatusBar({selectedAccount:['codex','claude']})).toMatchObject({selectedAccount:null});
});
it('falls back to the same provider default after removal or hiding and respects provider filters', () => {
  const settings = {...DEFAULT_STATUS_BAR,selectedAccount:'claude:work'};
  const groups = [account('codex'),account('claude'),account('claude','work',{registered:false})];
  expect(selectStatusAccount(groups,settings)?.key).toBe('claude');
  groups[2] = account('claude','work',{visible:false});
  expect(selectStatusAccount(groups,settings)?.key).toBe('claude');
  expect(selectStatusAccount(groups,{...settings,claude:false})?.key).toBe('codex');
  expect(selectStatusAccount(groups,{...settings,codex:false,claude:false})).toBeNull();
  expect(selectStatusAccount([account('codex','pending')],DEFAULT_STATUS_BAR)?.key).toBe('codex:pending');
  expect(selectStatusAccount([],settings)).toBeNull();
});
