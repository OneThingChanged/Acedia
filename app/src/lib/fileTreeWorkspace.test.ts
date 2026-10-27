import { expect, it } from 'vitest';
import type { Agent, Project } from '../types';
import { fileTreeWorkspace, fileTreeDocumentReference, fileTreeRepositoryPath, fileTreeSessionForTab } from './fileTreeWorkspace';
import { makeDocTabId, parseDocTabId } from './docTabs';
import { makeGitHistoryTabId, parseGitHistoryTabId } from './gitHistoryTabs';

const project: Project = { id: 'p', name: 'AIHub', folder: 'G:/AI', createdAt: 1 };
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, name: id, projectId: 'p', folder: 'G:/AI', aiToolId: 'codex', aiLabel: 'Codex', dangerous: false, status: 'idle', createdAt: 1, ...extra });
it('restores child folder context from saved document/history tabs and prefers explicit runtime ownership', () => {
  const parent = agent('manager');
  const child = agent('child', { sessionHierarchy: { parentId: 'manager', inheritFolder: false, folderOverride: 'D:/AI2/PCGLab' } });
  const nested = agent('nested', { sessionHierarchy: { parentId: 'manager', inheritFolder: false, folderOverride: 'G:/AI/Nested' } });
  const agents = [parent, child, nested];
  expect(fileTreeSessionForTab(makeDocTabId('p', 'README.md', 'D:/AI2/PCGLab'), agents, [project])).toBe('child');
  expect(fileTreeSessionForTab(makeDocTabId('p', 'Nested/README.md'), agents, [project])).toBe('nested');
  expect(fileTreeSessionForTab(makeGitHistoryTabId('p', null, 'D:/AI2/PCGLab'), agents, [project])).toBe('child');
  expect(fileTreeSessionForTab(makeDocTabId('p', 'Nested/README.md'), agents, [project], 'manager')).toBe('manager');
  expect(fileTreeSessionForTab(null, agents, [project])).toBeNull();
});
it('follows explicit child roots even across drives while keeping registered project membership', () => {
  const parent = agent('manager');
  const child = agent('PCGLab', { folder: 'G:/stale', sessionHierarchy: { parentId: 'manager', inheritFolder: false, folderOverride: 'D:/AI2/PCGLab' } });
  const result = fileTreeWorkspace(project, [project], [parent, child], child.id);
  expect(result).toMatchObject({ label: 'PCGLab', folder: 'D:/AI2/PCGLab', session: child });
  expect(result.cacheKey).not.toBe(fileTreeWorkspace(project, [project], [parent, child], parent.id).cacheKey);
  expect(project.folder).toBe('G:/AI'); expect(child.folder).toBe('G:/stale');
});
it('uses inherited effective folders, separates siblings and folder edits, and keeps legacy root cache keys', () => {
  const parent = agent('manager', { sessionHierarchy: { folderOverride: 'D:/work' } });
  const child = agent('child', { sessionHierarchy: { parentId: 'manager' } });
  const sibling = agent('sibling', { sessionHierarchy: { parentId: 'manager', inheritFolder: false, folderOverride: 'E:/other' } });
  const agents = [parent, child, sibling];
  expect(fileTreeWorkspace(project, [project], agents, child.id).folder).toBe('D:/work');
  expect(fileTreeWorkspace(project, [project], agents, sibling.id).folder).toBe('E:/other');
  expect(fileTreeWorkspace(project, [project], agents, null).cacheKey).toBe(project.id);
  const before = fileTreeWorkspace(project, [project], agents, child.id).cacheKey;
  parent.sessionHierarchy!.folderOverride = 'D:/moved';
  expect(fileTreeWorkspace(project, [project], agents, child.id).cacheKey).not.toBe(before);
});
it('does not use an unrelated project session and never browses an SSH root as local files', () => {
  const other = agent('other', { projectId: 'elsewhere', folder: 'C:/private' });
  expect(fileTreeWorkspace(project, [project], [other], other.id)).toMatchObject({ folder: project.folder, label: project.name, session: undefined });
  const remote = { ...project, sshHostId: 'host', remoteFolder: '/srv/root' };
  const child = agent('remote', { sshHostId: 'host', remoteFolder: '/srv/root', sessionHierarchy: { inheritFolder: false, folderOverride: '/srv/child' } });
  expect(fileTreeWorkspace(remote, [remote], [child], child.id)).toMatchObject({ folder: '', remoteFolder: '/srv/child' });
});
it('maps nested files to existing registered-project tabs and scoped history', () => {
  const ref = fileTreeDocumentReference('G:\\AI', 'g:/ai/PCGLab', 'Docs/Report.md');
  expect(ref).toEqual({ relativePath: 'PCGLab/Docs/Report.md' });
  expect(makeDocTabId('p', ref.relativePath, ref.rootFolder)).toBe(makeDocTabId('p', 'PCGLab/Docs/Report.md'));
  expect(fileTreeRepositoryPath('G:/AI', 'g:/ai/PCGLab/Plugin')).toBe('PCGLab/Plugin');
  expect(fileTreeRepositoryPath('G:/AI', 'g:\\ai\\')).toBeNull();
});
it.each(['D:\\AI2\\PCGLab', '\\\\server\\share\\PCGLab', '/tmp/PCGLab'])('keeps an external working root intact in document and history tabs: %s', folder => {
  const ref = fileTreeDocumentReference('G:/AI', folder, 'Docs/Report.md');
  expect(ref).toEqual({ relativePath: 'Docs/Report.md', rootFolder: folder });
  expect(parseDocTabId(makeDocTabId('p', ref.relativePath, ref.rootFolder))).toEqual({ projectId: 'p', ...ref });
  const repository = fileTreeRepositoryPath('G:/AI', folder)!;
  expect(parseGitHistoryTabId(makeGitHistoryTabId('p', 'Docs/Report.md', repository))).toEqual({ projectId: 'p', path: 'Docs/Report.md', repositoryPath: folder.replace(/\\/g, '/') });
});
