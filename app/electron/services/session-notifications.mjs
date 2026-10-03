import fs from 'node:fs';
import path from 'node:path';

// One preference per Acedia session, shared by desktop windows and web clients.
// Revisions are per session so changing one session never overwrites another.
export class SessionNotifications {
  constructor(directory) {
    this.file = path.join(directory, 'session-notifications.json');
    this.entries = new Map();
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [id, value] of Object.entries(saved)) {
        if (typeof value?.enabled === 'boolean' && Number.isSafeInteger(value.revision) && value.revision >= 0) this.entries.set(id, value);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  get(id) {
    if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new TypeError('Invalid session');
    return { ...(this.entries.get(id) || { enabled: true, revision: 0 }) };
  }
  set(id, enabled, revision) {
    const current = this.get(id);
    if (typeof enabled !== 'boolean') throw new TypeError('Invalid notification setting');
    if (revision !== current.revision) throw new Error('Settings changed. Reload before saving.');
    const next = { enabled, revision: current.revision + 1 };
    const entries = new Map(this.entries).set(id, next);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(Object.fromEntries(entries)) + '\n', { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    this.entries = entries;
    return { ...next };
  }
}
