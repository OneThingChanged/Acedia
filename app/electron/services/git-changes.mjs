import fs from "node:fs";
import { isGitRepository, runGit } from "./git-command.mjs";

export function gitLetterFromCode(code) {
  if (code === "A") return "A";
  if (code === "D") return "D";
  if (code === "R" || code === "C") return "R";
  return "M";
}

// Parse `status --porcelain -z` into separate staged (index) and unstaged
// (worktree) entry lists. A file with "MM" appears in both.
export function parseGitStatusZ(stdout) {
  const staged = [];
  const unstaged = [];
  const tokens = stdout.split("\0");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== " ") continue;
    const x = token[0];
    const y = token[1];
    const relative = token.slice(3).replace(/\\/g, "/");
    if (x === "R" || x === "C") i += 1; // skip original-path token
    if (x === "?" && y === "?") {
      unstaged.push({ relative_path: relative, status: "U" });
      continue;
    }
    if (x !== " " && x !== "?") {
      staged.push({ relative_path: relative, status: gitLetterFromCode(x) });
    }
    if (y !== " ") {
      unstaged.push({ relative_path: relative, status: gitLetterFromCode(y) });
    }
    if (staged.length + unstaged.length >= 2000) break;
  }
  return { staged, unstaged };
}

function parseNumstat(stdout) {
  const stats = new Map();
  for (const line of stdout.split("\n")) {
    const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!match) continue;
    // Binary files report "-"; rename lines keep git's "old => new" form and
    // simply won't match a plain path lookup — acceptable for stats.
    stats.set(match[3].replace(/\\/g, "/"), {
      additions: match[1] === "-" ? 0 : Number(match[1]),
      deletions: match[2] === "-" ? 0 : Number(match[2]),
    });
  }
  return stats;
}

export async function gitChanges(folder) {
  const root = fs.realpathSync(typeof folder === "string" ? folder : "");
  if (!(await isGitRepository(root))) {
    return {
      is_repo: false,
      branch: "",
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      commits: [],
    };
  }
  const statusOut = await runGit(root, ["status", "--porcelain", "-z"]);
  const { staged, unstaged } = parseGitStatusZ(statusOut);

  const [stagedStatsOut, unstagedStatsOut, branchOut, logOut] =
    await Promise.all([
      runGit(root, ["diff", "--numstat", "--cached"]).catch(() => ""),
      runGit(root, ["diff", "--numstat"]).catch(() => ""),
      runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => ""),
      runGit(root, ["log", "-n", "8", "--pretty=format:%h%x00%s"]).catch(
        () => ""
      ),
    ]);
  const stagedStats = parseNumstat(stagedStatsOut);
  const unstagedStats = parseNumstat(unstagedStatsOut);
  const attach = (entries, stats) =>
    entries.map((entry) => ({
      ...entry,
      additions: stats.get(entry.relative_path)?.additions ?? 0,
      deletions: stats.get(entry.relative_path)?.deletions ?? 0,
    }));

  let upstream = null;
  let ahead = 0;
  let behind = 0;
  try {
    upstream = (
      await runGit(root, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ])
    ).trim();
    const counts = (
      await runGit(root, ["rev-list", "--left-right", "--count", "@{u}...HEAD"])
    )
      .trim()
      .split(/\s+/);
    behind = Number(counts[0]) || 0;
    ahead = Number(counts[1]) || 0;
  } catch {
    upstream = null;
  }

  const commits = [];
  for (const line of logOut.split("\n")) {
    const sep = line.indexOf("\0");
    if (sep <= 0) continue;
    commits.push({ hash: line.slice(0, sep), subject: line.slice(sep + 1) });
  }

  return {
    is_repo: true,
    branch: branchOut.trim(),
    upstream,
    ahead,
    behind,
    staged: attach(staged, stagedStats),
    unstaged: attach(unstaged, unstagedStats),
    commits,
  };
}
