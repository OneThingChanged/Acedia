export const MAX_NOTE_BYTES = 65536;
export const NOTE_DRAFT_PREFIX = 'acedia.session-note-draft.v1.';
const tooLarge = text => new TextEncoder().encode(text).length > MAX_NOTE_BYTES;

// Shared by React and the Remote/Dashboard client. One entry per registration
// keeps drafts and in-flight saves alive when a pane is unmounted or switched.
export class SessionNoteClient {
  constructor({ read, save, storage = null, debounce = 500 }) {
    Object.assign(this, { read, save, storage, debounce });
    this.entries = new Map();
  }
  entry(id) {
    if (!this.entries.has(id)) {
      let draft = null;
      try {
        const value = JSON.parse(this.storage?.getItem(NOTE_DRAFT_PREFIX + id) || 'null');
        if (value && typeof value.text === 'string' && typeof value.baseText === 'string'
          && Number.isSafeInteger(value.revision) && value.revision >= 0) draft = value;
      } catch { /* An unavailable browser backup must not block host storage. */ }
      this.entries.set(id, {
        state: { id, text: draft?.text ?? '', note: null, conflict: null, status: 'loading', error: null, backupFailed: false },
        listeners: new Set(), timer: null, loading: null, saving: null, composing: false,
        baseRevision: draft?.revision ?? 0, baseText: draft?.baseText ?? '', dirty: !!draft,
      });
    }
    return this.entries.get(id);
  }
  snapshot(id) { return this.entry(id).state; }
  subscribe(id, listener) { const entry = this.entry(id); entry.listeners.add(listener); return () => entry.listeners.delete(listener); }
  update(entry, patch) {
    entry.state = { ...entry.state, ...patch };
    for (const listener of entry.listeners) listener();
  }
  backup(entry) {
    if (!this.storage) { if (entry.state.backupFailed !== entry.dirty) this.update(entry, { backupFailed: entry.dirty }); return; }
    try {
      const key = NOTE_DRAFT_PREFIX + entry.state.id;
      if (!entry.dirty) this.storage.removeItem(key);
      else this.storage.setItem(key, JSON.stringify({ text: entry.state.text, revision: entry.baseRevision, baseText: entry.baseText }));
      if (entry.state.backupFailed) this.update(entry, { backupFailed: false });
    } catch { if (!entry.state.backupFailed) this.update(entry, { backupFailed: true }); }
  }
  apply(entry, note) {
    if (!note || note.id !== entry.state.id || !Number.isSafeInteger(note.revision) || typeof note.text !== 'string') throw Error('Invalid session note response');
    if (entry.state.note && note.revision < entry.state.note.revision) return;
    if (!entry.dirty || entry.state.text === note.text) {
      entry.baseRevision = note.revision; entry.baseText = note.text; entry.dirty = false;
      this.update(entry, { note, text: note.text, conflict: null, status: 'saved', error: null });
    } else if (entry.baseRevision !== note.revision && entry.baseText !== note.text) {
      this.update(entry, { note, conflict: note, status: 'conflict', error: null });
    } else {
      entry.baseRevision = note.revision; entry.baseText = note.text;
      this.update(entry, { note, conflict: null, status: tooLarge(entry.state.text) ? 'too-large' : 'dirty', error: null });
      this.schedule(entry);
    }
    this.backup(entry);
  }
  async load(id) {
    const entry = this.entry(id);
    if (entry.loading) return entry.loading;
    if (entry.saving) return entry.saving;
    entry.loading = (async () => {
      try {
        const note = await this.read(id, entry.state.note?.revision);
        // A refresh started before a save may arrive after its acknowledgement.
        // Apply it afterwards so it cannot roll back the acknowledged revision.
        if (entry.saving) await entry.saving;
        if (!note?.unchanged) this.apply(entry, note);
        else if (entry.state.status === 'error') {
          this.update(entry, { status: entry.state.conflict ? 'conflict' : tooLarge(entry.state.text) ? 'too-large' : entry.dirty ? 'dirty' : 'saved', error: null });
          this.schedule(entry);
        }
      } catch (error) { this.update(entry, { status: 'error', error: String(error?.message || error) }); }
      finally { entry.loading = null; }
    })();
    return entry.loading;
  }
  edit(id, text) {
    const entry = this.entry(id);
    entry.dirty = !!entry.saving || !entry.state.note || text !== entry.state.note.text;
    this.update(entry, { text, status: tooLarge(text) ? 'too-large' : entry.state.conflict ? 'conflict' : entry.dirty ? 'dirty' : 'saved', error: null });
    this.backup(entry);
    this.schedule(entry);
  }
  setComposing(id, composing) { const entry = this.entry(id); entry.composing = composing; if (!composing) this.schedule(entry); }
  schedule(entry) {
    clearTimeout(entry.timer); entry.timer = null;
    if (entry.dirty && entry.state.note && !entry.composing && !entry.state.conflict && entry.state.status !== 'too-large') {
      entry.timer = setTimeout(() => { entry.timer = null; void this.flush(entry.state.id); }, this.debounce);
    }
  }
  async flush(id) {
    const entry = this.entry(id);
    clearTimeout(entry.timer); entry.timer = null;
    if (entry.saving) return entry.saving;
    if (!entry.dirty || entry.composing || entry.state.conflict || tooLarge(entry.state.text)) return;
    if (!entry.state.note) { await this.load(id); if (!entry.state.note || entry.state.conflict) return; }
    if (entry.saving) return entry.saving;
    entry.saving = (async () => {
      while (entry.dirty && !entry.composing && !entry.state.conflict && !tooLarge(entry.state.text)) {
        const text = entry.state.text, revision = entry.baseRevision;
        this.update(entry, { status: 'saving', error: null });
        try {
          const result = await this.save({ id, text, revision });
          const note = result?.note;
          if (!note || note.id !== id || !Number.isSafeInteger(note.revision) || typeof note.text !== 'string') throw Error('Invalid session note acknowledgement');
          if (result.saved && (note.text !== text || note.revision < revision)) throw Error('Invalid session note acknowledgement');
          if (!result.saved) {
            this.update(entry, { note, conflict: note, status: 'conflict', error: null });
            this.backup(entry); break;
          }
          entry.baseRevision = note.revision; entry.baseText = note.text;
          entry.dirty = entry.state.text !== note.text;
          this.update(entry, { note, conflict: null, status: tooLarge(entry.state.text) ? 'too-large' : entry.dirty ? 'dirty' : 'saved', error: null });
          this.backup(entry);
        } catch (error) {
          this.update(entry, { status: 'error', error: String(error?.message || error) });
          this.backup(entry); break;
        }
      }
    })();
    try { await entry.saving; } finally { entry.saving = null; }
  }
  async resolve(id, choice) {
    const entry = this.entry(id), latest = entry.state.conflict;
    if (!latest) return;
    entry.baseRevision = latest.revision; entry.baseText = latest.text;
    entry.dirty = choice === 'local' && entry.state.text !== latest.text;
    this.update(entry, { text: choice === 'local' ? entry.state.text : latest.text, note: latest, conflict: null, status: entry.dirty ? 'dirty' : 'saved', error: null });
    this.backup(entry);
    if (entry.dirty) await this.flush(id);
  }
  async retry(id) { await this.load(id); await this.flush(id); }
  async flushAll() { await Promise.all([...this.entries.keys()].map(id => this.flush(id))); }
}
