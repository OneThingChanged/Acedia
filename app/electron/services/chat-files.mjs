import path from "node:path";
import { fileURLToPath } from "node:url";
import { changesFromToolCall } from "./chat-file-changes.mjs";

function cleanPath(value, encoded = false) {
  let candidate = String(value ?? "").trim().replace(/^[<`]+|[>`]+$/g, "");
  if (/^(?:https?:|data:|mailto:|app:|chat:)/i.test(candidate)) return null;
  candidate = candidate.replace(/#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?$/i, "").replace(/:\d+(?::\d+)?$/, "");
  try {
    if (/^file:/i.test(candidate)) candidate = fileURLToPath(candidate);
    else if (encoded) candidate = decodeURIComponent(candidate);
  } catch { /* Literal percent in a filename. */ }
  return candidate.replace(/^\/(?=[a-z]:[\\/])/i, "").replace(/\\([ ()])/g, "$1");
}

// Read only paths mentioned in a block. Never enumerate the project directory.
export function conversationFileCandidates(block) {
  if (block.role === "user" || block.kind === "reasoning") return [];
  const candidates = new Map();
  const add = (value, encoded = false) => {
    const candidate = String(value ?? "").trim();
    if (candidate && candidate.length <= 2048 && candidates.size < 256) candidates.set(`${encoded}:${candidate}`, { path: candidate, encoded });
  };
  if (block.input && typeof block.input === "object") {
    for (const key of ["file_path", "path", "filePath", "output_path", "relativePath", "notebook_path"]) {
      if (typeof block.input[key] === "string") add(block.input[key]);
    }
  }
  for (const value of [block.text, block.output]) {
    if (typeof value !== "string") continue;
    // Process links and code spans first so surrounding Markdown isn't part of a path.
    const plain = value.replace(/\]\((<[^>]+>|[^)\r\n]+)\)/g, (_, target) => { add(target.replace(/\s+["'][^"']*["']$/, ""), true); return " "; })
      .replace(/`([^`\r\n]+)`/g, (_, target) => { add(target); return " "; });
    for (const match of plain.matchAll(/(?:^|\s)(\/?[a-z]:[\\/][^\r\n"'<>|`]+)/gi)) add(match[1].replace(/[),.;]+$/, "").trim());
    // Tokenize before checking extensions: the previous unanchored greedy
    // regex repeatedly rescanned long code/base64 lines (quadratic work).
    for (const token of plain.split(/[\s"'<>|`()\[\]{};,=]+/)) {
      const candidate = token.replace(/[),.;]+$/, "");
      if (candidate.length <= 2048 && /\.[a-z0-9]{1,12}(?::\d+(?::\d+)?)?$/i.test(candidate)) add(candidate);
    }
  }
  return [...candidates.values()];
}

function patchPaths(patch) {
  const files = [];
  for (const match of String(patch ?? "").matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)) files.push(match[1].trim());
  return files;
}

function mutationPaths(call, result) {
  const tool = String(call?.name ?? "").split(/[.:/]|__/).pop().toLowerCase();
  const input = call?.input;
  const fields = input && typeof input === "object" ? input : {};
  if (/^(?:write|write_file|create_file|edit|edit_file|multiedit|str_replace|str_replace_editor|notebookedit)$/.test(tool)) {
    if (fields.command === "view") return [];
    return [fields.file_path ?? fields.path ?? fields.filePath ?? fields.notebook_path].filter(value => typeof value === "string");
  }
  if (tool === "apply_patch") return patchPaths(typeof input === "string" ? input : fields.patch ?? fields.input ?? fields.diff);
  if (/^(?:imagegen|image_gen|generate_image|image_generation)$/.test(tool)) return conversationFileCandidates(result);
  // Codex can wrap apply_patch in functions.exec. Require the patch tool's
  // success report; a shell listing or git status is never evidence of a write.
  const output = String(result.output ?? "");
  if (/Success\. Updated the following files:/i.test(output)) {
    return [...output.matchAll(/(?:^|\n)\s*[AM]\s+([^\r\n]+)/g)].map(match => match[1].trim());
  }
  return [];
}

function succeeded(result) {
  const output = String(result.output ?? "");
  return !result.isError && !/(?:"isError"\s*:\s*true|"exit_code"\s*:\s*[1-9]\d*|exited with code [1-9]\d*|^\s*(?:Error:|Error executing|Failed to|apply_patch verification failed))/im.test(output);
}

// Associations are rebuilt from the requested history page, including old
// stored transcripts. No global "first mention" record can move a file to a
// different answer or mislabel an existing document as a new result.
export function conversationFileAssociations(blocks, { projectPath }) {
  const files = new Map();
  let pending = [];
  const add = (candidate, block, usage, change) => {
    const cleaned = typeof candidate === "string" ? cleanPath(candidate) : cleanPath(candidate.path, candidate.encoded);
    if (!cleaned || !Number.isSafeInteger(block.sequence)) return;
    const resolved = path.isAbsolute(cleaned) ? path.resolve(cleaned) : projectPath ? path.resolve(projectPath, cleaned) : null;
    if (!resolved) return;
    const key = `${block.sequence}:${process.platform === "win32" ? resolved.toLowerCase() : resolved}`;
    if (files.get(key)?.usage === "output" && usage === "reference") return;
    files.set(key, { path: resolved, kind: path.extname(resolved).slice(1).toLowerCase() || "file",
      sourceSequence: block.sequence, usage, ...(change ? { change } : {}) });
  };
  for (const block of blocks) {
    if (block.role === "user") { pending = []; continue; }
    for (const candidate of conversationFileCandidates(block)) add(candidate, block, "reference");
    if (block.kind === "tool-call") pending.push(block);
    if (block.kind !== "tool-result") continue;
    const index = block.callId ? pending.findIndex(call => call.callId === block.callId) : pending.findIndex(call => !call.callId);
    const call = index >= 0 ? pending.splice(index, 1)[0] : null;
    if (succeeded(block)) {
      for (const candidate of mutationPaths(call, block)) add(candidate, block, "output");
      // Count only edits whose matching result succeeded. Old indexed calls
      // can be interpreted on demand; no transcript reimport is needed.
      const wrapped = /(?:^|[.:/])exec$/.test(call?.name ?? "");
      const changes = wrapped && !/Success\. Updated the following files:/i.test(String(block.output ?? "")) ? []
        : call?.fileChanges ?? changesFromToolCall(call?.name, call?.input);
      for (const change of changes) {
        const { path: changedPath, ...details } = change;
        add(changedPath, block, "output", details);
      }
    }
  }
  return [...files.values()];
}

export function collectConversationFiles(blocks, { projectPath, statFile }) {
  const stats = new Map();
  return conversationFileAssociations(blocks, { projectPath }).flatMap(file => {
    if (!stats.has(file.path)) stats.set(file.path, statFile(file.path, file.usage === "output"));
    const stat = stats.get(file.path);
    if (!stat?.isFile() && file.change?.operation !== "delete") return [];
    return [{ ...file, size: stat?.size ?? 0, modifiedAt: stat ? Math.floor(stat.mtimeMs / 1000) : null }];
  });
}
