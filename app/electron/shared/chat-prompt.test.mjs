import { describe, expect, it } from "vitest";
import { isQuestionTool, parseChatPrompt, promptSignature, questionDetails } from "./chat-prompt.mjs";

describe("chat questions", () => {
  it.each(["Login expired · Please run /login", "Not logged in · Please run /login", "Anthropic profile login expired"])("identifies a Claude authentication failure: %s", message => {
    expect(parseChatPrompt("waiting", message, null, "claude")).toMatchObject({ kind: "authentication", answerStyle: "terminal", options: [] });
    expect(parseChatPrompt("blocked", null, message, "claude").kind).toBe("authentication");
    expect(parseChatPrompt("running", message, null, "claude")).toBeNull();
  });
  it("does not classify quoted login errors, other providers or structured questions as authentication failures", () => {
    const message = "Login expired · Please run /login";
    expect(parseChatPrompt("waiting", `What does '${message}' mean?`, null, "claude").kind).toBe("question");
    expect(parseChatPrompt("waiting", message, null, "codex").kind).toBe("question");
    expect(parseChatPrompt("waiting", JSON.stringify({ questions: [{ question: message, options: ["A", "B"] }] }), null, "claude").answerStyle).toBe("arrow");
  });
  it.each(["waiting", "blocked", "attention", "question"])("shows a fallback for %s without details", status => {
    expect(parseChatPrompt(status, null, null, "codex")).toMatchObject({ text: "", answerStyle: "terminal", options: [] });
  });
  it("keeps free-text and multiline questions visible", () => {
    expect(parseChatPrompt("waiting", "어떤 경로인가요?\n전체 경로를 알려주세요.", null, "codex").text).toBe("어떤 경로인가요?\n전체 경로를 알려주세요.");
  });
  it.each(["working", "running", "done", "idle", "exited", "recovering"])("ignores stale questions while %s", status => {
    expect(parseChatPrompt(status, "old question", null, "codex")).toBeNull();
  });
  it("preserves all questions, options and descriptions without flattening a Codex form", () => {
    const question = JSON.stringify({ questions: [
      { id: "model", question: "모델을 선택하세요", options: [{ label: "Codex", description: "코딩" }, { label: "Claude", description: "문서" }] },
      { id: "project", question: "어느 프로젝트인가요?", options: [{label: "Current"}, {label: "New"}] },
    ] });
    const prompt = parseChatPrompt("waiting", question, null, "codex");
    expect(prompt).toMatchObject({ answerStyle: "codex-form", options: [], questions: [{id: "model"}, {id: "project"}] });
    expect(prompt.text).toContain("Codex — 코딩");
    expect(prompt.text).toContain("어느 프로젝트인가요?");
  });
  it("preserves a single-choice Claude selector but uses the terminal for multi-select", () => {
    const questions = [{ question: "Pick", options: ["A", "B"] }];
    expect(parseChatPrompt("waiting", JSON.stringify({ questions }), null, "claude")).toMatchObject({ answerStyle: "arrow", options: [{ label: "A", send: "1" }, { label: "B", send: "2" }] });
    questions[0].multiSelect = true;
    expect(parseChatPrompt("waiting", JSON.stringify({ questions }), null, "claude").answerStyle).toBe("terminal");
  });
  it("renders malformed or clipped structured data as a fallback rather than raw JSON", () => {
    expect(questionDetails('{"questions":[{"question":"unfinished')).toEqual({ text: "", questions: [] });
    expect(parseChatPrompt("waiting", '{"questions":', null, "codex").answerStyle).toBe("terminal");
  });
  it("doesn't invent permission answer keys from a hint alone", () => {
    expect(parseChatPrompt("blocked", "Allow this command?", null, "codex")).toMatchObject({ kind: "permission", answerStyle: "terminal", options: [] });
    expect(parseChatPrompt("waiting", "Approve?\n1. Yes\n2. No", null, "codex").options).toEqual([{ label: "Yes", send: "1" }, { label: "No", send: "2" }]);
  });
  it("changes the signature when choices change with the same question and option count", () => {
    expect(promptSignature(parseChatPrompt("waiting", "Pick\n1. A\n2. B"))).not.toBe(promptSignature(parseChatPrompt("waiting", "Pick\n1. C\n2. D")));
  });
  it("recognizes question tool namespaces without turning async work into a blocking prompt", () => {
    for (const name of ["AskUserQuestion", "functions.request_user_input", "functions:request_user_input"]) expect(isQuestionTool(name)).toBe(true);
    expect(isQuestionTool("functions.request_user_input_async")).toBe(false);
    expect(isQuestionTool("functions.request_user_input_async", { includeAsync: true })).toBe(true);
  });
});
