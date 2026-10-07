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
    fs.rmSync(directory, { recursive: true });
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

it("preserves Codex approvals inserted before the managed MCP end comment across resumes", async () => {
  const { root, service } = fixture();
  await service.setupCodexHome(root);
  const file = path.join(root, "config.toml");
  const approvals = `[projects.'g:\\unityproject\\projects']
trust_level = "trusted"

[hooks.state.'project-config:pre_tool_use:0:0']
trusted_hash = "sha256:existing-approval"

[windows]
sandbox = "elevated"
`;
  const before = fs.readFileSync(file, "utf8").replace(
    "# <<< multiagent browser mcp <<<", approvals + "# <<< multiagent browser mcp <<<",
  );
  fs.writeFileSync(file, before);
  await service.setupCodexHome(root);
  const after = fs.readFileSync(file, "utf8");
  expect(after).toContain(approvals.trim());
  expect(after.match(/\[mcp_servers\.multiagent_browser\]/g)).toHaveLength(1);
  expect(after.indexOf("[windows]")).toBeLessThan(after.indexOf("# >>> multiagent browser mcp >>>"));
  await expect(service.setupCodexHome(root)).resolves.toBe(false);
  expect(fs.readFileSync(file, "utf8")).toBe(after);
});

it.each(["claude", "codex", "qwen"])("repairs read-only managed %s files on session startup and keeps user settings", async tool => {
  const { root, service } = fixture();
  await service.setupProject(root, tool);
  const relative = tool === "claude" ? ".mcp.json" : tool === "codex" ? ".codex/config.toml" : ".qwen/settings.json";
  const file = path.join(root, relative);
  if (tool === "codex") fs.appendFileSync(file, '\nmodel = "preserved"\n');
  else {
    const settings = JSON.parse(fs.readFileSync(file, "utf8"));
    if (tool === "claude") settings.mcpServers.userServer = { command: "user-command" };
    else settings.userSetting = "preserved";
    fs.writeFileSync(file, JSON.stringify(settings));
  }
  fs.chmodSync(file, 0o444);
  await service.setupProject(root, tool);
  expect(fs.statSync(file).mode & 0o200).not.toBe(0);
  expect(fs.readFileSync(file, "utf8")).toContain(tool === "claude" ? "user-command" : "preserved");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, ".acedia", "managed-files.json"), "utf8"));
  const entry = manifest.tools[tool].find(entry => entry.path === relative);
  const source = fs.readFileSync(path.join(root, entry.source), "utf8");
  expect(source).toContain(tool === "claude" ? "multiagent-browser" : "multiagent");
  expect(source).not.toContain(tool === "claude" ? "user-command" : "preserved");
  fs.chmodSync(file, 0o444);
  await service.setupProject(root, tool);
  expect(fs.statSync(file).mode & 0o200).not.toBe(0);
});

it("adds nested project Git rules locally and retains rules across different tools without duplicates", async () => {
  const { root, service } = fixture();
  const exclude = path.join(root, ".git", "info", "exclude");
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, "# user rule\n*.bak\n");
  const project = path.join(root, "nested");
  fs.mkdirSync(project);
  await service.setupProject(project, "claude");
  await service.setupProject(project, "qwen");
  await expect(service.setupProject(project, "claude")).resolves.toBe(false);
  const rules = fs.readFileSync(exclude, "utf8");
  expect(rules).toContain("*.bak\n");
  expect(rules.match(/\/nested\/\.acedia\//g)).toHaveLength(1);
  expect(rules).toContain("/nested/.mcp.json\n");
  expect(rules).toContain("/nested/.qwen/settings.json\n");
  expect(fs.existsSync(path.join(root, ".gitignore"))).toBe(false);
});

it("uses the worktree common Git exclude directory", async () => {
  const { root, service } = fixture();
  const project = path.join(root, "worktree");
  const gitDir = path.join(root, "metadata", "worktrees", "one");
  fs.mkdirSync(project);
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(project, ".git"), `gitdir: ${gitDir}\n`);
  fs.writeFileSync(path.join(gitDir, "commondir"), "../..\n");
  await service.setupProject(project, "claude");
  expect(fs.readFileSync(path.join(root, "metadata", "info", "exclude"), "utf8")).toContain("/.mcp.json\n");
});

it("honors a Perforce custom ignore filename and makes that ignore file writable", async () => {
  const { root, service } = fixture();
  vi.stubEnv("P4IGNORE", "local.ignore;second.ignore");
  const ignore = path.join(root, "local.ignore");
  fs.writeFileSync(ignore, "# existing\n*.obj\n");
  fs.chmodSync(ignore, 0o444);
  try {
    await service.setupProject(root, "claude");
    const contents = fs.readFileSync(ignore, "utf8");
    expect(contents).toContain("*.obj\n");
    expect(contents).toContain("/.acedia/\n");
    expect(contents).toContain("/.mcp.json\n");
    expect(contents).toContain("/local.ignore\n");
    await expect(service.setupProject(root, "claude")).resolves.toBe(false);
  } finally { vi.unstubAllEnvs(); }
});

it("preserves read-only files with only user configuration and does not trust registry paths", async () => {
  const { root, service } = fixture();
  await service.setupProject(root, "claude");
  const file = path.join(root, ".mcp.json");
  const original = '{"mcpServers":{"user":{"command":"keep"}}}\n';
  fs.writeFileSync(file, original);
  fs.chmodSync(file, 0o444);
  try {
    await expect(service.setupProject(root, "claude")).rejects.toThrow();
    expect(fs.readFileSync(file, "utf8")).toBe(original);
    expect(fs.statSync(file).mode & 0o200).toBe(0);
  } finally { fs.chmodSync(file, 0o644); }
});

it("rejects a linked management folder before touching existing project settings", async () => {
  const { root, service } = fixture();
  const project = path.join(root, "project");
  const outside = path.join(root, "outside");
  fs.mkdirSync(project);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(project, ".acedia"), process.platform === "win32" ? "junction" : "dir");
  await expect(service.setupProject(project, "claude")).rejects.toThrow("linked project path");
  expect(fs.readdirSync(outside)).toEqual([]);
  expect(fs.existsSync(path.join(project, ".mcp.json"))).toBe(false);
});
