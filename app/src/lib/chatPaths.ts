const FILE_EXTENSIONS = "png|jpe?g|gif|webp|bmp|svg|ico|avif|md|markdown|html?|json|pdf|fbx|txt|csv|zip|docx|xlsx|pptx|tsx?|jsx?|m?[jt]s|cjs|py|cs|cpp|cc|c|hpp|h|usf|ush|uasset|umap|ini|toml|ya?ml|xml|log|sh|ps1";
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|bmp|svg|ico)$/i;

export function normalizeChatPath(value: string, encodedLink = false): string {
  let target = value.trim();
  // fileURLToPath owns decoding file URLs; decoding here would corrupt literal
  // percent escapes in filenames. Markdown hrefs are URI encoded once.
  if (encodedLink && !/^file:/i.test(target)) {
    try { target = decodeURIComponent(target); } catch { /* Let the opener report the invalid target. */ }
  }
  return target.replace(/^\/(?=[a-z]:[\\/])/i, "");
}

export function isChatLocalPath(value: string): boolean {
  const target = value.trim();
  if (!target || /[\r\n]/.test(target) || /^(?:https?:|mailto:|#|\/\/)/i.test(target)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^(?:[a-z]:[\\/]|file:\/\/)/i.test(target)) return false;
  return /^(?:\/?[a-z]:[\\/]|file:\/\/|\\\\|\/[^/]|\.[\\/])/i.test(target)
    || /^(?:\.{1,2}[\\/])?[^<>|*?]+[\\/]$/.test(target)
    || new RegExp(`^[^<>|*?]+\\.(?:${FILE_EXTENSIONS})(?::\\d+(?::\\d+)?)?(?:#L\\d+(?:C\\d+)?(?:-L?\\d+(?:C\\d+)?)?)?$`, "i").test(target);
}

export function isChatImagePath(value: string): boolean {
  const target = value.replace(/(?::\d+(?::\d+)?)?(?:#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?)?$/i, "");
  return isChatLocalPath(value) && IMAGE_EXTENSION.test(target);
}

// Raw paths can also appear outside Markdown links. Restrict automatic links
// to path-shaped filenames, and leave source blocks and web URLs to Markdown.
export function chatPathMatches(value: string): { start: number; end: number; path: string }[] {
  const pattern = new RegExp(`(?:^|[\\s("'])("(?:[^"\\r\\n]+\\.(?:${FILE_EXTENSIONS}))"|(?:\\/?[a-z]:[\\\\/]|\\\\\\\\|\\/(?!\\/)|(?:[\\w.-]+[\\\\/]))[^\\r\\n<>"|]*?\\.(?:${FILE_EXTENSIONS})(?::\\d+(?::\\d+)?)?(?:#L\\d+(?:C\\d+)?)?)(?=$|[\\s,;)'"\\]])`, "gi");
  return Array.from(value.matchAll(pattern)).flatMap(match => {
    const token = match[1];
    const start = match.index! + match[0].length - token.length;
    const target = token.replace(/^"|"$/g, "");
    return isChatLocalPath(target) ? [{ start, end: start + token.length, path: target }] : [];
  });
}

export function splitChatImagePaths(value: string): { rest: string; images: string[] } {
  const matches = chatPathMatches(value).filter(match => isChatImagePath(match.path));
  let rest = "", offset = 0;
  for (const match of matches) { rest += value.slice(offset, match.start); offset = match.end; }
  rest += value.slice(offset);
  return { rest: rest.replace(/[ \t]{2,}/g, " ").trim(), images: [...new Set(matches.map(match => normalizeChatPath(match.path)))] };
}
