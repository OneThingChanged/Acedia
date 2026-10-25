import type { Agent, Project } from "../types";
import { isAbsoluteFsPath, joinFsPath, relativeIfInside } from "./path";
import { resolveSessionSettings } from "./sessionHierarchy";

type ResolveDocumentPath = (args: { folder: string; path: string }) => Promise<string>;

// Resolve the link beside the session's files, then translate it to the project
// root used by document tabs. These roots need not be the same for child sessions.
export async function resolveSessionDocumentLink(
  agent: Agent,
  agents: readonly Agent[],
  projects: readonly Project[],
  path: string,
  resolvePath: ResolveDocumentPath,
) {
  const project = projects.find(item => item.id === agent.projectId);
  if (!project?.folder) throw new Error("프로젝트 폴더를 찾을 수 없습니다.");
  const folder = resolveSessionSettings(agent, agents, projects).folder || project.folder;
  const resolved = await resolvePath({ folder, path });
  const absolutePath = isAbsoluteFsPath(resolved) ? resolved : joinFsPath(folder, resolved);
  return { projectId: project.id, absolutePath, relativePath: relativeIfInside(project.folder, absolutePath) };
}
