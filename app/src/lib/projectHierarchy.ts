import type { Project, ProjectHierarchy, ProjectReference } from "../types";
import { normalizeSessionModel } from "../../electron/shared/session-model.mjs";

const clean = (v: unknown, limit = 128) => typeof v === "string" && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v) ? v.trim().slice(0, limit) : "";
export function normalizeProjectHierarchy(value: unknown): ProjectHierarchy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as ProjectHierarchy, result: ProjectHierarchy = {};
  if (clean(raw.parentId)) result.parentId = clean(raw.parentId);
  if (clean(raw.folderOverride, 4096) && !/[\x00-\x1f]/.test(raw.folderOverride!)) result.folderOverride = clean(raw.folderOverride, 4096);
  if (clean(raw.instructions, 20000)) result.instructions = clean(raw.instructions, 20000);
  for (const key of ["inheritFolder", "inheritInstructions", "inheritModel"] as const) if (typeof raw[key] === "boolean") result[key] = raw[key];
  if (raw.models) {
    const codex = normalizeSessionModel(raw.models.codex), claude = normalizeSessionModel(raw.models.claude);
    if (codex || claude) result.models = { ...(codex ? { codex } : {}), ...(claude ? { claude } : {}) };
  }
  const seen = new Set<string>();
  const references: ProjectReference[] = [];
  for (const ref of Array.isArray(raw.references) ? raw.references.slice(0, 20) : []) {
    const projectId = clean(ref?.projectId), path = clean(ref?.path, 4096).replace(/\\/g, "/");
    if (!projectId || seen.has(projectId) || /[\x00-\x1f]/.test(path) || path.startsWith("/") || path.includes(":") || path.split("/").some(s => s === "..")) continue;
    const scopes = (["instructions", "code", "docs"] as const).filter(scope => Array.isArray(ref.scopes) && ref.scopes.includes(scope));
    if (!scopes.length) continue;
    seen.add(projectId);
    references.push({ projectId, ...(path ? { path } : {}), scopes, access: ref.access === "write" ? "write" : "read" });
  }
  if (references.length) result.references = references;
  return Object.keys(result).length ? result : undefined;
}
export function normalizeBoardPosition(value: unknown): Project["boardPosition"] {
  const p = value as Project["boardPosition"];
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.max(-100000, Math.min(100000, p.x)), y: Math.max(-100000, Math.min(100000, p.y)) } : undefined;
}
export function canParentProject(projects: readonly Project[], childId: string, parentId?: string): boolean {
  const child = projects.find(p => p.id === childId);
  if (!child) return false;
  if (!parentId) return true;
  const byId = new Map(projects.map(p => [p.id, p]));
  const seen = new Set([childId]);
  let parent = byId.get(parentId);
  if (!parent || (parent.sshHostId || "") !== (child.sshHostId || "")) return false;
  while (parent) {
    if (seen.has(parent.id)) return false;
    seen.add(parent.id);
    parent = parent.hierarchy?.parentId ? byId.get(parent.hierarchy.parentId) : undefined;
  }
  return true;
}
export function resolveProjectSettings(project: Project, projects: readonly Project[]) {
  const byId = new Map(projects.map(p => [p.id, p]));
  const chain: Project[] = [], seen = new Set<string>();
  let current: Project | undefined = project;
  while (current && !seen.has(current.id)) { chain.unshift(current); seen.add(current.id); current = current.hierarchy?.parentId && canParentProject(projects, current.id, current.hierarchy.parentId) ? byId.get(current.hierarchy.parentId) : undefined; }
  let folder = project.folder, remoteFolder = project.remoteFolder, instructions = "", models: ProjectHierarchy["models"] = {};
  for (const p of chain) {
    const h = normalizeProjectHierarchy(p.hierarchy);
    if (h?.inheritFolder !== true || !canParentProject(projects, p.id, h.parentId) || !h.parentId) { folder = !p.sshHostId && h?.folderOverride || p.folder; remoteFolder = p.sshHostId && h?.folderOverride || p.remoteFolder; }
    if (h?.inheritInstructions === false) instructions = "";
    instructions = [instructions, h?.instructions].filter(Boolean).join("\n\n");
    models = { ...(h?.inheritModel === true ? models : {}), ...h?.models };
  }
  // References are explicit, one hop only. Cyclic references never recurse.
  const references = (project.hierarchy?.references || []).flatMap(ref => {
    const target = byId.get(ref.projectId);
    if (!target || target.id === project.id || (target.sshHostId || "") !== (project.sshHostId || "")) return [];
    const root = target.sshHostId ? target.remoteFolder || "" : target.folder;
    const path = ref.path ? `${root.replace(/[\\/]$/, "")}/${ref.path}` : root;
    return [{ ...ref, path, name: target.name, instructions: ref.scopes.includes("instructions") ? target.hierarchy?.instructions || "" : "" }];
  });
  const referenceInstructions = references.map(ref => [
    `Referenced project: ${ref.name}\nFolder: ${ref.path}\nScope: ${ref.scopes.join(", ")}\n${ref.access === "write" ? "Edits may be requested within this folder." : "Use as reference only. Do not modify files in this folder."}`,
    ref.instructions,
  ].filter(Boolean).join("\n")).join("\n\n");
  return { folder, remoteFolder, instructions: [instructions, referenceInstructions].filter(Boolean).join("\n\n"), models, references };
}
export function updateProjectHierarchy(projects: readonly Project[], id: string, value: ProjectHierarchy): Project[] {
  const target = projects.find(p => p.id === id), hierarchy = normalizeProjectHierarchy(value);
  if (!target || !canParentProject(projects, id, hierarchy?.parentId)) throw new Error("Invalid parent: choose a project on the same machine, outside its descendants.");
  if (hierarchy?.folderOverride && !/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(hierarchy.folderOverride)) throw new Error("Working folder must be an absolute path.");
  for (const ref of hierarchy?.references || []) {
    const other = projects.find(p => p.id === ref.projectId);
    if (!other || other.id === id || (other.sshHostId || "") !== (target.sshHostId || "")) throw new Error("Invalid reference project.");
    if (target.sshHostId && ref.access === "write") throw new Error("SSH references support reference guidance only.");
  }
  let next = projects.map(p => p.id === id ? { ...p, hierarchy } : p);
  // Detaching folder inheritance keeps the effective working folder.
  if (target.hierarchy?.inheritFolder && target.hierarchy.parentId && !hierarchy?.parentId) {
    const resolved = resolveProjectSettings(target, projects);
    next = next.map(p => p.id === id ? { ...p, hierarchy: { ...hierarchy, folderOverride: target.sshHostId ? resolved.remoteFolder : resolved.folder } } : p);
  }
  if (resolveProjectSettings(next.find(p => p.id === id)!, next).instructions.length > 20000) throw new Error("Effective instructions must be within 20,000 characters.");
  return next;
}
export function removeProjectRelationships(projects: readonly Project[], id: string): Project[] {
  return projects.filter(p => p.id !== id).map(p => {
    if (!p.hierarchy) return p;
    const settings = resolveProjectSettings(p, projects);
    const orphan = p.hierarchy.parentId === id;
    return { ...p, hierarchy: normalizeProjectHierarchy({ ...p.hierarchy, ...(orphan ? { parentId: undefined, inheritFolder: false, ...(p.hierarchy.inheritFolder ? { folderOverride: p.sshHostId ? settings.remoteFolder : settings.folder } : {}) } : {}), references: p.hierarchy.references?.filter(r => r.projectId !== id) }) };
  });
}
