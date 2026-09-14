import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

function decodeValue(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseGitmodules(content) {
  const entries = [];
  let current = null;
  for (const line of String(content ?? "").split(/\r?\n/)) {
    const section = line.match(
      /^\s*\[\s*submodule\s+"((?:\\.|[^"])*)"\s*\]\s*$/
    );
    if (section) {
      current = { name: section[1].replace(/\\"/g, '"'), path: "", url: "" };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const property = line.match(/^\s*(path|url)\s*=\s*(.*?)\s*$/i);
    if (!property) continue;
    current[property[1].toLowerCase()] = decodeValue(property[2]);
  }
  return entries.filter((entry) => entry.path.trim().length > 0);
}

function normalizedRelativePath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (
    !normalized ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return normalized
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .join("/");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function discoverGitSubmodules(folder, maxEntries = 200) {
  const root = await fsPromises.realpath(String(folder));
  const queue = [{ repository: root, prefix: "" }];
  const visitedRepositories = new Set();
  const results = new Map();
  const skippedDirectories = new Set([
    ".git", "node_modules", ".venv", "venv", "__pycache__",
    "binaries", "intermediate", "saved", "deriveddatacache",
    "dist", "build", "target", ".next", ".cache",
  ]);

  // Bound filesystem work even when a project contains large generated trees.
  while (queue.length > 0 && results.size < maxEntries && visitedRepositories.size < 10000) {
    const current = queue.shift();
    const repositoryKey =
      process.platform === "win32"
        ? current.repository.toLowerCase()
        : current.repository;
    if (visitedRepositories.has(repositoryKey)) continue;
    visitedRepositories.add(repositoryKey);

    let children;
    try {
      children = await fsPromises.readdir(current.repository, { withFileTypes: true });
    } catch {
      continue;
    }
    if (current.prefix && children.some((entry) =>
      entry.name === ".git" && (entry.isDirectory() || entry.isFile())
    ) && !results.has(current.prefix)) {
      results.set(current.prefix, {
        name: path.basename(current.repository),
        relative_path: current.prefix,
        url: "",
        initialized: true,
      });
    }
    // Do not follow symlinks/junctions outside the project or into cycles.
    for (const child of children) {
      if (!child.isDirectory() || child.isSymbolicLink() || skippedDirectories.has(child.name.toLowerCase())) continue;
      if (queue.length + visitedRepositories.size >= 10000) break;
      queue.push({
        repository: path.join(current.repository, child.name),
        prefix: current.prefix ? `${current.prefix}/${child.name}` : child.name,
      });
    }

    let definitions;
    try {
      const content = await fsPromises.readFile(
        path.join(current.repository, ".gitmodules"),
        "utf8"
      );
      definitions = parseGitmodules(content);
    } catch {
      continue;
    }

    for (const definition of definitions) {
      if (results.size >= maxEntries) break;
      const childPath = normalizedRelativePath(definition.path);
      if (!childPath) continue;
      const relativePath = current.prefix
        ? `${current.prefix}/${childPath}`
        : childPath;
      const target = path.resolve(root, ...relativePath.split("/"));
      if (!isInside(root, target)) continue;

      let initialized = false;
      let resolvedTarget = target;
      try {
        resolvedTarget = await fsPromises.realpath(target);
        initialized =
          isInside(root, resolvedTarget) &&
          (await fsPromises.stat(resolvedTarget)).isDirectory() &&
          fs.existsSync(path.join(resolvedTarget, ".git"));
      } catch {
        initialized = false;
      }

      results.set(relativePath, {
        name: definition.name || childPath.split("/").at(-1) || childPath,
        relative_path: relativePath,
        url: definition.url || "",
        initialized,
      });
      if (initialized) {
        queue.push({ repository: resolvedTarget, prefix: relativePath });
      }
    }
  }

  return [...results.values()].sort((left, right) =>
    left.relative_path.localeCompare(right.relative_path)
  );
}
