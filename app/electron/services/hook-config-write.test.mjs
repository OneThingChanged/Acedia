import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HookService } from "./hook-service.mjs";

const directories = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-hook-config-"));
  directories.push(root);
  const service = new HookService({ baseDir: path.join(root, "runtime"), mcpScriptPath: path.join(root, "browser.mjs") });
  return { root, service };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("acedia-hook-config-")) throw new Error("Unexpected fixture path");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it.each(["account", "codex", "claude", "qwen"])("preserves unreadable %s settings and allows a later retry", async kind => {
  const { root, service } = fixture();
  const file = kind === "account" ? path.join(root, "config.toml") : path.join(root, `.${kind}`, kind === "codex" ? "config.toml" : kind === "claude" ? "settings.local.json" : "settings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = kind === "codex" || kind === "account" ? 'model = "user-model"\n' : '{"userSetting":"keep"}\n';
  fs.writeFileSync(file, original);
  const setup = () => kind === "account" ? service.setupCodexHome(root) : service.setupProject(root, kind);
  const error = Object.assign(new Error("fixture read denied"), { code: "EACCES" });
  vi.spyOn(fsPromises, "readFile").mockRejectedValueOnce(error);
  await expect(setup()).rejects.toThrow("fixture read denied");
  expect(fs.readFileSync(file, "utf8")).toBe(original);
  await expect(setup()).resolves.toBe(true);
  expect(fs.readFileSync(file, "utf8")).toContain(kind === "codex" || kind === "account" ? 'model = "user-model"' : '"userSetting": "keep"');
  await expect(setup()).resolves.toBe(false);
});

it.each(["claude", "qwen"])("preserves invalid %s JSON instead of replacing it", async tool => {
  const { root, service } = fixture();
  const file = path.join(root, `.${tool}`, tool === "claude" ? "settings.local.json" : "settings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = '{"userSetting": "unfinished"';
  fs.writeFileSync(file, original);
  await expect(service.setupProject(root, tool)).rejects.toThrow("JSON");
  expect(fs.readFileSync(file, "utf8")).toBe(original);
});

it("validates the existing MCP file before changing either Claude configuration", async () => {
  const { root, service } = fixture();
  const hooksFile = path.join(root, ".claude", "settings.local.json");
  const mcpFile = path.join(root, ".mcp.json");
  fs.mkdirSync(path.dirname(hooksFile));
  const hooks = '{"userSetting":"keep"}\n';
  fs.writeFileSync(hooksFile, hooks);
  fs.writeFileSync(mcpFile, "[1,2,3]\n");
  await expect(service.setupProject(root, "claude")).rejects.toThrow("JSON object");
  expect(fs.readFileSync(hooksFile, "utf8")).toBe(hooks);
  expect(fs.readFileSync(mcpFile, "utf8")).toBe("[1,2,3]\n");
});

it("serializes overlapping writes to the same Codex home without losing hooks or MCP settings", async () => {
  const { root, service } = fixture();
  const codexHome = path.join(root, ".codex");
  await Promise.all([service.setupProject(root, "codex"), service.setupCodexHome(codexHome)]);
  const file = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
  expect(file).toContain("[[hooks.SessionStart]]");
  expect(file.match(/\[mcp_servers.multiagent_browser\]/g)).toHaveLength(1);
  expect(file).toContain("enabled = false");
});
