import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function perforceSettings() {
  // `p4 set` reads local environment/registry configuration; it does not
  // contact the server, check out files, or change client settings.
  const result = await execFileAsync("p4", ["set", "-q"], {
    windowsHide: true, timeout: 3000, maxBuffer: 65536,
  }).catch(() => null);
  const settings = {};
  for (const name of ["P4IGNORE", "P4CONFIG", "P4PORT", "P4CLIENT"]) {
    settings[name] = process.env[name] || result?.stdout?.match(new RegExp(`^${name}=(.*?)\\s*(?:\\([^\\n]*\\))?\\r?$`, "m"))?.[1] || "";
  }
  return { settings, installed: Boolean(result) };
}

async function readOptional(file) {
  return fs.readFile(file, "utf8").catch(error => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

// Check each component: neither managed files nor their parent directories may
// redirect writes outside the selected project through a symlink/junction.
export async function checkProjectPath(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error(`Invalid Acedia project path: ${file}`);
  }
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Acedia cannot manage a linked project path: ${current}`);
  }
}

export async function makeWritable(file) {
  const stat = await fs.stat(file).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (stat && !(stat.mode & 0o200)) await fs.chmod(file, stat.mode | 0o200);
}

function appendRules(before, rules) {
  const lines = new Set(before.split(/\r?\n/).map(line => line.trim()));
  const missing = rules.filter(rule => !lines.has(rule));
  if (!missing.length) return before;
  return `${before}${before && !before.endsWith("\n") ? "\n" : ""}\n# Acedia local session files\n${missing.join("\n")}\n`;
}

// Return a write plan; callers validate CLI settings before applying this plan.
export async function projectManagementPlan(root, entries) {
  const manifestFile = path.join(root, ".acedia", "managed-files.json");
  await checkProjectPath(root, manifestFile);
  const manifestBefore = await readOptional(manifestFile);
  const manifest = manifestBefore ? JSON.parse(manifestBefore) : { version: 1, tools: {} };
  if (manifest.version !== 1 || !manifest.tools || typeof manifest.tools !== "object" || Array.isArray(manifest.tools)) {
    throw new Error(`Invalid Acedia managed file list: ${manifestFile}`);
  }
  // The registry is informational, never an authority to chmod arbitrary paths.
  const tool = entries[0]?.tool;
  if (!tool) return [];
  manifest.tools[tool] = entries.map(entry => ({
    path: path.relative(root, entry.target).split(path.sep).join("/"),
    source: `.acedia/${entry.source}`,
  }));
  const writes = [];
  for (const entry of entries) {
    const target = path.join(root, ".acedia", entry.source);
    await checkProjectPath(root, target);
    const before = await readOptional(target);
    if (before !== entry.content) writes.push({ target, after: entry.content });
    await makeWritable(target);
  }
  const manifestAfter = `${JSON.stringify(manifest, null, 2)}\n`;
  if (manifestBefore !== manifestAfter) writes.push({ target: manifestFile, after: manifestAfter });
  await makeWritable(manifestFile);

  const relativeFiles = [...new Set(Object.values(manifest.tools).flatMap(files =>
    Array.isArray(files) ? files.map(file => file.path).filter(file =>
      typeof file === "string" && /^(?:\.mcp\.json|\.claude\/settings\.local\.json|\.codex\/config\.toml|\.qwen\/settings\.json)$/.test(file)) : []))];
  // Repository-local excludes avoid editing/checkout of a tracked .gitignore.
  // Scope every rule to the selected project, including nested projects.
  let directory = root;
  while (true) {
    const marker = path.join(directory, ".git");
    await checkProjectPath(directory, marker);
    const stat = await fs.stat(marker).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat) {
      let gitDir = marker;
      if (stat.isFile()) {
        const match = (await fs.readFile(marker, "utf8")).match(/^gitdir:\s*(.+)\s*$/m);
        if (!match) throw new Error(`Invalid Git directory marker: ${marker}`);
        gitDir = path.resolve(directory, match[1].trim());
      }
      const commonDir = (await readOptional(path.join(gitDir, "commondir"))).trim();
      if (commonDir) gitDir = path.resolve(gitDir, commonDir);
      const target = path.join(gitDir, "info", "exclude");
      await checkProjectPath(gitDir, target);
      const prefix = path.relative(directory, root).split(path.sep).join("/");
      // Escape Git glob characters in literal directory names.
      const literal = text => text.replace(/[\\*?\[\]]/g, "\\$&");
      const rules = [".acedia/", ...relativeFiles].map(file => `/${literal(prefix ? `${prefix}/` : "")}${file}`);
      const before = await readOptional(target);
      const after = appendRules(before, rules);
      if (before !== after) writes.push({ target, after });
      break;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  // Respect P4IGNORE/P4CONFIG rather than assuming .p4ignore is always active.
  const { settings: p4, installed } = await perforceSettings();
  let p4Ignore = p4.P4IGNORE;
  let configIgnoreFound = false;
  let hasP4 = Boolean(installed || p4Ignore || p4.P4CONFIG || p4.P4PORT || p4.P4CLIENT);
  directory = root;
  while (true) {
    for (const name of [...new Set([p4.P4CONFIG, ".p4config", "p4config"].filter(Boolean))]) {
      const config = await readOptional(path.resolve(directory, name));
      if (!config) continue;
      hasP4 = true;
      const configuredIgnore = config.match(/^\s*P4IGNORE\s*=\s*(.*?)\s*$/m)?.[1];
      if (!process.env.P4IGNORE && !configIgnoreFound && configuredIgnore) {
        p4Ignore = configuredIgnore;
        configIgnoreFound = true;
      }
    }
    for (const name of [".p4ignore", "p4ignore.txt"]) {
      const stat = await fs.stat(path.join(directory, name)).catch(error => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (stat?.isFile()) hasP4 = true;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  if (hasP4) {
    const names = p4Ignore ? p4Ignore.split(";").map(name => name.trim()).filter(Boolean) : [".p4ignore"];
    // Choose a workspace-local relative ignore name. Absolute/global ignore
    // settings must not be rewritten as a side effect of opening a project.
    const name = names.find(name => !path.isAbsolute(name) && !name.split(/[\\/]/).includes(".."));
    if (!name) throw new Error("P4IGNORE only names global files. Add a project-local ignore filename to P4IGNORE to enable Acedia setup.");
    const target = path.resolve(root, name);
    await checkProjectPath(root, target);
    const before = await readOptional(target);
    const after = appendRules(before, ["/.acedia/", ...relativeFiles.map(file => `/${file}`), `/${name.split(path.sep).join("/")}`]);
    if (before !== after) {
      await makeWritable(target);
      writes.push({ target, after });
    }
  }
  return writes;
}
