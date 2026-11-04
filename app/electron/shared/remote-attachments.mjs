export const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_REMOTE_ZIP_BYTES = 32 * 1024 * 1024;
export const MAX_REMOTE_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_REMOTE_ATTACHMENTS = 4;

const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);
const zipTypes = new Set(["application/zip", "application/x-zip-compressed", "application/x-zip"]);
const genericTextTypes = new Set(["", "application/octet-stream", "text/plain"]);
const markdownTypes = new Set(["text/markdown", "text/x-markdown"]);
const htmlTypes = new Set(["text/html", "application/xhtml+xml"]);

export function remoteAttachmentIsText(type) {
  return type === "text/markdown" || type === "text/html";
}

export function remoteAttachmentType(file) {
  const type = String(file?.type || "").split(";", 1)[0].trim().toLowerCase();
  const name = String(file?.name || "").trim();
  // Browsers can report ZIPs with an empty or generic MIME type. The host
  // verifies the actual bytes before storing a file with this classification.
  if (zipTypes.has(type) || /\.zip$/i.test(name)) return "application/zip";
  if (/\.(?:md|markdown)$/i.test(name) && (genericTextTypes.has(type) || markdownTypes.has(type))) return "text/markdown";
  if (/\.html?$/i.test(name) && (genericTextTypes.has(type) || htmlTypes.has(type))) return "text/html";
  return imageTypes.has(type) ? type : "";
}

export function remoteAttachmentMaxBytes(type) {
  return type === "application/zip" ? MAX_REMOTE_ZIP_BYTES
    : remoteAttachmentIsText(type) ? MAX_REMOTE_DOCUMENT_BYTES : MAX_REMOTE_IMAGE_BYTES;
}

export function remoteAttachmentSizeError(type) {
  return type === "application/zip" ? "ZIP 파일은 32MB 이하여야 합니다."
    : remoteAttachmentIsText(type) ? "문서 파일은 8MB 이하여야 합니다." : "이미지는 8MB 이하여야 합니다.";
}

export function remoteAttachmentMessage(message, attachments) {
  const images = [], files = [];
  for (const attachment of attachments) {
    if (!attachment.path || attachment.error) continue;
    const quoted = `"${String(attachment.path).replaceAll('"', '\\"')}"`;
    (String(attachment.type).startsWith("image/") ? images : files).push(quoted);
  }
  return [message, images.length ? `첨부 이미지:\n${images.join("\n")}` : "",
    files.length ? `첨부 파일:\n${files.join("\n")}` : ""].filter(Boolean).join("\n\n");
}
