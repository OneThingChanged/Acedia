import { expect, it } from "vitest";
import { remoteAttachmentType, remoteAttachmentMessage } from "./remote-attachments.mjs";

it.each(["", "application/octet-stream", "text/plain", "text/markdown", "text/x-markdown; charset=utf-8"])(
  "recognizes Markdown reported by browsers as %j", type => {
    expect(remoteAttachmentType({ name: "한글 보고서.MD", type })).toBe("text/markdown");
    expect(remoteAttachmentType({ name: "notes.markdown", type })).toBe("text/markdown");
  });
it.each(["", "application/octet-stream", "text/plain", "text/html; charset=UTF-8"])(
  "recognizes HTML reported by browsers as %j", type => {
    expect(remoteAttachmentType({ name: "미리보기.HTML", type })).toBe("text/html");
    expect(remoteAttachmentType({ name: "page.htm", type })).toBe("text/html");
  });
it("does not accept an unsupported extension or mismatched document MIME", () => {
  expect(remoteAttachmentType({ name: "payload.exe", type: "text/html" })).toBe("");
  expect(remoteAttachmentType({ name: "notes.md", type: "text/html" })).toBe("");
  expect(remoteAttachmentType({ name: "payload.txt", type: "text/plain" })).toBe("");
});
it("sends documents and archives as file paths alongside image paths, omitting failed uploads", () => {
  const attachments = [
    { path: "C:/자료/보고서.md", type: "text/markdown" },
    { path: "C:/자료/페이지.html", type: "text/html" },
    { path: "C:/자료/묶음.zip", type: "application/zip" },
    { path: "C:/자료/화면.png", type: "image/png" },
    { path: "C:/자료/실패.md", type: "text/markdown", error: "failed" },
  ];
  expect(remoteAttachmentMessage("확인해줘", attachments)).toBe('확인해줘\n\n첨부 이미지:\n"C:/자료/화면.png"\n\n첨부 파일:\n"C:/자료/보고서.md"\n"C:/자료/페이지.html"\n"C:/자료/묶음.zip"');
  expect(remoteAttachmentMessage("", attachments.slice(0, 1))).toBe('첨부 파일:\n"C:/자료/보고서.md"');
});
