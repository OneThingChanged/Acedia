import fs from 'node:fs';
import path from 'node:path';
import { parseTerminalStartupPrompt, readTerminalStartupScreen } from '../shared/terminal-startup-prompt.mjs';

const canonical = value => {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error('Absolute folder required');
  const result = fs.realpathSync(value);
  if (!fs.statSync(result).isDirectory()) throw Error('Folder required');
  return process.platform === 'win32' ? result.toLowerCase() : result;
};
const within = (root, value) => value === root || value.startsWith(root + path.sep);
export function startupPrompt(entry) {
  if (!entry || entry.ssh || entry.aiToolId !== 'codex') return null;
  const screen = entry.filter?.shadow ? readTerminalStartupScreen(entry.filter.shadow) : entry.filter?.viewportText?.() || '';
  return parseTerminalStartupPrompt(screen, entry.aiToolId);
}

// The operator grants a project directory, never a provider-wide permission.
// No window navigation and no persisted Codex config edits are needed.
export class StartupAutomation {
  constructor({ entry, allowedRoot, write, blocked = () => false, publish = () => {} }) {
    Object.assign(this, { entry, allowedRoot, write, blocked, publish });
    this.attempted = new WeakSet();
  }
  check(id) {
    const entry = this.entry(id), prompt = startupPrompt(entry);
    if (!entry || this.attempted.has(entry) || this.blocked(id) || prompt?.startupKind !== 'folder-trust' || prompt.selectedIndex !== 0) return false;
    const inputAt = entry.lastInputAt;
    let root, folder, trustRoot;
    try {
      root = canonical(this.allowedRoot(id)); folder = canonical(entry.cwd); trustRoot = canonical(prompt.trustRoot);
      if (canonical(prompt.folder) !== folder || !within(root, folder) || !within(root, trustRoot) || !within(trustRoot, folder)) return false;
    } catch { return false; }
    // Re-read immediately before the one irreversible key. A changed process,
    // selection, input, scope or native dialog is never confirmed speculatively.
    const livePrompt = startupPrompt(this.entry(id));
    if (this.entry(id) !== entry || entry.lastInputAt !== inputAt || this.blocked(id)
      || JSON.stringify(livePrompt) !== JSON.stringify(prompt)) return false;
    try { if (canonical(this.allowedRoot(id)) !== root) return false; } catch { return false; }
    this.attempted.add(entry); // A failed/uncertain write is never replayed.
    try {
      this.write(id, '\r');
      entry.startupTrustConfirmation = { folder, trustRoot, at: Date.now() };
      this.publish({ id, ...entry.startupTrustConfirmation });
      return true;
    } catch { return false; }
  }
}
