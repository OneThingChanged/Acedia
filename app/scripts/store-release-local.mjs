import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { digest, sha256 } from './store-release-core.mjs';

export function run(command, args, cwd, { log, env, input } = {}) {
  const childEnv = { ...(env || process.env) };
  if (command === 'git') for (const key of Object.keys(childEnv)) if (key.startsWith('GIT_')) delete childEnv[key];
  const result = spawnSync(command, args, { cwd, env: childEnv, input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (log) writeFileSync(log, `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.error || result.status !== 0) throw new Error(`${command.split(/[\\/]/).at(-1)} failed (${result.status ?? 'launch'}). ${log ? `See ${log}` : 'Check tool installation and arguments.'}`);
  return (result.stdout || '').trim();
}
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`); renameSync(temp, file);
}
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
export function inside(root, path) {
  const target = resolve(root, path), rel = relative(resolve(root), target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Path must be below the release directory: ${path}`);
  return target;
}
export function sourceManifest(repo) {
  const paths = run('git', ['-c', 'core.quotepath=false', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], repo).split('\0').filter(Boolean);
  const gitlinks = new Map(run('git', ['ls-files', '--stage', '-z'], repo).split('\0').filter(Boolean)
    .map((line) => line.match(/^160000 ([a-f0-9]+) 0\t(.+)$/s)).filter(Boolean).map((match) => [match[2], match[1]]));
  const result = [];
  for (const path of [...new Set(paths)].sort()) {
    if (gitlinks.has(path)) {
      if (path !== 'MultiagentSite') throw new Error(`Unclassified build submodule: ${path}`);
      result.push({ path, kind: 'external-site-submodule', gitCommit: gitlinks.get(path), excludedFromBuild: true });
      continue;
    }
    const full = inside(repo, path);
    if (!existsSync(full)) continue; // Recorded deletion is represented by absence.
    if (!lstatSync(full).isFile()) throw new Error(`Release source must be a regular file: ${path}`);
    if (!path.endsWith('/.env.example') && /(^|\/)(\.env(?:\..*)?|credentials[^/]*|service-account[^/]*)$|\.(pfx|p12|key|keystore)$/i.test(path)) {
      throw new Error(`Credential-like file found in release source: ${path}`);
    }
    result.push({ path, sha256: sha256(full) });
  }
  return result;
}
export function snapshotSource(repo, destination, version) {
  const before = sourceManifest(repo);
  mkdirSync(destination, { recursive: true });
  for (const entry of before) {
    if (entry.excludedFromBuild) continue;
    const target = inside(destination, entry.path); mkdirSync(dirname(target), { recursive: true });
    copyFileSync(inside(repo, entry.path), target);
    if (sha256(target) !== entry.sha256) throw new Error('Source changed during snapshot; create a new release run.');
  }
  if (digest(sourceManifest(repo)) !== digest(before)) throw new Error('Source changed during snapshot; create a new release run.');
  const semver = version.split('.').slice(0, 3).join('.');
  for (const folder of ['app', 'mobile']) {
    const manifest = join(destination, folder, 'package.json');
    const data = readJson(manifest); data.version = semver; data.multiAgentReleaseVersion = version;
    if (data.build?.nsis) {
      data.build.nsis.artifactName = `Acedia-Setup-${version}-${'${arch}'}.${'${ext}'}`;
      data.build.nsis.uninstallDisplayName = `Acedia ${version}`;
    }
    writeJson(manifest, data);
    const lock = join(destination, folder, 'package-lock.json');
    if (existsSync(lock)) {
      const data = readJson(lock); data.version = semver;
      if (data.packages?.['']) data.packages[''].version = semver;
      writeJson(lock, data);
    }
  }
  const mobile = join(destination, 'mobile', 'app.json');
  const app = readJson(mobile); app.expo.version = version; writeJson(mobile, app);
  // A local, isolated source commit includes the version transformation. Never commits the user's worktree.
  run('git', ['init', '--quiet'], destination);
  run('git', ['add', '--all'], destination);
  run('git', ['-c', 'user.name=Acedia Release Automation', '-c', 'user.email=release@acedia.invalid', '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '-m', `Store release snapshot ${version}`], destination);
  return { sourceHash: digest(before), files: before, snapshotCommit: run('git', ['rev-parse', 'HEAD'], destination) };
}
export function npmCli(appDir) {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  const nextToNode = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(nextToNode)) return nextToNode;
  try { return createRequire(join(appDir, 'package.json')).resolve('npm/bin/npm-cli.js'); } catch {}
  throw new Error('npm CLI not found. Run through npm run release:store.');
}
