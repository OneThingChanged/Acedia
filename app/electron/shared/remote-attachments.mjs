export const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_REMOTE_ZIP_BYTES = 32 * 1024 * 1024;
export const MAX_REMOTE_ATTACHMENTS = 4;

const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);
const zipTypes = new Set(["application/zip", "application/x-zip-compressed", "application/x-zip"]);

export function remoteAttachmentType(file) {
  const type = String(file?.type || "").trim().toLowerCase();
  // Browsers can report ZIPs with an empty or generic MIME type. The host
  // verifies the actual bytes before storing a file with this classification.
  if (zipTypes.has(type) || /\.zip$/i.test(String(file?.name || "").trim())) return "application/zip";
  return imageTypes.has(type) ? type : "";
}

export function remoteAttachmentMaxBytes(type) {
  return type === "application/zip" ? MAX_REMOTE_ZIP_BYTES : MAX_REMOTE_IMAGE_BYTES;
}

export function remoteAttachmentMessage(message, attachments) {
  const images = [], files = [];
  for (const attachment of attachments) {
    if (!attachment.path || attachment.error) continue;
    const quoted = `"${String(attachment.path).replaceAll('"', '\\"')}"`;
    (attachment.type === "application/zip" ? files : images).push(quoted);
  }
  return [message, images.length ? `첨부 이미지:\n${images.join("\n")}` : "",
    files.length ? `첨부 파일:\n${files.join("\n")}` : ""].filter(Boolean).join("\n\n");
}
