import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gitChanges } from "../electron/services/git-changes.mjs";
import { runGit } from "../electron/services/git-command.mjs";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function exercise() {
  const waitFor = async (predicate, message) => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw Error(message);
  };
  const check = (value, message) => { if (!value) throw Error(message); };
  const refresh = () => document.querySelector('.scm-retry, [title="Git 상태 새로고침"]').click();
  const names = () => [...document.querySelectorAll('.scm-name')].map(node => node.textContent);
  await waitFor(() => document.querySelector('[title="Source Control"]'), "File panel did not mount");
  document.querySelector('[title="Source Control"]').click();
  await waitFor(() => document.querySelector('.scm-load-error'), "Failed Git query was hidden");
  await new Promise(resolve => setTimeout(resolve, 5200));
  check(document.querySelector('.scm-load-error')?.textContent.includes('Git 조회 실패 검증'), "Error disappeared after five seconds");
  check(!document.querySelector('.scm-retry').disabled, "Retry did not recover after failure");
  window.fixtureSetMode('success'); refresh();
  await waitFor(() => names().includes('tracked.txt') && names().includes('new.txt'), "Retry did not display production Git changes");
  check(!document.querySelector('.scm-load-error'), "Successful retry kept the old error");
  document.querySelector('.scm-row input').click();
  window.fixtureSetMode('slow'); refresh();
  await waitFor(() => window.fixturePending, "Slow query did not start");
  window.fixtureSetMode('success'); window.fixtureSelect(1);
  await waitFor(() => document.querySelector('.file-tree-project-name').textContent === 'Second repository', "Project switch did not apply");
  check(names().length === 0, "Old project rows survived project switching");
  window.fixtureRelease();
  await waitFor(() => names().includes('second.txt'), "New project's query was lost");
  check(!names().includes('tracked.txt'), "Old query overwrote the current project");
  check(!document.querySelector('.scm-row-selected'), "Selections leaked into the new repository");
  window.fixtureSetMode('stale-error'); refresh();
  await waitFor(() => window.fixturePending, "Stale error query did not start");
  window.fixtureSetMode('success'); window.fixtureSelect(0); window.fixtureRelease();
  await waitFor(() => names().includes('tracked.txt'), "Current project did not reload after stale error");
  check(!document.querySelector('.scm-load-error'), "Previous repository error overwrote current state");
  window.fixtureSetMode('error'); refresh();
  await waitFor(() => document.querySelector('.scm-load-error'), "Refresh error was hidden behind old rows");
  window.fixtureSetMode('slow'); refresh();
  await waitFor(() => window.fixturePending && document.querySelector('.scm-retry')?.disabled, "Retry was enabled while a query was running");
  window.fixtureSetMode('success'); window.fixtureRelease();
  await waitFor(() => names().includes('tracked.txt'), "Slow retry did not complete");
  const projectA = window.fixtureProjects.findIndex(project => project.name === 'ProjectA');
  if (projectA >= 0) {
    window.fixtureSelect(projectA);
    await waitFor(() => document.querySelector('.file-tree-project-name').textContent === 'ProjectA' && names().length > 0, "Real ProjectA changes were not displayed");
    check(document.querySelector('.scm-branch')?.textContent.includes('main'), "ProjectA branch was missing");
    console.log('PROJECT_A_GIT_ROWS_OK ' + names().length);
  }
  return 'ACEDIA_GIT_PANEL_ERROR_RETRY_AND_PROJECT_SWITCH_OK';
}

if (process.versions.electron) {
  const { app, BrowserWindow, ipcMain } = require("electron");
  const directory = process.env.ACEDIA_GIT_PANEL_DIRECTORY;
  app.setPath("userData", path.join(directory, "profile"));
  app.whenReady().then(async () => {
    try {
      const projects = JSON.parse(await fs.readFile(path.join(directory, "projects.json"), "utf8"));
      ipcMain.handle("git-panel-fixture", async (_, command, args) => {
        if (!projects.some(project => project.folder === args?.folder)) throw Error("Unknown fixture folder");
        if (command === "git_changes") return gitChanges(args.folder);
        if (command === "git_status") return { is_repo: true, entries: [] };
        if (command === "list_git_submodules" || command === "list_directory") return [];
        throw Error("Unexpected fixture command: " + command);
      });
      const win = new BrowserWindow({ show: false, width: 900, height: 760, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: false, preload: path.join(directory, "preload.cjs") } });
      const errors = [];
      win.webContents.on("console-message", event => {
        if (event.level === "error") errors.push(event.message);
        if (event.message.startsWith("PROJECT_A_GIT_ROWS_OK")) console.log(event.message);
      });
      await win.loadFile(path.join(directory, "index.html"));
      console.log(await win.webContents.executeJavaScript(`(${exercise.toString()})()`));
      assert.deepEqual(errors, []);
      if (process.env.ACEDIA_GIT_PANEL_SCREENSHOT) {
        await pause(200);
        await fs.writeFile(process.env.ACEDIA_GIT_PANEL_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
      }
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
} else {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-git-panel-"));
  try {
    const repos = [path.join(directory, "first"), path.join(directory, "second")];
    for (const repo of repos) await fs.mkdir(repo);
    for (const [i, repo] of repos.entries()) {
      await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
      const name = i ? "second.txt" : "tracked.txt";
      await fs.writeFile(path.join(repo, name), "original\n");
      await runGit(repo, ["add", "--", name]);
      await runGit(repo, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--no-gpg-sign", "-m", "fixture"]);
      await fs.writeFile(path.join(repo, name), "changed\n");
    }
    await fs.writeFile(path.join(repos[0], "new.txt"), "untracked\n");
    const projects = repos.map((folder, i) => ({ id: `fixture-${i}`, name: i ? "Second repository" : "First repository", folder, createdAt: 1 }));
    if (process.env.ACEDIA_GIT_PROJECT_SMOKE) projects.push({ id: "project-a", name: "ProjectA", folder: process.env.ACEDIA_GIT_PROJECT_SMOKE, createdAt: 1 });
    await fs.writeFile(path.join(directory, "projects.json"), JSON.stringify(projects));
    await fs.writeFile(path.join(directory, "preload.cjs"), `const { ipcRenderer } = require('electron'); window.fixtureProjects = ${JSON.stringify(projects)}; window.multiAgentElectron = { invoke: (command, args) => ipcRenderer.invoke('git-panel-fixture', command, args), onEvent: () => () => {} };`);
    const { build } = await import("esbuild");
    await build({ entryPoints: [path.join(root, "scripts/fixtures/git-panel-renderer.tsx")], bundle: true, jsx: "automatic", define: { "import.meta.env": "{}" }, outfile: path.join(directory, "renderer.js") });
    await fs.writeFile(path.join(directory, "index.html"), '<meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><div id="root"></div><script src="renderer.js"></script>');
    const env = { ...process.env, ACEDIA_GIT_PANEL_DIRECTORY: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(require("electron"), [fileURLToPath(import.meta.url)], { cwd: root, env, windowsHide: true, stdio: "inherit" });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 45_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); code === 0 && !timedOut ? resolve() : reject(Error(`Git panel smoke failed: ${timedOut ? "timeout" : code}`)); });
    });
  } finally {
    if (path.dirname(directory) !== os.tmpdir() || !path.basename(directory).startsWith("acedia-git-panel-")) throw Error("Unexpected fixture cleanup path");
    await fs.rm(directory, { recursive: true });
  }
}
