import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MAX_SESSION_NOTE_BYTES = 64 * 1024;
const invalid = message => Object.assign(new TypeError(message), { statusCode: 400 });

export function validateSessionNoteId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw invalid('Invalid session id');
  return id;
}

// Human notes deliberately live outside transcripts, workspace snapshots,
// project folders and the AI/MCP catalog. Acedia registration IDs, rather than
// provider conversation IDs, own them across restarts and account changes.
export class SessionNotes {
  constructor(directory) {
    this.file = path.join(directory, 'session-notes.sqlite');
    this.database = null;
  }
  db() {
    if (this.database) return this.database;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const db = new DatabaseSync(this.file);
    db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );`);
    this.database = db;
    return db;
  }
  read(id) {
    validateSessionNoteId(id);
    const row = this.db().prepare('SELECT text, revision, updated_at AS updatedAt FROM notes WHERE id = ?').get(id);
    return { id, text: row?.text ?? '', revision: row?.revision ?? 0, updatedAt: row?.updatedAt ?? null };
  }
  save({ id, text, revision }) {
    validateSessionNoteId(id);
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SESSION_NOTE_BYTES) throw invalid('Session note exceeds 64 KB');
    if (!Number.isSafeInteger(revision) || revision < 0) throw invalid('Invalid note revision');
    const db = this.db();
    db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.read(id);
      // An acknowledgement lost in transit can be retried without a new write.
      if (previous.text === text) { db.exec('COMMIT'); return { saved: true, note: previous }; }
      if (previous.revision !== revision) { db.exec('COMMIT'); return { saved: false, note: previous }; }
      const note = { id, text, revision: previous.revision + 1, updatedAt: Date.now() };
      db.prepare(`INSERT INTO notes (id, text, revision, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET text=excluded.text, revision=excluded.revision, updated_at=excluded.updated_at`)
        .run(id, text, note.revision, note.updatedAt);
      db.exec('COMMIT');
      return { saved: true, note };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  close() { this.database?.close(); this.database = null; }
}
