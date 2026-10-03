import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { SessionNotifications } from './session-notifications.mjs';
import { allowNotification, NOTIFICATION_DEFAULTS, notificationPreferences } from './notification-policy.mjs';

describe('persistent session notifications', () => {
  it('keeps sessions independent, persists mute, and rejects stale clients', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-session-alerts-'));
    try {
      const store = new SessionNotifications(root);
      expect(store.get('a')).toEqual({ enabled: true, revision: 0 });
      store.set('a', false, 0); store.set('b', true, 0);
      expect(() => store.set('a', true, 0)).toThrow('Settings changed');
      const restored = new SessionNotifications(root);
      expect(restored.get('a')).toEqual({ enabled: false, revision: 1 });
      expect(restored.get('b')).toEqual({ enabled: true, revision: 1 });
      for (const kind of ['completion', 'bell', 'question']) {
        expect(allowNotification({ ...NOTIFICATION_DEFAULTS, bell: true }, kind, false, restored.get('a').enabled)).toBe(false);
      }
      expect(allowNotification(NOTIFICATION_DEFAULTS, 'question', true)).toBe(true);
      expect(allowNotification({ ...NOTIFICATION_DEFAULTS, suppressFocused: true }, 'question', true)).toBe(false);
      fs.writeFileSync(path.join(root, 'notification-policy.json'), JSON.stringify({ ...NOTIFICATION_DEFAULTS, question: undefined }));
      expect(notificationPreferences(root).get().question).toBe(true);
    } finally { fs.rmSync(root, { recursive: true }); }
  });
});
