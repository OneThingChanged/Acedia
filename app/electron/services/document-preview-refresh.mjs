// Reopening a local document must reload even while its preview capability is valid.
export async function refreshDocumentPreview(record, previews, force = false) {
  if (!record.folder || !record.relativePath) return false;
  if (!force && previews.isPreviewUrl(record.previewUrl, record.token)) return false;
  const preview = await previews.issue({ folder: record.folder, relativePath: record.relativePath });
  const previousToken = record.token;
  record.token = preview.token;
  record.previewUrl = preview.url;
  previews.release(previousToken);
  await record.view.webContents.loadURL(preview.url);
  return true;
}
