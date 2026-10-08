// Evidence from edit inputs, never the repository-wide working-tree diff.
// Keep totals before clipping the preview. Unknown baselines (Write/replace_all)
// deliberately have no +/- total.
const lineCount = value => value ? String(value).replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").length : 0;
function preview(lines) {
  let chars = 0;
  const diff = [];
  for (const line of lines) {
    if (diff.length >= 120 || (chars += line.text.length) > 16000) break;
    diff.push(line);
  }
  return { diff, truncated: diff.length < lines.length };
}

function patchChanges(patch) {
  const files = [];
  let file;
  for (const row of patch.split(/\r?\n/)) {
    const header = row.match(/^\*\*\* (Add File|Update File|Delete File): (.+)$/);
    if (header) {
      file = { path: header[2].trim(), operation: header[1] === "Add File" ? "add" : header[1] === "Delete File" ? "delete" : "edit", additions: 0, deletions: 0, lines: [] };
      files.push(file);
    } else if (file && row.startsWith("*** Move to: ")) { file.path = row.slice(13).trim(); file.operation = "rename"; }
    else if (file && !row.startsWith("***")) {
      const type = row.startsWith("+") ? "add" : row.startsWith("-") ? "del" : row.startsWith("@@") ? "meta" : "context";
      if (type === "add") file.additions++;
      if (type === "del") file.deletions++;
      file.lines.push({ type, text: /^[+ -]/.test(row) ? row.slice(1) : row });
    }
  }
  // A clipped legacy tool input cannot provide trustworthy totals.
  const complete = patch.trimEnd().endsWith("*** End Patch");
  return files.map(({ lines, additions, deletions, ...file }) => ({ ...file,
    ...(complete && file.operation !== "delete" ? { additions, deletions } : {}), ...preview(lines) }));
}

// Extract a literal patch passed through functions.exec without executing JS.
function wrappedPatches(source) {
  const patches = [];
  const pattern = /\b(?:tools\.)?apply_patch\s*\(\s*(["'`])/g;
  for (const match of source.matchAll(pattern)) {
    const quote = match[1], start = match.index + match[0].length;
    let value = "", valid = false;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (c === quote) { valid = /^\s*\)/.test(source.slice(i + 1)); break; }
      if (quote === "`" && c === "$" && source[i + 1] === "{") break;
      if (c !== "\\") { value += c; continue; }
      const next = source[++i];
      if (next === "u" || next === "x") {
        const length = next === "u" ? 4 : 2, hex = source.slice(i + 1, i + 1 + length);
        if (!new RegExp(`^[0-9a-f]{${length}}$`, "i").test(hex)) break;
        value += String.fromCharCode(parseInt(hex, 16)); i += length;
      } else value += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "\n": "" })[next] ?? next;
    }
    if (valid && value.startsWith("*** Begin Patch")) patches.push(value);
  }
  return patches;
}

export function changesFromToolCall(name, input) {
  const tool = String(name ?? "").split(/[.:/]|__/).pop().toLowerCase();
  const fields = input && typeof input === "object" ? input : {};
  if (tool === "exec" && typeof input === "string") return wrappedPatches(input).flatMap(patchChanges);
  if (tool === "apply_patch") {
    const patch = typeof input === "string" ? input : fields.patch ?? fields.input ?? fields.diff;
    return typeof patch === "string" ? patchChanges(patch) : [];
  }
  const file = fields.file_path ?? fields.path ?? fields.filePath ?? fields.notebook_path;
  if (!file || fields.command === "view" || !/^(?:write|write_file|create_file|edit|edit_file|multiedit|str_replace|str_replace_editor|notebookedit)$/.test(tool)) return [];
  const edits = fields.edits ?? [fields];
  const lines = [];
  let additions = 0, deletions = 0, counted = true;
  for (const edit of edits) {
    const old = edit.old_string ?? edit.oldString ?? edit.old, next = edit.new_string ?? edit.newString ?? edit.new;
    if (old == null || next == null || edit.replace_all || fields.replace_all) counted = false;
    additions += lineCount(next); deletions += lineCount(old);
    for (const [type, value] of [["del", old], ["add", next]]) if (value) {
      for (const text of String(value).replace(/\n$/, "").split(/\r?\n/)) lines.push({ type, text });
    }
  }
  return [{ path: file, operation: "edit", ...(counted ? { additions, deletions } : {}), ...preview(lines) }];
}
