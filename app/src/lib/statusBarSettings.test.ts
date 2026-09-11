import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_STATUS_BAR, displayUsagePercent, normalizeStatusBar, showUsageProvider, updateStatusBar } from './statusBarSettings';
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
