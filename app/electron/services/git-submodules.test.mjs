import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverGitSubmodules,
  parseGitmodules,
} from "./git-submodules.mjs";

const cleanup = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("parseGitmodules", () => {
  it("parses names, quoted paths and URLs", () => {
    expect(
      parseGitmodules(`
[submodule "Engine"]
  path = Plugins/Engine
  url = https://example.test/engine.git
[submodule "Shared UI"]
  path = "Packages/Shared UI"
  url = ../shared-ui.git
`)
    ).toEqual([
      {
        name: "Engine",
        path: "Plugins/Engine",
        url: "https://example.test/engine.git",
      },
      {
        name: "Shared UI",
        path: "Packages/Shared UI",
        url: "../shared-ui.git",
      },
    ]);
  });
});

describe("discoverGitSubmodules", () => {
  it("finds repositories below a non-Git project, including worktree git files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "multiagent-child-repos-"));
    cleanup.push(root);
    await mkdir(path.join(root, "Plugins", "Environment", ".git"), { recursive: true });
    await mkdir(path.join(root, "Tools", "Worktree"), { recursive: true });
    await writeFile(path.join(root, "Tools", "Worktree", ".git"), "gitdir: /external/worktrees/tool\n");
    await mkdir(path.join(root, "Intermediate", "Generated", ".git"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "Dependency", ".git"), { recursive: true });

    expect((await discoverGitSubmodules(root)).map((entry) => [entry.relative_path, entry.initialized]))
      .toEqual([["Plugins/Environment", true], ["Tools/Worktree", true]]);
    expect(await discoverGitSubmodules(root, 1)).toHaveLength(1);
  });

  it("finds initialized, uninitialized and nested submodules", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "multiagent-submodules-"));
    cleanup.push(root);
    await writeFile(
      path.join(root, ".gitmodules"),
      `[submodule "Core"]\npath = Plugins/Core\nurl = core.git\n` +
        `[submodule "Optional"]\npath = Plugins/Optional\nurl = optional.git\n`
    );
    await mkdir(path.join(root, "Plugins", "Core", ".git"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "Plugins", "Core", ".gitmodules"),
      `[submodule "Nested"]\npath = Vendor/Nested\nurl = nested.git\n`
    );
    await mkdir(
      path.join(root, "Plugins", "Core", "Vendor", "Nested", ".git"),
      { recursive: true }
    );

    expect(await discoverGitSubmodules(root)).toEqual([
      {
        name: "Core",
        relative_path: "Plugins/Core",
        url: "core.git",
        initialized: true,
      },
      {
        name: "Nested",
        relative_path: "Plugins/Core/Vendor/Nested",
        url: "nested.git",
        initialized: true,
      },
      {
        name: "Optional",
        relative_path: "Plugins/Optional",
        url: "optional.git",
        initialized: false,
      },
    ]);
  });
});
