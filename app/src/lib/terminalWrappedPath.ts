import type { IBuffer } from "@xterm/xterm";

type CellRef = { row: number; col: number; width: number };

function foreground(buffer: IBuffer, ref: CellRef) {
  const cell = buffer.getLine(ref.row)?.getCell(ref.col);
  return cell && !cell.isFgDefault() ? `${cell.getFgColorMode()}:${cell.getFgColor()}` : null;
}

function readRow(buffer: IBuffer, cols: number, row: number, continuation: boolean) {
  const line = buffer.getLine(row);
  if (!line) return null;
  const raw = line.translateToString(true);
  if (!raw.trim()) return null;
  const from = continuation && !line.isWrapped ? raw.search(/\S/) : 0;
  let text = '', offset = 0;
  const cellMap: CellRef[] = [];
  for (let col = 0; col < cols; col++) {
    const cell = line.getCell(col);
    if (!cell || cell.getWidth() === 0) continue;
    const chars = cell.getChars() || ' ';
    if (offset < from) { offset += chars.length; continue; }
    text += chars;
    for (let i = 0; i < chars.length; i++) cellMap.push({ row, col, width: cell.getWidth() });
  }
  text = text.trimEnd();
  return { text, cellMap: cellMap.slice(0, text.length), wrapped: line.isWrapped };
}

// Bare TUI code spans have no punctuation boundary. Only join the same explicit
// foreground run at a pane edge, not arbitrary adjacent lines or ordinary prose.
function coloredWrappedPath(buffer: IBuffer, cols: number, row: number, gutter: number) {
  const nearEdge = (ref: CellRef | undefined) => ref && ref.col + ref.width >= cols - gutter;
  for (let start = Math.max(0, row - 7); start <= row; start++) {
    const first = readRow(buffer, cols, start, false);
    if (!first || !nearEdge(first.cellMap[first.cellMap.length - 1])) continue;
    let tailStart = first.text.length;
    while (tailStart > 0 && !/[\s"'`()\[\]<>|]/.test(first.text[tailStart - 1])) tailStart--;
    const tail = first.text.slice(tailStart);
    if (!/[\\/]/.test(tail) || /:\/\//.test(tail)) continue;
    const color = foreground(buffer, first.cellMap[tailStart]);
    if (!color || first.cellMap.slice(tailStart).some(ref => foreground(buffer, ref) !== color)) continue;
    const prefix = first.text.slice(0, tailStart).trimEnd();
    if (/[\p{L}\p{N}]$/u.test(prefix) && foreground(buffer, first.cellMap[prefix.length - 1]) === color) continue;
    let text = first.text, cellMap = [...first.cellMap], hardBreak = false;
    for (let r = start + 1; r < Math.min(buffer.length, start + 8); r++) {
      const next = readRow(buffer, cols, r, true);
      if (!next || /^(?:[A-Za-z]:[\\/]|\\\\|https?:\/\/|file:)/i.test(next.text)) break;
      if (!next.wrapped && next.cellMap[0].col > gutter) break;
      let length = 0;
      while (length < next.text.length && !/[\s"'`()\[\]<>|]/.test(next.text[length])
        && foreground(buffer, next.cellMap[length]) === color) length++;
      if (!length) break;
      text += next.text.slice(0, length); cellMap.push(...next.cellMap.slice(0, length));
      hardBreak ||= !next.wrapped;
      if (length < next.text.length || !nearEdge(next.cellMap[length - 1])) {
        if (hardBreak && row >= start && row <= r) return { text, cellMap };
        break;
      }
    }
  }
  return null;
}

// Some TUIs wrap with CRLF and indentation rather than xterm soft wraps.
// Recover a bounded, explicitly delimited or highlighted path at the right edge.
export function buildHardWrappedPath(buffer: IBuffer, cols: number, row: number) {
  // TUI content can stop before the terminal edge to reserve a gutter. Keep
  // recovery near that edge while allowing up to 12 cells of layout padding.
  const wrapGutter = Math.min(12, Math.max(4, Math.floor(cols / 4)));
  for (let start = Math.max(0, row - 7); start <= row; start++) {
    let text = "";
    const cellMap: CellRef[] = [];
    let crossedHardBreak = false;
    for (let r = start; r < Math.min(buffer.length, start + 8); r++) {
      const next = readRow(buffer, cols, r, r > start);
      if (!next) break;
      if (r > start && !next.wrapped) crossedHardBreak = true;
      text += next.text;
      cellMap.push(...next.cellMap);
      const complete = /\(([^\s()]+)\)|\[([^\s\[\]]+)\]|`([^\s`]+)`|"([^\s"]+)"|'([^\s']+)'/g;
      for (const match of text.matchAll(complete)) {
        const value = match.slice(1).find(v => v !== undefined)!;
        if (!/[\\/]/.test(value) || /:\/\//.test(value)) continue;
        const first = cellMap[match.index!];
        const last = cellMap[match.index! + match[0].length - 1];
        if (crossedHardBreak && first.row < last.row && row >= first.row && row <= last.row) {
          return { text, cellMap };
        }
      }
      // Continue only inside an open path, with no whitespace or prose.
      const open = /[([`"']([^\s()[\]`"']*)$/.exec(text);
      if (!open || !/[\\/]/.test(open[1]) || /:\/\//.test(open[1])) break;
      const last = cellMap[cellMap.length - 1];
      if (!last || last.col + last.width < cols - wrapGutter) break;
    }
  }
  return coloredWrappedPath(buffer, cols, row, wrapGutter);
}
