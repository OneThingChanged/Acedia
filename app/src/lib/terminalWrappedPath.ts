import type { IBuffer } from "@xterm/xterm";

type CellRef = { row: number; col: number; width: number };

// Some TUIs wrap with CRLF and indentation rather than xterm soft wraps.
// Recover only a bounded, parenthesized path at the right edge, never prose.
export function buildHardWrappedPath(buffer: IBuffer, cols: number, row: number) {
  for (let start = Math.max(0, row - 7); start <= row; start++) {
    let text = "";
    const cellMap: CellRef[] = [];
    let crossedHardBreak = false;
    for (let r = start; r < Math.min(buffer.length, start + 8); r++) {
      const line = buffer.getLine(r);
      if (!line) break;
      const raw = line.translateToString(true);
      if (!raw.trim()) break;
      const from = r === start || line.isWrapped ? 0 : raw.search(/\S/);
      // Read cells rather than string columns: CJK and emoji occupy different widths.
      let leading = 0;
      let rowText = "";
      const refs: CellRef[] = [];
      for (let c = 0; c < cols; c++) {
        const cell = line.getCell(c);
        if (!cell || cell.getWidth() === 0) continue;
        const chars = cell.getChars() || " ";
        if (leading < from) { leading += chars.length; continue; }
        rowText += chars;
        for (let i = 0; i < chars.length; i++) refs.push({ row: r, col: c, width: cell.getWidth() });
      }
      rowText = rowText.trimEnd();
      if (r > start && !line.isWrapped) crossedHardBreak = true;
      text += rowText;
      cellMap.push(...refs.slice(0, rowText.length));
      const complete = /\((?:[A-Za-z]:)?[^\s()]*[\\/][^\s()]*\.[a-zA-Z0-9]{1,16}(?::\d+(?::\d+)?)?\)/g;
      for (const match of text.matchAll(complete)) {
        const first = cellMap[match.index!];
        const last = cellMap[match.index! + match[0].length - 1];
        if (crossedHardBreak && first.row < last.row && row >= first.row && row <= last.row) {
          return { text, cellMap };
        }
      }
      // Continue only inside an open path, with no whitespace or prose.
      if (!/\((?:[A-Za-z]:)?[^\s()]*[\\/][^\s()]*$/.test(text)) break;
      const last = cellMap[cellMap.length - 1];
      if (!last || last.col + last.width < cols - 4) break;
    }
  }
  return null;
}
