import { describe, expect, it } from "vitest";
import { mergeChatHistory, mergeChatPages } from "./chat-history.js";

const block = (text) => ({ role: "assistant", kind: "text", text });

describe("Remote chat history", () => {

  it("retains the prefix that moved out of the server transcript window", () => {
    const previous = [block("a"), block("b"), block("c"), block("d")];
    const incoming = [block("c"), block("d"), block("e")];

    expect(mergeChatHistory(previous, incoming).map((entry) => entry.text))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps cached blocks when a lookup temporarily returns an empty tail", () => {
    const previous = [block("a")];
    expect(mergeChatHistory(previous, [])).toEqual(previous);
  });

  it("prepends durable pages by sequence without duplicating their overlap", () => {
    const previous = [
      { ...block("c"), sequence: 3 },
      { ...block("d"), sequence: 4 },
    ];
    const incoming = [
      { ...block("a"), sequence: 1 },
      { ...block("b"), sequence: 2 },
      { ...block("c-old"), sequence: 3 },
    ];

    expect(mergeChatPages(previous, incoming, { prepend: true }).map((entry) => entry.text))
      .toEqual(["a", "b", "c", "d"]);
  });
});
