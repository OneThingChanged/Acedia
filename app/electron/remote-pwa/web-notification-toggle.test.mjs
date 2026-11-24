import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { remotePath } from './base-path.js';

const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const implementation = name => source.match(new RegExp(`^(?:async )?function ${name}\\([^]*?\\n\\}`, 'm'))[0];

function fixture({ scope = 'https://example.test/acedia/', deleteOk = true } = {}) {
  const preferenceKey = 'multiagent.remote.notifications:/acedia/';
  const storage = new Map([['multiagent.remote.notifications', 'on']]);
  const notification = { permission: 'granted', requestPermission: vi.fn() };
  const endpoint = 'https://push.example.test/device';
  const subscription = { endpoint, toJSON: () => ({ endpoint }), unsubscribe: vi.fn(async () => { current = null; }) };
  let current = subscription;
  const pushManager = { getSubscription: vi.fn(async () => current), subscribe: vi.fn(async () => { current = subscription; return current; }) };
  const registration = { scope, active: true, pushManager };
  const serviceWorker = { getRegistration: vi.fn(async () => registration), register: vi.fn(async () => registration) };
  const fetch = vi.fn(async (path, options) => ({ ok: options.method !== 'DELETE' || deleteOk, status: 503,
    json: async () => ({ publicKey: 'AQ' }) }));
  const button = { disabled: false, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
  const context = vm.createContext({ atob, URL, fetch, t: value => value, text: value => String(value || ''),
    WEB_NOTIFICATION_KEY: preferenceKey, webNotificationOperation: Promise.resolve(), backgroundPushEnabled: true,
    REMOTE_BASE_PATH: '/acedia/', remotePath: path => remotePath(path, '/acedia/'), localStorage: storage,
    window: { Notification: notification }, Notification: notification, navigator: { serviceWorker }, ui: { notifyButton: button },
    showToast: vi.fn() });
  const fns = ['pushKeyBytes', 'samePushKey', 'notificationPreference', 'syncWebNotificationButton', 'runWebNotificationOperation',
    'removeBackgroundPush', 'ensureBackgroundPush', 'enableNotifications', 'registerServiceWorker', 'initializeNotifications'];
  // Use the actual browser functions with a fake worker and HTTP responses.
  vm.runInContext('localStorage.getItem = key => localStorage.get(key) ?? null; localStorage.setItem = (key, value) => localStorage.set(key, value);\n'
    + fns.map(implementation).join('\n'), context);
  return { context, storage, preferenceKey, button, subscription, fetch, pushManager, notification, endpoint };
}

it('unsubscribes in the mounted web service and browser, stays off on reload, and can subscribe again', async () => {
  const f = fixture();
  await f.context.enableNotifications();
  expect(f.fetch).toHaveBeenCalledExactlyOnceWith('/acedia/api/push/subscription', expect.objectContaining({
    method: 'DELETE', credentials: 'same-origin', body: JSON.stringify({ endpoint: f.endpoint }),
  }));
  expect(f.subscription.unsubscribe).toHaveBeenCalledOnce();
  expect(f.storage.get(f.preferenceKey)).toBe('off');
  expect(f.button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');
  await f.context.initializeNotifications();
  expect(f.fetch).toHaveBeenCalledTimes(1);

  await f.context.enableNotifications();
  expect(f.notification.requestPermission).not.toHaveBeenCalled();
  expect(f.pushManager.subscribe).toHaveBeenCalledOnce();
  expect(f.fetch).toHaveBeenLastCalledWith('/acedia/api/push/subscription', expect.objectContaining({ method: 'POST' }));
  expect(f.storage.get(f.preferenceKey)).toBe('on');
  expect(f.button.setAttribute).toHaveBeenLastCalledWith('aria-label', '알림 끄기');
});

it('keeps the toggle on and allows retry when the PC does not confirm removal', async () => {
  const f = fixture({ deleteOk: false });
  await f.context.enableNotifications();
  expect(f.subscription.unsubscribe).not.toHaveBeenCalled();
  expect(f.storage.has(f.preferenceKey)).toBe(false);
  expect(f.button.disabled).toBe(false);
  expect(f.button.setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
  expect(f.context.showToast).toHaveBeenCalledWith('웹 알림을 끄지 못했습니다. 다시 시도해 주세요.');
});

it('does not unsubscribe a different Remote service when the browser returns its parent registration', async () => {
  const f = fixture({ scope: 'https://example.test/' });
  await f.context.enableNotifications();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.subscription.unsubscribe).not.toHaveBeenCalled();
  expect(f.storage.get(f.preferenceKey)).toBe('off');
});
