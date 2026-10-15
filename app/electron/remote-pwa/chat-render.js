import { t } from "./i18n.js";
import { make } from "./dom.js";
import { inlineMd, mdToHtml } from "./chat-markup.js";
import { providerLogo, providerLabel } from './workspace-ui.js';
import { renderFiles, filesForTurn, renderStoredImages } from './chat-files.js';

function renderChatUser(text, agent, block) {
  const node = make("div", "chat-user");
  node.innerHTML = inlineMd(text, agent);
  if (block) node.append(renderStoredImages(block, agent));
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

function renderAssistantTurn(run, agent = null, artifacts = [], owner = {}) {
  const turnFiles = filesForTurn(artifacts, run);
  const turn = make("div", "chat-turn");
  const role = make("div", "chat-role");
  role.append(providerLogo(agent?.aiToolId), document.createTextNode(providerLabel(agent?.aiToolId)));
  turn.appendChild(role);

  const tools = [];
  const pendingCalls = [];
  const bodyNodes = [];
  for (const block of run) {
    if (block.kind === "tool-call") {
      const call = { callId:block.callId, name: block.name, input: block.input, summary: block.summary, diff: block.diff || null, output: null, isError: false, deferredSequences: block.deferred ? [block.sequence] : [] };
      pendingCalls.push(call); tools.push(call);
    } else if (block.kind === "tool-result") {
      const index = block.callId ? pendingCalls.findIndex(call => call.callId === block.callId) : pendingCalls.findIndex(call => !call.callId);
      const pendingCall = index >= 0 ? pendingCalls.splice(index,1)[0] : null;
      if (pendingCall) {
        pendingCall.output = block.output; pendingCall.isError = block.isError; if (block.deferred) pendingCall.deferredSequences.push(block.sequence);
        if (!pendingCall.diff && block.diff) pendingCall.diff = block.diff;
      } else {
        tools.push({ name: "result", input: null, output: block.output, isError: block.isError, diff: block.diff || null, deferredSequences: block.deferred ? [block.sequence] : [] });
      }
    } else if (block.kind === "reasoning") {
      const d = make("details", "chat-work");
      d.append(make("summary", "", t("추론")));
      const wrap = make("div", "chat-tools");
      const pre = make("pre", "", block.text);
      wrap.appendChild(pre);
      d.appendChild(wrap);
      bodyNodes.push(d);
    } else if (block.kind === "text") {
      const md = make("div", "chat-md");
      md.innerHTML = mdToHtml(block.text, agent, turnFiles);
      bodyNodes.push(md);
    } else if (block.kind === "image") {
      bodyNodes.push(make("div", "chat-md", t("🖼 이미지")));
    }
  }

  if (tools.length) {
    const group = make("details", "chat-work");
    group.append(make("summary", "", t("작업 · 툴 {0}개", [tools.length])));
    const list = make("div", "chat-tools");
    group.addEventListener('toggle', () => {
      if (!group.open || list.children.length) return;
      for (const tool of tools) {
        const label = toolLabel(tool), item = make('details', 'chat-tool'), summary = make('summary', '');
        summary.append(make('span', 'k', '$'), make('span', 'cmd', label.arg ? label.name + ' · ' + label.arg : label.name));
        item.append(summary);
        let loaded = false, loading = false;
        const display = value => {
          if (value.diff) item.append(renderDiff(value.diff));
          if (value.output != null || !value.diff) item.append(make('pre', value.isError ? 'err' : '', value.output ?? t('(출력 없음)')));
        };
        if (tool.deferredSequences.includes(undefined)) { item.append(make('div', 'chat-tool-loading', t('작업 내역을 준비하고 있습니다…'))); loaded = true; }
        else if (!tool.deferredSequences.length) { display(tool); loaded = true; }
        item.addEventListener('toggle', async () => {
          if (!item.open || loaded || loading) return;
          loading = true;
          const status = make('div', 'chat-tool-loading', t('상세 내역 불러오는 중…')); item.append(status);
          try {
            const response = await fetch('/api/chat/details', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: agent.id, sessionId: owner.sessionId, conversationId: owner.conversationId, sequences: tool.deferredSequences }) });
            const data = await response.json();
            if (!response.ok || !data.blocks?.length) throw Error('Details unavailable');
            const call = data.blocks.find(block => block.kind === 'tool-call'), result = data.blocks.find(block => block.kind === 'tool-result');
            display({ diff: call?.diff || result?.diff, output: result?.output, isError: result?.isError }); loaded = true; status.remove();
          } catch {
            status.textContent = ''; const retry = make('button', '', t('상세 내역 불러오기 실패 · 다시 시도'));
            retry.type = 'button'; retry.addEventListener('click', () => { status.remove(); item.open = false; requestAnimationFrame(() => { item.open = true; }); }); status.append(retry);
          } finally { loading = false; }
        });
        list.append(item);
      }
    });
    group.appendChild(list);
    turn.appendChild(group);
  }
  for (const node of bodyNodes) turn.appendChild(node);
  const files = renderFiles(turnFiles, agent); if (files) turn.append(files);
  return turn;
}

export { renderChatUser, renderAssistantTurn };
