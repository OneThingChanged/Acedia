const MAX_IMAGE_URL = Math.ceil(25 * 1024 * 1024 * 4 / 3) + 128;

function imageSource(part) {
  const source = part?.source;
  if (source?.type === "base64" && typeof source.data === "string") {
    const dataUrl = `data:${source.media_type};base64,${source.data}`;
    return dataUrl.length <= MAX_IMAGE_URL && /^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml|x-icon|avif);base64,[a-z\d+/=]+$/i.test(dataUrl) ? { dataUrl } : null;
  }
  const value = part?.image_url?.url ?? part?.image_url ?? source?.url ?? part?.url ?? part?.path;
  if (typeof value !== "string" || !value || value.length > MAX_IMAGE_URL) return null;
  if (/^data:image\/(?:png|jpe?g|gif|webp|bmp|svg\+xml|x-icon|avif);base64,[a-z\d+/=]+$/i.test(value)) return { dataUrl: value };
  if (/^https?:\/\//i.test(value)) return { url: value };
  if (/^(?:file:\/\/|\/?[a-z]:[\\/]|\/[^/]|\\\\)/i.test(value)) return { path: value };
  return null;
}

// Image bitmaps are requested separately instead of copied through every poll.
export function transcriptImages(record, provider, blockIndex) {
  if (provider === "codex") {
    const message = record?.type === "response_item" ? record.payload : null;
    if (message?.type !== "message" || message.role !== "user" || blockIndex !== 0) return [];
    return (Array.isArray(message.content) ? message.content : []).filter(part => ["input_image", "image", "image_url"].includes(part?.type)).map(imageSource).filter(Boolean).slice(0, 20);
  }
  if (provider === "claude" && record?.type === "user") {
    const images = (Array.isArray(record.message?.content) ? record.message.content : []).filter(part => part?.type === "image");
    const selected = imageSource(images[blockIndex]);
    return selected ? [selected] : [];
  }
  return [];
}
