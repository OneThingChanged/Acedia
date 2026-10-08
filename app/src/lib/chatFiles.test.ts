import { describe, expect, it } from "vitest";
import { chatFilesForTurn, mergeChatFiles } from "./chatFiles";
import type { ChatBlock, ConversationArtifact } from "../platform/ipcContract";

const block = (sequence: number): ChatBlock => ({ sequence, role: "assistant", kind: "text", text: "answer" });
const file = (sourceSequence: number, usage: "output" | "reference", path = "G:/project/result.html"): ConversationArtifact => ({
  path, kind: "html", size: 1024, modifiedAt: 1, sourceSequence, usage,
});
describe("files attached to chat responses", () => {
  it("keeps a file under its own answer and distinguishes later references", () => {
    const files = [file(2, "output"), file(5, "reference")];
    expect(chatFilesForTurn(files, [block(2)])).toEqual([files[0]]);
    expect(chatFilesForTurn(files, [block(5)])).toEqual([files[1]]);
    expect(chatFilesForTurn(files, [block(8)])).toEqual([]);
  });
  it("deduplicates reads and writes of one Windows file within an answer", () => {
    const output = file(4, "output");
    expect(chatFilesForTurn([file(2, "reference", "g:\\PROJECT\\RESULT.html"), output, file(5, "reference")], [block(2), block(4), block(5)])).toEqual([output]);
  });
  it("preserves earlier pages, refreshes the current page, and keeps unchanged references stable", () => {
    const previous = [file(2, "reference"), file(8, "reference")];
    expect(mergeChatFiles(previous, [file(8, "reference")], [block(8)])).toBe(previous);
    const next = mergeChatFiles(previous, [file(8, "output")], [block(8)]);
    expect(next).toEqual([previous[0], file(8, "output")]);
    expect(mergeChatFiles(next, [], [block(8)])).toEqual([previous[0]]);
    expect(mergeChatFiles(next, [file(1, "output")], [block(1)])).toEqual([file(1, "output"), ...next]);
  });
  it("does not display unscoped legacy conversation-wide artifacts under a new answer", () => {
    const legacy = { path: "G:/old.md", kind: "md", size: 1, modifiedAt: null };
    expect(chatFilesForTurn([legacy], [block(8)])).toEqual([]);
  });
});
