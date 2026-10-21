// Absolute paths may contain spaces and balanced parentheses. Bound each path
// to its enclosing punctuation/quote or the next absolute root, rather than
// letting the first drive path consume every link that follows on the line.
export function absoluteTerminalPathSpans(text: string) {
  const roots = [...text.matchAll(/(?:[A-Za-z]:[\\/]|\\\\[^<>"|?*\r\n\\/]+[\\/][^<>"|?*\r\n\\/]+[\\/])/g)]
    .filter(match => !match[0].startsWith("\\\\") || !/[\\/:]/.test(text[match.index! - 1] || ""));
  return roots.flatMap((root, index) => {
    const startIndex = root.index!;
    const before = text[startIndex - 1];
    const quote = before && "\"'`".includes(before) ? before : null;
    const brackets: string[] = [];
    const closing: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const limit = roots[index + 1]?.index ?? text.length;
    let endIndex = startIndex;
    for (; endIndex < limit; endIndex++) {
      const char = text[endIndex];
      if (/[<>|?*\r\n]/.test(char)) break;
      if (quote) { if (char === quote) break; continue; }
      if (char === '"' || char === '`') break;
      if (closing[char]) brackets.push(closing[char]);
      else if (")]}".includes(char)) {
        if (brackets.pop() !== char) break;
      }
    }
    const value = text.slice(startIndex, endIndex).trimEnd();
    return value ? [{ text: value, startIndex, endIndex: startIndex + value.length }] : [];
  });
}
