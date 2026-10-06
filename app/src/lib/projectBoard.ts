import type { Agent, Project } from "../types";
import { isAgentRuntimeActive } from "./agentActivity";

export const PROJECT_CARD_WIDTH = 274;
const GAP_X = 72, GAP_Y = 96, ROW_WIDTH = PROJECT_CARD_WIDTH * 3 + GAP_X * 2;

export function boardProjects(projects: readonly Project[], agents: readonly Agent[], activeOnly: boolean): Project[] {
  if (!activeOnly) return [...projects];
  const live = new Set(agents.filter(a => isAgentRuntimeActive(a) && !a.deferredStart).map(a => a.projectId));
  return projects.filter(p => live.has(p.id));
}

function folderKey(project: Project): string | null {
  const raw = (project.sshHostId ? project.remoteFolder : project.folder)?.trim();
  if (!raw || /[\x00-\x1f]/.test(raw)) return null;
  let source = project.sshHostId ? raw : raw.replace(/\\/g, "/");
  let root: string;
  if (!project.sshHostId && /^[A-Za-z]:\//.test(source)) {
    source = source.toLowerCase(); root = source.slice(0, 3); source = source.slice(3);
  } else if (!project.sshHostId && source.startsWith("//")) {
    const unc = source.match(/^\/\/([^/]+)\/+([^/]+)(?:\/+|$)/);
    if (!unc) return null;
    root = `//${unc[1].toLowerCase()}/${unc[2].toLowerCase()}/`;
    source = source.slice(unc[0].length).toLowerCase();
  } else if (source.startsWith("/")) {
    root = "/"; source = source.slice(1);
  } else return null;
  const segments: string[] = [];
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") segments.pop(); else segments.push(part);
  }
  return root + (segments.length ? segments.join("/") + "/" : "");
}

// This is a view of registered folder containment, not a change to launch settings.
// Passing the visible projects connects the nearest visible ancestor in Active view.
export function folderProjectParents(projects: readonly Project[]): Map<string, string> {
  const paths = new Map(projects.map(p => [p.id, folderKey(p)]));
  const parents = new Map<string, string>();
  for (const child of projects) {
    const childPath = paths.get(child.id);
    if (!childPath) continue;
    let nearest: Project | undefined, length = 0;
    for (const candidate of projects) {
      const parentPath = paths.get(candidate.id);
      if ((candidate.sshHostId || "") !== (child.sshHostId || "") || !parentPath || parentPath.length <= length) continue;
      if (childPath !== parentPath && childPath.startsWith(parentPath)) { nearest = candidate; length = parentPath.length; }
    }
    if (nearest) parents.set(child.id, nearest.id);
  }
  return parents;
}

export function layoutProjectBoard(projects: readonly Project[], folderParents: ReadonlyMap<string, string>, height: (id: string) => number): Map<string, { x: number; y: number }> {
  const byId = new Map(projects.map(p => [p.id, p]));
  const parents = new Map(folderParents);
  // Explicit settings relationships also get a hierarchy layout. Folder ancestry
  // takes precedence for placement, and mixed relationships must never form a cycle.
  for (const p of projects) {
    const parent = p.hierarchy?.parentId && byId.get(p.hierarchy.parentId);
    if (parents.has(p.id) || !parent || (parent.sshHostId || "") !== (p.sshHostId || "")) continue;
    const seen = new Set([p.id]); let id: string | undefined = parent.id;
    while (id && !seen.has(id)) { seen.add(id); id = parents.get(id); }
    if (!id) parents.set(p.id, parent.id);
  }
  const children = new Map(projects.map(p => [p.id, projects.filter(child => parents.get(child.id) === p.id)]));
  const widths = new Map<string, number>();
  function width(p: Project): number {
    const rows = children.get(p.id)!;
    const result = Math.max(PROJECT_CARD_WIDTH, rows.reduce((sum, child) => sum + width(child), 0) + Math.max(0, rows.length - 1) * GAP_X);
    widths.set(p.id, result); return result;
  }
  const positions = new Map<string, { x: number; y: number }>();
  let rowX = 0, rowY = 0, rowHeight = 0;
  for (const root of projects.filter(p => !parents.has(p.id))) {
    const blockWidth = width(root), levels: number[] = [];
    function measure(p: Project, depth: number) {
      levels[depth] = Math.max(levels[depth] || 0, height(p.id));
      children.get(p.id)!.forEach(child => measure(child, depth + 1));
    }
    measure(root, 0);
    const levelY = levels.map((_h, depth) => levels.slice(0, depth).reduce((sum, h) => sum + h + GAP_Y, 0));
    const blockHeight = levelY[levelY.length - 1] + levels[levels.length - 1];
    if (rowX && rowX + blockWidth > ROW_WIDTH) { rowY += rowHeight + GAP_Y; rowX = 0; rowHeight = 0; }
    function place(p: Project, x: number, depth: number) {
      positions.set(p.id, { x: x + (widths.get(p.id)! - PROJECT_CARD_WIDTH) / 2, y: rowY + levelY[depth] });
      let childX = x;
      for (const child of children.get(p.id)!) { place(child, childX, depth + 1); childX += widths.get(child.id)! + GAP_X; }
    }
    place(root, rowX, 0); rowX += blockWidth + GAP_X; rowHeight = Math.max(rowHeight, blockHeight);
  }
  return positions;
}
