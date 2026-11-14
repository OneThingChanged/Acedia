// Scan each token once. Repeating a path component whose character class also
// contains slash/backslash makes failed extension searches exponential on deep
// Windows paths (including ordinary .json/.mp4 paths in a terminal repaint).
const tokens = /[^\s"'<>|:*?()\[\]{},;]+/g;
const extensions = {
  document: /\.(?:markdown|md|html|htm)/gi,
  image: /\.(?:png|jpe?g|gif|webp|bmp|svg|ico)/gi,
};

export function terminalSpecializedPathMatches(text, kind) {
  const extension = extensions[kind];
  if (!extension) throw new TypeError('Unsupported terminal path kind');
  const matches = [];
  for (const token of text.matchAll(tokens)) {
    const raw = token[0];
    const basename = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\')) + 1;
    // A filename needs at least one character before its extension. Only the
    // last component is a filename: directory names may contain .md or .png.
    extension.lastIndex = basename + 1;
    const suffix = extension.exec(raw);
    if (!suffix) continue;
    let startIndex = token.index;
    if (/^[\\/]/.test(raw) && /^[A-Za-z]:$/.test(text.slice(Math.max(0, startIndex - 2), startIndex))) startIndex -= 2;
    let endIndex = token.index + suffix.index + suffix[0].length;
    if (kind === 'document') {
      const position = /^:\d+(?::\d+)?/.exec(text.slice(endIndex));
      if (position) endIndex += position[0].length;
    }
    matches.push({ raw: text.slice(startIndex, endIndex), startIndex, endIndex });
  }
  return matches;
}
