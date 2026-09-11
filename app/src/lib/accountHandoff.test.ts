import { describe, expect, it } from "vitest";
import { buildAccountHandoffPrompt, handoffPromptForAccount, makeAccountHandoff } from "./accountHandoff";

describe("account work handoff", () => {
  it("keeps recent user and assistant context while excluding tools and earlier handoffs", () => {
    const prompt = buildAccountHandoffPrompt({
      language: "ko",
      folder: "K:\\AI\\Project",
      blocks: [
        { role: "user", kind: "text", text: "첫 요청" },
        { role: "tool", kind: "tool-result", output: "secret output" },
        { role: "user", kind: "text", text: "[계정 전환 작업 인계] 이전 인계문" },
        { role: "assistant", kind: "reasoning", text: "private reasoning" },
        { role: "user", kind: "text", text: "마지막 기능을 구현해줘" },
        { role: "assistant", kind: "text", text: "구현 중입니다" },
      ],
    });
    expect(prompt).toContain("마지막 기능을 구현해줘");
    expect(prompt).toContain("구현 중입니다");
    expect(prompt).not.toContain("secret output");
    expect(prompt).not.toContain("private reasoning");
    expect(prompt).not.toContain("이전 인계문");
    expect(prompt.length).toBeLessThanOrEqual(2_800);
  });

  it("falls back to live activity and only releases the prompt to its target account", () => {
    const handoff = makeAccountHandoff({
      id: "handoff-a",
      fromAccountId: "account-a",
      toAccountId: "account-b",
      createdAt: 10,
      blocks: [],
      activity: {
        workStatus: "done",
        source: "hook",
        receivedAt: 1,
        stateStartedAt: 1,
        lastPrompt: "검증까지 진행해줘",
        lastAssistantMessage: "검증을 시작했습니다",
      },
      language: "ko-KR",
    });
    expect(handoffPromptForAccount(handoff, "account-b")).toContain("검증까지 진행해줘");
    expect(handoffPromptForAccount(handoff, "account-a")).toBeUndefined();
  });
});
