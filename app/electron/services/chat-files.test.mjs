import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectConversationFiles } from "./chat-files.mjs";
import { parseChatTranscript } from "./chat-transcript.mjs";

const projectPath = path.resolve("project");
const collect = blocks => collectConversationFiles(blocks, { projectPath, statFile: target => target.includes("missing") ? null : { isFile: () => true, size: 20, mtimeMs: 1000 } });
const call = (sequence, name, input, callId) => ({ sequence, role: "assistant", kind: "tool-call", name, input, ...(callId ? { callId } : {}) });
const result = (sequence, output, callId, isError = false) => ({ sequence, role: "tool", kind: "tool-result", output, isError, ...(callId ? { callId } : {}) });
describe("conversation file evidence", () => {
  it("keeps existing links as references and omits user attachments, reasoning and missing files", () => {
    const files = collect([
      { sequence: 1, role: "user", kind: "text", text: "attachment.png" },
      { sequence: 2, role: "assistant", kind: "reasoning", text: "planned.html" },
      { sequence: 3, role: "assistant", kind: "text", text: "[Roadmap](<docs/My%20Roadmap.html#L42>) and `missing.pdf`" },
    ]);
    expect(files).toEqual([expect.objectContaining({ path: path.join(projectPath, "docs/My Roadmap.html"), sourceSequence: 3, usage: "reference" })]);
  });
  it("decodes Markdown and file URLs once while preserving literal tool and code paths", () => {
    const literal = path.join(projectPath, "literal%20.html");
    const spaced = path.join(projectPath, "My document.html");
    const files = collectConversationFiles([
      { sequence: 1, role: "assistant", kind: "text", text: `[literal](literal%2520.html) and \`literal%20.html\` and [doc](<My%20document.html> "Document") and [url](${pathToFileURL(literal).href})` },
      call(2, "Read", { file_path: "literal%20.html" }),
    ], { projectPath, statFile: target => [literal, spaced].includes(target) ? { isFile: () => true, size: 20, mtimeMs: 1000 } : null });
    expect(files.map(file => [file.sourceSequence, file.path])).toEqual([[1, literal], [1, spaced], [2, literal]]);
  });
  it("pairs parallel tool IDs and marks only completed writes as outputs", () => {
    const files = collect([call(1, "Read", { file_path: "source.ts" }, "read"), call(2, "Edit", { file_path: "edited.ts" }, "edit"),
      result(3, "Done", "edit"), result(4, "Done", "read"), call(5, "Write", { file_path: "pending.mp4" }, "pending")]);
    expect(files.filter(file => file.usage === "output")).toEqual([expect.objectContaining({ path: path.join(projectPath, "edited.ts"), sourceSequence: 3 })]);
  });
  it("does not label a failed or unrelated tool result as a created file", () => {
    for (const output of ['Error: EPERM', 'Process exited with code 1', '{"isError":true}', 'apply_patch verification failed']) {
      expect(collect([call(1, "Write", { file_path: "failed.html" }, "write"), result(2, output, "write")]).some(file => file.usage === "output")).toBe(false);
    }
    expect(collect([call(1, "Write", { file_path: "failed.html" }, "write"), result(2, "Done", "different")]).some(file => file.usage === "output")).toBe(false);
    expect(collect([call(1, "Write", { file_path: "failed.html" }), result(2, "Done", undefined, true)]).some(file => file.usage === "output")).toBe(false);
  });
  it("supports legacy ID-less calls, code, extensionless files, videos and archives", () => {
    const files = collect([call(1, "create_file", { path: "movie.mp4" }), result(2, "Done"),
      call(3, "functions.apply_patch", "*** Begin Patch\n*** Add File: bundle.zip\n+data\n*** Update File: src/app.ts\n+data\n*** Add File: .gitignore\n+data\n*** End Patch"), result(4, "Done")]);
    expect(files.filter(file => file.usage === "output").map(file => path.basename(file.path))).toEqual(["movie.mp4", "bundle.zip", "app.ts", ".gitignore"]);
  });
  it("recognizes a wrapped patch success report without treating git status as a write", () => {
    const files = collect([call(1, "functions.exec", "await tools.apply_patch(...)"), result(2, "Success. Updated the following files:\nA result.html\nM docs/guide.md")]);
    expect(files.filter(file => file.usage === "output")).toHaveLength(2);
    expect(collect([call(1, "functions.exec_command", { cmd: "git status" }), result(2, "M docs/guide.md")]).some(file => file.usage === "output")).toBe(false);
    expect(collect([call(1, "image_gen__imagegen", {}), result(2, "created.png")]).some(file => file.usage === "output" && file.path.endsWith("created.png"))).toBe(true);
  });
  it("preserves provider call identities in new transcripts", () => {
    const codex = [{ type: "response_item", payload: { type: "function_call", name: "Write", arguments: '{"path":"result.html"}', call_id: "write" } },
      { type: "response_item", payload: { type: "function_call_output", output: "Done", call_id: "write" } }];
    const claude = [{ type: "assistant", message: { content: [{ type: "tool_use", name: "Write", input: { file_path: "result.html" }, id: "write" }] } },
      { type: "user", message: { content: [{ type: "tool_result", content: "Done", tool_use_id: "write" }] } }];
    for (const [provider, records] of [["codex", codex], ["claude", claude]]) {
      const blocks = parseChatTranscript(records.map(JSON.stringify).join("\n"), provider);
      expect(blocks.map(block => block.callId)).toEqual(["write", "write"]);
    }
  });
});
