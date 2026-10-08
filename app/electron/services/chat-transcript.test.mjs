import { describe, expect, it } from "vitest";
import { parseChatTranscript, deriveTurnLifecycle, deriveTurnLifecycleDetails, derivePendingQuestion } from "./chat-transcript.mjs";

describe("live work lifecycle", () => {
  const serialize = records => records.map(JSON.stringify).join("\n");
  const at = timestamp => new Date(timestamp).toISOString();
  it("recognizes new input and tools even when a tail omits task_started", () => {
    const records = [
      { timestamp: at(1000), type: "event_msg", payload: { type: "task_complete" } },
      { timestamp: at(2000), type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "계속 진행해" }] } },
      { timestamp: at(3000), type: "response_item", payload: { type: "function_call", name: "functions.exec_command" } },
    ];
    expect(deriveTurnLifecycleDetails(serialize(records), "codex")).toEqual({ lifecycle: "working", lifecycleAt: 3000, activeTool: "functions.exec_command" });
    records.push({ timestamp: at(4000), type: "response_item", payload: { type: "function_call_output", output: "done" } });
    expect(deriveTurnLifecycleDetails(serialize(records), "codex")).toMatchObject({ lifecycle: "working", activeTool: undefined });
    records.push({ timestamp: at(5000), type: "response_item", payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "완료" }] } });
    expect(deriveTurnLifecycleDetails(serialize(records), "codex")).toEqual({ lifecycle: "idle", lifecycleAt: 5000, activeTool: undefined });
  });
  it("keeps a markerless tail inconclusive and skips injected setup messages", () => {
    const records = [
      { type: "session_meta", payload: {} },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ text: "<environment_context>setup</environment_context>" }] } },
    ];
    expect(deriveTurnLifecycleDetails(serialize(records), "codex")).toEqual({ lifecycle: undefined, lifecycleAt: undefined, activeTool: undefined });
  });
  it("tracks Claude tools and ends on a timestamped final answer", () => {
    const records = [{ timestamp: at(2000), type: "assistant", message: { stop_reason: "tool_use", content: [{ type: "tool_use", name: "Read" }] } }];
    expect(deriveTurnLifecycleDetails(serialize(records), "claude")).toEqual({ lifecycle: "working", lifecycleAt: 2000, activeTool: "Read" });
    records.push({ timestamp: at(3000), type: "assistant", message: { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] } });
    expect(deriveTurnLifecycleDetails(serialize(records), "claude")).toEqual({ lifecycle: "idle", lifecycleAt: 3000, activeTool: undefined });
  });
  it("recognizes image-only input, Claude tool results and explicit interruption", () => {
    expect(deriveTurnLifecycleDetails(serialize([{ timestamp: at(1000), type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,YQ==" }] } }]), "codex")).toMatchObject({ lifecycle: "working", lifecycleAt: 1000 });
    const records = [{ timestamp: at(1000), type: "user", message: { content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "YQ==" } }] } }];
    expect(deriveTurnLifecycleDetails(serialize(records), "claude")).toMatchObject({ lifecycle: "working", lifecycleAt: 1000 });
    records.push({ timestamp: at(2000), type: "user", message: { content: [{ type: "tool_result", content: "done" }] } });
    expect(deriveTurnLifecycleDetails(serialize(records), "claude")).toEqual({ lifecycle: "working", lifecycleAt: 2000, activeTool: undefined });
    records.push({ timestamp: at(3000), type: "user", message: { content: "[Request interrupted by user]" } });
    expect(deriveTurnLifecycleDetails(serialize(records), "claude")).toEqual({ lifecycle: "idle", lifecycleAt: 3000, activeTool: undefined });
  });
});

describe("image-only transcript messages", () => {
  it("preserves a Codex user image without copying bitmap data to regular history", () => {
    const line = JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,YQ==" }] } });
    expect(parseChatTranscript(line, "codex")).toEqual([{ role: "user", kind: "image" }]);
  });
});

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
