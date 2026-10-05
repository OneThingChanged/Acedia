// Decode an agent's own JSONL session transcript (Codex / Claude) into a flat
// list of chat blocks the mobile/site chat view renders as a conversation —
// instead of scaling a raw terminal down to phone width. Each block carries a
// role and a kind; the renderer groups consecutive assistant/tool blocks into a
// turn and folds tool calls. Kept dependency-free and plain-JSON (crosses IPC).
//
// Block shape: { role, kind, text?, name?, input?, summary?, diff?, output?, isError? }
//   role: "user" | "assistant" | "tool"
//   kind: "text" | "reasoning" | "tool-call" | "tool-result" | "image"
//   summary/diff: on tool-call — a short label + a colored diff (edit tools).
//   diff (on tool-result): when the output itself is a unified diff.

import { toolSummary, diffFromToolCall, diffFromText } from "./chat-tool-format.mjs";
import { isNoiseUserText } from "./chat-noise.mjs";
import { isQuestionTool } from "../shared/chat-prompt.mjs";

const MAX_TOOL_OUTPUT = 4000;
const MAX_TEXT = 20000;

function toolCallBlock(name, rawInput) {
  // Codex passes function-call arguments as a JSON string — parse so the
  // summary/diff can read fields; keep the parsed object as the block input.
  let input = rawInput;
  if (typeof rawInput === "string") {
    const trimmed = rawInput.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        input = JSON.parse(trimmed);
      } catch {
        /* keep the raw string */
      }
    }
  }
  const block = { role: "assistant", kind: "tool-call", name, input };
  const summary = toolSummary(name, input);
  if (summary) block.summary = summary;
  const diff = diffFromToolCall(name, input);
  if (diff) block.diff = diff;
  return block;
}

function toolResultBlock(output, isError) {
  const block = { role: "tool", kind: "tool-result", output };
  if (isError) block.isError = true;
  const diff = diffFromText(output);
  if (diff) block.diff = diff;
  return block;
}

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Flatten Claude/Anthropic content (string | array of typed parts) to text.
function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

function decodeClaudeLine(obj, out) {
  const message = obj.message;
  if (obj.type === "user" && message) {
    const content = message.content;
    if (typeof content === "string") {
      const text = content.trim();
      // Skip harness-injected wrappers (command output, caveats, reminders).
      if (text && !isNoiseUserText(text)) {
        out.push({ role: "user", kind: "text", text: clip(text, MAX_TEXT) });
      }
      return;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text" && part.text?.trim() && !isNoiseUserText(part.text)) {
          out.push({ role: "user", kind: "text", text: clip(part.text, MAX_TEXT) });
        } else if (part.type === "tool_result") {
          out.push(
            toolResultBlock(clip(contentToText(part.content), MAX_TOOL_OUTPUT), Boolean(part.is_error))
          );
        } else if (part.type === "image") {
          out.push({ role: "user", kind: "image" });
        }
      }
    }
    return;
  }
  if (obj.type === "assistant" && Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part.type === "text" && part.text?.trim()) {
        out.push({ role: "assistant", kind: "text", text: clip(part.text, MAX_TEXT) });
      } else if (part.type === "thinking" && part.thinking?.trim()) {
        out.push({ role: "assistant", kind: "reasoning", text: clip(part.thinking, MAX_TEXT) });
      } else if (part.type === "tool_use") {
        out.push(toolCallBlock(part.name || "tool", part.input));
      }
    }
  }
}

function decodeCodexLine(obj, out) {
  if (obj.type !== "response_item" || !obj.payload) return;
  const p = obj.payload;
  if (p.type === "message") {
    const role = p.role === "assistant" ? "assistant" : p.role === "user" ? "user" : null;
    if (!role) return; // developer/system prompts are noise in a chat view
    let text = contentToText(p.content).trim();
    if (role === "user") {
      const reply = text.match(/^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/);
      if (reply) {
        try {
          const answers = JSON.parse(reply[1]);
          if (Array.isArray(answers)) {
            const readable = answers.map(a => [typeof a.question === "string" ? a.question : "", typeof a.answer === "string" ? a.answer : ""].filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
            if (readable) text = readable;
          }
        } catch { /* Preserve unexpected provider text instead of losing it. */ }
      }
    }
    // Codex injects an <environment_context>/<user_instructions> wrapper as the
    // first "user" turn — skip those the way we skip Claude's reminders.
    if (!text || (role === "user" && isNoiseUserText(text))) return;
    out.push({ role, kind: "text", text: clip(text, MAX_TEXT) });
    return;
  }
  if (p.type === "function_call" || p.type === "local_shell_call" || p.type === "custom_tool_call") {
    out.push(
      toolCallBlock(
        p.name || p.tool_name || (p.type === "local_shell_call" ? "shell" : "tool"),
        p.arguments ?? p.action ?? p.input ?? null
      )
    );
    return;
  }
  if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
    const raw = p.output;
    const text = typeof raw === "string" ? raw : contentToText(raw?.content) || JSON.stringify(raw ?? "");
    out.push(toolResultBlock(clip(text, MAX_TOOL_OUTPUT), false));
    return;
  }
  if (p.type === "reasoning") {
    const text = contentToText(p.summary).trim() || contentToText(p.content).trim();
    if (text) out.push({ role: "assistant", kind: "reasoning", text: clip(text, MAX_TEXT) });
  }
}

// Decide whether the agent's LAST turn is still in progress ("working") or has
// finished ("idle"), read from the transcript itself — reliable even when the
// completion hook never fired and the app's status is stuck at "working".
//   Codex: task_started (working) vs task_complete / turn_aborted (idle).
//   Claude: last record — assistant with a terminal stop_reason = idle; an
//           assistant awaiting tools (stop_reason "tool_use") or a trailing
//           user turn = working.
export function deriveTurnLifecycle(text, tool) {
  const lines = String(text ?? "").split(/\r?\n/);
  if (tool === "codex") {
    let state = "idle";
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const type = obj?.payload?.type ?? obj?.type;
      if (type === "task_started") state = "working";
      else if (type === "task_complete" || type === "turn_aborted") state = "idle";
    }
    return state;
  }
  if (tool === "claude") {
    let last = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj?.type === "user" || obj?.type === "assistant") last = obj;
    }
    if (!last) return "idle";
    if (last.type === "assistant") {
      const stop = last.message?.stop_reason;
      return stop && stop !== "tool_use" ? "idle" : "working";
    }
    // Trailing user turn → agent should act, UNLESS it's an interrupt marker
    // ("[Request interrupted…]"), which means the turn was cancelled → idle.
    if (/\[request interrupted/i.test(contentToText(last.message?.content))) return "idle";
    return "working";
  }
  return "idle";
}

// A native Codex question can be logged without a PermissionRequest hook.
// Track its call identity, not the position of the next unrelated tool output.
// Async calls return {accepted:true} before the user answers. Their actual
// replies arrive later as send_user_message_question_reply user messages.
export function derivePendingQuestions(text, tool, previous = []) {
  const pending = new Map(previous.map(q => [q.id, q]));
  const add = (id, name, input) => {
    if (!id || !isQuestionTool(name, { includeAsync: true })) return;
    const async = String(name).split(/[.:/]/).pop() === "request_user_input_async";
    if (!pending.has(id)) pending.set(id, { id, toolName: name, question: typeof input === "string" ? input : JSON.stringify(input ?? {}), ...(async ? { async: true } : {}) });
  };
  const clearSynchronous = () => { for (const [id, q] of pending) if (!q.async) pending.delete(id); };
  for (const line of String(text ?? "").split(/\r?\n/)) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (tool === "codex") {
      const p = obj?.payload;
      if (!p) continue;
      if (["task_started", "task_complete", "turn_aborted"].includes(p.type)) clearSynchronous();
      if (obj.type !== "response_item") continue;
      if (p.type === "message" && p.role === "user") {
        const body = contentToText(p.content), reply = body.match(/<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>/);
        if (reply) {
          try {
            for (const answer of JSON.parse(reply[1])) {
              const identity = JSON.parse(answer.questionItemId);
              if (identity[0] !== "request_user_input_async") continue;
              const q = pending.get(identity[1]); if (!q?.async) continue;
              const input = JSON.parse(q.question), index = identity[2];
              if (!Number.isInteger(index) || index < 0 || !Array.isArray(input.questions)) continue;
              const answered = new Set(q.answeredIndices || []); answered.add(index);
              if (input.questions.every((_, i) => answered.has(i))) pending.delete(q.id);
              else pending.set(q.id, { ...q, answeredIndices: [...answered] });
            }
          } catch { /* partial/malformed replies never dismiss a question */ }
        } else if (!isNoiseUserText(body)) clearSynchronous();
      }
      if (["function_call", "custom_tool_call"].includes(p.type)) add(p.call_id, p.name || p.tool_name, p.arguments ?? p.input);
      if (["function_call_output", "custom_tool_call_output"].includes(p.type)) {
        if (!pending.get(p.call_id)?.async) pending.delete(p.call_id);
        else { try { if (JSON.parse(p.output)?.accepted === false) pending.delete(p.call_id); } catch { /* accepted async output is not an answer */ } }
      }
    } else if (tool === "claude") {
      const content = obj.message?.content;
      if (obj.type === "user" && typeof content === "string" && !isNoiseUserText(content)) pending.clear();
      for (const part of Array.isArray(content) ? content : []) {
        if (obj.type === "assistant" && part.type === "tool_use") add(part.id, part.name, part.input);
        if (obj.type === "user" && part.type === "tool_result") pending.delete(part.tool_use_id);
      }
      const stop = obj.message?.stop_reason;
      if (obj.type === "assistant" && stop && stop !== "tool_use") pending.clear();
    }
  }
  return [...pending.values()];
}
export function derivePendingQuestion(text, tool, previous = null) {
  const pending = derivePendingQuestions(text, tool, previous ? [previous] : []);
  return pending.find(q => !q.async) || pending.find(q => q.async) || null;
}

// Parse a full transcript body into chat blocks. `tool` is "codex" | "claude".
export function parseChatTranscript(text, tool) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (tool === "claude") decodeClaudeLine(obj, out);
    else if (tool === "codex") decodeCodexLine(obj, out);
  }
  return out;
}
