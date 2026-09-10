import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

// Outside AppData: MSIX must see the same physical files as the EXE.
export function sharedProfileRoot({ home, variant, userDataOverride, localDataOverride }) {
  if (variant === 'company' || userDataOverride || localDataOverride) return null;
  return path.join(home, '.acedia', 'shared-v1');
}

export function discoverLegacyProfiles({ roaming, local }) {
  const candidates = [
    { id: 'exe', profile: path.join(roaming, 'MultiAgent'), local: path.join(local, 'com.jintae.multiagent') },
    { id: 'store', profile: path.join(roaming, 'MultiAgent Store'), local: path.join(local, 'com.jintae.multiagent.store') },
  ];
  const packages = path.join(local, 'Packages');
  if (fs.existsSync(packages)) for (const name of fs.readdirSync(packages)) {
    const cache = path.join(packages, name, 'LocalCache');
    const profile = path.join(cache, 'Roaming', 'MultiAgent Store');
    const localDir = path.join(cache, 'Local', 'com.jintae.multiagent.store');
    if (fs.existsSync(profile) || fs.existsSync(localDir)) {
      candidates.push({ id: `store-${createHash('sha256').update(name).digest('hex').slice(0, 12)}`, profile, local: localDir });
    }
  }
  const seen = new Set();
  return candidates.filter(c => {
    if (!fs.existsSync(c.profile) && !fs.existsSync(c.local)) return false;
    const physical = fs.existsSync(c.profile) ? fs.realpathSync.native(c.profile) : fs.realpathSync.native(c.local);
    if (seen.has(physical.toLowerCase())) return false;
    seen.add(physical.toLowerCase());
    if (fs.existsSync(c.profile)) c.profile = fs.realpathSync.native(c.profile);
    if (fs.existsSync(c.local)) c.local = fs.realpathSync.native(c.local);
    return true;
  });
}

const excluded = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'Crashpad', 'exe-updates',
  'SingletonLock', 'SingletonCookie', 'SingletonSocket']);
function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false,
    filter: file => !excluded.has(path.basename(file)) });
}
function readJson(file) {
  if (!fs.existsSync(file)) return null;
  // Fail closed on damaged data rather than silently migrating an empty list.
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
}
function freshness(c) {
  return Math.max(0, ...['storage-export.json'].map(f => fs.existsSync(path.join(c.local, f)) ? fs.statSync(path.join(c.local, f)).mtimeMs : 0),
    ...['Preferences', 'Local Storage/leveldb'].map(f => fs.existsSync(path.join(c.profile, f)) ? fs.statSync(path.join(c.profile, f)).mtimeMs : 0));
}
function verifyOffline(dir, files = []) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(item.name) || item.isSymbolicLink()) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) verifyOffline(file, files);
    else if (item.name === 'LOCK' || item.name.endsWith('-wal')) {
      files.push(file);
    }
  }
  return files;
}
function assertProfilesOffline(candidates) {
  const files = candidates.flatMap(c => [...(verifyOffline(c.profile) || []), ...(verifyOffline(c.local) || [])]);
  if (!files.length) return;
  if (process.platform !== 'win32') throw new Error('기존 프로필 이전은 Windows에서만 지원합니다.');
  // Node opens with file sharing enabled, so it cannot establish that Chromium
  // has closed these files. An exclusive .NET open detects existing handles.
  const script = '$files = [Console]::In.ReadToEnd() | ConvertFrom-Json; foreach ($file in $files) { try { $handle = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None); $handle.Dispose() } catch { exit 17 } }';
  const result = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', script], { input: JSON.stringify(files), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error('기존 Acedia EXE/Store 앱을 완전히 종료한 뒤 다시 실행하세요. 사용 중이거나 확인할 수 없는 데이터는 이전하지 않습니다.');
}

const entityKeys = ['multiagent.projects.v1', 'multiagent.projectFolders.v1', 'multiagent.agents.v1', 'multiagent.groups.v1', 'multiagent.sshHosts.v1'];
export function initializeSharedProfile(root, candidates) {
  if (fs.existsSync(path.join(root, 'migration.json'))) {
    if (readJson(path.join(root, 'migration.json'))?.version !== 1 || !fs.existsSync(path.join(root, 'profile')) || !fs.existsSync(path.join(root, 'local'))) {
      throw new Error('공유 데이터 이전 기록 또는 저장 폴더가 손상되었습니다.');
    }
    return { migrated: false };
  }
  if (fs.existsSync(root)) throw new Error('공유 데이터 폴더의 이전 완료 기록이 없습니다. 기존 폴더를 확인하세요.');
  const ordered = [...candidates].sort((a, b) => freshness(b) - freshness(a));
  assertProfilesOffline(ordered);
  const staging = `${root}.migrating-${randomUUID()}`;
  fs.mkdirSync(staging, { recursive: true, mode: 0o700 });
  try {
    fs.mkdirSync(path.join(staging, 'profile'), { recursive: true });
    fs.mkdirSync(path.join(staging, 'local'), { recursive: true });
    const primary = ordered[0];
    if (primary) {
      copyTree(primary.profile, path.join(staging, 'profile'));
      copyTree(primary.local, path.join(staging, 'local'));
      // Rebuild the metadata cache against the migrated account homes; its
      // transcript paths may otherwise point into a removable Store container.
      fs.rmSync(path.join(staging, 'profile', 'session-storage-catalog.json'), { force: true });
      const config = readJson(path.join(staging, 'profile', 'conversation-store-config.json'));
      if (config?.customRoot && fs.existsSync(config.customRoot)) {
        const physical = fs.realpathSync.native(config.customRoot);
        const relative = path.relative(fs.realpathSync.native(primary.local), physical);
        config.customRoot = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
          ? path.join(root, 'local', relative) : physical;
        writeJson(path.join(staging, 'profile', 'conversation-store-config.json'), config);
      }
    }
    // Retain complete secondary data, including conflicting settings and archives.
    // Never merge unrelated SQLite databases by copying files over one another.
    for (const c of ordered.slice(1)) {
      copyTree(c.profile, path.join(staging, 'legacy', c.id, 'profile'));
      copyTree(c.local, path.join(staging, 'legacy', c.id, 'local'));
    }
    const entities = Object.fromEntries(entityKeys.map(k => [k, new Map()]));
    const accounts = new Map();
    const sshSecrets = {};
    for (const c of [...ordered].reverse()) {
      Object.assign(sshSecrets, readJson(path.join(c.profile, 'ssh-secrets.electron.json')) || {});
      const snapshot = readJson(path.join(c.local, 'storage-export.json'));
      for (const key of entityKeys) {
        const records = JSON.parse(snapshot?.values?.[key] || '[]');
        if (!Array.isArray(records)) throw new Error('기존 프로젝트/세션 목록 형식이 올바르지 않습니다.');
        for (const record of records) if (typeof record?.id === 'string') entities[key].set(record.id, record);
      }
      const registry = readJson(path.join(c.profile, 'codex-accounts', 'accounts.json')) || [];
      if (!Array.isArray(registry)) throw new Error('기존 계정 목록 형식이 올바르지 않습니다.');
      for (const account of registry) {
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(account?.id || '')) throw new Error('기존 계정 ID가 올바르지 않습니다.');
        accounts.set(account.id, account);
      }
    }
    // Primary wins collisions; secondary account homes are copied only if absent.
    for (const c of ordered) for (const account of readJson(path.join(c.profile, 'codex-accounts', 'accounts.json')) || []) {
      copyTree(path.join(c.profile, 'codex-accounts', account.id), path.join(staging, 'profile', 'codex-accounts', account.id));
    }
    if (accounts.size) writeJson(path.join(staging, 'profile', 'codex-accounts', 'accounts.json'), [...accounts.values()]);
    if (Object.keys(sshSecrets).length) writeJson(path.join(staging, 'profile', 'ssh-secrets.electron.json'), sshSecrets);
    if (ordered.length) writeJson(path.join(staging, 'local', 'storage-export.json'), {
      // v1 intentionally forces the renderer to union its copied localStorage
      // with the other channel's catalog on first render (even with an old marker).
      version: 1, updatedAt: new Date().toISOString(),
      values: Object.fromEntries(entityKeys.map(k => [k, JSON.stringify([...entities[k].values()])])),
    });
    const report = { version: 1, createdAt: new Date().toISOString(), primary: primary?.id || null,
      sources: ordered, retainedSecondaryArchives: ordered.slice(1).map(c => `legacy/${c.id}`) };
    for (const relative of ['local/usage.db', 'local/conversation-store/multiagent-conversations.db']) {
      const file = path.join(staging, relative);
      if (!fs.existsSync(file)) continue;
      const db = new DatabaseSync(file);
      try {
        if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw new Error('복사된 데이터베이스 무결성 검사에 실패했습니다.');
      } finally { db.close(); }
    }
    writeJson(path.join(staging, 'migration.json'), report);
    fs.renameSync(staging, root);
    return { migrated: true, secondaryCount: ordered.length - (primary ? 1 : 0) };
  } catch (error) {
    // Keep a failed staging copy for recovery; originals were never modified.
    throw new Error(`공유 데이터 이전 실패: ${error.message}`, { cause: error });
  }
}

export async function acquireSharedProfileLease(root, activate = () => {}) {
  fs.mkdirSync(path.dirname(root), { recursive: true, mode: 0o700 });
  const physicalRoot = path.join(fs.realpathSync.native(path.dirname(root)), path.basename(root));
  const hash = createHash('sha256').update(physicalRoot.toLowerCase()).digest('hex').slice(0, 32);
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\acedia-shared-${hash}` : path.join(path.dirname(root), `.acedia-${hash}.sock`);
  const server = net.createServer(socket => { socket.on('error', () => {}); socket.end('active'); activate(); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve); });
    return server;
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    await new Promise((resolve, reject) => {
      const socket = net.connect(endpoint);
      socket.setTimeout(3000, () => socket.destroy(new Error('Shared profile owner did not respond.')));
      socket.once('data', () => { socket.destroy(); resolve(); });
      socket.once('error', reject);
    });
    return null;
  }
}
