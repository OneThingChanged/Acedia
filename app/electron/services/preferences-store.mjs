import fs from 'node:fs';
import path from 'node:path';

// One main process owns writes. Revisions reject stale edits from another window.
export class PreferencesStore {
  constructor(file, defaults, validate) { this.file = file; this.defaults = defaults; this.validate = validate; }
  get() {
    let value;
    try { value = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; value = {}; }
    return this.validate({ ...structuredClone(this.defaults), ...value });
  }
  set(patch, revision) {
    const current = this.get();
    if (revision !== current.revision) throw new Error('Settings changed in another window. Reload before saving.');
    const next = this.validate({ ...current, ...patch, revision: current.revision + 1 });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { fs.rmSync(temporary, { force: true }); }
    return next;
  }
}
