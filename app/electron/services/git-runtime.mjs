import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../../", import.meta.url));

export function gitExecutableCandidates({
  platform = process.platform, env = process.env, resourcesPath = process.resourcesPath,
  appDir = appDirectory,
} = {}) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const candidates = [];
  const add = value => { if (value && paths.isAbsolute(value)) candidates.push(paths.normalize(value)); };
  add(env.ACEDIA_GIT_EXECUTABLE);
  const searchPath = env.PATH ?? env.Path ?? "";
  for (const entry of searchPath.split(platform === "win32" ? ";" : ":")) {
    const directory = entry.trim().replace(/^"|"$/g, "");
    // A project-local executable must not shadow the app's Git installation.
    if (directory && paths.isAbsolute(directory)) add(paths.join(directory, platform === "win32" ? "git.exe" : "git"));
  }
  if (platform === "win32") {
    for (const directory of [env.ProgramFiles || "C:\\Program Files", env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"]) {
      add(paths.join(directory, "Git", "cmd", "git.exe"));
    }
    if (env.LOCALAPPDATA) add(paths.join(env.LOCALAPPDATA, "Programs", "Git", "cmd", "git.exe"));
    if (resourcesPath) add(paths.join(resourcesPath, "git", "cmd", "git.exe"));
    add(paths.resolve(appDir, "..", ".build-tools", "mingit", "cmd", "git.exe"));
  }
  return [...new Map(candidates.map(candidate => [platform === "win32" ? candidate.toLowerCase() : candidate, candidate])).values()];
}

export function resolveGitExecutable(options = {}) {
  const isFile = options.isFile || (candidate => {
    try { return fs.statSync(candidate).isFile(); } catch { return false; }
  });
  return gitExecutableCandidates(options).find(isFile) || null;
}

export function gitWorktreeRoot(folder) {
  let current = fs.realpathSync(folder);
  while (true) {
    try {
      const metadata = fs.statSync(path.join(current, ".git"));
      if (metadata.isDirectory() || metadata.isFile()) return current;
    } catch { /* Git reports inaccessible or invalid metadata itself. */ }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
