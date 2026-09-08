import fs from "node:fs/promises";
import path from "node:path";

export async function validateUploadFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 20) {
    throw new Error("Provide between 1 and 20 explicit absolute file paths.");
  }
  const validated = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    if (typeof file !== "string" || file.includes("\0") || !path.isAbsolute(file) || (process.platform === "win32" && !/^[a-z]:[\\/]/i.test(file))) {
      throw new Error(`File ${index + 1}: an absolute local file path is required.`);
    }
    try {
      const canonical = await fs.realpath(file);
      const stat = await fs.stat(canonical);
      if (!stat.isFile()) throw new Error("not a file");
      await fs.access(canonical, fs.constants.R_OK);
      validated.push(canonical);
    } catch {
      throw new Error(`File ${index + 1}: file is missing, unreadable, or is a directory.`);
    }
  }
  if (new Set(validated).size !== validated.length) throw new Error("Duplicate upload files are not allowed.");
  return validated;
}

// Native Chromium file selection avoids OS dialogs and does not inject file bytes
// or privileged APIs into the page. Only the explicitly supplied paths are used.
export async function uploadBrowserFiles(webContents, body = {}) {
  if (typeof body.selector !== "string" || !body.selector.trim() || body.selector.length > 500 || body.selector.includes("\0")) {
    return { ok: false, error: "A unique CSS selector for an input[type=file] is required." };
  }
  let files;
  try { files = await validateUploadFiles(body.files); }
  catch (error) { return { ok: false, error: error.message }; }
  if (!webContents || webContents.isDestroyed()) return { ok: false, error: "Browser tab is unavailable." };
  const debug = webContents.debugger;
  // Do not detach a debugger owned by DevTools or another browser operation.
  if (debug.isAttached()) return { ok: false, error: "Browser debugger is busy. Close DevTools or retry after the current operation." };
  let attached = false;
  let applied = false;
  let objectId;
  try {
    debug.attach("1.3");
    attached = true;
    const { root } = await debug.sendCommand("DOM.getDocument");
    const { nodeIds } = await debug.sendCommand("DOM.querySelectorAll", { nodeId: root.nodeId, selector: body.selector });
    if (nodeIds.length !== 1) return { ok: false, error: nodeIds.length ? "ambiguous_file_input" : "file_input_not_found" };
    const nodeId = nodeIds[0];
    const { node } = await debug.sendCommand("DOM.describeNode", { nodeId });
    const attrs = new Map();
    for (let i = 0; i < (node.attributes?.length || 0); i += 2) attrs.set(node.attributes[i], node.attributes[i + 1]);
    if (node.localName !== "input" || attrs.get("type")?.toLowerCase() !== "file") return { ok: false, error: "not_a_file_input" };
    if (attrs.has("webkitdirectory")) return { ok: false, error: "directory_upload_not_supported" };
    if (files.length > 1 && !attrs.has("multiple")) return { ok: false, error: "file_input_does_not_allow_multiple" };
    const resolved = await debug.sendCommand("DOM.resolveNode", { nodeId });
    objectId = resolved.object.objectId;
    const state = await debug.sendCommand("Runtime.callFunctionOn", {
      objectId, returnByValue: true,
      functionDeclaration: "function() { return { connected: this.isConnected, disabled: this.matches(':disabled') }; }",
    });
    if (!state.result?.value?.connected || state.result.value.disabled) return { ok: false, error: "file_input_unavailable_or_disabled" };
    await debug.sendCommand("DOM.setFileInputFiles", { nodeId, files });
    applied = true;
    const selected = await debug.sendCommand("Runtime.callFunctionOn", {
      objectId, returnByValue: true,
      functionDeclaration: "function() { return { connected: this.isConnected, names: Array.from(this.files || [], f => f.name) }; }",
    });
    const names = selected.result?.value?.names;
    const verified = selected.result?.value?.connected && Array.isArray(names) && names.length === files.length && names.every((name, index) => name === path.basename(files[index]));
    return {
      ok: !!verified, applied: true, selectedCount: verified ? names.length : null,
      ...(verified ? { status: "files_selected" } : { error: "selection_applied_but_not_verifiable" }),
      message: "File selection can trigger upload immediately. Verify completion on the page; this result does not confirm server acceptance. Do not repeat an applied selection without checking the page.",
    };
  } catch {
    return { ok: false, applied, error: applied ? "selection_applied_but_not_verifiable" : "file_selection_failed", message: "Check the selector and page state. This tool targets the top-level document; iframe and directory uploads are not supported." };
  } finally {
    if (objectId && debug.isAttached()) {
      try { await debug.sendCommand("Runtime.releaseObject", { objectId }); } catch {}
    }
    if (attached && debug.isAttached()) { try { debug.detach(); } catch {} }
  }
}
