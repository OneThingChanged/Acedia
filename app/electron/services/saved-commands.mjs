import path from 'node:path';
import { PreferencesStore } from './preferences-store.mjs';
function validate(value) {
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("Invalid revision.");
  if (!Array.isArray(value.commands) || value.commands.length > 200 || !value.startups || typeof value.startups !== 'object' || Array.isArray(value.startups)) throw new Error('Invalid saved commands.');
  const ids = new Set();
  const commands = value.commands.map(c => {
    if (!c || typeof c.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(c.id) || ids.has(c.id) || !['global', 'project'].includes(c.scope) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80 || typeof c.command !== 'string' || !c.command.trim() || c.command.length > 16384 || c.command.includes('\0') || (c.scope === 'project' && (typeof c.projectId !== 'string' || !c.projectId || c.projectId.length > 256))) throw new Error('Invalid command name, scope or script.');
    ids.add(c.id); return { id: c.id, name: c.name.trim(), command: c.command, scope: c.scope, ...(c.scope === 'project' ? { projectId: c.projectId } : {}) };
  });
  const startups = {};
  for (const [projectId, entry] of Object.entries(value.startups)) {
    if (!projectId || projectId.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(projectId)) throw new Error('Invalid project.');
    const command = commands.find(c => c.id === entry?.commandId);
    if (!command || (command.scope === 'project' && command.projectId !== projectId)) throw new Error('Startup command is unavailable in this project.');
    startups[projectId] = { commandId: command.id, automatic: entry.automatic === true };
  }
  return { revision: value.revision, commands, startups };
}
export class SavedCommands {
  constructor(directory) { this.store = new PreferencesStore(path.join(directory, 'saved-commands.json'), { revision: 0, commands: [], startups: {} }, validate); this.started = new Set(); }
  resolve(commandId, projectId) {
    const command = this.store.get().commands.find(c => c.id === commandId);
    if (!command || (command.scope === 'project' && command.projectId !== projectId)) throw new Error('Command is unavailable in this project.');
    return command;
  }
  claimStartup(projectId) {
    const entry = this.store.get().startups[projectId];
    if (!entry?.automatic || this.started.has(projectId)) return null;
    const command = this.resolve(entry.commandId, projectId);
    this.started.add(projectId); return command;
  }
}
