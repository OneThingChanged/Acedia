import { invoke } from "../platform/runtime";
import type { TerminalPathResolution } from "../platform/ipcContract";
import { normalizeChatPath } from "./chatPaths";

export type ImagePathOpener = (path: string, reveal?: boolean) => void;

export async function resolveImagePath(path: string, folder?: string | null) {
  const resolved = await invoke<TerminalPathResolution>("resolve_terminal_path", {
    path: normalizeChatPath(path), folder: folder || "",
  });
  if (resolved.kind !== "image") throw new Error("Not an image file");
  return resolved.path;
}

export async function revealImagePath(path: string, folder?: string | null) {
  await invoke("reveal_local_path", { path: await resolveImagePath(path, folder) });
}

// Copy decoded pixels, preserving the original size rather than the preview's
// zoom/crop. Electron's clipboard endpoint accepts a bounded PNG data URL.
export async function copyImageToClipboard(source: HTMLImageElement | string) {
  const image = typeof source === "string" ? new Image() : source;
  if (typeof source === "string") {
    if (/^https?:/i.test(source)) image.crossOrigin = "anonymous";
    image.src = source;
  }
  if (!image.complete || !image.naturalWidth) await image.decode();
  if (!image.naturalWidth) throw new Error("Image is not ready");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create image canvas");
  context.drawImage(image, 0, 0);
  await invoke("clipboard_write_image", { dataUrl: canvas.toDataURL("image/png") });
}

export async function copyImagePath(path: string, folder?: string | null) {
  const resolved = await resolveImagePath(path, folder);
  const src = await invoke<string>("read_image_data_url", { path: resolved });
  await copyImageToClipboard(src);
}
