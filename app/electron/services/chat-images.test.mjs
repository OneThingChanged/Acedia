import { describe, expect, it } from "vitest";
import { transcriptImages } from "./chat-images.mjs";

const bitmap = "data:image/png;base64,YQ==";
const codex = content => ({ type: "response_item", payload: { type: "message", role: "user", content } });
describe("native chat attachment extraction", () => {
  it("reads Codex image parts in order, including file paths and image URL objects", () => {
    const record = codex([{ type: "input_text", text: "[Image #1] 확인해줘" },
      { type: "input_image", image_url: bitmap }, { type: "input_image", image_url: { url: "https://example.com/image.png" } },
      { type: "input_image", image_url: "C:/Temp/paste.png" }]);
    expect(transcriptImages(record, "codex", 0)).toEqual([{ dataUrl: bitmap }, { url: "https://example.com/image.png" }, { path: "C:/Temp/paste.png" }]);
    expect(transcriptImages(record, "codex", 1)).toEqual([]);
    expect(transcriptImages({ ...record, payload: { ...record.payload, role: "assistant" } }, "codex", 0)).toEqual([]);
  });
  it("uses the Claude image ordinal rather than the preceding text part index", () => {
    const record = { type: "user", message: { content: [{ type: "text", text: "첨부 확인" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "YQ==" } },
      { type: "image", source: { type: "url", url: "https://example.com/two.jpg" } }] } };
    expect(transcriptImages(record, "claude", 0)).toEqual([{ dataUrl: bitmap }]);
    expect(transcriptImages(record, "claude", 1)).toEqual([{ url: "https://example.com/two.jpg" }]);
    expect(transcriptImages(record, "claude", 2)).toEqual([]);
  });
  it("rejects executable and non-image sources and limits oversized attachments", () => {
    const content = ["javascript:alert(1)", "data:text/html;base64,YQ==", "data:image/png;base64,@@", `data:image/png;base64,${"A".repeat(36 * 1024 * 1024)}`].map(image_url => ({ type: "input_image", image_url }));
    expect(transcriptImages(codex(content), "codex", 0)).toEqual([]);
  });
});
