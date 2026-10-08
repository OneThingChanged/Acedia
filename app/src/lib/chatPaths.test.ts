import { describe, expect, it } from "vitest";
import { chatPathMatches, isChatLocalPath, isChatImagePath, normalizeChatPath, splitChatImagePaths } from "./chatPaths";

describe("chat file and image targets", () => {
  it("normalizes Windows link notation and decodes Markdown once, preserving literal path escapes", () => {
    expect(normalizeChatPath("/G:/My%20Project/%EC%9D%B4%EB%AF%B8%EC%A7%80%20%2520.png", true)).toBe("G:/My Project/이미지 %20.png");
    expect(normalizeChatPath("G:/My Project/이미지 %20.png")).toBe("G:/My Project/이미지 %20.png");
    expect(normalizeChatPath("file:///G:/My%20Project/%2520.png", true)).toBe("file:///G:/My%20Project/%2520.png");
  });
  it("recognizes source links, line anchors and safe image targets", () => {
    for (const target of ["./src/App.tsx:12:4", "src/App.tsx#L12", "/G:/Project/file.html", "file:///G:/result.png", "\\\\server\\share\\result.png"]) expect(isChatLocalPath(target)).toBe(true);
    expect(isChatImagePath("output/result.png#L12")).toBe(true);
    for (const target of ["javascript:alert(1)", "https://example.com/picture.png", "//example.com/picture.png", "data:text/html,hello", "#L12"]) expect(isChatLocalPath(target)).toBe(false);
  });
  it("finds pasted Windows, forward-slash, relative and quoted image paths without linking URLs", () => {
    const windows = String.raw`C:\Users\jinta\AppData\Local\Temp\multiagent-pasted\paste-1791420186229.png`;
    const message = `이미지\n${windows}\nG:/My Assets/이미지 2.png\n"output/My reference.png"\nhttps://example.com/result.png`;
    expect(splitChatImagePaths(message)).toEqual({ rest: "이미지\n\n\n\nhttps://example.com/result.png", images: [windows, "G:/My Assets/이미지 2.png", "output/My reference.png"] });
    expect(chatPathMatches("src/App.tsx:12 is here")[0]?.path).toBe("src/App.tsx:12");
    expect(chatPathMatches("https://example.com/result.png")).toEqual([]);
  });
});
