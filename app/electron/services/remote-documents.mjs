import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { sendJson } from "./remote-http.mjs";

const REMOTE_DOCUMENT_EXTENSIONS = new Map([
  [".mp4", "video"],
  [".webm", "video"],
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".html", "html"],
  [".htm", "html"],
]);
const REMOTE_DOCUMENT_SKIPPED_DIRS = new Set([
  ".build-tools",
  ".cache",
  ".claude",
  ".codex",
  ".git",
  ".next",
  ".qwen",
  ".gemini",
  ".tmp",
  ".venv",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
  "out",
  "target",
]);
const MAX_REMOTE_DOCUMENT_FILES = 500;
const MAX_REMOTE_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const REMOTE_HTML_PREVIEW_TTL_MS = 15 * 60_000;
const MAX_REMOTE_HTML_PREVIEWS = 128;
const REMOTE_HTML_PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REMOTE_IMAGE_EXTENSIONS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);
const REMOTE_PREVIEW_ASSET_EXTENSIONS = new Map([
  ...REMOTE_IMAGE_EXTENSIONS,
  [".css", "text/css; charset=utf-8"],
]);
const REMOTE_HTML_PREVIEW_EXTENSIONS = new Map([
  ...REMOTE_IMAGE_EXTENSIONS,
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);
const REMOTE_HTML_PREVIEW_CSP = [
  "default-src 'self' data: blob:",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "sandbox allow-scripts allow-downloads",
].join("; ");
class RemoteDocumentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function documentProjects(snapshot) {
  const viewProjects = snapshot?.view?.projects;
  if (Array.isArray(viewProjects)) return viewProjects;
  return Array.isArray(snapshot?.projects) ? snapshot.projects : [];
}

function documentAgents(snapshot) {
  const liveAgents = Array.isArray(snapshot?.agents) ? snapshot.agents : [];
  const viewAgents = Array.isArray(snapshot?.view?.agents) ? snapshot.view.agents : [];
  const merged = new Map();
  for (const agent of liveAgents) {
    const id = String(agent?.id || "").trim();
    if (id) merged.set(id, agent);
  }
  for (const agent of viewAgents) {
    const id = String(agent?.id || "").trim();
    if (!id) continue;
    merged.set(id, { ...(merged.get(id) || {}), ...agent });
  }
  return [...merged.values()];
}

function documentProjectRoot(snapshot, projectId, agentId = null) {
  const id = String(projectId || "").trim();
  const project = documentProjects(snapshot).find((candidate) => String(candidate?.id || "") === id);
  if (!project) throw new RemoteDocumentError(404, "프로젝트를 찾을 수 없습니다.");
  if (project.sshHostId) {
    throw new RemoteDocumentError(409, "SSH 프로젝트의 원격 파일 보기는 아직 지원하지 않습니다.");
  }
  const folder = String(project.folder || "").trim();
  if (!folder) throw new RemoteDocumentError(404, "프로젝트 폴더가 없습니다.");
  let root;
  try {
    root = fs.realpathSync(folder);
  } catch {
    throw new RemoteDocumentError(404, "프로젝트 폴더를 찾을 수 없습니다.");
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new RemoteDocumentError(404, "프로젝트 폴더를 찾을 수 없습니다.");
  }
  let baseRoot = root;
  const requestedAgentId = String(agentId || "").trim();
  if (requestedAgentId) {
    const agent = documentAgents(snapshot).find(
      (candidate) => String(candidate?.id || "") === requestedAgentId,
    );
    // Restored or older clients can briefly publish live agent data without
    // project/folder metadata. Fall back to the selected project root, which
    // preserves the same sandbox boundary until richer view data arrives.
    if (agent && (!agent.projectId || String(agent.projectId) === id)) {
      if (agent.sshHostId) {
        throw new RemoteDocumentError(409, "SSH 세션의 원격 파일 보기는 아직 지원하지 않습니다.");
      }
      const agentFolder = String(agent.folder || "").trim();
      if (agentFolder) {
        try {
          baseRoot = fs.realpathSync(agentFolder);
        } catch {
          throw new RemoteDocumentError(404, "세션 작업 폴더를 찾을 수 없습니다.");
        }
        if (!fs.statSync(baseRoot).isDirectory() || !isInsideDocumentRoot(root, baseRoot)) {
          throw new RemoteDocumentError(403, "세션 작업 폴더가 프로젝트 밖에 있습니다.");
        }
      }
    }
  }
  return { project, root, baseRoot };
}

function isInsideDocumentRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRemoteRequestedPath(requestedPath) {
  const raw = String(requestedPath || "").trim().replaceAll("\\", "/");
  // Markdown renderers sometimes turn G:/path into /G:/path. Treat that as a
  // Windows drive path instead of a POSIX root.
  return /^\/[A-Za-z]:\//.test(raw) ? raw.slice(1) : raw;
}

function documentProjectRootForAbsolutePath(snapshot, candidate) {
  const matches = [];
  for (const project of documentProjects(snapshot)) {
    if (project?.sshHostId) continue;
    const folder = String(project?.folder || "").trim();
    if (!folder) continue;
    try {
      const root = fs.realpathSync(folder);
      if (!fs.statSync(root).isDirectory()) continue;
      if (isInsideDocumentRoot(root, candidate)) {
        matches.push({ project, root, baseRoot: root });
        continue;
      }
      let workspace = root;
      // A registered Unreal plugin also belongs to its enclosing .uproject.
      // This permits Saved reports without exposing the rest of the drive.
      for (let dir = root; ; dir = path.dirname(dir)) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { break; }
        if (entries.some(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.uproject'))) {
          workspace = dir;
          break;
        }
        if (path.dirname(dir) === dir) break;
      }
      if (isInsideDocumentRoot(workspace, candidate)) {
        matches.push({ project, root: workspace, baseRoot: workspace });
      }
    } catch {
      // A stale project must not prevent another registered project from
      // owning the requested path.
    }
  }
  if (!matches.length) {
    throw new RemoteDocumentError(403, "등록된 프로젝트나 Unreal 작업공간 밖의 파일은 열 수 없습니다.");
  }
  // Nested project roots are valid; the most specific registered root wins.
  matches.sort((left, right) => right.root.length - left.root.length);
  return matches[0];
}

async function collectRemoteDocuments(root, directory, output) {
  if (output.length >= MAX_REMOTE_DOCUMENT_FILES) return;
  let entries;
  try {
    entries = await fsPromises.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (output.length >= MAX_REMOTE_DOCUMENT_FILES) return;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!REMOTE_DOCUMENT_SKIPPED_DIRS.has(entry.name.toLowerCase())) {
        await collectRemoteDocuments(root, absolute, output);
      }
      continue;
    }
    // Deliberately ignore symbolic links so a project cannot expose a file
    // outside its root through an otherwise harmless-looking docs path.
    if (!entry.isFile()) continue;
    const kind = REMOTE_DOCUMENT_EXTENSIONS.get(path.extname(entry.name).toLowerCase());
    if (!kind) continue;
    output.push({
      name: entry.name,
      path: path.relative(root, absolute).split(path.sep).join("/"),
      kind,
    });
  }
}

async function listRemoteDocuments(snapshot, projectId) {
  const { project, root } = documentProjectRoot(snapshot, projectId);
  const documents = [];
  await collectRemoteDocuments(root, root, documents);
  return {
    project: { id: project.id, name: project.name },
    documents,
    limit: MAX_REMOTE_DOCUMENT_FILES,
    truncated: documents.length >= MAX_REMOTE_DOCUMENT_FILES,
  };
}

async function resolveRemoteProjectFile(snapshot, projectId, requestedPath, agentId = null) {
  const raw = normalizeRemoteRequestedPath(requestedPath);
  if (!raw) throw new RemoteDocumentError(400, "올바른 파일 경로가 필요합니다.");
  const absolute = path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw);
  const absoluteCandidate = absolute ? path.resolve(raw) : null;
  const { project, root, baseRoot } = absolute
    ? documentProjectRootForAbsolutePath(snapshot, absoluteCandidate)
    : documentProjectRoot(snapshot, projectId, agentId);
  const candidate = absoluteCandidate ?? path.resolve(baseRoot, ...raw.split("/"));
  if (!isInsideDocumentRoot(root, candidate)) {
    throw new RemoteDocumentError(403, "프로젝트 밖의 파일은 열 수 없습니다.");
  }
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    throw new RemoteDocumentError(404, "문서 파일을 찾을 수 없습니다.");
  }
  if (!isInsideDocumentRoot(root, resolved)) {
    throw new RemoteDocumentError(403, "프로젝트 밖의 파일은 열 수 없습니다.");
  }
  const stats = await fsPromises.stat(resolved);
  if (!stats.isFile()) throw new RemoteDocumentError(404, "파일을 찾을 수 없습니다.");
  return { project, root, baseRoot, resolved, stats };
}

async function readRemoteDocument(snapshot, projectId, requestedPath, agentId = null) {
  const { project, root, baseRoot, resolved, stats } = await resolveRemoteProjectFile(
    snapshot,
    projectId,
    requestedPath,
    agentId,
  );
  const extension = path.extname(resolved).toLowerCase();
  const kind = REMOTE_DOCUMENT_EXTENSIONS.get(extension) || (extension === ".json" ? "text" : null);
  if (!kind || kind === "video") throw new RemoteDocumentError(415, "Markdown, HTML, JSON 파일만 열 수 있습니다.");
  if (stats.size > MAX_REMOTE_DOCUMENT_BYTES) {
    throw new RemoteDocumentError(413, "2MB보다 큰 문서는 Remote에서 열 수 없습니다.");
  }
  return {
    project: { id: project.id, name: project.name },
    name: path.basename(resolved),
    path: path.relative(root, resolved).split(path.sep).join("/"),
    basePath: path.relative(baseRoot, resolved).split(path.sep).join("/"),
    kind,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    content: await fsPromises.readFile(resolved, "utf8"),
  };
}

async function sendRemoteImage(response, snapshot, projectId, requestedPath, agentId = null) {
  const { resolved, stats } = await resolveRemoteProjectFile(snapshot, projectId, requestedPath, agentId);
  const contentType = REMOTE_IMAGE_EXTENSIONS.get(path.extname(resolved).toLowerCase());
  if (!contentType) throw new RemoteDocumentError(415, "지원하지 않는 이미지 형식입니다.");
  if (stats.size > MAX_REMOTE_IMAGE_BYTES) {
    throw new RemoteDocumentError(413, "25MB보다 큰 이미지는 Remote에서 열 수 없습니다.");
  }
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stats.size,
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; sandbox",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
  await pipeline(fs.createReadStream(resolved), response);
}

async function sendRemotePreviewAsset(response, snapshot, projectId, requestedPath, agentId = null) {
  const { resolved, stats } = await resolveRemoteProjectFile(snapshot, projectId, requestedPath, agentId);
  const extension = path.extname(resolved).toLowerCase();
  const contentType = REMOTE_PREVIEW_ASSET_EXTENSIONS.get(extension);
  if (!contentType) throw new RemoteDocumentError(415, "지원하지 않는 HTML 자산 형식입니다.");
  const limit = extension === ".css" ? MAX_REMOTE_DOCUMENT_BYTES : MAX_REMOTE_IMAGE_BYTES;
  if (stats.size > limit) {
    throw new RemoteDocumentError(413, extension === ".css"
      ? "2MB보다 큰 스타일시트는 Remote에서 열 수 없습니다."
      : "25MB보다 큰 이미지는 Remote에서 열 수 없습니다.");
  }
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": stats.size,
    "cache-control": "no-store",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
  await pipeline(fs.createReadStream(resolved), response);
}

function pruneRemoteHtmlPreviews(previews, now = Date.now()) {
  for (const [token, entry] of previews) {
    if (!entry || entry.expiresAt <= now) previews.delete(token);
  }
}

function escapeRemotePreviewHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function remotePreviewPath(token, root, candidate) {
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    return null;
  }
  if (!isInsideDocumentRoot(root, resolved)) return null;
  const extension = path.extname(resolved).toLowerCase();
  if (!REMOTE_HTML_PREVIEW_EXTENSIONS.has(extension)) return null;
  const relativePath = path.relative(root, resolved).split(path.sep).join("/");
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `/preview/${token}/${encodedPath}`;
}

function unrealAutomationArtifactUrl(token, root, reportDirectory, rawPath) {
  const value = String(rawPath ?? "").trim();
  if (!value || value.includes("\0") || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return null;
  }
  const normalized = value.replaceAll("\\", "/");
  const candidate = normalized.startsWith("/")
    ? path.resolve(root, ...normalized.replace(/^\/+/, "").split("/"))
    : path.resolve(reportDirectory, ...normalized.split("/"));
  return remotePreviewPath(token, root, candidate);
}

function formatAutomationDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "0.000s";
  if (seconds < 60) return `${seconds.toFixed(3)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(1)}s`;
}

function renderUnrealAutomationArtifacts(test, token, root, reportDirectory) {
  const artifacts = Array.isArray(test?.artifacts) ? test.artifacts : [];
  const images = [];
  for (const artifact of artifacts) {
    const files = artifact?.files && typeof artifact.files === "object" ? artifact.files : {};
    for (const [label, rawPath] of Object.entries(files)) {
      const url = unrealAutomationArtifactUrl(token, root, reportDirectory, rawPath);
      if (!url || !REMOTE_IMAGE_EXTENSIONS.has(path.extname(String(rawPath)).toLowerCase())) continue;
      images.push(`<figure><img loading="lazy" src="${escapeRemotePreviewHtml(url)}" alt="${escapeRemotePreviewHtml(artifact?.name || label)}"><figcaption>${escapeRemotePreviewHtml(artifact?.name || label)}</figcaption></figure>`);
    }
  }
  return images.length > 0 ? `<div class="artifacts">${images.join("")}</div>` : "";
}

function renderUnrealAutomationEntries(test) {
  const entries = Array.isArray(test?.entries) ? test.entries : [];
  if (entries.length === 0) return '<p class="empty">기록된 이벤트가 없습니다.</p>';
  return `<div class="events">${entries.map((entry) => {
    const event = entry?.event && typeof entry.event === "object" ? entry.event : entry;
    const level = String(event?.type || "Info").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 32);
    const message = event?.message ?? entry?.message ?? "";
    const location = entry?.filename
      ? `${entry.filename}${entry.lineNumber ? `:${entry.lineNumber}` : ""}`
      : "";
    return `<div class="event event-${escapeRemotePreviewHtml(level)}">${location ? `<code>${escapeRemotePreviewHtml(location)}</code>` : ""}<span>${escapeRemotePreviewHtml(message)}</span></div>`;
  }).join("")}</div>`;
}

function renderUnrealAutomationReport(report, token, root, reportPath) {
  const tests = Array.isArray(report?.tests) ? report.tests : [];
  const succeeded = Number(report?.succeeded) || 0;
  const warned = Number(report?.succeededWithWarnings) || 0;
  const failed = Number(report?.failed) || 0;
  const notRun = Number(report?.notRun) || 0;
  const inProcess = Number(report?.inProcess) || 0;
  const total = succeeded + warned + failed + notRun + inProcess;
  const title = report?.title || "Automation Test Results";
  const reportDirectory = path.dirname(reportPath);
  const platforms = [...new Set((Array.isArray(report?.devices) ? report.devices : [])
    .map((device) => String(device?.platform || "").trim()).filter(Boolean))];
  const cards = tests.map((test, index) => {
    const state = String(test?.state || "NotRun");
    const stateClass = state.toLowerCase() === "success" && Number(test?.warnings) > 0
      ? "warning"
      : state.toLowerCase() === "failure" || state.toLowerCase() === "fail"
        ? "failure"
        : state.toLowerCase();
    const normalizedState = stateClass.replace(/[^a-z0-9_-]/g, "-").slice(0, 32);
    const testTitle = test?.fullTestPath || test?.testDisplayName || `Test ${index + 1}`;
    const search = `${testTitle} ${state}`.toLowerCase();
    return `<details class="test state-${escapeRemotePreviewHtml(normalizedState)}" data-search="${escapeRemotePreviewHtml(search)}">
      <summary><span>${escapeRemotePreviewHtml(testTitle)}</span><span class="test-meta">${escapeRemotePreviewHtml(state)} · ${formatAutomationDuration(test?.duration)}</span></summary>
      <div class="test-body">${renderUnrealAutomationEntries(test)}${renderUnrealAutomationArtifacts(test, token, root, reportDirectory)}</div>
    </details>`;
  }).join("");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeRemotePreviewHtml(title)}</title><style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#07111b;color:#dceaf4}*{box-sizing:border-box}body{margin:0;background:#07111b;color:#dceaf4}header{padding:28px clamp(18px,4vw,52px);background:linear-gradient(135deg,#0d2638,#0b1726);border-bottom:1px solid #24465a}h1{margin:0 0 8px;font-size:clamp(25px,4vw,42px)}.subtitle{color:#91adbe}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:22px}.metric{padding:14px 16px;border:1px solid #28475a;border-radius:12px;background:#0c1c29}.metric strong{display:block;font-size:24px;margin-bottom:3px}.metric span{font-size:12px;color:#91adbe}.success strong{color:#5ae6a1}.warning strong{color:#ffc766}.failure strong{color:#ff7f8b}.neutral strong{color:#83cdfc}main{padding:20px clamp(12px,3vw,44px) 48px;max-width:1600px;margin:auto}.toolbar{position:sticky;top:0;z-index:2;padding:10px 0;background:#07111bf2}.toolbar input{width:100%;padding:12px 14px;border:1px solid #2b4a5d;border-radius:10px;background:#0b1925;color:#e9f6ff;font:inherit}.test{margin:9px 0;border:1px solid #203b4c;border-left:4px solid #668194;border-radius:10px;background:#0a1824;overflow:hidden}.test.state-success{border-left-color:#35d893}.test.state-warning{border-left-color:#f6b94d}.test.state-failure,.test.state-fail{border-left-color:#ff6574}.test summary{cursor:pointer;padding:13px 15px;display:flex;gap:16px;justify-content:space-between;align-items:center}.test summary::marker{color:#73caff}.test-meta{flex:none;color:#88a4b5;font-size:12px}.test-body{padding:4px 16px 16px;border-top:1px solid #1c3443}.empty{color:#7894a5}.event{display:grid;gap:4px;padding:8px 0;border-bottom:1px solid #172e3c}.event code{color:#79d6ff;white-space:pre-wrap}.event-warning span{color:#ffd17c}.event-error span{color:#ff8994}.artifacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:14px}.artifacts figure{margin:0;padding:8px;border:1px solid #274354;border-radius:9px}.artifacts img{display:block;width:100%;height:auto;max-height:520px;object-fit:contain;background:#02080d}.artifacts figcaption{padding:7px 2px 2px;color:#91adbe;font-size:12px}.hidden{display:none}@media(max-width:600px){header{padding:18px 14px}.summary{grid-template-columns:repeat(2,1fr)}main{padding:10px}.test summary{align-items:flex-start;flex-direction:column;gap:5px}}
</style></head><body><header><h1>${escapeRemotePreviewHtml(title)}</h1><div class="subtitle">${escapeRemotePreviewHtml(platforms.join(" + ") || "Unreal Automation")} · ${escapeRemotePreviewHtml(report?.reportCreatedOn || "")} · ${formatAutomationDuration(report?.totalDuration)}</div><div class="summary"><div class="metric success"><strong>${succeeded}</strong><span>성공</span></div><div class="metric warning"><strong>${warned}</strong><span>경고 포함</span></div><div class="metric failure"><strong>${failed}</strong><span>실패</span></div><div class="metric neutral"><strong>${notRun + inProcess}</strong><span>미실행/진행 중</span></div><div class="metric neutral"><strong>${total}</strong><span>전체</span></div></div></header><main><div class="toolbar"><input id="filter" type="search" placeholder="테스트 이름 또는 상태 검색" autocomplete="off"></div><section id="tests">${cards || '<p class="empty">표시할 테스트가 없습니다.</p>'}</section></main><script>document.getElementById("filter").addEventListener("input",function(){const q=this.value.trim().toLowerCase();document.querySelectorAll(".test").forEach(function(node){node.classList.toggle("hidden",q&&!node.dataset.search.includes(q));});});</script></body></html>`;
}

function rewriteRemotePreviewRootUrls(source, token) {
  const prefix = `/preview/${token}/`;
  let rewritten = String(source).replace(
    /\b(src|href|poster|data|data-original|data-featherlight)\s*=\s*(["'])\/(?!\/)/gi,
    (_match, attribute, quote) => `${attribute}=${quote}${prefix}`,
  );
  rewritten = rewritten.replace(
    /url\(\s*(["']?)\/(?!\/)/gi,
    (_match, quote) => `url(${quote}${prefix}`,
  );
  return rewritten;
}

async function prepareRemoteHtmlPreview(entry, token, resolved) {
  const source = await fsPromises.readFile(resolved, "utf8");
  const unrealReport = /<title>\s*Automation Test Results\s*<\/title>/i.test(source)
    && /dustjs-linkedin|\$\.getJSON\(["']index\.json["']/i.test(source);
  if (unrealReport) {
    const jsonCandidate = path.join(path.dirname(resolved), "index.json");
    try {
      const jsonResolved = fs.realpathSync(jsonCandidate);
      if (isInsideDocumentRoot(entry.root, jsonResolved)) {
        const stats = await fsPromises.stat(jsonResolved);
        if (stats.isFile() && stats.size <= MAX_REMOTE_DOCUMENT_BYTES) {
          const jsonSource = (await fsPromises.readFile(jsonResolved, "utf8")).replace(/^\uFEFF/, "");
          const report = JSON.parse(jsonSource);
          return renderUnrealAutomationReport(report, token, entry.root, resolved);
        }
      }
    } catch {
      // Fall through to the normal isolated HTML preview when the companion
      // report is absent or malformed.
    }
  }
  return rewriteRemotePreviewRootUrls(source, token);
}

async function issueRemoteHtmlPreview(previews, snapshot, projectId, requestedPath, agentId = null) {
  const { root, resolved, stats } = await resolveRemoteProjectFile(
    snapshot,
    projectId,
    requestedPath,
    agentId,
  );
  if (![".html", ".htm"].includes(path.extname(resolved).toLowerCase())) {
    throw new RemoteDocumentError(415, "HTML 파일만 새 창에서 열 수 있습니다.");
  }
  if (stats.size > MAX_REMOTE_DOCUMENT_BYTES) {
    throw new RemoteDocumentError(413, "2MB보다 큰 HTML 문서는 Remote에서 열 수 없습니다.");
  }
  pruneRemoteHtmlPreviews(previews);
  while (previews.size >= MAX_REMOTE_HTML_PREVIEWS) {
    previews.delete(previews.keys().next().value);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const relativePath = path.relative(root, resolved).split(path.sep).join("/");
  previews.set(token, {
    root,
    expiresAt: Date.now() + REMOTE_HTML_PREVIEW_TTL_MS,
  });
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `/preview/${token}/${encodedPath}`;
}

function parseRemoteHtmlPreviewPath(pathname) {
  const match = /^\/preview\/([^/]+)\/(.+)$/.exec(pathname);
  if (!match || !REMOTE_HTML_PREVIEW_TOKEN_PATTERN.test(match[1])) return null;
  try {
    return {
      token: match[1],
      relativePath: match[2].split("/").map(decodeURIComponent).join("/"),
    };
  } catch {
    return null;
  }
}

async function sendRemoteHtmlPreview(request, response, previews, pathname) {
  const parsed = parseRemoteHtmlPreviewPath(pathname);
  if (!parsed) return false;
  pruneRemoteHtmlPreviews(previews);
  const entry = previews.get(parsed.token);
  if (!entry) {
    response.writeHead(404, { "cache-control": "no-store" }).end();
    return true;
  }
  const normalizedPath = parsed.relativePath.replaceAll("\\", "/");
  if (!normalizedPath || normalizedPath.includes("\0")) {
    response.writeHead(400, { "cache-control": "no-store" }).end();
    return true;
  }
  const candidate = path.resolve(entry.root, ...normalizedPath.split("/"));
  if (!isInsideDocumentRoot(entry.root, candidate)) {
    response.writeHead(403, { "cache-control": "no-store" }).end();
    return true;
  }
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    response.writeHead(404, { "cache-control": "no-store" }).end();
    return true;
  }
  if (!isInsideDocumentRoot(entry.root, resolved)) {
    response.writeHead(403, { "cache-control": "no-store" }).end();
    return true;
  }
  const stats = await fsPromises.stat(resolved);
  if (!stats.isFile()) {
    response.writeHead(404, { "cache-control": "no-store" }).end();
    return true;
  }
  const extension = path.extname(resolved).toLowerCase();
  const contentType = REMOTE_HTML_PREVIEW_EXTENSIONS.get(extension);
  if (!contentType) {
    response.writeHead(415, { "cache-control": "no-store" }).end();
    return true;
  }
  if (videoType(resolved)) { await sendVideo(request, response, resolved, stats, contentType); return true; }
  const limit = [".html", ".htm", ".css", ".js", ".mjs", ".json", ".map", ".txt", ".csv", ".xml"]
    .includes(extension) ? MAX_REMOTE_DOCUMENT_BYTES : MAX_REMOTE_IMAGE_BYTES;
  if (stats.size > limit) {
    response.writeHead(413, { "cache-control": "no-store" }).end();
    return true;
  }
  const html = extension === ".html" || extension === ".htm";
  const htmlBody = html ? Buffer.from(await prepareRemoteHtmlPreview(entry, parsed.token, resolved)) : null;
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": htmlBody?.length ?? stats.size,
    "access-control-allow-origin": "null",
    "cache-control": "no-store",
    "content-security-policy": html ? REMOTE_HTML_PREVIEW_CSP : "default-src 'none'; sandbox",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") response.end();
  else if (htmlBody) response.end(htmlBody);
  else await pipeline(fs.createReadStream(resolved), response);
  return true;
}

function sendRemoteDocumentError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  sendJson(response, status, { error: error?.message || "문서를 불러오지 못했습니다." });
}


const DOCUMENT_ROUTES = new Set(["/api/docs", "/api/docs/read", "/api/docs/preview", "/api/files/image", "/api/files/asset", "/api/files/video"]);

// Caller owns authentication. Capability URLs retain their separate token gate.
export async function serveRemoteDocumentApi(request, response, url, { snapshot, previews }) {
  if (!DOCUMENT_ROUTES.has(url.pathname) || (request.method !== "GET" && !(request.method === "HEAD" && url.pathname === "/api/files/video"))) return false;
  try {
    const state = snapshot();
    const args = [state, url.searchParams.get("projectId"), url.searchParams.get("path"), url.searchParams.get("agentId")];
    switch (url.pathname) {
      case "/api/docs": sendJson(response, 200, await listRemoteDocuments(state, args[1])); break;
      case "/api/docs/read": sendJson(response, 200, await readRemoteDocument(...args)); break;
      case "/api/docs/preview": {
        const location = await issueRemoteHtmlPreview(previews, ...args);
        if (url.searchParams.get("format") === "json") {
          sendJson(response, 200, { url: location, expiresInSeconds: REMOTE_HTML_PREVIEW_TTL_MS / 1000 }, { "cache-control": "no-store" });
        } else response.writeHead(302, { location, "cache-control": "no-store" }).end();
        break;
      }
      case "/api/files/video": {
        const { resolved, stats } = await resolveRemoteProjectFile(...args);
        const type = videoType(resolved);
        if (!type) throw new RemoteDocumentError(415, "Unsupported video format.");
        await sendVideo(request, response, resolved, stats, type);
        break;
      }
      case "/api/files/image": await sendRemoteImage(response, ...args); break;
      case "/api/files/asset": await sendRemotePreviewAsset(response, ...args); break;
    }
  } catch (error) {
    if (!response.headersSent) sendRemoteDocumentError(response, error);
    else response.destroy(error);
  }
  return true;
}

export { RemoteDocumentError, sendRemoteHtmlPreview };

function videoType(file) { return ({ ".mp4": "video/mp4", ".webm": "video/webm" })[path.extname(file).toLowerCase()]; }
async function sendVideo(request, response, file, stats, type) {
  const size = stats.size;
  let start = 0, end = size - 1, status = 200;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else start = -1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
      response.writeHead(416, { "content-range": `bytes */${size}`, "cache-control": "no-store" }).end(); return;
    }
    status = 206;
  }
  response.writeHead(status, { "content-type": type, "content-length": Math.max(0, end - start + 1),
    "accept-ranges": "bytes", "cache-control": "no-store", "x-content-type-options": "nosniff",
    ...(status === 206 ? { "content-range": `bytes ${start}-${end}/${size}` } : {}) });
  if (request.method === "HEAD" || !size) response.end();
  else await pipeline(fs.createReadStream(file, { start, end }), response);
}
