import { text } from "./dom.js";

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const CHAT_FILE_PATH_RE = /(?:\/?[A-Za-z]:[\\/])?(?:\.{1,2}[\\/])?(?:[^\s"'<>|:*?()[\]{},;]+[\\/])*[^\s"'<>|:*?()[\]{},;]+\.(?:mp4|webm|md|markdown|html?|json|png|jpe?g|gif|webp|bmp|svg|ico)(?::\d+(?::\d+)?)?/gi;

function cleanChatFilePath(value) {
  let result = String(value ?? "").trim()
    .replace(/^[<`"']+/, "")
    .replace(/[>`"']+$/, "")
    .replace(/(:\d+)(?::\d+)?$/, "")
    .split(/[?#]/)[0];
  try { result = decodeURIComponent(result); } catch {}
  result = result.trim();
  return /^\/[A-Za-z]:[\\/]/.test(result) ? result.slice(1) : result;
}

function isAbsoluteChatFilePath(value) {
  return /^[A-Za-z]:[\\/]/.test(cleanChatFilePath(value));
}

function chatFileKind(value) {
  const path = cleanChatFilePath(value);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return null;
  if (/\.(?:md|markdown)$/i.test(path)) return "markdown";
  if (/\.json$/i.test(path)) return "text";
  if (/\.(?:html|htm)$/i.test(path)) return "html";
  if (/\.(?:png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(path)) return "image";
  if (/\.(?:mp4|webm)$/i.test(path)) return "video";
  return null;
}

function chatFileMarkup(rawPath, label, agent, { code = false } = {}) {
  const kind = chatFileKind(rawPath);
  const agentId = text(agent?.id);
  const projectId = text(agent?.projectId);
  const path = cleanChatFilePath(rawPath);
  const safeLabel = escapeHtml(label || path);
  if (!kind || !agentId || !projectId || !path) return code ? `<code>${safeLabel}</code>` : safeLabel;
  return `<button type="button" class="chat-file-link${code ? " chat-file-code" : ""}" data-chat-file-agent="${escapeHtml(agentId)}" data-chat-file-project="${escapeHtml(projectId)}" data-chat-file-path="${escapeHtml(path)}" data-chat-file-kind="${kind}" title="${escapeHtml(path)}">${safeLabel}</button>`;
}

function inlineMd(text, agent = null) {
  const tokens = [];
  const stash = (html) => {
    const token = `\u0000CHAT${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };
  let source = String(text ?? "");
  source = source.replace(/`([^`\n]+)`/g, (_match, code) => (
    chatFileKind(code)
      ? stash(chatFileMarkup(code, code, agent, { code: true }))
      : stash(`<code>${escapeHtml(code)}</code>`)
  ));
  source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawTarget) => {
    const target = String(rawTarget).trim().replace(/^<|>$/g, "");
    if (/^https?:\/\//i.test(target)) {
      return stash(`<a href="${escapeHtml(target)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    }
    return chatFileKind(target) ? stash(chatFileMarkup(target, label, agent)) : match;
  });
  source = source.replace(/https?:\/\/[^\s<]+/g, (url) => (
    stash(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)
  ));
  source = source.replace(CHAT_FILE_PATH_RE, (path) => stash(chatFileMarkup(path, path, agent, { code: true })));
  let out = escapeHtml(source);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\u0000CHAT(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
  return out;
}
function mdToHtml(text, agent = null) {
  const lines = String(text).split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) { closeList(); html += `<h4>${inlineMd(heading[2], agent)}</h4>`; }
    else if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inlineMd(bullet[1], agent)}</li>`; }
    else if (!line.trim()) { closeList(); }
    else { closeList(); html += `<p>${inlineMd(line, agent)}</p>`; }
  }
  closeList();
  return html;
}

export { escapeHtml, cleanChatFilePath, isAbsoluteChatFilePath, chatFileKind, inlineMd, mdToHtml };
