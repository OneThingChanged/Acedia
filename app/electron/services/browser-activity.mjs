import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function historyUrl(raw) {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.href.length > 8192 || /(?:access_token|id_token|code)=/i.test(url.hash)) return null;
    // Do not retain OAuth callback credentials or local preview capabilities.
    if ([...url.searchParams.keys()].some(key => /^(code|state|token|access_token|id_token)$/i.test(key))) return null;
    if (/^\/(?:preview|auth)\//.test(url.pathname)) return null;
    url.username = ""; url.password = "";
    return url.href;
  } catch { return null; }
}

export class BrowserActivity {
  constructor({ directory, downloadsDirectory, ownerOf, shell }) {
    this.file = path.join(directory, "browser-activity.json");
    this.downloadsDirectory = downloadsDirectory;
    this.ownerOf = ownerOf;
    this.shell = shell;
    this.history = [];
    this.downloads = [];
    this.items = new Map();
    this.sessions = new WeakSet();
    this.visits = new Map();
    try {
      const stored = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.history = Array.isArray(stored.history) ? stored.history.slice(0, 2000) : [];
      this.downloads = (Array.isArray(stored.downloads) ? stored.downloads : []).slice(0, 500)
        .map(row => row.state === "progressing" ? { ...row, state: "interrupted" } : row);
    } catch { /* first launch or unreadable history */ }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ history: this.history, downloads: this.downloads }), { mode: 0o600 });
      fs.renameSync(`${this.file}.tmp`, this.file);
      this.error = null;
    } catch { this.error = "브라우저 기록을 저장하지 못했습니다."; }
  }

  visit(contents, raw, title = "", { replace = false } = {}) {
    const url = historyUrl(raw);
    if (!url) return;
    const previous = this.visits.get(contents.id);
    if (replace) {
      if (previous?.url === url && this.history.includes(previous)) {
        previous.title = String(title || previous.title).slice(0, 500);
        this.save();
      }
      return;
    }
    const row = { id: randomUUID(), url, title: String(title || url).slice(0, 500), visitedAt: Date.now() };
    this.visits.set(contents.id, row);
    this.history.unshift(row);
    this.history.length = Math.min(this.history.length, 2000);
    this.save();
  }

  attach(contents) {
    const session = contents.session;
    contents.once("destroyed", () => this.visits.delete(contents.id));
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    session.on("will-download", (_event, item, source) => {
      const owner = source && this.ownerOf(source.id);
      if (!owner) return;
      const row = {
        id: randomUUID(), filename: path.basename(item.getFilename()) || "download",
        url: historyUrl(item.getURL()) || "", path: "", state: "progressing",
        receivedBytes: 0, totalBytes: item.getTotalBytes(), startedAt: Date.now(),
      };
      // Electron's native save dialog chooses the destination; never auto-open files.
      item.setSaveDialogOptions({ defaultPath: path.join(this.downloadsDirectory, row.filename) });
      this.downloads.unshift(row);
      // Keep all active items, even when trimming old records.
      this.downloads = this.downloads.filter((entry, index) => index < 500 || this.items.has(entry.id));
      this.items.set(row.id, item);
      this.save();
      item.on("updated", (_event, state) => {
        row.receivedBytes = item.getReceivedBytes();
        row.totalBytes = item.getTotalBytes();
        row.path = item.getSavePath();
        row.state = state;
      });
      item.once("done", (_event, state) => {
        row.receivedBytes = item.getReceivedBytes();
        row.totalBytes = item.getTotalBytes();
        row.path = item.getSavePath();
        row.state = state;
        this.items.delete(row.id);
        this.save();
      });
    });
  }

  list() {
    return { history: this.history, downloads: this.downloads.map(row => ({ ...row, active: this.items.has(row.id) })), error: this.error || null };
  }

  action(kind, id) {
    if (kind === "clear-history") { this.history = []; this.visits.clear(); this.save(); return; }
    if (kind === "clear-downloads") { this.downloads = this.downloads.filter(row => this.items.has(row.id)); this.save(); return; }
    if (kind === "remove-history") { this.history = this.history.filter(row => row.id !== id); this.save(); return; }
    const row = this.downloads.find(row => row.id === id);
    if (!row) throw new Error("다운로드 기록을 찾을 수 없습니다.");
    if (kind === "cancel") { this.items.get(id)?.cancel(); return; }
    if (kind === "show-folder") {
      if (row.state !== "completed" || !row.path || !fs.existsSync(row.path)) throw new Error("다운로드 파일이 없거나 아직 완료되지 않았습니다.");
      this.shell.showItemInFolder(row.path); return;
    }
    throw new Error("지원하지 않는 브라우저 기록 작업입니다.");
  }
}
