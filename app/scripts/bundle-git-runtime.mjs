import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const cacheDirectory = path.resolve(appDirectory, "..", ".build-tools");
export const GIT_RUNTIME = Object.freeze({
  version: "2.56.0.windows.1",
  archive: "MinGit-2.56.0-64-bit.zip",
  size: 39_602_073,
  sha256: "064b440ff870ed5198527e8f3a92cdf5bd2fd0fedf5e718af95e3fdaddeff718",
  url: "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.1/MinGit-2.56.0-64-bit.zip",
});

export async function verifyGitArchive(archive) {
  if ((await fs.stat(archive)).size !== GIT_RUNTIME.size) throw new Error("MinGit archive size does not match the pinned release.");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest("hex") !== GIT_RUNTIME.sha256) throw new Error("MinGit archive SHA256 does not match the pinned release.");
}

async function obtainArchive(directory) {
  const cached = path.join(cacheDirectory, "mingit.zip");
  try {
    await verifyGitArchive(cached);
    return cached;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const archive = path.join(directory, GIT_RUNTIME.archive);
  const response = await fetch(GIT_RUNTIME.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`MinGit download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: "wx" }));
  await verifyGitArchive(archive);
  // Exclusive copy also protects another builder's verified cache.
  try { await fs.copyFile(archive, cached, 1); } catch (error) { if (error.code !== "EEXIST") throw error; }
  return archive;
}

export async function verifyBundledGit(resourcesDirectory) {
  const directory = path.join(resourcesDirectory, "git");
  const metadata = JSON.parse(await fs.readFile(path.join(directory, "acedia-git-runtime.json"), "utf8"));
  for (const key of Object.keys(GIT_RUNTIME)) {
    if (metadata[key] !== GIT_RUNTIME[key]) throw new Error(`Packaged Git metadata mismatch: ${key}`);
  }
  await fs.access(path.join(directory, "LICENSE.txt"));
  await fs.access(path.join(directory, "ucrt64", "bin", "git-remote-https.exe"));
  const env = { ...process.env, PATH: "" };
  // Windows environment keys are case insensitive, including in child_process.
  for (const key of Object.keys(env)) if (key.toUpperCase() === "PATH") env[key] = "";
  const { stdout } = await execute(path.join(directory, "cmd", "git.exe"), ["--version"], { env, windowsHide: true, timeout: 10_000 });
  if (stdout.trim() !== `git version ${GIT_RUNTIME.version}`) throw new Error(`Unexpected packaged Git version: ${stdout.trim()}`);
}

export default async function bundleGitRuntime(context) {
  if (context.electronPlatformName !== "win32") return;
  // electron-builder's Arch.x64 is 1. Do not ship an x64 runtime for another arch.
  if (context.arch !== 1) throw new Error("The bundled MinGit release currently supports Windows x64 only.");
  const resources = path.join(context.appOutDir, "resources");
  await fs.mkdir(cacheDirectory, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(cacheDirectory, "acedia-git-bundle-"));
  try {
    const archive = await obtainArchive(temporary);
    const extracted = path.join(temporary, "extracted");
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const quote = value => `'${value.replaceAll("'", "''")}'`;
    await execute(powershell, ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)} -ErrorAction Stop`], { windowsHide: true, timeout: 120_000 });
    const destination = path.join(resources, "git");
    if (await fs.stat(destination).catch(error => { if (error.code === "ENOENT") return null; throw error; })) {
      throw new Error("The packaged Git destination already exists. Build into a fresh output directory.");
    }
    await fs.cp(extracted, destination, { recursive: true, force: false, errorOnExist: true });
    await fs.writeFile(path.join(destination, "acedia-git-runtime.json"), `${JSON.stringify(GIT_RUNTIME, null, 2)}\n`, { flag: "wx" });
    await verifyBundledGit(resources);
    console.log(`[git-runtime] packaged MinGit ${GIT_RUNTIME.version} (verified SHA256)`);
  } finally {
    const relative = path.relative(await fs.realpath(cacheDirectory), await fs.realpath(temporary));
    if (!relative.startsWith("acedia-git-bundle-") || relative.includes(path.sep)) throw new Error("Unexpected Git staging cleanup path.");
    await fs.rm(temporary, { recursive: true });
  }
}
