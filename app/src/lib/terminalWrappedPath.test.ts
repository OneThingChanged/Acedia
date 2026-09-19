import { describe, expect, it } from "vitest";
import type { IBuffer } from "@xterm/xterm";
import { buildHardWrappedPath } from "./terminalWrappedPath";

function buffer(rows: string[], wrapped: number[] = []) {
  return {
    length: rows.length,
    getLine(r: number) {
      const text = rows[r];
      if (text === undefined) return undefined;
      const cells: { chars: string; width: number }[] = [];
      for (const chars of text) {
        const width = /[가-힣]/.test(chars) ? 2 : 1;
        cells.push({ chars, width });
        if (width === 2) cells.push({ chars: "", width: 0 });
      }
      return {
        isWrapped: wrapped.includes(r),
        translateToString: () => text.trimEnd(),
        getCell(c: number) {
          const cell = cells[c] ?? { chars: "", width: 1 };
          return { getChars: () => cell.chars, getWidth: () => cell.width };
        },
      };
    },
  } as unknown as IBuffer;
}

describe("TUI hard-wrapped terminal paths", () => {
  it("recovers the same complete path from either row with indentation", () => {
    const b = buffer(["화면 (docs/dev/images/ui-concepts/", "  v7/inventory-ux-moving.png) 설명"]);
    for (const row of [0, 1]) {
      const result = buildHardWrappedPath(b, 34, row)!;
      expect(result.text).toContain("(docs/dev/images/ui-concepts/v7/inventory-ux-moving.png)");
      expect(result.cellMap[result.text.indexOf("docs")]).toEqual({ row: 0, col: 6, width: 1 });
      expect(result.cellMap[result.text.indexOf("v7")]).toEqual({ row: 1, col: 2, width: 1 });
    }
  });

  it("supports three rows and line/column suffixes", () => {
    const b = buffer(["(docs/very-long-folder/", "  another-long-folder/", "  component.ts:12:3)"]);
    for (const row of [0, 1, 2]) {
      expect(buildHardWrappedPath(b, 23, row)?.text).toBe("(docs/very-long-folder/another-long-folder/component.ts:12:3)");
    }
  });

  it("leaves ordinary soft wrapping to the existing logical-line reader", () => {
    expect(buildHardWrappedPath(buffer(["(docs/very-long-folder/", "file.md)"], [1]), 23, 1)).toBeNull();
  });

  it.each([
    ["(docs/", "unrelated.md)"],
    ["(this is ordinary prose", "continued.md)"],
    ["(docs/very-long-folder/", "", "file.md)"],
    ["(docs/very-long-folder/", "  unrelated sentence)"],
    ["docs/very-long-folder/", "file.md"],
  ])("does not join ambiguous or unrelated rows: %s", (...rows) => {
    const b = buffer(rows);
    for (let row = 0; row < rows.length; row++) expect(buildHardWrappedPath(b, 23, row)).toBeNull();
  });
});
