import { make } from "./dom.js";
import { inlineMd, mdToHtml } from "./chat-markup.js";

function renderChatUser(text, agent) {
  const node = make("div", "chat-user");
  node.innerHTML = inlineMd(text, agent);
  return node;
}

function toolLabel(tool) {
  let arg = tool.summary || "";
  if (!arg) {
    const input = tool.input;
    if (typeof input === "string") arg = input;
    else if (input && typeof input === "object") {
      arg = input.command || input.cmd || input.file_path || input.path || input.pattern || JSON.stringify(input);
    }
  }
  return { name: tool.name || "tool", arg: String(arg).replace(/\s+/g, " ").slice(0, 110) };
}

// Render a diff (from an edit tool call or diff-like output) as colored lines.
function renderDiff(diff) {
  const box = make("div", "chat-diff");
  for (const line of diff) {
    const row = make("div", `chat-diff-line ${line.type}`);
    const gutter = make("span", "chat-diff-gutter", line.type === "add" ? "+" : line.type === "del" ? "-" : " ");
    row.append(gutter, document.createTextNode(line.text || " "));
    box.appendChild(row);
  }
  return box;
}

function renderAssistantTurn(run, agent = null) {
  const turn = make("div", "chat-turn");
  const role = make("div", "chat-role");
  role.append(make("span", "av", "✦"), document.createTextNode("Assistant"));
  turn.appendChild(role);

  const tools = [];
  let pendingCall = null;
  const bodyNodes = [];
  for (const block of run) {
    if (block.kind === "tool-call") {
      pendingCall = { name: block.name, input: block.input, summary: block.summary, diff: block.diff || null, output: null, isError: false };
      tools.push(pendingCall);
    } else if (block.kind === "tool-result") {
      if (pendingCall && pendingCall.output === null) {
        pendingCall.output = block.output; pendingCall.isError = block.isError;
        if (!pendingCall.diff && block.diff) pendingCall.diff = block.diff;
        pendingCall = null;
      } else {
        tools.push({ name: "result", input: null, output: block.output, isError: block.isError, diff: block.diff || null });
      }
    } else if (block.kind === "reasoning") {
      const d = make("details", "chat-work");
      d.append(make("summary", "", "추론"));
      const wrap = make("div", "chat-tools");
      const pre = make("pre", "", block.text);
      wrap.appendChild(pre);
      d.appendChild(wrap);
      bodyNodes.push(d);
    } else if (block.kind === "text") {
      const md = make("div", "chat-md");
      md.innerHTML = mdToHtml(block.text, agent);
      bodyNodes.push(md);
    } else if (block.kind === "image") {
      bodyNodes.push(make("div", "chat-md", "🖼 이미지"));
    }
  }

  if (tools.length) {
    const group = make("details", "chat-work");
    group.append(make("summary", "", `작업 · 툴 ${tools.length}개`));
    const list = make("div", "chat-tools");
    for (const tool of tools) {
      const label = toolLabel(tool);
      const item = make("details", "chat-tool");
      const summary = make("summary", "");
      summary.append(make("span", "k", "$"), make("span", "cmd", label.arg ? `${label.name} · ${label.arg}` : label.name));
      item.appendChild(summary);
      if (tool.diff) item.appendChild(renderDiff(tool.diff));
      if (tool.output !== undefined && tool.output !== null || !tool.diff) {
        item.appendChild(make("pre", tool.isError ? "err" : "", tool.output ?? "(출력 없음)"));
      }
      list.appendChild(item);
    }
    group.appendChild(list);
    turn.appendChild(group);
  }
  for (const node of bodyNodes) turn.appendChild(node);
  return turn;
}

export { renderChatUser, renderAssistantTurn };
