import { mkdtemp, mkdir, writeFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitExecutableCandidates, gitWorktreeRoot, resolveGitExecutable } from "./git-runtime.mjs";

const cleanup = [];
afterEach(async () => {
  for (const directory of cleanup.splice(0)) {
    if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith("acedia-git-runtime-")) throw Error("Unexpected fixture cleanup path");
    await rm(directory, { recursive: true });
  }
});

describe("Git executable resolution", () => {
  const windows = { platform: "win32", resourcesPath: "C:\\App\\resources", appDir: "G:\\Acedia\\source\\app" };
  it("prefers installed Git, including quoted PATH directories with spaces", () => {
    const options = { ...windows, env: { Path: '.;"C:\\Git Tools\\cmd";c:\\git tools\\CMD' } };
    const candidates = gitExecutableCandidates(options);
    expect(candidates.filter(candidate => candidate.toLowerCase() === "c:\\git tools\\cmd\\git.exe")).toHaveLength(1);
    expect(resolveGitExecutable({ ...options, isFile: candidate => /git tools|resources/.test(candidate.toLowerCase()) })).toMatch(/git tools/i);
    expect(candidates.some(candidate => candidate.includes("source\\app\\git.exe"))).toBe(false);
  });
  it("falls back to bundled Git when PATH and standard installations are absent", () => {
    expect(resolveGitExecutable({ ...windows, env: {}, isFile: candidate => candidate === "C:\\App\\resources\\git\\cmd\\git.exe" })).toBe("C:\\App\\resources\\git\\cmd\\git.exe");
    expect(resolveGitExecutable({ ...windows, env: {}, isFile: () => false })).toBeNull();
  });
  it("finds user installations and accepts only absolute overrides", () => {
    const env = { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local", ACEDIA_GIT_EXECUTABLE: "git.exe" };
    expect(gitExecutableCandidates({ ...windows, env })[0]).not.toBe("git.exe");
    expect(resolveGitExecutable({ ...windows, env, isFile: candidate => candidate.includes("tester") })).toBe("C:\\Users\\tester\\AppData\\Local\\Programs\\Git\\cmd\\git.exe");
    expect(gitExecutableCandidates({ ...windows, env: { ACEDIA_GIT_EXECUTABLE: "D:\\Custom Git\\git.exe" } })[0]).toBe("D:\\Custom Git\\git.exe");
  });
  it("resolves Unix Git without Windows fallbacks or relative PATH entries", () => {
    expect(gitExecutableCandidates({ platform: "linux", env: { PATH: ".:/usr/local/bin:/usr/bin" } })).toEqual(["/usr/local/bin/git", "/usr/bin/git"]);
  });
});

it("finds the nearest worktree for .git directories and submodule gitfiles", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "acedia-git-runtime-")); cleanup.push(directory);
  await mkdir(path.join(directory, ".git"));
  const child = path.join(directory, "module");
  await mkdir(path.join(child, "Source"), { recursive: true });
  await writeFile(path.join(child, ".git"), "gitdir: ../.git/modules/module\n");
  expect(gitWorktreeRoot(path.join(child, "Source"))).toBe(await realpath(child));
  expect(gitWorktreeRoot(directory)).toBe(await realpath(directory));
});
