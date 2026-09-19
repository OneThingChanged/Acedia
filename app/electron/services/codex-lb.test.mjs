import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexLbConnection, normalizeCodexLbSettings } from "./codex-lb.mjs";

const cleanups = [];
const key = randomBytes(32);
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  },
  decryptString(value) {
    const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString("utf8");
  },
};
function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-codex-lb-test-"));
  cleanups.push(() => {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-codex-lb-test-")) throw new Error("Unsafe fixture cleanup");
    fs.rmSync(directory, { force: true, recursive: true });
  });
  const service = new CodexLbConnection(directory, { safeStorage, ...options });
  return { service, directory, args: (patch = {}, extra = {}) => ({ settings: { ...service.get().settings, ...patch }, revision: service.get().revision, ...extra }) };
}
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe("external codex-lb connection", () => {
  it("is opt-in and normalizes server origins, prefixes and trailing slashes", () => {
    const f = fixture(); expect(f.service.launch()).toBeNull();
    for (const [input, expected] of [
      ["http://localhost:2455/", "http://localhost:2455/backend-api/codex"],
      ["https://proxy.example/lb/backend-api/codex/", "https://proxy.example/lb/backend-api/codex"],
      ["https://proxy.example/lb", "https://proxy.example/lb/backend-api/codex"],
    ]) expect(normalizeCodexLbSettings(f.args({ baseUrl: input }).settings).baseUrl).toBe(expected);
  });
  it.each(["file:///tmp/a", "http://remote.example", "https://user:password@proxy.example", "https://proxy.example?key=secret", "https://proxy.example/#fragment", "http://127.0.0.1:2455/v1"])("rejects unsafe or incompatible URL %s", baseUrl => {
    const f = fixture(); expect(() => f.service.save(f.args({ baseUrl }))).toThrow();
  });
  it("encrypts the key, never returns it, and reloads without modifying CLI configuration", () => {
    const f = fixture(); const secret = "fixture-secret-never-display";
    const state = f.service.save(f.args({ enabled: true }, { apiKey: secret }));
    expect(JSON.stringify(state)).not.toContain(secret);
    expect(fs.readFileSync(f.service.file, "utf8")).not.toContain(secret);
    expect(fs.readdirSync(f.directory)).toEqual(["codex-lb.json"]);
    const restored = new CodexLbConnection(f.directory, { safeStorage });
    const launch = restored.launch();
    expect(launch.env.ACEDIA_CODEX_LB_API_KEY).toBe(secret);
    expect(launch.args.join(" ")).not.toContain(secret);
    expect(launch.args).toContain('model_provider="codex-lb"');
    expect(launch.args).toContain('model_providers.codex-lb.name="openai"');
    expect(launch.args).toContain("model_providers.codex-lb.requires_openai_auth=true");
    f.service.save(f.args({}, { removeApiKey: true }));
    expect(f.service.launch().env.ACEDIA_CODEX_LB_API_KEY).toBe("acedia-local-no-auth");
  });
  it("does not send an old server's key to a different origin", () => {
    const f = fixture(); f.service.save(f.args({}, { apiKey: "old-server-key" }));
    expect(() => f.service.save(f.args({ baseUrl: "https://other.example", enabled: true }))).toThrow("server changed");
    expect(() => f.service.save(f.args({ baseUrl: "https://other.example", enabled: true }, { removeApiKey: true }))).toThrow("requires its own");
    f.service.save(f.args({ baseUrl: "https://other.example", enabled: true }, { apiKey: "new-server-key" }));
    expect(f.service.launch().env.ACEDIA_CODEX_LB_API_KEY).toBe("new-server-key");
  });
  it("rejects stale windows and retains settings on write/encryption failure", () => {
    const f = fixture(); const stale = f.args();
    f.service.save(f.args({ supportsWebsockets: false }));
    expect(() => f.service.save(stale)).toThrow("another window");
    const previous = f.service.get();
    f.service.safeStorage = { isEncryptionAvailable: () => false };
    expect(() => f.service.save(f.args({ enabled: true }, { apiKey: "secret" }))).toThrow("not saved");
    expect(f.service.get().settings).toEqual(previous.settings);
    fs.mkdirSync(f.service.file + ".tmp");
    expect(() => f.service.save(f.args({ enabled: true }))).toThrow();
    expect(f.service.get().revision).toBe(previous.revision);
  });
  it("fails closed for corrupted settings or an undecryptable key", () => {
    const f = fixture(); fs.writeFileSync(f.service.file, "{broken");
    const bad = new CodexLbConnection(f.directory, { safeStorage });
    expect(bad.get().error).toBeTruthy(); expect(() => bad.launch()).toThrow("Could not read");
    f.service.save(f.args({ enabled: true }, { apiKey: "secret" }));
    f.service.safeStorage = { ...safeStorage, decryptString: () => { throw new Error("raw-sensitive-error"); } };
    expect(() => f.service.launch()).toThrow("Could not unlock");
  });
  it("tests the actual local HTTP boundary without sending generation requests or persisting a draft", async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      seen.push({ url: req.url, method: req.method, authorization: req.headers.authorization });
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ models: [{ slug: "fixture" }] }));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const f = fixture(); const baseUrl = `http://127.0.0.1:${server.address().port}`;
    expect(await f.service.test(f.args({ baseUrl }, { apiKey: "fixture-key" }))).toEqual({ ok: true, modelCount: 1 });
    expect(seen).toEqual([{ url: "/backend-api/codex/models", method: "GET", authorization: "Bearer fixture-key" }]);
    expect(fs.existsSync(f.service.file)).toBe(false);
    expect(f.service.launch()).toBeNull();
  });
  it.each([401, 403, 302, 503])("does not follow redirects or expose response bodies (HTTP %s)", async status => {
    const fetchImpl = vi.fn(async () => new Response("upstream-sensitive-details", { status, headers: { location: "https://untrusted.example" } }));
    const f = fixture({ fetchImpl });
    const result = await f.service.test(f.args());
    expect(result).toEqual({ ok: false, reason: [401, 403].includes(status) ? "authentication" : "http", status });
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("manual");
  });
  it("rejects a non-Codex catalog and sanitizes network failures", async () => {
    const f = fixture({ fetchImpl: async () => new Response('{"data":[]}') });
    expect(await f.service.test(f.args())).toEqual({ ok: false, reason: "catalog" });
    f.service.fetch = async () => { throw new Error("secret-url-and-key"); };
    expect(await f.service.test(f.args())).toEqual({ ok: false, reason: "connection" });
  });
});
