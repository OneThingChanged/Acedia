import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';

function worker() {
  const handlers = new Map(), deleted = [], stored = [], opened = [], notifications = [];
  let clients = [];
  const cache = { addAll: async urls => stored.push(...urls), match: async url => ({ offline: url }), put: vi.fn() };
  const self = { registration: { scope: 'https://agent.example.com/acedia/', showNotification: async (...args) => notifications.push(args) },
    location: { origin: 'https://agent.example.com' }, addEventListener: (name, callback) => handlers.set(name, callback), skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => clients, openWindow: async url => opened.push(url) } };
  const fetch = vi.fn(async () => ({ ok: true, clone: () => ({}) }));
  const caches = { open: async () => cache, match: async () => null,
    keys: async () => ['acedia-remote:/acedia/:multiagent-remote-v115', 'acedia-remote:/other/:multiagent-remote-v115', 'other-app-cache', 'multiagent-remote-v115'],
    delete: async key => deleted.push(key) };
  vm.runInNewContext(fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8'), { self, caches, fetch, URL });
  const dispatch = async (name, value = {}) => { let promise; handlers.get(name)({ ...value, waitUntil: task => { promise = task; }, respondWith: task => { promise = task; } }); return promise; };
  return { dispatch, deleted, stored, opened, notifications, fetch, clients: value => { clients = value; } };
}
it('scopes assets and offline fallback while leaving other services caches and API requests untouched', async () => {
  const w = worker(); await w.dispatch('install');
  expect(w.stored.length).toBeGreaterThan(20); expect(w.stored.every(url => url.startsWith('/acedia/'))).toBe(true);
  expect(w.stored).toEqual(expect.arrayContaining(['/acedia/pwa/startup.js', '/acedia/pwa/task-flow.js', '/acedia/pwa/task-flow.css']));
  await w.dispatch('activate'); expect(w.deleted).toEqual(['acedia-remote:/acedia/:multiagent-remote-v115']);
  for (const url of ['https://agent.example.com/other/', 'https://agent.example.com/acedia/api/state', 'https://agent.example.com/acedia/auth/github']) {
    expect(await w.dispatch('fetch', { request: { method: 'GET', url } })).toBeUndefined();
  }
  expect(w.fetch).not.toHaveBeenCalled();
  w.fetch.mockRejectedValue(Error('offline'));
  expect(await w.dispatch('fetch', { request: { method: 'GET', url: 'https://agent.example.com/acedia/', mode: 'navigate' } })).toEqual({ offline: '/acedia/' });
});
it('opens and focuses only this mounted service when a notification is selected', async () => {
  const w = worker(); await w.dispatch('push', { data: { json: () => ({ agentId: 'one', body: 'done' }) } });
  expect(w.notifications[0][1]).toMatchObject({ icon: '/acedia/icons/icon-192.png', data: { url: '/acedia/?agent=one' } });
  const siblingFocus = vi.fn(), ownFocus = vi.fn(), message = vi.fn();
  w.clients([{ url: 'https://agent.example.com/other/', focus: siblingFocus }, { url: 'https://agent.example.com/acedia/', focus: ownFocus, postMessage: message }]);
  await w.dispatch('notificationclick', { notification: { close() {}, data: { agentId: 'one' } } });
  expect(ownFocus).toHaveBeenCalledOnce(); expect(siblingFocus).not.toHaveBeenCalled();
  w.clients([]); await w.dispatch('notificationclick', { notification: { close() {}, data: { agentId: 'one' } } });
  expect(w.opened).toEqual(['/acedia/?agent=one&view=chat']);
});
