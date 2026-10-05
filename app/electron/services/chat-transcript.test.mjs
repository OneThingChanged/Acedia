import { describe, expect, it } from "vitest";
import { parseChatTranscript, deriveTurnLifecycle, derivePendingQuestion } from "./chat-transcript.mjs";

describe("pending native questions", () => {
  const serialize = records => records.map(payload => JSON.stringify({ type: "response_item", payload })).join("\n");
  const question = { type: "function_call", call_id: "question-1", name: "functions.request_user_input", arguments: '{"questions":[{"question":"Choose"}]}' };
  it("renders asynchronous answers as readable user messages", () => {
    const reply = `<send_user_message_question_reply>\n${JSON.stringify([{ question: "Which folder?", answer: "Current", questionItemId: '["request_user_input_async","call-1",0]' }])}\n</send_user_message_question_reply>`;
    expect(parseChatTranscript(serialize([{ type: "message", role: "user", content: [{ text: reply }] }]), "codex")).toEqual([{ role: "user", kind: "text", text: "Which folder?\nCurrent" }]);
  });
  it("finds a question even without hooks and ignores unrelated tool output", () => {
    const text = serialize([question, { type: "function_call_output", call_id: "other-tool", output: "done" }]);
    expect(derivePendingQuestion(text, "codex")).toEqual({ id: "question-1", toolName: question.name, question: question.arguments });
    expect(derivePendingQuestion(text + "\n" + serialize([{ type: "function_call_output", call_id: "question-1", output: "A" }]), "codex")).toBeNull();
  });
  it.each(["task_started", "task_complete", "turn_aborted"])("clears the question on %s", type => {
    expect(derivePendingQuestion(serialize([question]) + "\n" + JSON.stringify({ type: "event_msg", payload: { type } }), "codex")).toBeNull();
  });
  it("doesn't resurrect an old synchronous question after a new user message", () => {
    expect(derivePendingQuestion(serialize([question, { type: "message", role: "user", content: [{ text: "continue" }] }]), "codex")).toBeNull();
  });
  it("keeps accepted async questions through ongoing work and completes only the matching reply", () => {
    const async = { ...question, name: "request_user_input_async", arguments: JSON.stringify({ questions: [{ title: "Which folder?", options: ["Current", "Other"] }] }) };
    const accepted = { type: "function_call_output", call_id: async.call_id, output: '{"accepted":true}' };
    const text = serialize([async, accepted]) + '\n' + JSON.stringify({ type: "event_msg", payload: { type: "task_complete" } });
    expect(derivePendingQuestion(text, "codex")).toMatchObject({ id: async.call_id, async: true });
    const reply = id => ({ type: "message", role: "user", content: [{ text: `<send_user_message_question_reply>\n${JSON.stringify([{ questionItemId: JSON.stringify(["request_user_input_async", id, 0]), answer: "Current" }])}\n</send_user_message_question_reply>` }] });
    expect(derivePendingQuestion(text + '\n' + serialize([reply('other-call')]), 'codex')).not.toBeNull();
    expect(derivePendingQuestion(text + '\n' + serialize([reply(async.call_id)]), 'codex')).toBeNull();
  });
  it("correlates Claude answers by tool_use_id", () => {
    const input = { questions: [{ question: "Choose" }] };
    const call = { type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", id: "q1", name: "AskUserQuestion", input }] } };
    expect(derivePendingQuestion(JSON.stringify(call), "claude")).toMatchObject({ id: "q1", question: JSON.stringify(input) });
    const result = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "q1", content: "A" }] } };
    expect(derivePendingQuestion([call, result].map(JSON.stringify).join("\n"), "claude")).toBeNull();
  });
});

describe("deriveTurnLifecycle", () => {
  it("codex: task_complete → idle; lone task_started → working", () => {
    const done = [
      { type: "event_msg", payload: { type: "task_started" } },
      { type: "event_msg", payload: { type: "task_complete" } },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");
    expect(deriveTurnLifecycle(done, "codex")).toBe("idle");
    expect(deriveTurnLifecycle(JSON.stringify({ type: "event_msg", payload: { type: "task_started" } }), "codex")).toBe("working");
  });

  it("claude: assistant end_turn → idle; trailing user turn → working", () => {
    const idle = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "done" }], stop_reason: "end_turn" },
    });
    expect(deriveTurnLifecycle(idle, "claude")).toBe("idle");
    const working = [
      JSON.stringify({ type: "assistant", message: { stop_reason: "end_turn" } }),
      JSON.stringify({ type: "user", message: { role: "user", content: "more" } }),
    ].join("\n");
    expect(deriveTurnLifecycle(working, "claude")).toBe("working");
  });
});

describe("parseChatTranscript — claude", () => {
  it("decodes user text, assistant text, thinking, and tool use/result", () => {
    const lines = [
      { type: "mode", mode: "normal" }, // ignored
      { type: "user", message: { role: "user", content: "안녕?" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "let me think" },
            { type: "text", text: "안녕하세요!" },
            { type: "tool_use", name: "Bash", input: { command: "ls" } },
          ],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "file.txt", is_error: false }],
        },
      },
      { type: "user", message: { role: "user", content: "<system-reminder>ignore me</system-reminder>" } },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");

    const blocks = parseChatTranscript(lines, "claude");
    expect(blocks).toEqual([
      { role: "user", kind: "text", text: "안녕?" },
      { role: "assistant", kind: "reasoning", text: "let me think" },
      { role: "assistant", kind: "text", text: "안녕하세요!" },
      { role: "assistant", kind: "tool-call", name: "Bash", input: { command: "ls" }, summary: "ls" },
      { role: "tool", kind: "tool-result", output: "file.txt" },
    ]);
  });

  it("summarizes and builds a diff for an edit tool call", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Edit",
            input: { file_path: "D:/x/foo.ts", old_string: "a\nb", new_string: "a\nc" },
          },
        ],
      },
    });
    const [block] = parseChatTranscript(line, "claude");
    expect(block.summary).toBe("foo.ts");
    expect(block.diff).toEqual([
      { type: "meta", text: "foo.ts" },
      { type: "del", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "a" },
      { type: "add", text: "c" },
    ]);
  });
});

describe("parseChatTranscript — codex", () => {
  it("decodes messages and tool calls, skipping developer/meta", () => {
    const lines = [
      { type: "session_meta", payload: { id: "x" } }, // ignored
      {
        type: "response_item",
        payload: { type: "message", role: "developer", content: [{ type: "input_text", text: "<permissions>" }] },
      },
      {
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "최신화 해줘" }] },
      },
      {
        type: "response_item",
        payload: { type: "function_call", name: "shell", arguments: '{"cmd":"git status"}' },
      },
      {
        type: "response_item",
        payload: { type: "function_call_output", output: "clean" },
      },
      {
        type: "response_item",
        payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "완료했습니다." }] },
      },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");

    const blocks = parseChatTranscript(lines, "codex");
    expect(blocks).toEqual([
      { role: "user", kind: "text", text: "최신화 해줘" },
      { role: "assistant", kind: "tool-call", name: "shell", input: { cmd: "git status" }, summary: "git status" },
      { role: "tool", kind: "tool-result", output: "clean" },
      { role: "assistant", kind: "text", text: "완료했습니다." },
    ]);
  });

  it("ignores blank lines and malformed JSON", () => {
    const text = '\n{bad json}\n{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"hi"}]}}\n';
    expect(parseChatTranscript(text, "codex")).toEqual([
      { role: "user", kind: "text", text: "hi" },
    ]);
  });
});
