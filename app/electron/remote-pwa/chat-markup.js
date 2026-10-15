import { text } from "./dom.js";

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const CHAT_FILE_PATH_RE = /(?:\/?[A-Za-z]:[\\/])?(?:\.{1,2}[\\/])?(?:[^\s"'<>|:*?()[\]{},;]+[\\/])*[^\s"'<>|:*?()[\]{},;]+\.(?:zip|mp4|webm|md|markdown|html?|jsonc?|png|jpe?g|gif|webp|bmp|svg|ico|txt|tsx?|jsx?|mjs|cjs|py|rs|go|cpp|hpp|cc|cs|c|h|java|kt|swift|css|scss|ya?ml|toml|xml|ini|sql|sh|ps1|bat|cmd|cmake)(?![a-z0-9]|\.[a-z0-9])(?::\d+(?::\d+)?)?/gi;
const CODE_FILE = /\.(?:txt|ts|tsx|js|jsx|mjs|cjs|py|rs|go|c|h|cpp|hpp|cc|cs|java|kt|swift|css|scss|jsonc|yaml|yml|toml|xml|ini|sql|sh|ps1|bat|cmd|cmake)$/i;

function localHostingUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && url.port && !url.username && !url.password && url.href.length <= 4096) return url.href;
  } catch {}
  return null;
}

function httpLinkMarkup(rawTarget, label, agent, { code = false } = {}) {
  const localUrl = localHostingUrl(rawTarget);
  const safeLabel = escapeHtml(label);
  if (localUrl) return `<button type="button" class="chat-file-link${code ? " chat-file-code" : ""}" data-chat-hosting-url="${escapeHtml(localUrl)}" data-chat-hosting-name="${escapeHtml(text(agent?.name))}" title="${escapeHtml(localUrl)}">${safeLabel}</button>`;
  return `<a href="${escapeHtml(rawTarget)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
}

function cleanChatFilePath(value) {
  let result = String(value ?? "").trim()
    .replace(/^[<`"']+/, "")
    .replace(/[>`"']+$/, "")
    .replace(/(:\d+)(?::\d+)?$/, "")
    .split(/[?#]/)[0];
  try { result = decodeURIComponent(result); } catch {}
  if (/^file:\/\//i.test(result)) { try { result = decodeURIComponent(new URL(result).pathname); } catch {} }
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
  if (CODE_FILE.test(path)) return 'text';
  if (/\.(?:html|htm)$/i.test(path)) return "html";
  if (/\.(?:png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(path)) return "image";
  if (/\.(?:mp4|webm)$/i.test(path)) return "video";
  if (/\.zip$/i.test(path)) return 'archive';
  if (isAbsoluteChatFilePath(path) && !/\.[^\\/]+$/.test(path.replace(/[\\/]+$/, ""))) return "folder";
  return null;
}

// Only use files associated with this assistant turn. A filename alone is not
// enough to search other sessions or guess between two different results.
export function resolveChatFileReference(value, files = []) {
  const original = cleanChatFilePath(value);
  if (/[\\/]/.test(original)) return original;
  const matches = new Map();
  for (const file of files) {
    if (file.change?.operation === 'delete') continue;
    const candidate = cleanChatFilePath(file.path);
    const windows = isAbsoluteChatFilePath(candidate);
    if (!windows && !candidate.startsWith('/')) continue;
    const name = candidate.replaceAll('\\', '/').split('/').at(-1);
    if (windows ? name.toLowerCase() !== original.toLowerCase() : name !== original) continue;
    matches.set(windows ? candidate.replaceAll('\\', '/').toLowerCase() : candidate, candidate);
  }
  return matches.size === 1 ? matches.values().next().value : original;
}

function chatFileMarkup(rawPath, label, agent, { code = false, files = [] } = {}) {
  const kind = chatFileKind(rawPath);
  const agentId = text(agent?.id);
  const projectId = text(agent?.projectId);
  const path = resolveChatFileReference(rawPath, files);
  const safeLabel = escapeHtml(label || path);
  if (!kind || !agentId || !projectId || !path) return code ? `<code>${safeLabel}</code>` : safeLabel;
  return `<button type="button" class="chat-file-link${code ? " chat-file-code" : ""}" data-chat-file-agent="${escapeHtml(agentId)}" data-chat-file-project="${escapeHtml(projectId)}" data-chat-file-path="${escapeHtml(path)}" data-chat-file-kind="${kind}" title="${escapeHtml(path)}">${safeLabel}</button>`;
}

function inlineMd(text, agent = null, files = []) {
  const tokens = [];
  const stash = (html) => {
    const token = `\u0000CHAT${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };
  let source = String(text ?? "");
  source = source.replace(/`([^`\n]+)`/g, (_match, code) => (
    localHostingUrl(code) ? stash(httpLinkMarkup(code, code, agent, { code: true })) : chatFileKind(code)
      ? stash(chatFileMarkup(code, code, agent, { code: true, files }))
      : stash(`<code>${escapeHtml(code)}</code>`)
  ));
  source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, rawTarget) => {
    const target = String(rawTarget).trim().replace(/^<|>$/g, "");
    if (/^https?:\/\//i.test(target)) {
      return stash(httpLinkMarkup(target, label, agent));
    }
    return chatFileKind(target) ? stash(chatFileMarkup(target, label, agent, { files })) : match;
  });
  source = source.replace(/https?:\/\/[^\s<>`]+/g, rawUrl => {
    const url = rawUrl.replace(/[.,;!?\])}]+$/, "");
    return stash(httpLinkMarkup(url, url, agent)) + rawUrl.slice(url.length);
  });
  source = source.replace(CHAT_FILE_PATH_RE, (path) => stash(chatFileMarkup(path, path, agent, { code: true, files })));
  source = source.replace(/(?:\/?[A-Za-z]:[\\/]|\.\.?[\\/])[^\s"'<>|*?()[\]{},;]+\.(?:tsx?|jsx?|mjs|cjs|py|rs|go|cpp|hpp|c|h|cs|java|kt|css|yaml|yml|toml|xml|ps1)(?::\d+(?::\d+)?)?/gi, path => stash(chatFileMarkup(path, path, agent, { code: true, files })));
  let out = escapeHtml(source);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\u0000CHAT(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
  return out;
}
function mdToHtml(text, agent = null, files = []) {
  const lines = String(text).split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) { closeList(); html += `<h4>${inlineMd(heading[2], agent, files)}</h4>`; }
    else if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inlineMd(bullet[1], agent, files)}</li>`; }
    else if (!line.trim()) { closeList(); }
    else { closeList(); html += `<p>${inlineMd(line, agent, files)}</p>`; }
  }
  closeList();
  return html;
}

export { escapeHtml, cleanChatFilePath, isAbsoluteChatFilePath, chatFileKind, localHostingUrl, inlineMd, mdToHtml };
