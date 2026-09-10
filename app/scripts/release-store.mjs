import { createRequire } from 'node:module';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { StoreApi } from './store-submission-api.mjs';
import { PRODUCT_ID, IDENTITY_NAME, PIPELINE_STEPS, chooseStoreVersion, sha256, digest, redact, assertArtifact,
  classifyStatus, prepareSubmission, assertSubmission, submissionFingerprint } from './store-release-core.mjs';
import { run, writeJson, readJson, snapshotSource, npmCli, inside } from './store-release-local.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repo = resolve(scriptDir, '../..');
const appDir = join(repo, 'app');
const require = createRequire(import.meta.url);
const { loadStoreIdentity, findWindowsSdkTool } = require('./store-msix-config.cjs');
export const stateRoot = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'Acedia', 'store-release');
const jobDir = (id) => {
  if (!/^\d{8}T\d{9}Z-[a-f0-9]{8}$/.test(id)) throw new Error('Invalid release run ID.');
  return inside(join(stateRoot, 'runs'), id);
};
const stateFile = (id) => join(jobDir(id), 'state.json');
const loadJob = (id) => readJson(stateFile(id));
const saveJob = (s) => { s.updatedAt = new Date().toISOString(); writeJson(stateFile(s.id), s); };
function credentials() {
  const env = process.env;
  if (env.ACEDIA_STORE_TENANT_ID && env.ACEDIA_STORE_CLIENT_ID && env.ACEDIA_STORE_CLIENT_SECRET) {
    return { tenantId: env.ACEDIA_STORE_TENANT_ID, clientId: env.ACEDIA_STORE_CLIENT_ID, clientSecret: env.ACEDIA_STORE_CLIENT_SECRET };
  }
  const vault = join(stateRoot, 'credentials.xml');
  if (!existsSync(vault)) throw new Error('Store API credentials are not configured. Run app/scripts/setup-store-release.ps1 -ConfigureCredentials.');
  return JSON.parse(run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'ReadCredentials', '-StateRoot', stateRoot], repo));
}
const api = () => new StoreApi(credentials());
async function locked(fn, waitForLock = false) {
  mkdirSync(stateRoot, { recursive: true }); const path = join(stateRoot, 'release.lock');
  let fd;
  for (let i = 0; i < (waitForLock ? 30 : 2); i++) {
    try { fd = openSync(path, 'wx'); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = readJson(path);
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid lock owner.');
        try { process.kill(owner.pid, 0); } catch (probe) {
          if (probe.code === 'ESRCH') { unlinkSync(path); continue; }
        }
      } catch {} // An owner may still be writing its lock. Never remove a live/unknown owner.
      if (waitForLock) await new Promise((done) => setTimeout(done, 1000));
    }
  }
  if (fd === undefined) throw new Error('Another Store operation owns release.lock. Retry after it finishes.');
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  try { return await fn(); } finally { closeSync(fd); unlinkSync(path); }
}
function allJobs() {
  const root = join(stateRoot, 'runs'); if (!existsSync(root)) return [];
  return readdirSync(root).filter((id) => /^\d{8}T\d{9}Z-[a-f0-9]{8}$/.test(id) && existsSync(stateFile(id))).map(loadJob);
}
async function readRemote(client) {
  const app = await client.app();
  if (app.id !== PRODUCT_ID || app.packageIdentityName !== IDENTITY_NAME) throw new Error('Partner Center product identity mismatch.');
  const pendingId = app.pendingApplicationSubmission?.id;
  const publishedId = app.lastPublishedApplicationSubmission?.id;
  const pending = pendingId ? await client.submission(pendingId) : null;
  const published = publishedId ? await client.submission(publishedId) : null;
  return { app, pending, published };
}
async function backupRemote(client) {
  const data = await readRemote(client);
  const folder = join(stateRoot, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  writeJson(join(folder, 'submissions.json'), redact(data));
  // This preserves full metadata references; it is not a binary listing-asset export.
  return { data, path: join(folder, 'submissions.json') };
}
async function doctor(online) {
  const checks = { windows: process.platform === 'win32', node: process.version };
  for (const tool of ['makeappx.exe', 'signtool.exe']) { try { checks[tool] = findWindowsSdkTool(tool); } catch { checks[tool] = false; } }
  try { checks.identity = loadStoreIdentity({ appDir, appVersion: readJson(join(appDir, 'package.json')).version }).productId; } catch { checks.identity = false; }
  checks.wack = existsSync('C:/Program Files (x86)/Windows Kits/10/App Certification Kit/appcert.exe');
  checks.credentialsConfigured = existsSync(join(stateRoot, 'credentials.xml')) || Boolean(process.env.ACEDIA_STORE_CLIENT_SECRET);
  checks.tasks = process.platform === 'win32' ? JSON.parse(run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'TaskStatus'], repo)) : {};
  if (online) {
    try { const { data, path } = await backupRemote(api()); checks.remote = { pendingId: data.pending?.id, status: data.pending?.status, backup: path }; }
    catch (error) { checks.remoteError = error.message; }
  }
  return checks;
}
async function createJob(options, mode) {
  const active = allJobs().find((s) => s.mode !== 'local' && !['failed', 'published', 'abandoned', 'local-complete'].includes(s.phase));
  if (mode !== 'local' && active) return { existingRun: active.id, phase: active.phase, message: 'Use resume/status for the existing release.' };
  if (options.background) ensureBackgroundTasks();
  const notes = options.notes ? readJson(resolve(options.notes)) : null;
  if (mode !== 'local' && (!notes?.['ko-kr']?.trim() || !notes?.['en-us']?.trim())) throw new Error('Provide --notes <JSON> with ko-kr and en-us release notes.');
  let remote = null, backup = null;
  if (mode !== 'local') {
    const result = await backupRemote(api()); remote = result.data; backup = result.path;
    if (remote.pending && classifyStatus(remote.pending.status) !== 'draft') {
      return { existingSubmission: remote.pending.id, status: remote.pending.status, backup, message: 'Existing submission is not editable. No new build or submission was started.' };
    }
  }
  const pkg = readJson(join(appDir, 'package.json'));
  const existing = [remote?.pending, remote?.published].filter(Boolean).flatMap((s) => s.applicationPackages || []).map((p) => p.version).filter(Boolean);
  const version = chooseStoreVersion(pkg.multiAgentReleaseVersion, existing, options.version);
  const manifest = { mode, version, sourceCommit: run('git', ['rev-parse', 'HEAD'], repo), createdAt: new Date().toISOString() };
  const id = `${manifest.createdAt.replace(/[-:.]/g, '')}-${digest(manifest).slice(0, 8)}`;
  const root = jobDir(id); mkdirSync(root, { recursive: true });
  const state = { schemaVersion: 1, id, ...manifest, productId: PRODUCT_ID, phase: 'preparing', steps: {}, releaseNotes: notes,
    backup, initialSubmissionId: remote?.pending?.id || null,
    initialSubmissionFingerprint: remote?.pending ? submissionFingerprint(remote.pending) : null };
  saveJob(state);
  try {
    const snapshot = join(root, 'source');
    const source = snapshotSource(repo, snapshot, version);
    writeJson(join(root, 'source-manifest.json'), source);
    state.sourceHash = source.sourceHash; state.snapshotCommit = source.snapshotCommit;
    const identity = loadStoreIdentity({ appDir, appVersion: pkg.version });
    const rawIdentity = readJson(identity.identityFile); rawIdentity.packageVersion = version;
    writeJson(join(snapshot, 'app/store/store-identity.local.json'), rawIdentity);
    state.publisher = identity.publisher; state.phase = 'queued'; saveJob(state);
  } catch (error) { state.phase = 'failed'; state.error = error.message; saveJob(state); throw error; }
  if (options.background) {
    run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'StartWorker'], repo);
    return { runId: id, version, phase: 'queued', state: stateFile(id) };
  }
  return executeJob(id);
}
function ensureBackgroundTasks() {
  const tasks = JSON.parse(run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'TaskStatus'], repo));
  if (Object.values(tasks).some((s) => !['Ready', 'Running'].includes(s))) throw new Error('Install/enable the Store worker and monitor tasks before --background.');
}
function verifySource(state) {
  const source = join(jobDir(state.id), 'source');
  if (run('git', ['rev-parse', 'HEAD'], source) !== state.snapshotCommit || run('git', ['status', '--porcelain', '--untracked-files=no'], source)) {
    throw new Error('Release source snapshot changed. Create a fresh release run.');
  }
}
function artifactFor(state) {
  const output = join(jobDir(state.id), 'source/app/electron-dist/store');
  const precise = join(output, `Acedia-Store-Release-${state.version}-x64.metadata.json`);
  const metadata = readJson(precise);
  const artifact = inside(output, metadata.artifact);
  assertArtifact(metadata, artifact, state.version, state.publisher);
  if (state.artifactHash && state.artifactHash !== metadata.sha256) throw new Error('The verified artifact was replaced.');
  return { metadata, metadataPath: precise, artifact };
}
function validateEvidence(state) {
  verifySource(state);
  if (!PIPELINE_STEPS.every((s) => state.steps[s]?.completedAt)) throw new Error('Required local checks are incomplete.');
  const result = artifactFor(state);
  if (!state.wackReport || sha256(state.wackReport) !== state.wackReportHash || state.wackArtifactHash !== result.metadata.sha256) {
    throw new Error('WACK report is not bound to this exact package.');
  }
  return result;
}
async function localPipeline(state) {
  const root = jobDir(state.id), sourceApp = join(root, 'source/app');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/SECRET|TOKEN|PASSWORD|ACEDIA_STORE_|MULTIAGENT_STORE_IDENTITY_FILE/i.test(k)));
  const npm = npmCli(appDir);
  const steps = {
    dependencies: ['ci'], tests: ['test'], electron: ['run', 'electron:smoke'], build: ['run', 'release:build:store'],
    verify: ['run', 'release:verify:store'], packaged: ['run', 'electron:store-packaged-smoke'], lifecycle: ['run', 'electron:store-packaged-lifecycle-smoke'],
  };
  for (const name of PIPELINE_STEPS) {
    if (state.steps[name]?.completedAt) continue;
    verifySource(state); state.phase = name; state.error = null; saveJob(state);
    console.log(`[store-release] ${state.id}: ${name}`);
    const log = join(root, `${name}.log`);
    if (name === 'wack') {
      const { metadata, metadataPath } = artifactFor(state);
      const startedAt = Date.now();
      const priorOutput = existsSync(log) ? readFileSync(log, 'utf8') : '';
      const priorReport = priorOutput.split(/\r?\n/).find((line) => line.startsWith('WACK_REPORT='))?.slice(12);
      const outputRoot = join(sourceApp, 'electron-dist/store');
      const reusable = priorReport && dirname(resolve(priorReport)) === resolve(outputRoot) && existsSync(priorReport) &&
        state.artifactHash === metadata.sha256 && statSync(priorReport).mtimeMs >= Date.parse(state.steps.verify.completedAt);
      const output = reusable ? priorOutput : run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(sourceApp, 'scripts/test-electron-store-wack.ps1'), '-MetadataPath', metadataPath], sourceApp, { log, env });
      const report = output.split(/\r?\n/).find((line) => line.startsWith('WACK_REPORT='))?.slice(12);
      if (!report || !existsSync(report) || (!reusable && statSync(report).mtimeMs < startedAt)) throw new Error('WACK did not produce a fresh report.');
      const validation = run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'ValidateWack', '-InputPath', report,
        '-ExpectedVersion', state.version, '-ExpectedIdentity', IDENTITY_NAME], sourceApp, { env });
      const warnings = validation.split(/\r?\n/).find((line) => line.startsWith('WACK_OPTIONAL_WARNINGS='));
      state.wackOptionalWarnings = warnings ? JSON.parse(warnings.slice('WACK_OPTIONAL_WARNINGS='.length)) : [];
      state.wackReport = report; state.wackReportHash = sha256(report); state.wackArtifactHash = metadata.sha256;
    } else run(process.execPath, [npm, ...steps[name]], sourceApp, { log, env: { ...env, npm_execpath: npm } });
    verifySource(state);
    if (name === 'verify') { const { metadata } = artifactFor(state); state.artifactHash = metadata.sha256; }
    state.steps[name] = { completedAt: new Date().toISOString(), log }; saveJob(state);
  }
}
async function pollJob(state, client) {
  const result = await client.status(state.submissionId);
  state.remoteStatus = result.status; state.remoteDetails = redact(result.statusDetails);
  const kind = classifyStatus(result.status);
  if (['published', 'processing', 'draft'].includes(kind)) state.error = null;
  state.phase = kind === 'published' ? 'published' : kind === 'failed' ? 'failed' : kind === 'draft' ? 'draft' : kind === 'attention' ? 'attention' : 'certification';
  state.lastPolledAt = new Date().toISOString();
  if (kind === 'published') {
    const published = await client.submission(state.submissionId);
    const matches = published.applicationPackages?.filter((p) => p.fileStatus !== 'PendingDelete' && p.version === state.version && String(p.architecture).toLowerCase() === 'x64');
    if (matches?.length !== 1) { state.phase = 'attention'; state.error = 'Published package version/architecture differs from release.'; }
    state.installVerification = 'pending'; // Publication is not an install/update smoke test.
  }
  saveJob(state); return { runId: state.id, phase: state.phase, version: state.version, submissionId: state.submissionId, status: result.status, state: stateFile(state.id) };
}
export async function submitJob(state, client) {
  const root = jobDir(state.id);
  const { artifact, metadata } = validateEvidence(state);
  const checkSubmission = (saved, expected) => {
    const evidence = state.portalTitleEvidence;
    if (evidence && (evidence.submissionId !== state.submissionId || evidence.requestHash !== state.requestHash ||
        evidence.artifactHash !== metadata.sha256 || !evidence.verifiedAt ||
        Object.values(evidence.aliases || {}).some((entry) => entry.productName !== metadata.displayName ||
          !entry.apiName || !entry.screenshot || sha256(inside(root, entry.screenshot)) !== entry.screenshotHash))) {
      throw new Error('Portal title evidence does not match this exact submission, request and package.');
    }
    assertSubmission(saved, expected, evidence?.aliases);
  };
  let remote;
  if (state.submissionId) {
    remote = await client.submission(state.submissionId);
    if (remote.status !== 'PendingCommit') return pollJob(state, client);
    if (state.commitAttemptedAt) throw new Error('A commit result is uncertain and still PendingCommit. Check Partner Center before clearing commitAttemptedAt; no automatic repeat.');
  } else {
    const current = await readRemote(client);
    if (current.pending) {
      if (current.pending.id !== state.initialSubmissionId || submissionFingerprint(current.pending) !== state.initialSubmissionFingerprint || current.pending.status !== 'PendingCommit') {
        throw new Error('Partner Center pending submission changed since preparation; no overwrite performed.');
      }
      remote = current.pending;
    } else {
      if (state.initialSubmissionId) throw new Error('The original pending submission disappeared; reconcile before continuing.');
      if (state.createAttemptedAt) throw new Error('Submission creation result is uncertain; reconcile before creating another submission.');
      const versions = (current.published?.applicationPackages || []).map((p) => p.version).filter(Boolean);
      chooseStoreVersion(state.version, versions, state.version);
      state.createAttemptedAt = new Date().toISOString(); saveJob(state);
      remote = await client.create();
    }
    state.submissionId = remote.id;
    state.baseFingerprint = submissionFingerprint(remote);
    writeJson(join(root, 'submission-before.json'), redact(remote)); saveJob(state);
  }
  let expected;
  const expectedFile = join(root, 'submission-request.json');
  if (existsSync(expectedFile)) {
    expected = readJson(expectedFile);
    if (state.requestHash !== sha256(expectedFile)) throw new Error('Submission request file changed.');
    // A successful PUT whose response was lost can be reconciled by its saved content.
    if (submissionFingerprint(remote) !== state.baseFingerprint) checkSubmission(remote, expected);
  } else {
    if (submissionFingerprint(remote) !== state.baseFingerprint) throw new Error('Remote draft changed before update.');
    expected = prepareSubmission(remote, metadata.artifact, state.releaseNotes);
    writeJson(expectedFile, expected); state.requestHash = sha256(expectedFile); saveJob(state);
  }
  const zip = join(root, 'upload.zip');
  if (existsSync(zip) && state.zipHash && sha256(zip) !== state.zipHash) throw new Error('Release ZIP changed after creation.');
  if (existsSync(zip) && !state.zipHash) unlinkSync(zip); // Only this job-owned incomplete archive.
  if (!existsSync(zip)) {
    run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'ZipPackage', '-InputPath', artifact, '-OutputPath', zip], repo);
    state.zipHash = sha256(zip); saveJob(state);
  }
  if (!state.uploadedAt) {
    const updated = await client.update(state.submissionId, expected);
    const stored = await client.submission(state.submissionId); checkSubmission(stored, expected);
    state.phase = 'uploading'; saveJob(state);
    await client.upload(updated?.fileUploadUrl || stored.fileUploadUrl || remote.fileUploadUrl, zip);
  } else if (state.uploadHash !== sha256(zip)) throw new Error('Previously uploaded archive changed.');
  // API package validation is asynchronous after commit, not equivalent to Portal's Validated label.
  const check = await client.submission(state.submissionId); checkSubmission(check, expected);
  writeJson(join(root, 'submission-after.json'), redact(check));
  state.uploadHash = sha256(zip); state.uploadedAt = new Date().toISOString(); state.phase = 'draft'; saveJob(state);
  if (state.mode === 'draft') return { runId: state.id, phase: 'draft', submissionId: state.submissionId, state: stateFile(state.id) };
  validateEvidence(state);
  state.commitAttemptedAt = new Date().toISOString(); saveJob(state);
  await client.commit(state.submissionId);
  state.phase = 'certification'; saveJob(state);
  return pollJob(state, client);
}
export async function promoteLocalRun(state, client, notes) {
  if (state.mode !== 'local' || state.phase !== 'local-complete') throw new Error('Only a completed local release can be promoted.');
  validateEvidence(state);
  for (const locale of ['ko-kr', 'en-us']) {
    if (typeof notes?.[locale] !== 'string' || !notes[locale].trim() || notes[locale].length > 1500) throw new Error(`Missing valid release notes: ${locale}`);
  }
  const { data, path } = await backupRemote(client);
  if (data.pending && classifyStatus(data.pending.status) !== 'draft') throw new Error(`Existing Store submission is ${data.pending.status}; no replacement performed.`);
  const versions = [data.pending, data.published].filter(Boolean).flatMap((s) => s.applicationPackages || []).map((p) => p.version).filter(Boolean);
  chooseStoreVersion(state.version, versions, state.version);
  state.mode = 'deploy'; state.releaseNotes = notes; state.backup = path;
  state.initialSubmissionId = data.pending?.id || null;
  state.initialSubmissionFingerprint = data.pending ? submissionFingerprint(data.pending) : null;
  state.phase = 'ready-to-submit'; saveJob(state);
  return state;
}
async function executeJob(id) {
  const state = loadJob(id);
  try {
    if (state.phase === 'preparing') throw new Error('Incomplete source snapshot; create a new release run.');
    if (state.phase === 'published') return { runId: id, phase: 'published', version: state.version };
    if (state.submissionId && state.commitAttemptedAt) {
      const client = api(); const result = await pollJob(state, client);
      if (result.status === 'PendingCommit') throw new Error('Previous commit outcome is uncertain; no automatic repeat.');
      return result;
    }
    await localPipeline(state); validateEvidence(state);
    if (state.mode === 'local') { state.phase = 'local-complete'; saveJob(state); return { runId: id, phase: state.phase, version: state.version, artifact: artifactFor(state).artifact }; }
    return await submitJob(state, api());
  } catch (error) { state.error = String(redact(error.message)); state.failedAt = new Date().toISOString(); state.phase = 'failed'; saveJob(state); throw error; }
}
async function monitor() {
  const jobs = allJobs().filter((s) => s.submissionId && s.commitAttemptedAt && !['published', 'abandoned'].includes(s.phase));
  if (!jobs.length) return { monitored: 0 };
  const client = api(), result = [];
  for (const state of jobs) {
    try { result.push(await pollJob(state, client)); }
    catch (error) { state.pollError = String(redact(error.message)); saveJob(state); result.push({ runId: state.id, error: state.pollError }); }
  }
  return result;
}
export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    notes: { type: 'string' }, version: { type: 'string' }, run: { type: 'string' }, online: { type: 'boolean' }, background: { type: 'boolean' }, help: { type: 'boolean' }, submit: { type: 'boolean' },
  } });
  const command = positionals[0] || 'help';
  if (values.help || command === 'help') return { commands: ['doctor [--online]', 'backup', 'local [--version X.Y.Z.0] [--background]',
    'deploy --notes notes.json [--background]', 'draft --notes notes.json [--background]', 'resume --run ID [--submit] [--background]', 'status [--run ID]', 'worker', 'monitor'],
    note: 'deploy authorizes certification and immediate publication. local/draft never commit a submission.' };
  if (command === 'doctor') return doctor(values.online);
  if (command === 'backup') return { backup: (await backupRemote(api())).path };
  if (command === 'status' && !values.run) {
    const remote = await readRemote(api()); return { pendingId: remote.pending?.id, status: remote.pending?.status,
      publishedId: remote.published?.id, runs: allJobs().map((s) => ({ id: s.id, version: s.version, phase: s.phase })) };
  }
  return locked(async () => {
    if (command === 'status') { const state = loadJob(values.run); return state.submissionId ? pollJob(state, api()) : redact(state); }
    if (command === 'monitor') return monitor();
    if (command === 'worker') {
      const queue = allJobs().filter((s) => ['queued', 'ready-to-submit', 'uploading', ...PIPELINE_STEPS].includes(s.phase)); const results = [];
      for (const state of queue) { try { results.push(await executeJob(state.id)); } catch (error) { results.push({ runId: state.id, error: error.message }); } }
      return results;
    }
    if (command === 'resume') {
      if (values.background) ensureBackgroundTasks();
      if (values.submit) {
        const state = loadJob(values.run);
        if (state.mode === 'local') {
          if (!values.notes) throw new Error('Promoting a local build requires --notes <JSON>.');
          await promoteLocalRun(state, api(), readJson(resolve(values.notes)));
        } else {
          if (state.mode !== 'draft' || state.phase !== 'draft') throw new Error('--submit requires a completed draft or local run.');
          state.mode = 'deploy'; saveJob(state);
        }
      }
      if (values.background) {
        const state = loadJob(values.run);
        if (['published', 'preparing', 'local-complete'].includes(state.phase)) throw new Error('This run cannot be queued for resume.');
        state.phase = 'queued'; saveJob(state);
        run('pwsh.exe', ['-NoLogo', '-NoProfile', '-File', join(scriptDir, 'store-release-windows.ps1'), '-Action', 'StartWorker'], repo);
        return { runId: state.id, phase: state.phase };
      }
      return executeJob(values.run);
    }
    if (['deploy', 'draft', 'local'].includes(command)) return createJob(values, command);
    throw new Error(`Unknown command: ${command}`);
  }, command === 'worker');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => console.log(JSON.stringify(redact(result), null, 2))).catch((error) => { console.error(`[store-release] ${redact(error.message)}`); process.exitCode = 1; });
}
