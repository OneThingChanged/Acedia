import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const ACEDIA_SKILL_BUNDLE_VERSION = 1;
const files = {
  'acedia-browser': ['SKILL.md', 'scripts/browser.py'],
  'acedia-connection': ['SKILL.md', 'scripts/check.mjs'],
  'acedia-workspace': ['SKILL.md', 'references/sessions.md', 'references/messages.md', 'references/delegation.md', 'references/routing.md'],
  'acedia-page-capture': ['SKILL.md'],
};
const hash = text => createHash('sha256').update(text).digest('hex');
const validRelative = value => typeof value === 'string' && /^[a-z0-9-]+\/[a-zA-Z0-9_./-]+$/.test(value)
  && !value.split('/').some(part => !part || part === '.' || part === '..');
const reason = error => error.code === 'ACEDIA_SKILL_LINK' ? 'linked-skill-path'
  : error.code === 'ACEDIA_SKILL_MANIFEST' ? 'manifest-unreadable' : 'skill-files-unavailable';
function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function safeTarget(root, relative) {
  const target = path.join(root, relative);
  let current = root;
  for (const part of ['', ...relative.split('/')]) {
    current = part ? path.join(current, part) : current;
    try { if (fs.lstatSync(current).isSymbolicLink()) throw Object.assign(new Error('Linked skill path'), { code: 'ACEDIA_SKILL_LINK' }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, text, { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.rmSync(temp); }
}

// Per-account, standalone skills; no plugin registration or permission edits.
// A recorded hash authorizes updating only an unchanged Acedia-owned file.
export class AcediaSkills {
  constructor({ entries = null, version = ACEDIA_SKILL_BUNDLE_VERSION } = {}) {
    this.entries = entries; this.version = version; this.queue = Promise.resolve(); this.last = new Map();
  }
  bundle() {
    if (!this.entries) this.entries = Object.fromEntries(Object.entries(files).flatMap(([name, paths]) => paths.map(relative => [name + '/' + relative,
      fs.readFileSync(new URL(name === 'acedia-browser' ? './acedia-browser-skill/' + relative : './acedia-skills/' + name + '/' + relative, import.meta.url), 'utf8')])));
    if (Object.entries(this.entries).some(([relative, content]) => !validRelative(relative) || typeof content !== 'string')) throw new Error('Invalid bundled skill');
    return this.entries;
  }
  paths(home) {
    if (typeof home !== 'string' || !path.isAbsolute(home)) throw new Error('Absolute provider home required');
    const resolved = fs.existsSync(home) ? fs.realpathSync(home) : path.resolve(home);
    const root = path.join(resolved, 'skills');
    return { root, manifest: safeTarget(root, '.acedia-managed-skills.json') };
  }
  manifest(file) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024) throw new Error();
      const text = read(file);
      if (text === null) return { schemaVersion: 1, bundleVersion: null, files: {} };
      const value = JSON.parse(text);
      if (value.schemaVersion !== 1 || !Number.isInteger(value.bundleVersion) || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)
        || Object.entries(value.files).some(([key, digest]) => !validRelative(key) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) throw new Error();
      return value;
    } catch { throw Object.assign(new Error('Unreadable skill manifest'), { code: 'ACEDIA_SKILL_MANIFEST' }); }
  }
  inspect(home) {
    const { root, manifest } = this.paths(home), metadata = this.manifest(manifest), states = new Map();
    for (const [relative, content] of Object.entries(this.bundle())) {
      const name = relative.split('/')[0], current = read(safeTarget(root, relative));
      const state = current === content ? 'ready' : current === null ? 'missing' : 'modified';
      const previous = states.get(name);
      if (!previous || previous === 'ready' || state === 'modified') states.set(name, state);
    }
    const skills = [...states].map(([name, state]) => ({ name, state }));
    return { bundleVersion: metadata.bundleVersion, expectedBundleVersion: this.version,
      ready: skills.every(skill => skill.state === 'ready'), state: skills.every(skill => skill.state === 'ready') ? 'ready' : 'attention', skills };
  }
  status(home) {
    try {
      const result = this.inspect(home), last = this.last.get(path.resolve(home));
      return last?.state === 'error' ? { ...result, ready: false, state: 'error', reason: last.reason } : result;
    } catch (error) { return { ready: false, state: 'error', expectedBundleVersion: this.version, reason: reason(error), skills: [] }; }
  }
  install(home) {
    const run = this.queue.then(() => {
      let changed = false;
      try {
        const { root, manifest } = this.paths(home), metadata = this.manifest(manifest);
        const entries = Object.entries(this.bundle()), blocked = new Set();
        for (const [relative, content] of entries.filter(([relative]) => relative.endsWith('/SKILL.md'))) {
          const current = read(safeTarget(root, relative));
          if (current !== null && current !== content && metadata.files[relative] !== hash(current)) blocked.add(relative.split('/')[0]);
        }
        for (const [relative, content] of entries) {
          if (blocked.has(relative.split('/')[0])) continue;
          const target = safeTarget(root, relative), current = read(target);
          if (current !== null && current !== content && metadata.files[relative] !== hash(current)) continue;
          if (current !== content) { write(target, content); changed = true; }
          metadata.files[relative] = hash(content);
        }
        metadata.bundleVersion = this.version;
        const text = JSON.stringify(metadata, null, 2) + '\n';
        if (read(manifest) !== text) { write(manifest, text); changed = true; }
        const result = { ...this.inspect(home), changed };
        this.last.set(path.resolve(home), result); return result;
      } catch (error) {
        const result = { changed, ready: false, state: 'error', expectedBundleVersion: this.version, reason: reason(error), skills: [] };
        this.last.set(path.resolve(home), result); return result;
      }
    });
    this.queue = run.catch(() => {}); return run;
  }
}
