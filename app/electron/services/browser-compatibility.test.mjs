import { describe, expect, it, vi } from 'vitest';
import { applyBrowserCompatibility, compatibleBrowserUserAgent } from './browser-compatibility.mjs';

const engine = 'Chrome/150.0.7871.114';
const prefix = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
const standard = `${prefix} ${engine} Safari/537.36`;
const original = `${prefix} Acedia/1.8.1.43 ${engine} Electron/43.1.1 Safari/537.36`;

describe('Embedded browser website compatibility', () => {
  it('preserves the actual Chromium and platform versions while removing app products', () => {
    expect(compatibleBrowserUserAgent(original, 'Acedia')).toBe(standard);
    expect(compatibleBrowserUserAgent(original.replace('Acedia/', 'AcediaCompany/'), 'AcediaCompany')).toBe(standard);
    expect(compatibleBrowserUserAgent(original.replace('Acedia/', 'app/'), 'Acedia')).toBe(standard);
    const linux = original.replace('Windows NT 10.0; Win64; x64', 'X11; Linux x86_64');
    expect(compatibleBrowserUserAgent(linux, 'Acedia')).toBe(standard.replace('Windows NT 10.0; Win64; x64', 'X11; Linux x86_64'));
    expect(compatibleBrowserUserAgent(standard, 'Acedia')).toBe(standard);
  });

  it('restores each tab\'s own original identity when compatibility is disabled', () => {
    const contents = {
      value: original,
      getUserAgent() { return this.value; },
      setUserAgent: vi.fn(function(value) { this.value = value; }),
    };
    applyBrowserCompatibility(contents, true, 'Acedia');
    expect(contents.value).toBe(standard);
    applyBrowserCompatibility(contents, true, 'Acedia');
    applyBrowserCompatibility(contents, false, 'Acedia');
    expect(contents.value).toBe(original);
    applyBrowserCompatibility(contents, true, 'Acedia');
    expect(contents.value).toBe(standard);
    const other = { getUserAgent: () => 'custom agent', setUserAgent: vi.fn() };
    applyBrowserCompatibility(other, false, 'Acedia');
    expect(other.setUserAgent).toHaveBeenCalledWith('custom agent');
  });
});
