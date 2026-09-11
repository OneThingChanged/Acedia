import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SavedCommands } from './saved-commands.mjs';
it('persists scoped commands and claims automatic startup only once across callers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saved-commands-'));
  try {
    const service = new SavedCommands(root), id = randomUUID();
    service.store.set({ commands: [{ id, name: 'Build', scope: 'project', projectId: 'project-one', command: 'echo fixture' }], startups: { 'project-one': { commandId: id, automatic: true } } }, 0);
    expect(() => service.resolve(id, 'another-project')).toThrow();
    expect(service.claimStartup('another-project')).toBeNull();
    expect(service.claimStartup('project-one').command).toBe('echo fixture');
    expect(service.claimStartup('project-one')).toBeNull();
    expect(new SavedCommands(root).claimStartup('project-one').id).toBe(id);
    expect(() => service.store.set({ commands: [] }, 1)).toThrow();
    expect(service.resolve(id, 'project-one').name).toBe('Build');
    expect(() => service.store.set({ commands: [{ id, name: 'Bad', scope: 'global', command: 'a\0b' }] }, 1)).toThrow();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
