import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveGitExecutable } from "./git-runtime.mjs";
import { gitChanges } from "./git-changes.mjs";
import {
  GIT_COMMAND_TIMEOUT_MS,
  describeGitCommandFailure,
  isGitRepository,
  runGit,
} from "./git-command.mjs";

const cleanup = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of cleanup.splice(0)) {
    if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith("multiagent-git-command-")) throw Error("Unexpected fixture cleanup path");
    await rm(directory, { recursive: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "multiagent-git-command-")); cleanup.push(root);
  const globalConfig = path.join(root, "isolated-global.config");
  await writeFile(globalConfig, "[safe]\n\tdirectory = *\n");
  vi.stubEnv("GIT_CONFIG_GLOBAL", globalConfig);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  const repo = path.join(root, "repository with spaces"); await mkdir(repo);
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(path.join(repo, "tracked.txt"), "original\n");
  await runGit(repo, ["add", "tracked.txt"]);
  await runGit(repo, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--no-gpg-sign", "-m", "fixture"]);
  return { root, repo, globalConfig };
}

describe("git command runner", () => {
  it("uses a bounded 30 second default", () => {
    expect(GIT_COMMAND_TIMEOUT_MS).toBe(30_000);
  });

  it("distinguishes timeout and missing-git failures", () => {
    expect(
      describeGitCommandFailure({ killed: true }, "", 30_000)
    ).toEqual({
      code: "GIT_TIMEOUT",
      message:
        "Git 상태 조회가 30초를 초과했습니다. 잠시 후 새로고침해 주세요.",
    });
    expect(describeGitCommandFailure({ code: "ENOENT" }, "", 30_000)).toEqual({
      code: "GIT_NOT_FOUND",
      message: "Git 실행 파일을 찾을 수 없습니다. Git 설치 경로와 Acedia의 내장 Git을 확인하세요.",
    });
  });

  it("separates real repositories from ordinary folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "multiagent-git-command-"));
    cleanup.push(root);
    expect(await isGitRepository(root)).toBe(false);

    execFileSync(resolveGitExecutable(), ["init", "--quiet"], { cwd: root, windowsHide: true });
    expect(await isGitRepository(root)).toBe(true);
    const expectedRoot = (await realpath(root)).replace(/\\/g, "/");
    expect((await runGit(root, ["rev-parse", "--show-toplevel"])).trim()).toBe(
      expectedRoot
    );
  });

  it("reports oversized results and invalid metadata rather than a non-repository", async () => {
    expect(describeGitCommandFailure({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: true }, "", 30_000).code).toBe("GIT_OUTPUT_TOO_LARGE");
    expect(describeGitCommandFailure({}, "fatal: detected dubious ownership", 30_000).code).toBe("GIT_UNSAFE_REPOSITORY");
    expect(describeGitCommandFailure({}, "fatal: Filename too long", 30_000).code).toBe("GIT_PATH_TOO_LONG");
    const root = await mkdtemp(path.join(os.tmpdir(), "multiagent-git-command-")); cleanup.push(root);
    await writeFile(path.join(root, ".git"), "gitdir: nonexistent-git-directory\n");
    await expect(isGitRepository(root)).rejects.toMatchObject({ code: "GIT_FAILED" });
  });

  it("trusts only the selected worktree without changing global configuration", async () => {
    const { repo, globalConfig } = await fixture();
    const previous = await readFile(globalConfig, "utf8");
    await writeFile(globalConfig, "");
    vi.stubEnv("GIT_TEST_ASSUME_DIFFERENT_OWNER", "1");
    const rawError = (() => {
      try { execFileSync(resolveGitExecutable(), ["-C", repo, "status", "--porcelain"], { windowsHide: true, stdio: "pipe" }); }
      catch (error) { return String(error.stderr); }
      return "";
    })();
    expect(rawError).toContain("dubious ownership");
    await writeFile(globalConfig, previous);
    await writeFile(path.join(repo, "tracked.txt"), "changed\n");
    const result = await gitChanges(repo);
    expect(result.is_repo).toBe(true);
    expect(result.branch).toBe("main");
    expect(result.unstaged).toEqual([{ relative_path: "tracked.txt", status: "M", additions: 1, deletions: 1 }]);
    expect((await runGit(repo, ["config", "--get-all", "safe.directory"])).trim().split(/\r?\n/)).toEqual(["*", "", (await realpath(repo)).replaceAll("\\", "/")]);
    expect(await readFile(globalConfig, "utf8")).toBe(previous);
  });

  it("reads a .git-file worktree and resolves its trust from a project subfolder", async () => {
    const { root, repo } = await fixture();
    const worktree = path.join(root, "separate worktree");
    await runGit(repo, ["worktree", "add", "--quiet", "-b", "worktree-fixture", worktree]);
    expect((await readFile(path.join(worktree, ".git"), "utf8")).startsWith("gitdir:")).toBe(true);
    await mkdir(path.join(worktree, "Source"));
    await writeFile(path.join(worktree, "Source", "new.txt"), "new\n");
    vi.stubEnv("GIT_TEST_ASSUME_DIFFERENT_OWNER", "1");
    const result = await gitChanges(path.join(worktree, "Source"));
    expect(result.is_repo).toBe(true);
    expect(result.branch).toBe("worktree-fixture");
    expect(result.unstaged.some(entry => entry.relative_path === "Source/" || entry.relative_path === "Source/new.txt")).toBe(true);
  });

  it.runIf(process.platform === "win32")("reads long Unreal-style paths when Git is absent from PATH", async () => {
    const { repo } = await fixture();
    vi.stubEnv("PATH", "");
    const relative = Array.from({ length: 7 }, (_, i) => `Unreal_SourceAssets_${i}_long_directory`).join("/");
    await mkdir(path.join(repo, relative), { recursive: true });
    await writeFile(path.join(repo, relative, "asset.json"), "original\n");
    await runGit(repo, ["add", "--", `${relative}/asset.json`]);
    await writeFile(path.join(repo, relative, "asset.json"), "modified\n");
    const result = await gitChanges(repo);
    expect(result.staged.some(entry => entry.relative_path === `${relative}/asset.json`)).toBe(true);
    expect(result.unstaged.some(entry => entry.relative_path === `${relative}/asset.json` && entry.additions === 1)).toBe(true);
    expect((await runGit(repo, ["config", "--get", "core.longpaths"])).trim()).toBe("true");
  });
});
