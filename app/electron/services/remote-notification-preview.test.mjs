import { describe, expect, it, vi } from "vitest";
import {
  completionNotificationPreview,
  MAX_NOTIFICATION_PREVIEW_LENGTH,
  notificationPreview,
} from "./remote-notification-preview.mjs";

describe("native completion notification previews", () => {
  it("turns final-answer Markdown into readable, bounded notification text", () => {
    expect(notificationPreview("## 완료\n\n**수정했습니다.** [보고서](/docs/report.md)\n```js\nconst ready = true;\n```\n\u001b[32m성공\u001b[0m\u0000"))
      .toBe("완료\n\n수정했습니다. 보고서\nconst ready = true;\n\n성공");
    const long = notificationPreview("🧩".repeat(MAX_NOTIFICATION_PREVIEW_LENGTH + 20));
    expect(Array.from(long)).toHaveLength(MAX_NOTIFICATION_PREVIEW_LENGTH);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toContain("\ufffd");
  });

  it("uses the actual hook reply without querying chat", async () => {
    const readChat = vi.fn();
    expect(await completionNotificationPreview({ assistant_message: "**테스트가 통과했습니다.**" }, readChat))
      .toBe("테스트가 통과했습니다.");
    expect(readChat).not.toHaveBeenCalled();
  });

  it("reads the last reply in the matching session and excludes tools and reasoning", async () => {
    const readChat = vi.fn().mockResolvedValue({
      sessionId: "session-1",
      blocks: [
        { role: "user", kind: "text", text: "확인해 줘" },
        { role: "assistant", kind: "text", text: "확인 중입니다." },
        { role: "assistant", kind: "tool-call", input: "SECRET input" },
        { role: "tool", kind: "tool-result", output: "SECRET terminal output" },
        { role: "assistant", kind: "reasoning", text: "SECRET reasoning" },
        { role: "assistant", kind: "text", text: "문제를 수정했습니다." },
        { role: "assistant", kind: "text", text: "검증도 통과했습니다." },
      ],
    });
    expect(await completionNotificationPreview({ id: "agent-1", session_id: "session-1" }, readChat))
      .toBe("문제를 수정했습니다.\n\n검증도 통과했습니다.");
    expect(readChat).toHaveBeenCalledWith("agent-1", { limit: 24 });
  });

  it("does not preview another session or a previous unanswered turn", async () => {
    const payload = { id: "agent-1", session_id: "session-1" };
    const oldReply = { role: "assistant", kind: "text", text: "지난 답변" };
    expect(await completionNotificationPreview(payload, () => ({ sessionId: "session-2", blocks: [oldReply] }))).toBe("");
    expect(await completionNotificationPreview(payload, () => ({
      sessionId: "session-1", blocks: [oldReply, { role: "user", kind: "text", text: "새 질문" }],
    }))).toBe("");
    expect(await completionNotificationPreview({ id: "agent-1" }, () => ({ blocks: [oldReply] }))).toBe("");
  });

  it("keeps completion delivery available when chat fails or takes too long", async () => {
    const payload = { id: "agent-1", session_id: "session-1" };
    expect(await completionNotificationPreview(payload, () => { throw new Error("offline"); })).toBe("");
    expect(await completionNotificationPreview(payload, () => new Promise(() => {}), { timeoutMs: 5 })).toBe("");
  });
});
