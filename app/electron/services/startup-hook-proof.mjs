import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'smol-toml';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => {
  if (!value || !path.isAbsolute(value)) throw Error('Absolute path required');
  return fs.realpathSync(value);
};
// This is deliberately narrower than native Trust all: only the exact commands
// installed by this host may be approved. Unknown hook sources stay interactive.
export function captureStartupHookProof({ cwd, home, args = [], helperPath, helperScript, commands }) {
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (/^(?:--(?:profile|hook[^=]*|cd|session[^=]*)|-[pC])(?:=|$)/.test(arg)) return null;
      const override = arg === '-c' || arg === '--config' ? args[++i] : arg.startsWith('--config=') ? arg.slice(9) : arg.startsWith('-c') ? arg.slice(2) : null;
      if (override !== null && (!override || /^\s*["']?(?:hooks|plugins|profiles|profile)["']?\s*(?:[.=[]|$)/.test(override))) return null;
    }
    cwd = canonical(cwd); home = canonical(home || path.join(os.homedir(), '.codex'));
    const files = new Map(), events = new Set(); let count = 0;
    const read = file => {
      if (files.has(file)) return files.get(file).text;
      let text = '';
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || canonical(path.dirname(file)) !== path.resolve(path.dirname(file))) throw Error('Unverifiable source');
        text = fs.readFileSync(file, 'utf8');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      files.set(file, { text, digest: hash(text) }); return text;
    };
    const validate = hooks => {
      if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) throw Error('Unknown hooks');
      for (const [event, entries] of Object.entries(hooks)) {
        if (event === 'state') continue; // Native per-hash trust metadata.
        const expected = commands[event];
        if (!expected || !Array.isArray(entries)) throw Error('Unknown event');
        for (const entry of entries) {
          if (!entry || entry.__source !== 'multiagent' || entry.matcher !== ''
            || Object.keys(entry).some(k => !['__source', 'matcher', 'hooks'].includes(k))
            || !Array.isArray(entry.hooks) || entry.hooks.length !== 1) throw Error('Unknown hook');
          const hook = entry.hooks[0];
          if (hook.type !== 'command' || hook.command !== expected || Object.keys(hook).some(k => !['type', 'command'].includes(k))) throw Error('Unknown command');
          count++; events.add(event);
        }
      }
    };
    const layer = directory => {
      const file = path.join(directory, 'config.toml'), text = read(file), config = text ? parse(text) : {};
      // Profiles, extra directories and enabled plugins can contribute hooks
      // outside these files. Leave their native review to the operator.
      const walk = (value, top = false) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
          if (/^(?:plugins|hooks_dir|hook_dirs|hooks_files|profile|project_root_markers)$/.test(key) && item && (typeof item !== 'object' || Object.keys(item).length)) throw Error('Additional hook sources');
          if (key === 'hooks') { if (!top) throw Error('Nested hooks'); validate(item); }
          else walk(item);
        }
      };
      walk(config, true);
      // Folder trust and native per-hash approval metadata are written during
      // startup. They must not invalidate an otherwise unchanged hook set.
      const { state: _state, ...hooks } = config.hooks || {};
      files.get(file).digest = hash(JSON.stringify(hooks));
      const json = read(path.join(directory, 'hooks.json'));
      if (json.trim()) {
        const value = JSON.parse(json);
        if (Object.keys(value).some(k => !['hooks', 'description'].includes(k))) throw Error('Unknown hook file');
        validate(value.hooks);
      }
    };
    if (read(helperPath) !== helperScript) return null;
    // Plugin hooks may be loaded by a CLI default or another active config
    // layer. Until their resolved inventory is available, keep review manual.
    const plugins = path.join(home, 'plugins');
    if (fs.existsSync(plugins) && fs.readdirSync(plugins).length) return null;
    layer(home);
    // Default project layers run from the repository root to cwd. Outside a
    // repository, cwd is the root; an isolated CODEX_HOME must not accidentally
    // pull ~/.codex in as an unrelated project ancestor.
    let projectRoot = cwd;
    for (let folder = cwd; ; folder = path.dirname(folder)) {
      if (fs.existsSync(path.join(folder, '.git'))) { projectRoot = folder; break; }
      if (path.dirname(folder) === folder) break;
    }
    for (let folder = cwd; ; folder = path.dirname(folder)) {
      layer(path.join(folder, '.codex'));
      if (folder === projectRoot) break;
    }
    if (process.platform !== 'win32') layer('/etc/codex');
    if (events.size !== Object.keys(commands).length || count < events.size) return null;
    return { cwd, home, count, fingerprint: hash(JSON.stringify([...files].map(([file, value]) => [file, value.digest]))) };
  } catch { return null; }
}
