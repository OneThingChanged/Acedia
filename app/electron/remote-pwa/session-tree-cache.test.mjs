import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

it.each(['session-tree.js', 'session-notes.js', 'task-flow.js', 'video-preview.js'])('fetches %s fresh and falls back to the current cache only when offline', async asset => {
  const listeners = new Map(), put = vi.fn(), match = vi.fn(async () => new Response('old-tree'));
  const fetcher = vi.fn(async () => new Response('new-tree'));
  const open = vi.fn(async () => ({ put, match }));
  const context = vm.createContext({ URL, fetch: fetcher,
    self: { registration: { scope: 'https://remote.test/' }, location: { origin: 'https://remote.test' }, addEventListener: (name, callback) => listeners.set(name, callback) },
    caches: { open },
  });
  vm.runInContext(fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8'), context);
  const request = new Request(`https://remote.test/pwa/${asset}`);
  let pending;
  const event = () => ({ request, respondWith: promise => { pending = promise; } });
  listeners.get('fetch')(event());
  expect(await (await pending).text()).toBe('new-tree');
  expect(fetcher).toHaveBeenCalledWith(request); expect(match).not.toHaveBeenCalled();
  await Promise.resolve(); expect(put).toHaveBeenCalledOnce();
  fetcher.mockRejectedValueOnce(new Error('offline'));
  listeners.get('fetch')(event());
  expect(await (await pending).text()).toBe('old-tree'); expect(match).toHaveBeenCalledExactlyOnceWith(request);
  expect(open.mock.calls.every(([name]) => name === 'acedia-remote:/:multiagent-remote-v121')).toBe(true);
});
