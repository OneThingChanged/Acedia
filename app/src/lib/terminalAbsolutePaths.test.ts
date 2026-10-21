import { expect, it } from "vitest";
import { absoluteTerminalPathSpans } from "./terminalAbsolutePaths";

it.each([
  ["삼면도 (D:/Images/front.png) · Blender 파일 (D:/Scenes/character.blend) · 비교 이미지 (D:/Images/comparison.jpg)", ["D:/Images/front.png", "D:/Scenes/character.blend", "D:/Images/comparison.jpg"]],
  ["기록 (D:/Images/generation.json) · 수정 (D:/Images/correction.json)", ["D:/Images/generation.json", "D:/Images/correction.json"]],
  ["D:/Images/front.png D:/Images/back.png", ["D:/Images/front.png", "D:/Images/back.png"]],
  ['"C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" "D:\\My Images\\render (final).png"', ["C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe", "D:\\My Images\\render (final).png"]],
  ["image (D:/My Images/render (final).png) · scene (D:/Scene (v2)/character.blend)", ["D:/My Images/render (final).png", "D:/Scene (v2)/character.blend"]],
  ["[D:/Images/front.png] [D:/Images/back.png]", ["D:/Images/front.png", "D:/Images/back.png"]],
  ["('D:/Images/front.png') ('D:/Images/back.png')", ["D:/Images/front.png", "D:/Images/back.png"]],
  ["C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe", ["C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe"]],
  ["(\\\\server\\shared images\\front.png) (\\\\server\\shared images\\back.png)", ["\\\\server\\shared images\\front.png", "\\\\server\\shared images\\back.png"]],
  [String.raw`C:\\Projects\\Images\\front.png`, [String.raw`C:\\Projects\\Images\\front.png`]],
  ["just a sentence", []],
] as const)("keeps separate absolute path boundaries in %s", (text, expected) => {
  const spans = absoluteTerminalPathSpans(text);
  expect(spans.map(span => span.text)).toEqual(expected);
  for (const span of spans) expect(text.slice(span.startIndex, span.endIndex)).toBe(span.text);
});
