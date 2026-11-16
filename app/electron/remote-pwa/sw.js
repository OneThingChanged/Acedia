const BASE_PATH = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `acedia-remote:${BASE_PATH}:`;
const CACHE_NAME = CACHE_PREFIX + 'multiagent-remote-v118';
const scopePath = path => BASE_PATH + path.replace(/^\//, '');
const STATIC_ASSETS = [
  '/pwa/base-path.js',
  '/pwa/workspace-shell.css', '/pwa/workspace-shell.js', '/pwa/markdown-blocks.js',
  '/pwa/session-notes.js',
  '/pwa/session-notes.css',
  '/pwa/session-notes-client.js',
  "/pwa/chat-files.js",
  "/pwa/model-editor.js",
  "/pwa/workspace-ui.js",
  "/",
  "/pwa/styles.css",
  "/pwa/terminal-touch.js",
  "/pwa/app.js",
  "/pwa/hosting.js",
  "/pwa/session-model.js",
  "/pwa/account-pool.js",
  "/pwa/usage-sessions.js",
  "/pwa/session-state.js",
  "/pwa/session-tree.js",
  "/pwa/chat-requests.js",
  "/pwa/queue-delivery.js",
  "/pwa/codex-quota.js",
  "/pwa/dom.js",
  "/pwa/i18n.js",
  "/pwa/translations.js",
  "/pwa/chat-markup.js",
  "/pwa/image-zoom.js",
  "/pwa/chat-render.js",
  "/pwa/video-preview.js",
  "/pwa/chat-history.js",
  "/pwa/chat-pagination.js",
  "/pwa/chat-prompt.js",
  "/pwa/question-form.js",
  "/pwa/requests.js",
  "/pwa/attachments.js",
  "/pwa/xterm.js",
  "/pwa/xterm.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS.map(scopePath))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(key => key !== CACHE_NAME && (key.startsWith(CACHE_PREFIX) || BASE_PATH === '/' && /^multiagent-remote-v\d+$/.test(key))).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_PATH)) return;
  const pathname = '/' + url.pathname.slice(BASE_PATH.length);
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/downloads/") ||
    pathname.startsWith("/hosting-preview/") ||
    pathname.startsWith("/preview/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE_NAME).then(cache => cache.match(scopePath('/')))));
    return;
  }

  // App shell (our own code) changes on every release — go network-first so a
  // new build lands immediately instead of being pinned to a stale cache.
  // Vendor/static assets (xterm, icons) stay cache-first for speed.
  const isAppShell =
    ['/pwa/base-path.js', "/pwa/workspace-shell.css", "/pwa/workspace-shell.js", "/pwa/markdown-blocks.js"].includes(pathname) ||
    pathname === "/pwa/chat-files.js" ||
    pathname === "/pwa/model-editor.js" ||
    pathname === "/pwa/workspace-ui.js" ||
     pathname === "/pwa/session-model.js" ||
    pathname === "/pwa/hosting.js" ||
    pathname === "/pwa/account-pool.js" ||
    pathname === "/pwa/usage-sessions.js" ||
    pathname === "/pwa/session-state.js" ||
    pathname === "/pwa/session-tree.js" ||
    pathname === "/pwa/app.js" ||
    pathname === "/pwa/dom.js" ||
    pathname === "/pwa/i18n.js" ||
    pathname === "/pwa/translations.js" ||
    pathname === "/pwa/chat-markup.js" ||
    pathname === "/pwa/image-zoom.js" ||
    pathname === "/pwa/chat-render.js" ||
    pathname === "/pwa/chat-history.js" ||
    pathname === "/pwa/chat-pagination.js" ||
     pathname === "/pwa/chat-prompt.js" ||
     pathname === "/pwa/question-form.js" ||
    pathname === "/pwa/requests.js" ||
    pathname === "/pwa/attachments.js" ||
    pathname === "/pwa/styles.css" ||
    pathname === "/pwa/terminal-touch.js";
  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "작업이 완료되었습니다." };
  }
  const candidateAgentId = String(payload.agentId || "").trim();
  const agentId = /^[A-Za-z0-9._:-]{1,128}$/.test(candidateAgentId)
    ? candidateAgentId
    : null;
  const title = payload.title || "Acedia";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "작업이 완료되었습니다.",
    tag: payload.tag || (agentId ? `done:${agentId}` : "multiagent:done"),
    renotify: true,
    icon: scopePath('/icons/icon-192.png'),
    badge: scopePath('/icons/icon-192.png'),
    timestamp: Number(payload.timestamp) || Date.now(),
    data: {
      agentId,
      url: scopePath(agentId ? `/?agent=${encodeURIComponent(agentId)}` : '/'),
    },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const agentId = event.notification.data?.agentId || null;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find(client => { try { const url = new URL(client.url); return url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH); } catch { return false; } });
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: "open-agent", agentId });
        return;
      }
      const target = scopePath(agentId ? `/?agent=${encodeURIComponent(agentId)}&view=chat` : '/');
      await self.clients.openWindow(target);
    })
  );
});
