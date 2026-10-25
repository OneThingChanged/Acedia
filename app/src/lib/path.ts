export function folderTail(p: string): string {
  const normalized = p.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return ".../" + parts.slice(-2).join("/");
}

export function isAbsoluteFsPath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\") || path.startsWith("/");
}

export function joinFsPath(folder: string, relativePath: string) {
  return `${folder.replace(/[\\/]+$/, "")}/${relativePath}`;
}

// Document tabs belong to the registered project even when a session works in
// a nested folder. Keep Windows separators and case out of that comparison.
export function relativeIfInside(folder: string, absolutePath: string): string | null {
  const normFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
  const normPath = absolutePath.replace(/\\/g, "/");
  if (!normFolder) return null;
  if (normPath.toLowerCase().startsWith(`${normFolder.toLowerCase()}/`) && normPath.length > normFolder.length + 1) {
    return normPath.slice(normFolder.length + 1);
  }
  return null;
}
