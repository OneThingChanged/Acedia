import fs from "node:fs";
import path from "node:path";

/**
 * Node's Windows realpath implementation can reject extended-length paths
 * (`\\?\C:\...`) even though existsSync accepts them. CLI hooks are allowed
 * to report those paths, so convert them back to their regular Win32 form
 * before canonicalizing or watching a transcript.
 */
export function normalizeTranscriptPath(value, platform = process.platform) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input || platform !== "win32") return input;
  if (input.startsWith("\\\\?\\UNC\\")) return `\\\\${input.slice(8)}`;
  if (input.startsWith("\\\\?\\")) return input.slice(4);
  if (input.startsWith("//?/UNC/")) return `//${input.slice(8)}`;
  if (input.startsWith("//?/")) return input.slice(4);
  return input;
}

/** Compare existing transcript paths after resolving junctions and symlinks. */
export function isTranscriptInsideRoot(root, candidate) {
  if (!root || !candidate) return false;
  try {
    const canonicalRoot = fs.realpathSync.native(root);
    const normalizedCandidate = normalizeTranscriptPath(candidate);
    let canonicalCandidate;
    try {
      canonicalCandidate = fs.realpathSync.native(normalizedCandidate);
    } catch (error) {
      // A SessionStart hook may report its rollout path before the file is
      // created. The parent still has to resolve inside the selected account.
      if (error.code !== "ENOENT") return false;
      canonicalCandidate = path.join(
        fs.realpathSync.native(path.dirname(normalizedCandidate)),
        path.basename(normalizedCandidate),
      );
    }
    const relative = path.relative(canonicalRoot, canonicalCandidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}
