import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

it('fetches fresh tree code before using a cached copy and falls back only when offline', async () => {
  const listeners = new Map(), put = vi.fn(), match = vi.fn(async () => new Response('old-tree'));
  const fetcher = vi.fn(async () => new Response('new-tree'));
  const context = vm.createContext({ URL, fetch: fetcher,
    self: { location: { origin: 'https://remote.test' }, addEventListener: (name, callback) => listeners.set(name, callback) },
    caches: { open: async () => ({ put }), match },
  });
  vm.runInContext(fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8'), context);
  const request = new Request('https://remote.test/pwa/session-tree.js');
  let pending;
  const event = () => ({ request, respondWith: promise => { pending = promise; } });
  listeners.get('fetch')(event());
  expect(await (await pending).text()).toBe('new-tree');
  expect(fetcher).toHaveBeenCalledWith(request); expect(match).not.toHaveBeenCalled();
  await Promise.resolve(); expect(put).toHaveBeenCalledOnce();
  fetcher.mockRejectedValueOnce(new Error('offline'));
  listeners.get('fetch')(event());
  expect(await (await pending).text()).toBe('old-tree'); expect(match).toHaveBeenCalledExactlyOnceWith(request);
});
