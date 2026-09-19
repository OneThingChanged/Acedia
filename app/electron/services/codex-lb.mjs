import fs from "node:fs";
import path from "node:path";

const DEFAULTS = { enabled: false, baseUrl: "http://127.0.0.1:2455/backend-api/codex", supportsWebsockets: true };
const KEY_ENV = "ACEDIA_CODEX_LB_API_KEY";

export function normalizeCodexLbSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.enabled !== "boolean" || typeof value.supportsWebsockets !== "boolean"
    || typeof value.baseUrl !== "string" || value.baseUrl.length > 2048) throw new TypeError("Invalid codex-lb settings.");
  let url;
  try { url = new URL(value.baseUrl.trim()); } catch { throw new TypeError("Enter a valid codex-lb HTTP(S) URL."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol) || (url.protocol === "http:" && !local)) {
    throw new TypeError("Use HTTPS for a remote codex-lb server; HTTP is allowed only on loopback.");
  }
  if (url.username || url.password || url.search || url.hash) throw new TypeError("The server URL must not contain credentials, a query or a fragment.");
  let pathname = url.pathname.replace(/\/+$/, "");
  if (/\/v1$/.test(pathname)) throw new TypeError("Use the codex-lb server URL or /backend-api/codex, not /v1.");
  if (!pathname.endsWith("/backend-api/codex")) pathname += "/backend-api/codex";
  url.pathname = pathname;
  return { enabled: value.enabled, baseUrl: url.href, supportsWebsockets: value.supportsWebsockets };
}

export function validateCodexLbDraft(args) {
  normalizeCodexLbSettings(args?.settings);
  if (args.apiKey !== undefined && (typeof args.apiKey !== "string" || args.apiKey.length > 4096 || /[^\x21-\x7e]/.test(args.apiKey))) {
    throw new TypeError("The API key must contain printable characters without spaces.");
  }
  if (args.removeApiKey !== undefined && typeof args.removeApiKey !== "boolean") throw new TypeError("Invalid API key removal option.");
  if (args.apiKey && args.removeApiKey) throw new TypeError("Choose either a new API key or key removal.");
  if (!Number.isSafeInteger(args.revision) || args.revision < 0) throw new TypeError("Invalid codex-lb settings revision.");
}

export class CodexLbConnection {
  constructor(storageDir, { safeStorage, fetchImpl = fetch } = {}) {
    this.file = path.join(storageDir, "codex-lb.json");
    this.safeStorage = safeStorage; this.fetch = fetchImpl;
    this.settings = { ...DEFAULTS }; this.encryptedKey = ""; this.revision = 0; this.loadError = null;
    try {
      const stored = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.settings = normalizeCodexLbSettings(stored.settings);
      if (typeof stored.encryptedKey !== "string" || !Number.isSafeInteger(stored.revision) || stored.revision < 0) throw new Error();
      this.encryptedKey = stored.encryptedKey; this.revision = stored.revision;
    } catch (error) {
      if (error.code !== "ENOENT") this.loadError = "Could not read codex-lb settings. Restore codex-lb.json before launching Codex.";
    }
  }

  get() {
    return { settings: { ...this.settings }, hasApiKey: Boolean(this.encryptedKey), revision: this.revision,
      keyStorageAvailable: Boolean(this.safeStorage?.isEncryptionAvailable()), error: this.loadError };
  }

  readKey() {
    if (!this.encryptedKey) return "";
    try {
      if (!this.safeStorage?.isEncryptionAvailable()) throw new Error();
      return this.safeStorage.decryptString(Buffer.from(this.encryptedKey, "base64"));
    } catch { throw new Error("Could not unlock the saved codex-lb API key. Enter it again in settings."); }
  }

  draft(args) {
    if (this.loadError) throw new Error(this.loadError);
    validateCodexLbDraft(args);
    if (args.revision !== this.revision) throw new Error("codex-lb settings changed in another window. Reload before saving or testing.");
    const settings = normalizeCodexLbSettings(args.settings);
    if (new URL(settings.baseUrl).origin !== new URL(this.settings.baseUrl).origin && this.encryptedKey && !args.apiKey && !args.removeApiKey) {
      throw new Error("The server changed. Re-enter the API key for that server or remove the saved key.");
    }
    const apiKey = args.removeApiKey ? "" : args.apiKey || this.readKey();
    if (settings.enabled && !apiKey && new URL(settings.baseUrl).protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(settings.baseUrl).hostname)) {
      throw new Error("A remote codex-lb connection requires its own API key.");
    }
    return { settings, apiKey };
  }

  save(args) {
    const { settings, apiKey } = this.draft(args);
    let encryptedKey = "";
    if (apiKey) {
      if (!this.safeStorage?.isEncryptionAvailable()) throw new Error("Windows credential encryption is unavailable. The API key was not saved.");
      encryptedKey = this.safeStorage.encryptString(apiKey).toString("base64");
    }
    const revision = this.revision + 1;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify({ settings, encryptedKey, revision }), { mode: 0o600 });
    fs.renameSync(this.file + ".tmp", this.file);
    this.settings = settings; this.encryptedKey = encryptedKey; this.revision = revision;
    return this.get();
  }

  async test(args) {
    const { settings, apiKey } = this.draft(args);
    try {
      const response = await this.fetch(settings.baseUrl + "/models", {
        headers: { accept: "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        signal: AbortSignal.timeout(8000), redirect: "manual",
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, reason: [401, 403].includes(response.status) ? "authentication" : "http", status: response.status };
      }
      let length = 0; const chunks = [];
      if (response.body) for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) throw new Error("Catalog too large");
        chunks.push(chunk);
      }
      const catalog = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(catalog.models)) return { ok: false, reason: "catalog" };
      return { ok: true, modelCount: catalog.models.length };
    } catch (error) {
      return { ok: false, reason: error.name === "TimeoutError" || error.name === "AbortError" ? "timeout" : "connection" };
    }
  }

  launch() {
    if (this.loadError) throw new Error(this.loadError);
    if (!this.settings.enabled) return null;
    const key = this.readKey();
    // Use a provider-specific environment key, never the selected account's
    // OAuth token as the LB credential. No config.toml or auth.json is rewritten.
    const config = {
      model_provider: "codex-lb", "model_providers.codex-lb.name": "openai",
      "model_providers.codex-lb.base_url": this.settings.baseUrl,
      "model_providers.codex-lb.wire_api": "responses", "model_providers.codex-lb.env_key": KEY_ENV,
      "model_providers.codex-lb.supports_websockets": this.settings.supportsWebsockets,
      "model_providers.codex-lb.requires_openai_auth": true,
    };
    return { env: { [KEY_ENV]: key || "acedia-local-no-auth" },
      args: Object.entries(config).flatMap(([name, value]) => ["-c", `${name}=${JSON.stringify(value)}`]) };
  }
}
