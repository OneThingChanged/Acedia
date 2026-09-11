import path from 'node:path';
import { PreferencesStore } from './preferences-store.mjs';

export const NOTIFICATION_DEFAULTS = { revision: 0, completion: true, bell: false, suppressFocused: false, powerMode: 'off' };
export function notificationPreferences(directory) {
  return new PreferencesStore(path.join(directory, 'notification-policy.json'), NOTIFICATION_DEFAULTS, value => {
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !['off', 'working', 'always'].includes(value.powerMode)
      || ['completion', 'bell', 'suppressFocused'].some(key => typeof value[key] !== 'boolean')) throw new Error('Invalid notification settings');
    return Object.fromEntries(Object.keys(NOTIFICATION_DEFAULTS).map(key => [key, value[key]]));
  });
}
export function allowNotification(settings, kind, focused) {
  if (!['completion', 'bell'].includes(kind)) throw new Error('Invalid notification kind');
  return settings[kind] && !(settings.suppressFocused && focused);
}
export class WorkPowerPolicy {
  constructor(blocker) { this.blocker = blocker; this.mode = 'off'; this.work = new Map(); this.live = new Set(); this.token = null; }
  setMode(mode) { this.mode = mode; this.sync(); }
  sessions(ids) {
    this.live = new Set(ids);
    for (const id of this.work.keys()) if (!this.live.has(id)) this.work.delete(id);
    this.sync();
  }
  hook(payload) {
    if (!this.live.has(payload.id)) return;
    const event = String(payload.event).toLowerCase(), hook = String(payload.hook_event_name).toLowerCase();
    if (['done', 'cancelled', 'canceled', 'interrupted', 'aborted', 'session-start'].includes(event) || ['stop', 'remotecancel', 'usercancel', 'interrupt'].includes(hook)) this.work.delete(payload.id);
    else if (['working', 'tool-start', 'tool-end', 'waiting', 'blocked'].includes(event) || ['permissionrequest', 'stopfailure', 'posttoolusefailure'].includes(hook)) this.work.set(payload.id, true);
    this.sync();
  }
  sync() {
    const needed = this.mode === 'always' || (this.mode === 'working' && this.work.size > 0);
    if (needed && this.token === null) this.token = this.blocker.start('prevent-app-suspension');
    if (!needed && this.token !== null) { this.blocker.stop(this.token); this.token = null; }
  }
  status() { return { active: this.token !== null && this.blocker.isStarted(this.token), workingCount: this.work.size, mode: this.mode }; }
  dispose() { this.mode = 'off'; this.work.clear(); this.sync(); }
}

// OSC strings often end in BEL. Only an actual terminal bell should notify.
export class TerminalBellParser {
  state = 'text';
  push(data) {
    let bell = false;
    for (const char of data) {
      if (this.state === 'string') { if (char === '\x07') this.state = 'text'; else if (char === '\x1b') this.state = 'string-escape'; }
      else if (this.state === 'string-escape') this.state = char === '\\' ? 'text' : 'string';
      else if (this.state === 'escape') this.state = [']', 'P', '_', '^', 'X'].includes(char) ? 'string' : 'text';
      else if (char === '\x1b') this.state = 'escape';
      else if (char === '\x07') bell = true;
    }
    return bell;
  }
}
