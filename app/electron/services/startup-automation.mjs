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
// Explicit local Claude activation may trust its registered project/folder,
// including ordinary sessions without API-created provenance. Scope is still
// checked against the actual native prompt and live cwd before any key is sent.
export function registeredClaudeTrustRoot(catalog, id) {
  const agent = catalog.agents?.find(a => a.id === id), project = catalog.projects?.find(p => p.id === agent?.projectId);
  if (agent?.aiToolId !== 'claude' || agent.sshHostId || !project || project.sshHostId) return null;
  try {
    const root = canonical(project.folder), folder = canonical(agent.folder || project.folder);
    return within(root, folder) ? root : folder;
  } catch { return null; }
}
export function startupPrompt(entry) {
  if (!entry || entry.ssh || !['codex', 'claude'].includes(entry.aiToolId)) return null;
  const screen = entry.filter?.shadow ? readTerminalStartupScreen(entry.filter.shadow) : entry.filter?.viewportText?.() || '';
  return parseTerminalStartupPrompt(screen, entry.aiToolId);
}

// Explicit activation policy or API creation grants only the registered directory.
// No window navigation and no persisted Codex config edits are needed.
export class StartupAutomation {
  constructor({ entry, allowedRoot, write, verifyHooks = () => null, blocked = () => false, publish = () => {} }) {
    Object.assign(this, { entry, allowedRoot, write, verifyHooks, blocked, publish });
    this.attempted = new WeakSet();
    this.moved = new WeakMap();
    this.hookAttempted = new WeakSet();
    this.hookMoved = new WeakMap();
    this.updateSkipped = new WeakSet();
  }
  check(id) {
    const entry = this.entry(id), prompt = startupPrompt(entry);
    if (prompt?.startupKind === 'hook-review') return this.checkHooks(id, entry, prompt);
    if (prompt?.startupKind === 'cli-update') return this.skipUpdate(id, entry, prompt);
    if (!entry || this.attempted.has(entry) || this.blocked(id) || prompt?.startupKind !== 'folder-trust' || prompt.selectedIndex === undefined) return false;
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
    const moved = this.moved.get(entry), confirmIndex = prompt.confirmIndex ?? 0;
    if (moved && (entry.lastInputAt !== moved.inputAt || moved.folder !== folder || moved.root !== root)) return false;
    if (prompt.selectedIndex !== confirmIndex) {
      // Claude starts on No. Move once within this exact native folder dialog;
      // confirmation is a later observation, never a blind Down+Enter sequence.
      if (entry.aiToolId !== 'claude' || moved || prompt.selectedIndex !== 0) return false;
      this.moved.set(entry, { folder, root, at: Date.now(), inputAt });
      try { this.write(id, '\x1b[B'); this.moved.get(entry).inputAt = entry.lastInputAt; }
      catch { this.attempted.add(entry); }
      return false;
    }
    if (moved && Date.now() - moved.at < 200) return false;
    this.attempted.add(entry); // A failed/uncertain write is never replayed.
    try {
      this.write(id, '\r');
      entry.startupTrustConfirmation = { folder, trustRoot, at: Date.now() };
      this.publish({ id, ...entry.startupTrustConfirmation });
      return true;
    } catch { return false; }
  }

  skipUpdate(id, entry, prompt) {
    if (this.updateSkipped.has(entry) || this.blocked(id) || entry.subscribers?.size || entry.firstMessageInput || entry.firstMessageSubmitted) return false;
    const inputAt = entry.lastInputAt, current = this.entry(id);
    const live = startupPrompt(current);
    if (current !== entry || entry.lastInputAt !== inputAt || live?.startupKind !== 'cli-update' || live.text !== prompt.text) return false;
    this.updateSkipped.add(entry);
    try {
      // The native Esc action postpones this prompt without installing anything.
      this.write(id, '\x1b');
      this.publish({ id, kind: 'cli-update-skipped' });
      return true;
    } catch { return false; }
  }

  checkHooks(id, entry, prompt) {
    if (this.hookAttempted.has(entry) || this.blocked(id) || entry.aiToolId !== 'codex'
      || ![0, 1].includes(prompt.selectedIndex) || !Number.isSafeInteger(prompt.changedHookCount) || prompt.changedHookCount < 1) return false;
    try {
      const inputAt = entry.lastInputAt, proof = this.verifyHooks(entry);
      if (!proof || prompt.changedHookCount > proof.count || (proof.exactPending && prompt.changedHookCount !== proof.count)
        || canonical(proof.cwd) !== canonical(entry.cwd)) return false;
      const fingerprint = proof.fingerprint, moved = this.hookMoved.get(entry);
      if (moved && (inputAt !== moved.inputAt || fingerprint !== moved.fingerprint || prompt.changedHookCount !== moved.count)) return false;
      const current = this.entry(id), live = startupPrompt(current), verified = this.verifyHooks(current);
      if (current !== entry || entry.lastInputAt !== inputAt || this.blocked(id)
        || JSON.stringify(live) !== JSON.stringify(prompt) || verified?.fingerprint !== fingerprint) return false;
      if (prompt.selectedIndex === 0) {
        if (moved) return false;
        const movement = { fingerprint, count: prompt.changedHookCount, at: Date.now(), inputAt };
        this.hookMoved.set(entry, movement);
        try { this.write(id, '\x1b[B'); movement.inputAt = entry.lastInputAt; }
        catch { this.hookAttempted.add(entry); }
        return false;
      }
      if (moved && Date.now() - moved.at < 200) return false;
      this.hookAttempted.add(entry);
      this.write(id, '\r');
      entry.startupHookConfirmation = { folder: proof.cwd, fingerprint, hookCount: prompt.changedHookCount, at: Date.now() };
      this.publish({ id, kind: 'hook-review', ...entry.startupHookConfirmation });
      return true;
    } catch { return false; }
  }
}
