import type { Agent, Project } from '../types';
import { resolveSessionSettings } from './sessionHierarchy';
import { resolveProjectSettings } from './projectHierarchy';
import { joinFsPath, relativeIfInside } from './path';
import { parseDocTabId } from './docTabs';
import { parseGitHistoryTabId } from './gitHistoryTabs';

const folderKey = (folder: string) => {
  const normalized = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^(?:[A-Za-z]:|\/\/)/.test(normalized) ? normalized.toLowerCase() : normalized;
};
export function fileTreeWorkspace(project: Project, projects: readonly Project[], agents: readonly Agent[], sessionId?: string | null) {
  const session = agents.find(a => a.id === sessionId && a.projectId === project.id);
  const settings = session ? resolveSessionSettings(session, agents, projects) : resolveProjectSettings(project, projects);
  const folder = project.sshHostId ? '' : settings.folder;
  const registeredRoot = !project.sshHostId && folderKey(folder) === folderKey(project.folder);
  return { session, folder, remoteFolder: settings.remoteFolder,
    label: session?.name || project.name,
    cacheKey: registeredRoot ? project.id : `${project.id}::folder:${project.sshHostId || ''}:${folderKey(project.sshHostId ? settings.remoteFolder || '' : folder)}` };
}

// Keep ordinary/nested project files on their existing tab IDs. A session on
// another drive needs its own explicit root; never join that path to the parent.
export function fileTreeDocumentReference(projectFolder: string, workingFolder: string, path: string) {
  const relativePath = relativeIfInside(projectFolder, joinFsPath(workingFolder, path));
  return relativePath ? { relativePath } : { relativePath: path, rootFolder: workingFolder };
}

export function fileTreeRepositoryPath(projectFolder: string, workingFolder: string): string | null {
  return folderKey(projectFolder) === folderKey(workingFolder) ? null : relativeIfInside(projectFolder, workingFolder) || workingFolder;
}

export function fileTreeSessionForTab(tabId: string | null, agents: readonly Agent[], projects: readonly Project[], ownerId?: string): string | null {
  const direct = agents.find(a => a.id === tabId) || agents.find(a => a.id === ownerId);
  if (direct) return direct.id;
  if (!tabId) return null;
  const doc = parseDocTabId(tabId), history = parseGitHistoryTabId(tabId);
  const project = projects.find(p => p.id === (doc?.projectId || history?.projectId));
  if (!project || project.sshHostId) return null;
  const root = doc?.rootFolder || (history?.repositoryPath
    ? /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(history.repositoryPath) ? history.repositoryPath : joinFsPath(project.folder, history.repositoryPath)
    : project.folder);
  const path = folderKey(doc ? joinFsPath(root, doc.relativePath) : root);
  // Saved document/history tabs can recover their folder context after restart
  // even though the runtime-only document owner map has been cleared.
  const candidates = agents.filter(a => a.projectId === project.id).map(a => ({ id: a.id, folder: folderKey(resolveSessionSettings(a, agents, projects).folder) }));
  return candidates.filter(a => a.folder && (path === a.folder || path.startsWith(a.folder + '/'))).sort((a, b) => b.folder.length - a.folder.length)[0]?.id || null;
}
