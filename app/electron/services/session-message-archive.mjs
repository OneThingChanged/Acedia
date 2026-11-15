import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Indexed cold storage. Only immutable, durably read terminal records enter it.
 * The archive transaction commits BEFORE the hot JSON is replaced, so a crash
 * may leave identical copies in both stores but can never lose a message/key.
 */
export class SessionMessageArchive {
  constructor(file, validRecord) { this.file = file; this.validRecord = validRecord; }
  open(create = false) {
    if (this.db) return this.db;
    const existed = fs.existsSync(this.file);
    const required = fs.existsSync(this.file + '.required');
    if (required && (fs.statSync(this.file + '.required').size > 32 || fs.readFileSync(this.file + '.required', 'utf8') !== 'archive-v1\n')) throw Error('Invalid archive marker');
    if (required && !existed) throw Error('Required message archive is missing');
    if (!create && !existed) return null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const db = new DatabaseSync(this.file);
    try {
      db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
      const version = db.prepare('PRAGMA user_version').get().user_version;
      const empty = version === 0 && !db.prepare("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get();
      if (empty && required) throw Error('Required message archive is empty');
      if (empty) db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE messages (
          message_id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          request_key TEXT NOT NULL,
          sequence INTEGER NOT NULL UNIQUE,
          record TEXT NOT NULL CHECK(length(record) <= 1048576),
          UNIQUE(source_id, request_key)
        );
        CREATE INDEX messages_source_sequence ON messages(source_id, sequence);
        CREATE INDEX messages_target_sequence ON messages(target_id, sequence);
        PRAGMA user_version=1;
        COMMIT;
      `);
      if (!existed) fs.chmodSync(this.file, 0o600);
      if (db.prepare('PRAGMA user_version').get().user_version !== 1) throw Error('Unsupported message archive');
      // Prepare now so an invalid/missing schema fails before a terminal call.
      db.prepare('SELECT message_id, source_id, target_id, request_key, sequence, record FROM messages LIMIT 0').all();
      this.db = db;
      return db;
    } catch (error) { db.close(); throw error; }
  }
  decode(row) {
    if (!row) return null;
    if (typeof row.record !== 'string' || Buffer.byteLength(row.record, 'utf8') > 1024 * 1024) throw Error('Invalid message archive row');
    const record = JSON.parse(row.record);
    if (!this.validRecord(record) || record.messageId !== row.message_id || record.sourceId !== row.source_id
      || record.targetId !== row.target_id || record.requestKey !== row.request_key || record.sequence !== row.sequence) throw Error('Invalid message archive binding');
    return record;
  }
  byId(id) { return this.decode(this.open()?.prepare('SELECT * FROM messages WHERE message_id=?').get(id)); }
  byKey(sourceId, key) { return this.decode(this.open()?.prepare('SELECT * FROM messages WHERE source_id=? AND request_key=?').get(sourceId, key)); }
  maxSequence() { return this.open()?.prepare('SELECT sequence FROM messages ORDER BY sequence DESC LIMIT 1').get()?.sequence || 0; }
  select({ agentId, outgoing = false, after = 0, limit = 21, recent = false, exclude = [] }) {
    const db = this.open(); if (!db) return [];
    const where = recent ? agentId === undefined ? '1' : '(source_id=? OR target_id=?)' : `${outgoing ? 'source_id' : 'target_id'}=? AND sequence>?`;
    const args = recent ? agentId === undefined ? [] : [agentId, agentId] : [agentId, after];
    const notHot = exclude.length ? ` AND message_id NOT IN (${exclude.map(() => '?').join(',')})` : '';
    return db.prepare(`SELECT * FROM messages WHERE ${where}${notHot} ORDER BY sequence ${recent ? 'DESC' : 'ASC'} LIMIT ?`)
      .all(...args, ...exclude, limit).map(row => this.decode(row));
  }
  put(records) {
    if (!records.length) return;
    const db = this.open(true);
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert = db.prepare('INSERT INTO messages(message_id,source_id,target_id,request_key,sequence,record) VALUES(?,?,?,?,?,?)');
      for (const record of records) {
        if (!this.validRecord(record)) throw Error('Invalid message archive input');
        const existing = this.byId(record.messageId) || this.byKey(record.sourceId, record.requestKey);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(record)) throw Error('Conflicting message archive copy');
        } else insert.run(record.messageId, record.sourceId, record.targetId, record.requestKey, record.sequence, JSON.stringify(record));
      }
      db.exec('COMMIT');
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
    if (!fs.existsSync(this.file + '.required')) {
      fs.writeFileSync(this.file + '.required.tmp', 'archive-v1\n', { mode: 0o600 });
      fs.renameSync(this.file + '.required.tmp', this.file + '.required');
    }
  }
  close() { this.db?.close(); this.db = null; }
}
