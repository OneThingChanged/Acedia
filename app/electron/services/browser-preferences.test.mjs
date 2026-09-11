import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BROWSER_DEFAULTS, browserAddress, browserPreferences } from './browser-preferences.mjs';
const { assertInvokeRequest } = createRequire(import.meta.url)('../ipc-contract.cjs');
describe('Browser preferences', () => {
  it('resolves addresses and search text without accepting privileged schemes or credentials', () => {
    expect(browserAddress('example.com/page', BROWSER_DEFAULTS)).toBe('https://example.com/page');
    expect(browserAddress('localhost:4420', BROWSER_DEFAULTS)).toBe('https://localhost:4420/');
    expect(browserAddress('한글 & search', { search: 'bing' })).toBe('https://www.bing.com/search?q=' + encodeURIComponent('한글 & search'));
    for (const text of ['file:///secret', 'javascript:alert(1)', 'https://user:pass@example.com', '']) expect(() => browserAddress(text, BROWSER_DEFAULTS)).toThrow();
    expect(() => assertInvokeRequest('document_browser_navigate', { browserId: 'test', url: '검색어', addressBar: true })).not.toThrow();
    expect(() => assertInvokeRequest('document_browser_navigate', { browserId: 'test', url: '검색어' })).toThrow();
  });
  it('persists defaults, rejects stale windows and invalid values, and preserves damaged files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-prefs-test-'));
    try {
      const prefs = browserPreferences(root);
      expect(prefs.get()).toEqual(BROWSER_DEFAULTS);
      const saved = prefs.set({ home: 'https://example.com', zoom: 125 }, 0);
      expect(browserPreferences(root).get()).toEqual(saved);
      expect(() => prefs.set({ zoom: 150 }, 0)).toThrow('another window');
      expect(() => prefs.set({ zoom: 500 }, 1)).toThrow();
      expect(prefs.get()).toEqual(saved);
      fs.writeFileSync(prefs.file, '{broken');
      expect(() => prefs.get()).toThrow();
      expect(fs.readFileSync(prefs.file, 'utf8')).toBe('{broken');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
