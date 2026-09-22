import { RemoteHosting } from './remote-hosting.mjs';
import { RemoteSubmissions } from "./remote-submissions.mjs";
import { sendJson } from "./remote-http.mjs";
import { serveRemoteDocumentApi, RemoteDocumentError, sendRemoteHtmlPreview } from "./remote-documents.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { RemoteDeviceMonitorService } from "./remote-device-monitor-service.mjs";
import { RemotePushService } from "./remote-push-service.mjs";

const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Acedia Dashboard</title><style>
body{margin:0;background:#0d1117;color:#c9d1d9;font:14px system-ui}header{padding:18px 24px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between}main{padding:18px;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}.card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px}.working{border-color:#d29922}.done{border-color:#238636}small{color:#8b949e}pre{white-space:pre-wrap;max-height:38vh;overflow:auto;background:#090c10;padding:10px;border-radius:6px}input{width:calc(100% - 80px);background:#0d1117;color:#fff;border:1px solid #30363d;padding:8px}button{padding:8px;background:#238636;color:white;border:0;border-radius:5px}</style></head>
<body><header><b id="title">Acedia</b><small id="updated">연결 중…</small></header><main id="cards"></main>
<script>
const cards=document.getElementById('cards');const esc=s=>String(s??'');
async function load(){try{const r=await fetch('/api/state');if(r.status===401){location.href='/auth/github';return}const state=await r.json();document.getElementById('title').textContent=state.title||'Acedia';document.getElementById('updated').textContent=new Date().toLocaleTimeString();const agents=state.agents||state.sessions||[];cards.replaceChildren(...agents.map(a=>{const d=document.createElement('section');d.className='card '+(a.status==='working'?'working':a.status==='done'?'done':'');const h=document.createElement('b');h.textContent=a.name||a.id;const meta=document.createElement('p');meta.textContent=[a.project||a.projectName,a.tool||a.aiToolId,a.status].filter(Boolean).join(' · ');const out=document.createElement('pre');out.textContent=a.output||a.lastOutput||'';d.append(h,meta,out);if(state.remote){const row=document.createElement('div');const input=document.createElement('input');input.placeholder='명령 또는 메시지';const btn=document.createElement('button');btn.textContent='전송';btn.onclick=async()=>{await fetch('/api/input',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:a.id,data:input.value+'\\r'})});input.value=''};row.append(input,btn);d.append(row)}return d}));}catch(e){document.getElementById('updated').textContent='연결 오류'}}
load();setInterval(load,1500);
</script></body></html>`;

const REMOTE_PWA_DIR = fileURLToPath(new URL("../remote-pwa/", import.meta.url));
const REMOTE_MOBILE_APK_URL = "/downloads/Acedia-Mobile.apk";
const LEGACY_REMOTE_MOBILE_APK_URL = "/downloads/MultiAgent-Mobile.apk";
const DEFAULT_REMOTE_MOBILE_APK_PATH = path.join(
  REMOTE_PWA_DIR,
  "downloads",
  "Acedia-Mobile.apk",
);

function remoteMobileSessionStatus(agent) {
  const hookEvent = String(agent?.hook?.event || "").trim().toLowerCase();
  const rawStatus = String(agent?.status || "").trim().toLowerCase();
  if (["exited", "unreachable", "offline"].includes(rawStatus)) return "offline";
  if (["cancelled", "canceled", "interrupted", "aborted"].includes(hookEvent)) return "idle";
  if (rawStatus === "recovering") return "recovering";
  if (rawStatus === "starting") return "starting";
  if (
    agent?.hook?.interactive_question ||
    ["waiting", "blocked", "permission-request"].includes(rawStatus) ||
    ["waiting", "blocked", "permission-request"].includes(hookEvent)
  ) return "attention";
  if (rawStatus === "working" || ["working", "tool-start", "tool-end"].includes(hookEvent)) {
    return "working";
  }
  if (hookEvent === "done" || rawStatus === "done") return "done";
  if (["running", "idle"].includes(rawStatus)) return "idle";
  return "offline";
}

function remoteMobileSessionSnapshot(agentsValue, viewValue) {
  const agents = Array.isArray(agentsValue) ? agentsValue : [];
  const view = viewValue && typeof viewValue === "object" ? viewValue : {};
  const projects = new Map(
    (Array.isArray(view.projects) ? view.projects : [])
      .filter((project) => project?.id)
      .map((project) => [String(project.id), project]),
  );
  const merged = new Map();
  for (const agent of Array.isArray(view.agents) ? view.agents : []) {
    if (agent?.id) merged.set(String(agent.id), { ...agent });
  }
  for (const agent of agents) {
    if (agent?.id) merged.set(String(agent.id), { ...(merged.get(String(agent.id)) || {}), ...agent });
  }
  return {
    generatedAt: new Date().toISOString(),
    sessions: [...merged.values()].map((agent) => {
      const id = String(agent.id || "").slice(0, 128);
      const projectId = String(agent.projectId || "").slice(0, 128);
      const status = remoteMobileSessionStatus(agent);
      return {
        id,
        name: (String(agent.name || id).trim() || id).slice(0, 120),
        projectId,
        project: (
          String(agent.project || agent.projectName || projects.get(projectId)?.name || "기타").trim() || "기타"
        ).slice(0, 120),
        tool: (String(agent.tool || agent.aiToolId || "shell").trim() || "shell").slice(0, 60),
        status,
        active: status !== "offline",
      };
    }),
  };
}
const MAX_REMOTE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_ATTACHMENT_REQUEST_BYTES = 12 * 1024 * 1024;
const REMOTE_SESSION_TOOLS = new Map([
  ["claude", { id: "claude", label: "Claude Code", supportsDangerous: true }],
  ["codex", { id: "codex", label: "Codex", supportsDangerous: true }],
  ["agy", { id: "agy", label: "Antigravity CLI", supportsDangerous: true }],
  ["qwen", { id: "qwen", label: "Qwen", supportsDangerous: true }],
  ["cline", { id: "cline", label: "Cline", supportsDangerous: false }],
  ["none", { id: "none", label: "Shell only", supportsDangerous: false }],
]);
const REMOTE_PROFILE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MOBILE_AUTH_TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MOBILE_AUTH_TICKET_TTL_MS = 2 * 60_000;
const REMOTE_ATTACHMENT_TYPES = new Map([
  ["image/png", { extension: ".png", signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) }],
  ["image/jpeg", { extension: ".jpg", signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
  ["image/gif", { extension: ".gif", signature: (buffer) => ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")) }],
  ["image/webp", { extension: ".webp", signature: (buffer) => buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" }],
  ["image/bmp", { extension: ".bmp", signature: (buffer) => buffer.subarray(0, 2).toString("ascii") === "BM" }],
]);
const REMOTE_PWA_ASSETS = new Map([
  ["/pwa/dom.js", { file: "dom.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/i18n.js", { file: "i18n.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/translations.js", { file: "translations.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/chat-markup.js", { file: "chat-markup.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/chat-render.js", { file: "chat-render.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/chat-history.js", { file: "chat-history.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/hosting.js", { file: "hosting.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/account-pool.js", { file: "account-pool.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/requests.js", { file: "requests.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/", { file: "index.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/login", { file: "login.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/pwa/styles.css", { file: "styles.css", type: "text/css; charset=utf-8", cache: "no-cache" }],
  ["/pwa/terminal-touch.js", { file: "terminal-touch.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/app.js", { file: "app.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/login.js", { file: "login.js", type: "text/javascript; charset=utf-8", cache: "no-cache" }],
  ["/pwa/xterm.js", { file: "vendor/xterm.js", type: "text/javascript; charset=utf-8", cache: "public, max-age=86400" }],
  ["/pwa/xterm.css", { file: "vendor/xterm.css", type: "text/css; charset=utf-8", cache: "public, max-age=86400" }],
  ["/manifest.webmanifest", { file: "manifest.webmanifest", type: "application/manifest+json; charset=utf-8", cache: "no-cache" }],
  ["/sw.js", { file: "sw.js", type: "text/javascript; charset=utf-8", cache: "no-cache", serviceWorker: true }],
  ["/icon.svg", { file: "icon.svg", type: "image/svg+xml; charset=utf-8", cache: "public, max-age=86400" }],
  ["/icons/icon-192.png", { file: "icon-192.png", type: "image/png", cache: "public, max-age=86400" }],
  ["/icons/icon-512.png", { file: "icon-512.png", type: "image/png", cache: "public, max-age=86400" }],
]);
const REMOTE_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self' https://github.com",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  // xterm.js applies per-cell/cursor inline styles at runtime; needed for the
  // live terminal. script-src stays strict, which is the XSS-relevant control.
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
].join("; ");

function remoteUsageHistorySelection(url) {
  const mode = String(url.searchParams.get("period") || "").trim().toLowerCase();
  const hasHistoryQuery = mode || ["year", "month", "week"]
    .some((name) => url.searchParams.has(name));
  if (!hasHistoryQuery) return { selection: null };
  if (!["week", "month", "year"].includes(mode)) {
    return { error: "period must be week, month, or year" };
  }
  const selection = { mode };
  for (const name of ["year", "month", "week"]) {
    const raw = url.searchParams.get(name);
    if (raw == null || raw === "") continue;
    if (!/^\d{1,4}$/.test(raw)) return { error: `${name} must be an integer` };
    selection[name] = Number(raw);
  }
  return { selection };
}

function sendRemoteAsset(response, pathname) {
  const asset = REMOTE_PWA_ASSETS.get(pathname);
  if (!asset) return false;
  const body = fs.readFileSync(path.join(REMOTE_PWA_DIR, asset.file));
  response.writeHead(200, {
    "content-type": asset.type,
    "content-length": body.length,
    "cache-control": asset.cache,
    "content-security-policy": REMOTE_CSP,
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...(asset.serviceWorker ? { "service-worker-allowed": "/" } : {}),
  });
  response.end(body);
  return true;
}

function remoteMobileApkInfo(apkPath) {
  try {
    const stats = fs.statSync(apkPath);
    if (!stats.isFile() || stats.size <= 0) return { available: false };
    return {
      available: true,
      downloadUrl: REMOTE_MOBILE_APK_URL,
      filename: path.basename(apkPath),
      size: stats.size,
      architecture: "arm64-v8a",
      minAndroidApi: 24,
    };
  } catch {
    return { available: false };
  }
}

function parseSingleByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || "").trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function sendRemoteMobileApk(request, response, apkPath) {
  const info = remoteMobileApkInfo(apkPath);
  if (!info.available) {
    sendJson(response, 404, { error: "Android APK is not available" });
    return;
  }
  const stats = fs.statSync(apkPath);
  const rangeHeader = String(request.headers.range || "").trim();
  const range = rangeHeader ? parseSingleByteRange(rangeHeader, stats.size) : null;
  if (rangeHeader && !range) {
    response.writeHead(416, {
      "content-range": `bytes */${stats.size}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    }).end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? stats.size - 1;
  response.writeHead(range ? 206 : 200, {
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-disposition": 'attachment; filename="Acedia-Mobile.apk"',
    "content-length": end - start + 1,
    "content-type": "application/vnd.android.package-archive",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
    ...(range ? { "content-range": `bytes ${start}-${end}/${stats.size}` } : {}),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = fs.createReadStream(apkPath, { start, end });
  stream.on("error", (error) => response.destroy(error));
  response.once("close", () => stream.destroy());
  stream.pipe(response);
}

// SSE stream of raw filtered PTY output for an xterm client. Shared by the
// Remote server and the local Dashboard so both mirror the desktop terminal.
function streamTerminalResponse(request, response, id, providers) {
  const snapshot = providers.terminalSnapshot?.(id, 0);
  if (!snapshot) {
    sendJson(response, 404, { error: "session is not active" });
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    "x-content-type-options": "nosniff",
  });
  const send = (event, payload) => {
    if (response.writableEnded) return;
    if (event) response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  let closed = false;
  let unsubscribe = null;
  let heartbeat = null;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    try { unsubscribe?.(); } catch { /* already gone */ }
    if (!response.writableEnded) response.end();
  };
  const size = providers.terminalSize?.(id) || null;
  send("reset", { data: snapshot.data, cols: size?.cols || null, rows: size?.rows || null });
  unsubscribe = providers.subscribeTerminal?.(id, {
    onData: (segment) => send(null, { data: segment.data }),
    onExit: (info) => { send("exit", { code: info?.exitCode ?? null }); cleanup(); },
  });
  if (!unsubscribe) {
    send("exit", { code: null });
    cleanup();
    return;
  }
  heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(": ping\n\n");
  }, 15_000);
  request.on("close", cleanup);
  request.on("error", cleanup);
}

const REMOTE_BROWSER_ACTIONS = new Set([
  "open",
  "navigate",
  "activate",
  "back",
  "forward",
  "reload",
  "pointer",
  "wheel",
  "key",
  "text",
]);

function remoteBrowserIdentifier(value, label) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new RemoteDocumentError(400, `${label} is invalid`);
  }
  return id;
}

function sendRemoteBrowserFrame(response, result) {
  if (!result?.ok || !Buffer.isBuffer(result.data)) {
    sendJson(response, result?.httpStatus || 502, {
      error: result?.error || "browser frame unavailable",
    });
    return;
  }
  response.writeHead(200, {
    "content-type": result.contentType || "image/jpeg",
    "content-length": result.data.length,
    "cache-control": "private, no-store, no-cache, must-revalidate",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-browser-frame-width": String(result.width || 0),
    "x-browser-frame-height": String(result.height || 0),
    "x-browser-source-width": String(result.sourceWidth || result.width || 0),
    "x-browser-source-height": String(result.sourceHeight || result.height || 0),
  });
  response.end(result.data);
}

async function serveRemoteBrowserApi(request, response, url, {
  browserProvider,
  mutationAllowed,
}) {
  if (request.method === "GET" && url.pathname === "/api/browser/tabs") {
    try {
      const agentId = remoteBrowserIdentifier(url.searchParams.get("agentId"), "agent id");
      const result = await browserProvider?.({ agentId, action: "status", body: {} });
      sendJson(response, result?.ok === false ? result.httpStatus || 502 : 200, result ?? {
        ok: false,
        error: "browser integration unavailable",
      });
    } catch (error) {
      sendJson(response, error?.status || 500, { error: error?.message || "browser status unavailable" });
    }
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/browser/frame") {
    try {
      const agentId = remoteBrowserIdentifier(url.searchParams.get("agentId"), "agent id");
      const tabId = remoteBrowserIdentifier(url.searchParams.get("tabId"), "tab id");
      const result = await browserProvider?.({
        agentId,
        action: "frame",
        body: {
          tabId,
          quality: url.searchParams.get("quality"),
          maxWidth: url.searchParams.get("maxWidth"),
          maxHeight: url.searchParams.get("maxHeight"),
        },
      });
      sendRemoteBrowserFrame(response, result ?? {
        ok: false,
        httpStatus: 501,
        error: "browser integration unavailable",
      });
    } catch (error) {
      sendJson(response, error?.status || 500, { error: error?.message || "browser frame unavailable" });
    }
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/browser/action") {
    if (!mutationAllowed()) {
      sendJson(response, 403, { error: "cross-origin request blocked" });
      return true;
    }
    if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      sendJson(response, 415, { error: "application/json required" });
      return true;
    }
    try {
      const body = await readJson(request);
      const agentId = remoteBrowserIdentifier(body.agentId, "agent id");
      const action = String(body.action || "").trim().toLowerCase();
      if (!REMOTE_BROWSER_ACTIONS.has(action)) {
        throw new RemoteDocumentError(400, "browser action is invalid");
      }
      const payload = { ...body };
      delete payload.agentId;
      delete payload.action;
      if (action !== "open" && payload.tabId) {
        payload.tabId = remoteBrowserIdentifier(payload.tabId, "tab id");
      }
      const result = await browserProvider?.({ agentId, action, body: payload });
      const { data: _privateFrame, ...safeResult } = result ?? {
        ok: false,
        httpStatus: 501,
        error: "browser integration unavailable",
      };
      sendJson(response, safeResult.ok === false ? safeResult.httpStatus || 502 : 200, safeResult);
    } catch (error) {
      sendJson(response, error?.status || 500, { error: error?.message || "browser action failed" });
    }
    return true;
  }
  return false;
}

async function serveUsageProfileVisibility(request, response, url, provider, allowed) {
  if (request.method !== "POST" || url.pathname !== "/api/usage/profile-visibility") return false;
  if (!allowed()) { sendJson(response, 403, { error: "cross-origin request blocked" }); return true; }
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) { sendJson(response, 415, { error: "application/json required" }); return true; }
  try {
    const body = await readJson(request, 2048);
    if (typeof body.profileKey !== "string" || !/^(codex|claude):(default|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/.test(body.profileKey) || typeof body.hidden !== "boolean") throw new TypeError("Invalid usage profile visibility");
    if (!provider) { sendJson(response, 503, { error: "Usage profile settings unavailable" }); return true; }
    sendJson(response, 200, await provider(body.profileKey, body.hidden));
  } catch (error) { sendJson(response, error instanceof TypeError ? 400 : 500, { error: error?.message || "Could not save usage profile visibility" }); }
  return true;
}

async function readJson(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function remoteSessionCatalog(snapshot) {
  const view = snapshot?.view && typeof snapshot.view === "object" ? snapshot.view : snapshot;
  const projects = Array.isArray(view?.projects) ? view.projects : [];
  const configuredTools = Array.isArray(view?.availableTools) ? view.availableTools : null;
  const tools = configuredTools == null
    ? [...REMOTE_SESSION_TOOLS.values()]
    : configuredTools.flatMap((candidate) => {
        const known = REMOTE_SESSION_TOOLS.get(String(candidate?.id || "").trim());
        if (!known) return [];
        return [{
          ...known,
          label: String(candidate?.label || known.label).trim().slice(0, 40) || known.label,
          supportsDangerous: known.supportsDangerous && Boolean(candidate?.supportsDangerous),
        }];
      });
  const agents = [
    ...(Array.isArray(view?.agents) ? view.agents : []),
    ...(Array.isArray(snapshot?.agents) ? snapshot.agents : []),
  ];
  return { projects, tools, agents };
}

function remoteSessionName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    const error = new Error("session name must be 1-80 characters on one line");
    error.statusCode = 400;
    throw error;
  }
  return name;
}

function remoteCreateSessionPayload(snapshot, body) {
  const catalog = remoteSessionCatalog(snapshot);
  const projectId = String(body?.projectId || "").trim();
  const aiToolId = String(body?.aiToolId || "").trim();
  if (!catalog.projects.some((project) => String(project?.id || "") === projectId)) {
    const error = new Error("project not found");
    error.statusCode = 404;
    throw error;
  }
  const tool = catalog.tools.find((candidate) => candidate.id === aiToolId);
  if (!tool) {
    const error = new Error("AI tool is not available");
    error.statusCode = 400;
    throw error;
  }
  return {
    projectId,
    name: remoteSessionName(body?.name),
    aiToolId,
    dangerous: tool.supportsDangerous && body?.dangerous === true,
  };
}

function remoteRenameSessionPayload(snapshot, body) {
  const id = String(body?.id || "").trim();
  const catalog = remoteSessionCatalog(snapshot);
  if (!id || !catalog.agents.some((agent) => String(agent?.id || "") === id)) {
    const error = new Error("session not found");
    error.statusCode = 404;
    throw error;
  }
  return { id, name: remoteSessionName(body?.name) };
}

async function saveRemoteAttachment(request, baseDir) {
  let body;
  try {
    body = await readJson(request, MAX_REMOTE_ATTACHMENT_REQUEST_BYTES);
  } catch (error) {
    if (error?.message === "request too large") {
      throw new RemoteDocumentError(413, "이미지는 8MB 이하여야 합니다.");
    }
    throw new RemoteDocumentError(400, "올바른 이미지 요청이 아닙니다.");
  }
  const id = String(body.id || "").trim();
  const declaredType = String(body.type || "").trim().toLowerCase();
  const match = String(body.data || "").match(/^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i);
  const mime = String(match?.[1] || "").toLowerCase();
  const encoded = match?.[2] || "";
  const imageType = REMOTE_ATTACHMENT_TYPES.get(mime);
  if (!id || !imageType || declaredType !== mime || encoded.length % 4 !== 0) {
    throw new RemoteDocumentError(415, "PNG, JPEG, GIF, WebP, BMP 이미지만 첨부할 수 있습니다.");
  }
  const content = Buffer.from(encoded, "base64");
  if (!content.length || content.length > MAX_REMOTE_ATTACHMENT_BYTES) {
    throw new RemoteDocumentError(413, "이미지는 8MB 이하여야 합니다.");
  }
  if (!imageType.signature(content)) {
    throw new RemoteDocumentError(415, "파일 내용이 선택한 이미지 형식과 일치하지 않습니다.");
  }
  const directory = path.join(baseDir, "remote-attachments");
  await fsPromises.mkdir(directory, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomUUID()}${imageType.extension}`;
  const storedPath = path.join(directory, storedName);
  await fsPromises.writeFile(storedPath, content, { flag: "wx" });
  return {
    path: storedPath,
    name: path.basename(String(body.name || "").trim()).slice(0, 160) || storedName,
    type: mime,
    size: content.length,
  };
}

function sendRemoteAttachmentError(response, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  sendJson(response, status, { error: error?.message || "이미지를 첨부하지 못했습니다." });
}

async function respondToSessionRestart(response, restartSession, id) {
  if (typeof restartSession !== "function") {
    sendJson(response, 501, { error: "session activation unavailable" });
    return;
  }
  try {
    const result = await restartSession(id);
    if (result === false || result === null) {
      sendJson(response, 409, { error: "session could not be activated" });
      return;
    }
    sendJson(response, 200, {
      ok: true,
      ...(result && typeof result === "object" ? result : {}),
    });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    sendJson(response, status, {
      error: error?.message || "session could not be activated",
    });
  }
}

async function listen(server, desiredPort, host = "127.0.0.1") {
  const candidates = desiredPort > 0
    ? Array.from({ length: 50 }, (_, index) => desiredPort + index)
    : [0];
  for (const port of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("사용 가능한 포트를 찾을 수 없습니다.");
}

export class LocalDashboardService {
  constructor({ title, defaultPort, baseDir, configName, stateProvider, providers = null }) {
    this.title = title;
    this.defaultPort = defaultPort;
    this.baseDir = baseDir;
    this.hosting = new RemoteHosting(baseDir);
    this.configPath = path.join(baseDir, configName);
    this.submissions = new RemoteSubmissions(path.join(baseDir, `${configName}.submissions.json`));
    this.stateProvider = stateProvider;
    // When provided, the dashboard serves the full Remote PWA (chat/terminal/
    // input) on loopback instead of the minimal card grid.
    this.providers = providers;
    this.state = {};
    this.server = null;
    this.port = null;
    this.htmlPreviews = new Map();
    this.usageRefreshAt = 0;
    this.config = { enabled: false, serverPort: defaultPort };
    this.loadConfig();
  }

  isLocalOrigin(request) {
    if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") {
      return false;
    }
    const origin = String(request.headers.origin || "").trim().toLowerCase();
    if (!origin) return true;
    const forwardedHost = String(
      request.headers["x-forwarded-host"] || request.headers.host || ""
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!forwardedHost) return false;
    return new Set([
      `http://${forwardedHost}`,
      `https://${forwardedHost}`,
    ]).has(origin);
  }

  loadConfig() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      this.config = {
        enabled: Boolean(stored.enabled),
        serverPort: Number(stored.serverPort ?? stored.server_port) || this.defaultPort,
      };
    } catch {}
  }

  async setConfig(config) {
    this.config = {
      enabled: Boolean(config.enabled),
      serverPort: Number(config.serverPort ?? config.server_port) || this.defaultPort,
    };
    await fsPromises.mkdir(this.baseDir, { recursive: true });
    await fsPromises.writeFile(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
    return this.config;
  }

  sync(state) {
    this.state = state && typeof state === "object" ? state : {};
  }

  snapshot() {
    const dynamic = this.stateProvider?.() ?? {};
    return { title: this.title, ...this.state, ...dynamic };
  }

  status() {
    return {
      running: Boolean(this.server?.listening),
      url: this.port ? `http://127.0.0.1:${this.port}` : null,
      port: this.port,
    };
  }

  async start() {
    if (this.server?.listening) return this.status();
    const p = this.providers;
    this.server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (await this.hosting.preview(request, response, url)) return;
        if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/preview/")) {
          if (await sendRemoteHtmlPreview(request, response, this.htmlPreviews, url.pathname)) return;
        }
        if (request.method === "GET" && url.pathname === "/api/state") {
          sendJson(response, 200, this.snapshot());
          return;
        }
        if (p) {
          if (await p.accountPoolApi?.(request, response, url, { readJson, allowed: () => this.isLocalOrigin(request), admin: true })) return;
          if (await this.hosting.api(request, response, url, { readJson, allowed: () => this.isLocalOrigin(request) })) return;
          if (await serveUsageProfileVisibility(request, response, url, p.usageProfileVisibility, () => this.isLocalOrigin(request))) return;
          // Full Remote PWA on loopback (no login needed locally).
          if (await serveRemoteBrowserApi(request, response, url, {
            browserProvider: p.browserProvider,
            mutationAllowed: () => this.isLocalOrigin(request),
          })) return;
          if (request.method === "GET" && url.pathname === "/api/usage") {
            const historyRequest = remoteUsageHistorySelection(url);
            if (historyRequest.error) {
              sendJson(response, 400, { error: historyRequest.error });
              return;
            }
            const refreshRequested = url.searchParams.get("refresh") === "1";
            const refresh = refreshRequested && Date.now() - this.usageRefreshAt >= 30_000;
            if (refresh) this.usageRefreshAt = Date.now();
            try {
              const usage = await p.usageProvider?.(refresh, historyRequest.selection);
              sendJson(response, 200, usage ?? { updatedAt: 0, limits: [], tokens: {} });
            } catch (error) {
              sendJson(response, error instanceof RangeError ? 400 : 500, {
                error: error?.message || "usage unavailable",
                updatedAt: 0,
                limits: [],
                tokens: {},
              });
            }
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/input") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            const data = String(body.data || "");
            if (!id || !data || data.length > 8 * 1024) { sendJson(response, 400, { error: "invalid input" }); return; }
            if (p.writePty?.(id, data) === false) {
              sendJson(response, 409, { error: "session is not active" });
              return;
            }
            sendJson(response, 200, { ok: true });
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/submit") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
              sendJson(response, 415, { error: "application/json required" });
              return;
            }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            const message = String(body.message || "");
            if (!id || !message.trim() || message.length > 8 * 1024) {
              sendJson(response, 400, { error: "invalid message" });
              return;
            }
            if (typeof p.submitPty !== "function") {
              sendJson(response, 501, { error: "message submission unavailable" });
              return;
            }
            const submission = await this.submissions.submit(body.requestId, id, message, () => p.submitPty(id, message));
            sendJson(response, submission.status, submission.body);
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/attachment") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
              sendJson(response, 415, { error: "application/json required" });
              return;
            }
            try {
              sendJson(response, 201, await saveRemoteAttachment(request, this.baseDir));
            } catch (error) {
              sendRemoteAttachmentError(response, error);
            }
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/restart") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            if (!id) { sendJson(response, 400, { error: "invalid session id" }); return; }
            await respondToSessionRestart(response, p.restartSession, id);
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/cancel") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            const body = await readJson(request);
            const id = String(body.id || "").trim();
            if (!id) { sendJson(response, 400, { error: "invalid session id" }); return; }
            if (p.cancelSession?.(id) === false) {
              sendJson(response, 409, { error: "session is not active" });
              return;
            }
            sendJson(response, 200, { ok: true, status: "idle" });
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/create") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
              sendJson(response, 415, { error: "application/json required" });
              return;
            }
            try {
              const payload = remoteCreateSessionPayload(this.snapshot(), await readJson(request));
              const result = await p.createSession?.(payload);
              if (!result) { sendJson(response, 501, { error: "session creation unavailable" }); return; }
              sendJson(response, 201, { ok: true, ...result });
            } catch (error) {
              sendJson(response, error?.statusCode || 400, { error: error?.message || "invalid session" });
            }
            return;
          }
          if (request.method === "POST" && url.pathname === "/api/session/rename") {
            if (!this.isLocalOrigin(request)) { sendJson(response, 403, { error: "blocked" }); return; }
            if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
              sendJson(response, 415, { error: "application/json required" });
              return;
            }
            try {
              const payload = remoteRenameSessionPayload(this.snapshot(), await readJson(request));
              if (p.renameSession?.(payload) === false) {
                sendJson(response, 409, { error: "session rename unavailable" });
                return;
              }
              sendJson(response, 202, { ok: true, id: payload.id, name: payload.name });
            } catch (error) {
              sendJson(response, error?.statusCode || 400, { error: error?.message || "invalid session" });
            }
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/chat") {
            const id = String(url.searchParams.get("id") || "").trim();
            const beforeSequence = Number(url.searchParams.get("before"));
            const requestedLimit = Number(url.searchParams.get("limit"));
            const options = {
              beforeSequence: Number.isSafeInteger(beforeSequence) && beforeSequence > 0 ? beforeSequence : null,
              limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0
                ? Math.min(400, requestedLimit)
                : 400,
            };
            try {
              sendJson(response, 200, (await p.chatProvider?.(id, options)) ?? { blocks: [], missing: true });
            } catch (error) {
              sendJson(response, 500, { error: error.message, blocks: [] });
            }
            return;
          }
          if (request.method === "GET" && url.pathname === "/api/stream") {
            streamTerminalResponse(request, response, String(url.searchParams.get("id") || "").trim(), p);
            return;
          }
          if (await serveRemoteDocumentApi(request, response, url, {
            snapshot: () => this.snapshot(), previews: this.htmlPreviews,
          })) return;
          // The PWA shell + assets (index at "/", app.js, xterm, styles, sw…).
          if (request.method === "GET" && sendRemoteAsset(response, url.pathname)) return;
        }
        if (request.method === "GET" && url.pathname === "/") {
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
            "cache-control": "no-store",
          });
          response.end(DASHBOARD_HTML);
          return;
        }
        response.writeHead(404).end();
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    this.port = await listen(this.server, this.config.serverPort);
    return this.status();
  }

  async stop() {
    const server = this.server;
    this.server = null;
    this.port = null;
    this.htmlPreviews.clear();
    this.hosting.tickets.clear();
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    return this.status();
  }
}

export class RemoteDashboardService {
  constructor({ baseDir, stateProvider, writePty, submitPty, requestAccess, fetchImpl = fetch, terminalSnapshot, subscribeTerminal, terminalSize, chatProvider, restartSession, cancelSession, createSession, renameSession, usageProvider, usageProfileVisibility, browserProvider, accountPoolApi, mobileApkPath = DEFAULT_REMOTE_MOBILE_APK_PATH, pushService = null, deviceMonitorService = null }) {
    this.accountPoolApi = accountPoolApi;
    this.baseDir = baseDir;
    this.hosting = new RemoteHosting(baseDir);
    this.configPath = path.join(baseDir, "remote-config.json");
    this.accessPath = path.join(baseDir, "remote-access.json");
    this.submissions = new RemoteSubmissions(path.join(baseDir, "remote-submissions.json"));
    this.stateProvider = stateProvider;
    this.writePty = writePty;
    this.submitPty = submitPty ?? (() => false);
    this.requestAccess = requestAccess;
    this.fetchImpl = fetchImpl;
    this.terminalSnapshot = terminalSnapshot ?? (() => null);
    this.subscribeTerminal = subscribeTerminal ?? (() => null);
    this.terminalSize = terminalSize ?? (() => null);
    this.chatProvider = chatProvider ?? (() => null);
    this.restartSession = restartSession ?? (() => false);
    this.cancelSession = cancelSession ?? (() => false);
    this.createSession = createSession ?? (() => null);
    this.renameSession = renameSession ?? (() => false);
    this.usageProvider = usageProvider ?? (() => ({ updatedAt: 0, limits: [], tokens: {} }));
    this.usageProfileVisibility = usageProfileVisibility;
    this.browserProvider = browserProvider ?? (() => null);
    this.usageRefreshAt = 0;
    this.mobileApkPath = mobileApkPath;
    this.pushService = pushService ?? new RemotePushService({ baseDir });
    this.deviceMonitorService = deviceMonitorService ?? new RemoteDeviceMonitorService({ baseDir });
    this.server = null;
    this.port = null;
    this.agents = [];
    this.view = {};
    this.states = new Map();
    this.mobileAuthTickets = new Map();
    this.htmlPreviews = new Map();
    this.secret = crypto.randomBytes(32);
    this.config = { client_id: "", owner: "", tunnel_token: "", public_hostname: "", server_port: 18800, client_secret: "" };
    this.access = { pending: [], approved: [] };
    this.load();
  }

  load() {
    try { this.config = { ...this.config, ...JSON.parse(fs.readFileSync(this.configPath, "utf8")) }; } catch {}
    try { this.access = { ...this.access, ...JSON.parse(fs.readFileSync(this.accessPath, "utf8")) }; } catch {}
  }

  async save(file, value) {
    await fsPromises.mkdir(this.baseDir, { recursive: true });
    await fsPromises.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  }

  async setConfig(config) {
    const previousOwner = String(this.config.owner || "").trim();
    this.config = { ...this.config, ...config };
    await this.save(this.configPath, this.config);
    const nextOwner = String(this.config.owner || "").trim();
    if (
      previousOwner &&
      previousOwner.toLowerCase() !== nextOwner.toLowerCase() &&
      !this.access.approved.some((value) => value.toLowerCase() === previousOwner.toLowerCase())
    ) {
      this.pushService.removeLogin(previousOwner);
      this.deviceMonitorService.removeLogin(previousOwner);
    }
    return this.config;
  }

  syncAgents(agents) { this.agents = Array.isArray(agents) ? agents : []; }
  syncView(view) {
    try { this.view = typeof view === "string" ? JSON.parse(view) : view; } catch { this.view = {}; }
  }

  mobileSessionSnapshot() {
    const runtime = this.stateProvider?.() ?? {};
    return remoteMobileSessionSnapshot(
      Array.isArray(runtime.agents) ? runtime.agents : this.agents,
      runtime.view && typeof runtime.view === "object" ? runtime.view : this.view,
    );
  }

  accessList() { return { pending: [...this.access.pending], approved: [...this.access.approved] }; }
  async approve(login) {
    this.access.pending = this.access.pending.filter((value) => value.toLowerCase() !== login.toLowerCase());
    if (!this.access.approved.some((value) => value.toLowerCase() === login.toLowerCase())) this.access.approved.push(login);
    await this.save(this.accessPath, this.access);
    return this.accessList();
  }
  async revoke(login) {
    this.access.pending = this.access.pending.filter((value) => value.toLowerCase() !== login.toLowerCase());
    this.access.approved = this.access.approved.filter((value) => value.toLowerCase() !== login.toLowerCase());
    await this.save(this.accessPath, this.access);
    this.pushService.removeLogin(login);
    this.deviceMonitorService.removeLogin(login);
    return this.accessList();
  }

  notifyAgentDone(payload) {
    if (payload?.event !== "done" || !payload?.id) return Promise.resolve(null);
    return this.notifyAgentEvent(payload, "done");
  }

  notifyAgentQuestion(payload) {
    if (payload?.event !== "waiting" || !payload?.id) return Promise.resolve(null);
    if (!payload?.interactive_question && payload?.tool_name !== "AskUserQuestion") {
      return Promise.resolve(null);
    }
    return this.notifyAgentEvent(payload, "question");
  }

  notifyAgentEvent(payload, kind) {
    const agent = this.agents.find((entry) => entry.id === payload.id) ?? null;
    const viewAgent = Array.isArray(this.view?.agents)
      ? this.view.agents.find((entry) => entry.id === payload.id)
      : null;
    const project = Array.isArray(this.view?.projects)
      ? this.view.projects.find((entry) => entry.id === viewAgent?.projectId)
      : null;
    const projectName = String(
      agent?.project || agent?.projectName || project?.name || "Acedia",
    ).trim();
    const agentName = String(agent?.name || payload.id).trim();
    const notification = {
      agentId: payload.id,
      sessionId: payload.session_id,
      title: `${projectName} / ${agentName}`,
    };
    this.deviceMonitorService.publish({
      type: kind === "question" ? "agent-question" : "agent-done",
      ...notification,
    });
    return kind === "question"
      ? this.pushService.notifyQuestion(notification)
      : this.pushService.notifyDone(notification);
  }

  sign(login) {
    const payload = Buffer.from(login, "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  sessionLogin(request) {
    const match = String(request.headers.cookie || "").match(/(?:^|;\s*)multiagent_remote=([^;]+)/);
    if (!match) return null;
    const [payload, signature] = match[1].split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    return Buffer.from(payload, "base64url").toString("utf8");
  }

  isApproved(login) {
    if (!login) return false;
    return login.toLowerCase() === String(this.config.owner).toLowerCase() ||
      this.access.approved.some((value) => value.toLowerCase() === login.toLowerCase());
  }

  isDirectLocal(request) {
    return !request.headers["cf-connecting-ip"] && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress);
  }

  isSameOrigin(request) {
    if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
    const origin = String(request.headers.origin || "").trim().toLowerCase();
    if (!origin) return this.isDirectLocal(request);
    const forwardedHost = String(request.headers["x-forwarded-host"] || request.headers.host || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (!forwardedHost) return false;
    const allowed = new Set([`http://${forwardedHost}`, `https://${forwardedHost}`]);
    const publicHostname = String(this.config.public_hostname || "").trim().toLowerCase();
    if (publicHostname) allowed.add(`https://${publicHostname}`);
    return allowed.has(origin);
  }

  cookieFor(login, request, maxAge = 604800) {
    const secure = this.config.public_hostname || request.headers["x-forwarded-proto"] === "https";
    const value = login ? this.sign(login) : "";
    return `multiagent_remote=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  }

  githubOAuthRedirectUri() {
    const publicHostname = String(this.config.public_hostname || "").trim();
    if (!publicHostname) return "";
    try {
      const publicUrl = new URL(`https://${publicHostname}`);
      if (
        publicUrl.protocol !== "https:" ||
        publicUrl.username ||
        publicUrl.password ||
        publicUrl.pathname !== "/" ||
        publicUrl.search ||
        publicUrl.hash
      ) {
        return "";
      }
      return new URL("/auth/github/callback", publicUrl).href;
    } catch {
      return "";
    }
  }

  async registerLogin(login) {
    if (!this.isApproved(login) && !this.access.pending.some((value) => value.toLowerCase() === login.toLowerCase())) {
      this.access.pending.push(login);
      await this.save(this.accessPath, this.access);
      this.requestAccess?.(login);
    }
  }

  async githubLoginFromToken(token) {
    const userResponse = await this.fetchImpl("https://api.github.com/user", {
      headers: { authorization: `Bearer ${token}`, "user-agent": "Acedia" },
      signal: AbortSignal.timeout(15_000),
    });
    const login = String((await userResponse.json()).login || "");
    if (!userResponse.ok || !login) throw new Error("github user failed");
    await this.registerLogin(login);
    return login;
  }

  status() {
    return { running: Boolean(this.server?.listening), url: this.port ? `http://127.0.0.1:${this.port}` : null, port: this.port };
  }

  async handleOAuth(request, response, url) {
    if (request.method === "GET" && url.pathname === "/auth/mobile/complete") {
      const ticket = String(url.searchParams.get("ticket") || "").trim();
      const entry = MOBILE_AUTH_TICKET_PATTERN.test(ticket)
        ? this.mobileAuthTickets.get(ticket)
        : null;
      if (ticket) this.mobileAuthTickets.delete(ticket);
      if (!entry || entry.expiresAt < Date.now()) {
        response.writeHead(400, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        }).end("mobile auth ticket invalid or expired");
        return true;
      }
      response.writeHead(302, {
        location: "/",
        "set-cookie": this.cookieFor(entry.login, request),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      }).end();
      return true;
    }
    if (url.pathname === "/auth/github") {
      if (!this.config.client_id || !this.config.client_secret) {
        response.writeHead(503, { "content-type": "text/plain; charset=utf-8" }).end("Settings에서 GitHub OAuth 설정이 필요합니다.");
        return true;
      }
      const mobileProfileId = url.searchParams.get("source") === "mobile-app"
        ? String(url.searchParams.get("profile") || "").trim()
        : "";
      if (url.searchParams.get("source") === "mobile-app" && !REMOTE_PROFILE_ID_PATTERN.test(mobileProfileId)) {
        response.writeHead(400, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        }).end("valid mobile profile required");
        return true;
      }
      const now = Date.now();
      for (const [key, value] of this.states) {
        const expiresAt = typeof value === "number" ? value : value?.expiresAt;
        if (!expiresAt || expiresAt < now) this.states.delete(key);
      }
      for (const [key, value] of this.mobileAuthTickets) {
        if (!value?.expiresAt || value.expiresAt < now) this.mobileAuthTickets.delete(key);
      }
      const redirectUri = this.githubOAuthRedirectUri();
      if (!redirectUri) {
        response.writeHead(503, { "content-type": "text/plain; charset=utf-8" })
          .end("Settings에서 올바른 Remote 공개 호스트네임을 설정해 주세요.");
        return true;
      }
      const state = crypto.randomBytes(18).toString("hex");
      this.states.set(state, {
        expiresAt: now + 10 * 60_000,
        mobileProfileId: mobileProfileId || null,
        redirectUri,
      });
      const redirect = new URL("https://github.com/login/oauth/authorize");
      redirect.searchParams.set("client_id", this.config.client_id);
      redirect.searchParams.set("state", state);
      redirect.searchParams.set("redirect_uri", redirectUri);
      response.writeHead(302, { location: redirect.href }).end();
      return true;
    }
    // Keep accepting the legacy shorter path for callbacks issued before the
    // canonical /auth/github/callback route was configured.
    if (
      url.pathname !== "/auth/github/callback" &&
      url.pathname !== "/auth/callback"
    ) {
      return false;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const stateEntry = state ? this.states.get(state) : null;
    const expiresAt = typeof stateEntry === "number" ? stateEntry : stateEntry?.expiresAt;
    if (!code || !state || !expiresAt || expiresAt < Date.now()) {
      response.writeHead(400).end("invalid oauth state");
      return true;
    }
    this.states.delete(state);
    const redirectUri = typeof stateEntry === "object"
      ? String(stateEntry?.redirectUri || "")
      : "";
    const tokenRequest = {
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
      code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    };
    const tokenResponse = await this.fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(tokenRequest),
      signal: AbortSignal.timeout(15_000),
    });
    const token = (await tokenResponse.json()).access_token;
    if (!token) { response.writeHead(401).end("github login failed"); return true; }
    const login = await this.githubLoginFromToken(token).catch(() => "");
    if (!login) { response.writeHead(401).end("github user failed"); return true; }
    const mobileProfileId = typeof stateEntry === "object" ? stateEntry?.mobileProfileId : null;
    if (mobileProfileId) {
      const ticket = crypto.randomBytes(32).toString("base64url");
      this.mobileAuthTickets.set(ticket, {
        login,
        expiresAt: Date.now() + MOBILE_AUTH_TICKET_TTL_MS,
      });
      const deepLink = new URL("multiagent://auth/complete");
      deepLink.searchParams.set("profile", mobileProfileId);
      deepLink.searchParams.set("ticket", ticket);
      response.writeHead(302, {
        location: deepLink.href,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      }).end();
      return true;
    }
    response.writeHead(302, {
      location: "/",
      "set-cookie": this.cookieFor(login, request),
    }).end();
    return true;
  }

  async handleDeviceAuth(request, response, url) {
    if (request.method === "GET" && url.pathname === "/auth/mode") {
      sendJson(response, 200, {
        configured: Boolean(this.config.client_id),
        web: Boolean(this.config.client_id && this.config.client_secret && this.config.public_hostname),
        language: this.view?.language || "en",
      });
      return true;
    }
    if (request.method !== "POST" || !["/auth/start", "/auth/poll"].includes(url.pathname)) return false;
    if (!this.isSameOrigin(request)) {
      sendJson(response, 403, { error: "cross-origin request blocked" });
      return true;
    }
    if (!this.config.client_id) {
      sendJson(response, 503, { error: "GitHub Client ID가 설정되지 않았습니다." });
      return true;
    }
    if (url.pathname === "/auth/start") {
      const githubResponse = await this.fetchImpl("https://github.com/login/device/code", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "Acedia" },
        body: new URLSearchParams({ client_id: this.config.client_id, scope: "read:user" }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await githubResponse.json();
      sendJson(response, githubResponse.ok ? 200 : 502, result);
      return true;
    }
    const body = await readJson(request);
    const deviceCode = String(body.device_code || "").trim();
    if (!deviceCode) {
      sendJson(response, 400, { error: "device_code required" });
      return true;
    }
    const tokenResponse = await this.fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": "Acedia" },
      body: new URLSearchParams({
        client_id: this.config.client_id,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tokenResult = await tokenResponse.json();
    if (["authorization_pending", "slow_down"].includes(tokenResult.error)) {
      sendJson(response, 200, {
        pending: true,
        slow_down: tokenResult.error === "slow_down",
        interval: Number(tokenResult.interval) || undefined,
      });
      return true;
    }
    if (!tokenResponse.ok || tokenResult.error || !tokenResult.access_token) {
      sendJson(response, 401, { error: tokenResult.error_description || tokenResult.error || "github login failed" });
      return true;
    }
    const login = await this.githubLoginFromToken(tokenResult.access_token);
    sendJson(response, 200, { login, approved: this.isApproved(login) }, {
      "set-cookie": this.cookieFor(login, request),
    });
    return true;
  }

  // Server-Sent Events stream of raw filtered PTY output for the Remote xterm
  // view. First message resets the client terminal and replays the buffer;
  // subsequent messages are live deltas. Input flows back over POST /api/input.
  streamTerminal(request, response, id) {
    streamTerminalResponse(request, response, id, {
      terminalSnapshot: this.terminalSnapshot,
      subscribeTerminal: this.subscribeTerminal,
      terminalSize: this.terminalSize,
    });
  }

  async start() {
    if (this.server?.listening) return this.status();
    this.server = http.createServer(async (request, response) => {
      try {
        const url = new URL(request.url || "/", "http://127.0.0.1");
        if (await this.hosting.preview(request, response, url)) return;
        if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/preview/")) {
          if (await sendRemoteHtmlPreview(request, response, this.htmlPreviews, url.pathname)) return;
        }
        if (await this.handleOAuth(request, response, url)) return;
        if (await this.handleDeviceAuth(request, response, url)) return;
        if (request.method === "POST" && url.pathname === "/auth/logout") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          response.writeHead(204, {
            "set-cookie": this.cookieFor("", request, 0),
            "cache-control": "no-store",
          }).end();
          return;
        }
        const publicAsset = request.method === "GET" && [
          "/login",
          "/pwa/styles.css",
          "/pwa/login.js",
          "/pwa/i18n.js",
          "/pwa/translations.js",
          "/icon.svg",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
        ].includes(url.pathname);
        if (publicAsset && sendRemoteAsset(response, url.pathname)) return;
        if (
          ["GET", "DELETE"].includes(request.method) &&
          url.pathname === "/api/monitor/device"
        ) {
          const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
          const token = match?.[1] || "";
          if (request.method === "DELETE") {
            const result = this.deviceMonitorService.revoke(token);
            sendJson(response, result.revoked ? 200 : 401, result, { "cache-control": "no-store" });
            return;
          }
          const controller = new AbortController();
          response.once("close", () => controller.abort());
          try {
            const result = await this.deviceMonitorService.poll(
              token,
              url.searchParams.get("cursor"),
              controller.signal,
            );
            if (!response.destroyed) sendJson(response, 200, result, { "cache-control": "no-store" });
          } catch (error) {
            if (!response.destroyed) sendJson(response, error?.statusCode || 400, {
              error: error?.message || "device monitor request failed",
            }, { "cache-control": "no-store" });
          }
          return;
        }
        if (
          (request.method === "GET" && url.pathname === "/api/mobile/sessions") ||
          (request.method === "DELETE" && url.pathname === "/api/mobile/device")
        ) {
          if (request.headers.origin) {
            sendJson(response, 403, { error: "browser origin is not allowed" }, { "cache-control": "no-store" });
            return;
          }
          const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
          const token = match?.[1] || "";
          if (request.method === "DELETE") {
            const result = this.deviceMonitorService.revoke(token);
            sendJson(response, result.revoked ? 200 : 401, result, { "cache-control": "no-store" });
            return;
          }
          const device = this.deviceMonitorService.authenticate(token);
          if (!device) {
            sendJson(response, 401, { error: "invalid or expired mobile device token" }, { "cache-control": "no-store" });
            return;
          }
          sendJson(response, 200, this.mobileSessionSnapshot(), { "cache-control": "no-store" });
          return;
        }
        const login = this.sessionLogin(request);
        const approved = this.isDirectLocal(request) || this.isApproved(login);
        if (!approved) {
          if (request.method === "GET" && url.pathname === "/") {
            if (login) {
              response.writeHead(403, { "content-type": "text/html; charset=utf-8" })
                .end(`<meta charset="utf-8"><title>승인 대기</title><body style="background:#0d1117;color:#c9d1d9;font:16px system-ui;padding:40px"><h2>GitHub @${login.replace(/[<>&"']/g, "")}</h2><p>Acedia 앱에서 원격 접속 요청을 승인해 주세요.</p></body>`);
            } else {
              response.writeHead(302, { location: "/login" }).end();
            }
          } else sendJson(response, 401, { error: "unauthorized", pending: Boolean(login) });
          return;
        }
        if (await this.accountPoolApi?.(request, response, url, { readJson, allowed: () => this.isSameOrigin(request),
          admin: this.isDirectLocal(request) || Boolean(login && login.toLowerCase() === String(this.config.owner).toLowerCase()) })) return;
        if (await this.hosting.api(request, response, url, { readJson, allowed: () => this.isSameOrigin(request) })) return;
        if (await serveRemoteBrowserApi(request, response, url, {
          browserProvider: this.browserProvider,
          mutationAllowed: () => this.isSameOrigin(request),
        })) return;
        if (
          ["GET", "HEAD"].includes(request.method) &&
          [REMOTE_MOBILE_APK_URL, LEGACY_REMOTE_MOBILE_APK_URL].includes(url.pathname)
        ) {
          sendRemoteMobileApk(request, response, this.mobileApkPath);
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/push/public-key") {
          sendJson(response, 200, {
            supported: true,
            publicKey: this.pushService.publicKey(),
          });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/monitor/device") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const deviceLogin = login || (this.isDirectLocal(request) ? "__local__" : "");
          if (!deviceLogin) {
            sendJson(response, 401, { error: "authenticated login required" });
            return;
          }
          try {
            await readJson(request);
            sendJson(response, 201, this.deviceMonitorService.issue(deviceLogin), {
              "cache-control": "no-store",
            });
          } catch (error) {
            sendJson(response, 400, { error: error?.message || "invalid device request" });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/mobile/device") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const deviceLogin = login || (this.isDirectLocal(request) ? "__local__" : "");
          if (!deviceLogin) {
            sendJson(response, 401, { error: "authenticated login required" });
            return;
          }
          try {
            await readJson(request);
            sendJson(response, 201, this.deviceMonitorService.issue(deviceLogin), {
              "cache-control": "no-store",
            });
          } catch (error) {
            sendJson(response, 400, { error: error?.message || "invalid mobile device request" });
          }
          return;
        }
        if (
          ["POST", "DELETE"].includes(request.method) &&
          url.pathname === "/api/push/subscription"
        ) {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const pushLogin = login || (this.isDirectLocal(request) ? "__local__" : "");
          if (!pushLogin) {
            sendJson(response, 401, { error: "authenticated login required" });
            return;
          }
          try {
            const body = await readJson(request);
            const result = request.method === "POST"
              ? this.pushService.subscribe(pushLogin, body)
              : this.pushService.unsubscribe(pushLogin, body.endpoint);
            sendJson(response, request.method === "POST" ? 201 : 200, result);
          } catch (error) {
            sendJson(response, 400, { error: error?.message || "invalid push subscription" });
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/state") {
          const runtime = this.stateProvider?.() ?? {};
          sendJson(response, 200, {
            title: "Acedia Remote",
            remote: true,
            pwa: true,
            generatedAt: new Date().toISOString(),
            agents: this.agents,
            view: this.view,
            language: this.view?.language,
            ...runtime,
            mobileApp: remoteMobileApkInfo(this.mobileApkPath),
          });
          return;
        }
        if (await serveUsageProfileVisibility(request, response, url, this.usageProfileVisibility, () => this.isSameOrigin(request))) return;
        if (request.method === "GET" && url.pathname === "/api/usage") {
          const historyRequest = remoteUsageHistorySelection(url);
          if (historyRequest.error) {
            sendJson(response, 400, { error: historyRequest.error });
            return;
          }
          const refreshRequested = url.searchParams.get("refresh") === "1";
          const refresh = refreshRequested && Date.now() - this.usageRefreshAt >= 30_000;
          if (refresh) this.usageRefreshAt = Date.now();
          try {
            const usage = await this.usageProvider(refresh, historyRequest.selection);
            sendJson(response, 200, usage ?? { updatedAt: 0, limits: [], tokens: {} });
          } catch (error) {
            sendJson(response, error instanceof RangeError ? 400 : 500, {
              error: error?.message || "usage limits unavailable",
              updatedAt: 0,
              limits: [],
              tokens: {},
            });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/input") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const body = await readJson(request);
          const id = String(body.id || "").trim();
          const data = String(body.data || "");
          if (!id || !data || data.length > 8 * 1024) {
            sendJson(response, 400, { error: "invalid input" });
            return;
          }
          const accepted = this.writePty?.(id, data);
          if (accepted === false) {
            sendJson(response, 409, { error: "session is not active" });
            return;
          }
          sendJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/submit") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const body = await readJson(request);
          const id = String(body.id || "").trim();
          const message = String(body.message || "");
          if (!id || !message.trim() || message.length > 8 * 1024) {
            sendJson(response, 400, { error: "invalid message" });
            return;
          }
          const submission = await this.submissions.submit(body.requestId, id, message, () => this.submitPty(id, message));
            sendJson(response, submission.status, submission.body);
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/attachment") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          try {
            sendJson(response, 201, await saveRemoteAttachment(request, this.baseDir));
          } catch (error) {
            sendRemoteAttachmentError(response, error);
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/stream") {
          this.streamTerminal(request, response, String(url.searchParams.get("id") || "").trim());
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/restart") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          const body = await readJson(request);
          const id = String(body.id || "").trim();
          if (!id) {
            sendJson(response, 400, { error: "invalid session id" });
            return;
          }
          await respondToSessionRestart(response, this.restartSession, id);
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/cancel") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          const body = await readJson(request);
          const id = String(body.id || "").trim();
          if (!id) {
            sendJson(response, 400, { error: "invalid session id" });
            return;
          }
          if (this.cancelSession?.(id) === false) {
            sendJson(response, 409, { error: "session is not active" });
            return;
          }
          sendJson(response, 200, { ok: true, status: "idle" });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/create") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          try {
            const payload = remoteCreateSessionPayload(
              { agents: this.agents, view: this.view },
              await readJson(request),
            );
            const result = await this.createSession(payload);
            if (!result) { sendJson(response, 501, { error: "session creation unavailable" }); return; }
            sendJson(response, 201, { ok: true, ...result });
          } catch (error) {
            sendJson(response, error?.statusCode || 400, { error: error?.message || "invalid session" });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/session/rename") {
          if (!this.isSameOrigin(request)) {
            sendJson(response, 403, { error: "cross-origin request blocked" });
            return;
          }
          if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, { error: "application/json required" });
            return;
          }
          try {
            const payload = remoteRenameSessionPayload(
              { agents: this.agents, view: this.view },
              await readJson(request),
            );
            if (this.renameSession(payload) === false) {
              sendJson(response, 409, { error: "session rename unavailable" });
              return;
            }
            sendJson(response, 202, { ok: true, id: payload.id, name: payload.name });
          } catch (error) {
            sendJson(response, error?.statusCode || 400, { error: error?.message || "invalid session" });
          }
          return;
        }
        if (request.method === "GET" && url.pathname === "/api/chat") {
          const id = String(url.searchParams.get("id") || "").trim();
          const beforeSequence = Number(url.searchParams.get("before"));
          const requestedLimit = Number(url.searchParams.get("limit"));
          const options = {
            beforeSequence: Number.isSafeInteger(beforeSequence) && beforeSequence > 0 ? beforeSequence : null,
            limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0
              ? Math.min(400, requestedLimit)
              : 400,
          };
          try {
            const result = (await this.chatProvider?.(id, options)) ?? { blocks: [], missing: true };
            sendJson(response, 200, result);
          } catch (error) {
            sendJson(response, 500, { error: error.message, blocks: [] });
          }
          return;
        }
        if (await serveRemoteDocumentApi(request, response, url, {
          snapshot: () => ({ agents: this.agents, view: this.view }), previews: this.htmlPreviews,
        })) return;
        if (request.method === "GET" && sendRemoteAsset(response, url.pathname)) return;
        response.writeHead(404).end();
      } catch (error) {
        sendJson(response, 500, { error: error.message });
      }
    });
    const configuredPort = Number(this.config.server_port);
    const desiredPort = Number.isInteger(configuredPort) && configuredPort >= 0 ? configuredPort : 18800;
    this.port = await listen(this.server, desiredPort);
    return this.status();
  }

  async stop() {
    const server = this.server; this.server = null; this.port = null;
    this.htmlPreviews.clear();
    this.hosting.tickets.clear();
    this.deviceMonitorService.close();
    if (server) {
      // Long-lived SSE terminal streams keep connections open; force them shut
      // so shutdown (and app quit) never blocks on server.close().
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    return this.status();
  }
}

export class TunnelService {
  constructor({
    baseDir,
    getConfig,
    getLocalUrl,
    fetchImpl = fetch,
    spawnImpl = spawn,
    allowDownload = true,
    executableSearchPath = process.env.PATH || "",
  }) {
    this.baseDir = baseDir;
    this.getConfig = getConfig;
    this.getLocalUrl = getLocalUrl;
    this.fetchImpl = fetchImpl;
    this.spawnImpl = spawnImpl;
    this.allowDownload = allowDownload;
    this.executableSearchPath = executableSearchPath;
    this.child = null;
    this.publicUrl = null;
    this.downloadPromise = null;
    this.startPromise = null;
  }
  status() { return { running: Boolean(this.child && !this.child.killed), publicUrl: this.publicUrl }; }

  async ensureExecutable() {
    const executableName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
    const executable = path.join(this.baseDir, executableName);
    if (fs.existsSync(executable)) return executable;
    for (const directory of this.executableSearchPath.split(path.delimiter)) {
      const candidateDirectory = directory.trim().replace(/^"|"$/g, "");
      if (!candidateDirectory) continue;
      const candidate = path.join(candidateDirectory, executableName);
      if (fs.existsSync(candidate)) return candidate;
    }
    if (!this.allowDownload) {
      throw new Error(
        "Microsoft Store판은 실행 파일을 자동으로 내려받지 않습니다. cloudflared를 PATH에 설치해 주세요.",
      );
    }
    if (process.platform !== "win32") {
      throw new Error("cloudflared를 PATH 또는 Acedia 데이터 폴더에 설치해 주세요.");
    }
    if (this.downloadPromise) return this.downloadPromise;
    this.downloadPromise = (async () => {
      await fsPromises.mkdir(this.baseDir, { recursive: true });
      const temporary = `${executable}.${process.pid}.download`;
      try {
        const response = await this.fetchImpl(
          "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
          {
            headers: { "user-agent": "Acedia" },
            redirect: "follow",
            signal: AbortSignal.timeout(120_000),
          }
        );
        if (!response.ok || !response.body) throw new Error(`cloudflared download failed: HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
        const downloaded = await fsPromises.stat(temporary);
        if (downloaded.size < 1024 * 1024) throw new Error("cloudflared download was unexpectedly small");
        await fsPromises.rename(temporary, executable);
        return executable;
      } catch (error) {
        await fsPromises.rm(temporary, { force: true }).catch(() => {});
        throw error;
      }
    })().finally(() => { this.downloadPromise = null; });
    return this.downloadPromise;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    if (this.child && !this.child.killed && this.publicUrl) return this.status();
    this.startPromise = (async () => {
      const config = this.getConfig();
      const executable = await this.ensureExecutable();
      const named = Boolean(config.tunnel_token);
      const localUrl = this.getLocalUrl();
      if (!named && !localUrl) throw new Error("Remote PWA 서버가 실행 중이 아닙니다.");
      const args = named
        ? ["tunnel", "run", "--token", config.tunnel_token]
        : ["tunnel", "--url", localUrl, "--no-autoupdate"];
      const child = this.spawnImpl(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      this.child = child;
      this.publicUrl = null;

      return await new Promise((resolve, reject) => {
        let settled = false;
        let recent = "";
        let timeout = null;
        const finish = (error = null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) {
            if (this.child === child) this.child = null;
            this.publicUrl = null;
            if (!child.killed) child.kill();
            reject(error);
          } else resolve(this.status());
        };
        const inspect = (chunk) => {
          recent = `${recent}${String(chunk)}`.slice(-8192);
          if (named && recent.includes("Registered tunnel connection")) {
            this.publicUrl = config.public_hostname ? `https://${config.public_hostname}` : null;
            finish();
            return;
          }
          if (!named) {
            const match = recent.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (match) {
              this.publicUrl = match[0].replace(/\/$/, "");
              finish();
            }
          }
        };
        child.stdout?.on("data", inspect);
        child.stderr?.on("data", inspect);
        child.once("error", (error) => finish(error));
        child.once("exit", (code) => {
          if (this.child === child) this.child = null;
          if (!settled) finish(new Error(`cloudflared exited before the tunnel was ready (${code ?? "unknown"})`));
        });
        timeout = setTimeout(() => {
          finish(new Error(named
            ? "cloudflared did not connect within 45s (check tunnel token)"
            : "cloudflared did not report a tunnel URL within 45s"));
        }, 45_000);
      });
    })().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }
  async stop() {
    if (this.child) this.child.kill();
    this.child = null;
    this.publicUrl = null;
    return this.status();
  }
}
