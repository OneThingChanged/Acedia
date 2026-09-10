import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoreApi } from './store-submission-api.mjs';
import { chooseStoreVersion, redact, classifyStatus, prepareSubmission, assertSubmission, assertArtifact, sha256, submissionFingerprint, PIPELINE_STEPS } from './store-release-core.mjs';
import { snapshotSource, readJson, run, inside, writeJson } from './store-release-local.mjs';

const base = () => ({ id: '123', status: 'PendingCommit', visibility: 'Public', targetPublishMode: 'Manual',
  fileUploadUrl: 'https://example.blob.core.windows.net/files?sig=private',
  pricing: { priceId: 'Free', marketSpecificPricings: {} }, customFutureField: { keep: true },
  listings: { 'ko-kr': { baseListing: { title: 'Acedia', images: [{ id: 'old-image' }] } }, 'en-us': { baseListing: { title: 'Acedia' } } },
  applicationPackages: [{ id: 'old', fileName: 'old.msix', fileStatus: 'Uploaded', version: '1.8.0.0' }] });
const notes = { 'ko-kr': '언어와 설정 개선', 'en-us': 'Language and settings improvements' };
describe('Store release safety and recovery', () => {
  it('promotes revisions without changing a fresh Store version', () => {
    expect(chooseStoreVersion('1.8.0.3', ['1.8.0.0'])).toBe('1.8.1.0');
    expect(chooseStoreVersion('1.8.1.0', ['1.8.0.0'])).toBe('1.8.1.0');
    expect(chooseStoreVersion('1.8.0.0', ['1.9.0.0'])).toBe('1.9.1.0');
    expect(chooseStoreVersion('1.8.65535.0', ['1.8.65535.0'])).toBe('1.9.0.0');
    expect(() => chooseStoreVersion('1.8.0.0', ['1.8.0.0'], '1.8.0.0')).toThrow();
    expect(() => chooseStoreVersion('1.8.0.0', [], '1.8.0.1')).toThrow();
  });
  it('preserves pricing, images and unknown fields while replacing only packages/notes/publication mode', () => {
    const source = base(), result = prepareSubmission(source, 'new.msix', notes);
    expect(source.applicationPackages[0].fileStatus).toBe('Uploaded');
    expect(result.applicationPackages.map((p) => p.fileStatus)).toEqual(['PendingDelete', 'PendingUpload']);
    expect(result.pricing).toEqual(source.pricing);
    expect(result.customFutureField).toEqual(source.customFutureField);
    expect(result.listings['ko-kr'].baseListing.images).toEqual(source.listings['ko-kr'].baseListing.images);
    expect(result.fileUploadUrl).toBeUndefined();
    expect(result.targetPublishMode).toBe('Immediate');
    expect(() => assertSubmission(result, result)).not.toThrow();
  });
  it('rejects certification, missing translations and changed server payloads', () => {
    expect(() => prepareSubmission({ ...base(), status: 'Certification' }, 'new.msix', notes)).toThrow();
    expect(() => prepareSubmission(base(), 'new.msix', {})).toThrow();
    const wanted = prepareSubmission(base(), 'new.msix', notes);
    const changed = structuredClone(wanted); changed.applicationPackages.push({ fileName: 'wrong.msix' });
    expect(() => assertSubmission(changed, wanted)).toThrow();
    const pricing = structuredClone(wanted); pricing.pricing.priceId = 'Tier2';
    expect(() => assertSubmission(pricing, wanted)).toThrow();
  });
  it('fingerprints metadata independently of transient SAS and JSON property order', () => {
    const a = base(), b = Object.fromEntries(Object.entries(a).reverse()); b.fileUploadUrl = 'new';
    expect(submissionFingerprint(a)).toBe(submissionFingerprint(b));
    b.visibility = 'Private'; expect(submissionFingerprint(a)).not.toBe(submissionFingerprint(b));
  });
  it('limits evidenced title aliases to exact locales/names while rejecting other listing changes', () => {
    const expected = prepareSubmission(base(), 'new.msix', notes), saved = structuredClone(expected);
    saved.listings['en-us'].baseListing.title = 'MultiAgent';
    const aliases = { 'en-us': { productName: 'Acedia', apiName: 'MultiAgent' } };
    expect(() => assertSubmission(saved, expected)).toThrow(/listings/);
    expect(() => assertSubmission(saved, expected, aliases)).not.toThrow();
    saved.listings['en-us'].baseListing.title = 'Unexpected';
    expect(() => assertSubmission(saved, expected, aliases)).toThrow(/title/);
    saved.listings['en-us'].baseListing.title = 'MultiAgent';
    saved.listings['en-us'].baseListing.releaseNotes = 'Changed';
    expect(() => assertSubmission(saved, expected, aliases)).toThrow(/listings/);
  });
  it('accepts only the read-only tier flag normalization for free prices, preserving price and market guards', () => {
    const expected = prepareSubmission(base(), 'new.msix', notes);
    expected.pricing.isAdvancedPricingModel = true;
    expected.pricing.marketSpecificPricings = { LB: 'NotAvailable' };
    const saved = structuredClone(expected); saved.pricing.isAdvancedPricingModel = false;
    expect(() => assertSubmission(saved, expected)).not.toThrow();
    const marketChange = structuredClone(saved); marketChange.pricing.marketSpecificPricings.LB = 'Free';
    expect(() => assertSubmission(marketChange, expected)).toThrow(/pricing/);
    const trialChange = structuredClone(saved); trialChange.pricing.trialPeriod = 'OneDay';
    expect(() => assertSubmission(trialChange, expected)).toThrow(/pricing/);
    expected.pricing.priceId = saved.pricing.priceId = 'Tier2';
    expect(() => assertSubmission(saved, expected)).toThrow(/pricing/);
  });
  it('does not confuse a draft or processing state with publication', () => {
    expect(classifyStatus('PendingCommit')).toBe('draft');
    expect(classifyStatus('Certification')).toBe('processing');
    expect(classifyStatus('CommitFailed')).toBe('failed');
    expect(classifyStatus('Published')).toBe('published');
    expect(classifyStatus('NewUnknownStatus')).toBe('attention');
  });
  it('redacts credentials and SAS query strings from saved diagnostics', () => {
    expect(JSON.stringify(redact({ access_token: 'private', fileUploadUrl: 'private', details: 'see https://host/path?sig=private&sp=w', nested: { clientSecret: 'private' } }))).not.toContain('private');
  });
  it('rejects wrong package hashes and development artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'acedia-store-artifact-'));
    const artifact = join(root, 'Acedia-Store-Release-1.8.1.0-x64.msix'); writeFileSync(artifact, 'package');
    const metadata = { productId: '9NVBSGNRTPLR', identityName: 'jintaenate.MultiAgent', publisher: 'CN=test', mode: 'production',
      signedForDevelopment: false, architecture: 'x64', packageVersion: '1.8.1.0', artifact: 'Acedia-Store-Release-1.8.1.0-x64.msix', size: 7, sha256: sha256(artifact) };
    expect(() => assertArtifact(metadata, artifact, '1.8.1.0', 'CN=test')).not.toThrow();
    expect(() => assertArtifact({ ...metadata, signedForDevelopment: true }, artifact, '1.8.1.0', 'CN=test')).toThrow();
    writeFileSync(artifact, 'changed');
    expect(() => assertArtifact(metadata, artifact, '1.8.1.0', 'CN=test')).toThrow();
  });
});

function fakeApi(fetchImpl) {
  const client = new StoreApi({}, { fetchImpl, sleep: vi.fn(async () => {}) });
  client.accessToken = 'token'; client.expiresAt = Infinity; return client;
}
describe('Store API transport', () => {
  it('retries safe GET throttling but never blindly retries a commit', async () => {
    const transport = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('{"id":"ok"}'));
    expect(await fakeApi(transport).app()).toEqual({ id: 'ok' }); expect(transport).toHaveBeenCalledTimes(2);
    const commit = vi.fn().mockRejectedValue(new Error('network may have delivered request'));
    await expect(fakeApi(commit).commit('123')).rejects.toThrow(/reconcile/); expect(commit).toHaveBeenCalledTimes(1);
  });
  it('never sends bearer credentials to an arbitrary product or blob host', async () => {
    const fetcher = vi.fn(); const client = fakeApi(fetcher);
    await expect(client.request('GET', '/applications/OTHER')).rejects.toThrow();
    await expect(client.upload('https://attacker.test/upload?sig=x', 'unused')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retries blob blocks with the same IDs, and commits the block list without Store authorization', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acedia-store-upload-')); const file = join(root, 'upload.zip'); writeFileSync(file, 'zip');
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementation(async () => new Response('', { status: 201 }));
    await fakeApi(fetcher).upload('https://sample.blob.core.windows.net/file?sig=private', file);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[0][0])).toBe(String(fetcher.mock.calls[1][0]));
    expect(String(fetcher.mock.calls[2][0])).toContain('comp=blocklist');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});

describe('isolated release source', () => {
  it('includes dirty/untracked changes, excludes ignored secrets, and versions only the isolated commit', () => {
    const parent = mkdtempSync(join(tmpdir(), 'acedia-store-snapshot-')), source = join(parent, 'repo'), target = join(parent, 'snapshot');
    mkdirSync(source); mkdirSync(join(source, 'app')); mkdirSync(join(source, 'mobile'));
    writeFileSync(join(source, '.gitignore'), 'ignored.secret\n');
    for (const dir of ['app', 'mobile']) writeFileSync(join(source, dir, 'package.json'), JSON.stringify({ version: '1.8.0', multiAgentReleaseVersion: '1.8.0.0' }));
    writeFileSync(join(source, 'mobile/app.json'), JSON.stringify({ expo: { version: '1.8.0.0', android: { versionCode: 17 } } }));
    run('git', ['init', '--quiet'], source); run('git', ['add', '.'], source);
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'base'], source);
    writeFileSync(join(source, 'change.txt'), 'dirty'); writeFileSync(join(source, 'ignored.secret'), 'secret');
    const siteCommit = run('git', ['rev-parse', 'HEAD'], source);
    run('git', ['update-index', '--add', '--cacheinfo', `160000,${siteCommit},MultiagentSite`], source);
    const result = snapshotSource(source, target, '1.8.1.0');
    expect(readJson(join(source, 'app/package.json')).version).toBe('1.8.0');
    expect(readJson(join(target, 'app/package.json')).version).toBe('1.8.1');
    expect(readJson(join(target, 'mobile/app.json')).expo.android.versionCode).toBe(17);
    expect(result.files.some((f) => f.path === 'ignored.secret')).toBe(false);
    expect(result.files.find((f) => f.path === 'MultiagentSite')).toMatchObject({ gitCommit: siteCommit, excludedFromBuild: true });
    expect(readFileSync(join(target, 'change.txt'), 'utf8')).toBe('dirty');
    expect(run('git', ['status', '--porcelain'], target)).toBe('');
    expect(() => inside(target, '../escape')).toThrow();
  });
});

describe.skipIf(process.platform !== 'win32')('submission orchestration with a simulated Store', () => {
  it('uses required WACK results and records optional failures without accepting stale or empty reports', () => {
    const folder = mkdtempSync(join(tmpdir(), 'acedia-wack-report-'));
    const script = fileURLToPath(new URL('./store-release-windows.ps1', import.meta.url));
    function validate(requiredResult, optionalResult, version = '1.8.1.0') {
      const path = join(folder, 'report.xml');
      writeFileSync(path, `<REPORT OVERALL_RESULT="PASS" PARTIAL_RUN="FALSE" APP_NAME="jintaenate.MultiAgent" APP_VERSION="${version}"><REQUIREMENTS><REQUIREMENT><TEST NAME="Required test" OPTIONAL="FALSE"><RESULT>${requiredResult}</RESULT></TEST><TEST NAME="Blocked executables" OPTIONAL="TRUE"><RESULT>${optionalResult}</RESULT></TEST></REQUIREMENT></REQUIREMENTS></REPORT>`);
      return run('pwsh.exe', ['-NoLogo','-NoProfile','-File',script,'-Action','ValidateWack','-InputPath',path,'-ExpectedVersion','1.8.1.0','-ExpectedIdentity','jintaenate.MultiAgent'], folder);
    }
    expect(validate('PASS', 'FAIL')).toContain('WACK_OPTIONAL_WARNINGS=["Blocked executables"]');
    expect(() => validate('FAIL', 'PASS')).toThrow();
    expect(() => validate('', 'PASS')).toThrow();
    expect(() => validate('PASS', 'PASS', '1.8.0.0')).toThrow();
  });
  async function fixture(mode) {
    const local = mkdtempSync(join(tmpdir(), 'acedia-store-workflow-'));
    vi.resetModules(); vi.stubEnv('LOCALAPPDATA', local);
    const { submitJob, promoteLocalRun, stateRoot } = await import('./release-store.mjs');
    vi.unstubAllEnvs();
    const id = '20260908T000000000Z-12345678', folder = join(stateRoot, 'runs', id), source = join(folder, 'source');
    const output = join(source, 'app/electron-dist/store'); mkdirSync(output, { recursive: true });
    writeFileSync(join(source, '.gitignore'), 'app/electron-dist/\n');
    run('git', ['init', '--quiet'], source); run('git', ['add', '.'], source);
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'release'], source);
    const name = 'Acedia-Store-Release-1.8.1.0-x64.msix', artifact = join(output, name); writeFileSync(artifact, 'package');
    const metadata = { productId: '9NVBSGNRTPLR', identityName: 'jintaenate.MultiAgent', publisher: 'CN=test', mode: 'production',
      signedForDevelopment: false, architecture: 'x64', packageVersion: '1.8.1.0', artifact: name, size: 7, sha256: sha256(artifact) };
    writeJson(join(output, 'Acedia-Store-Release-1.8.1.0-x64.metadata.json'), metadata);
    const wack = join(folder, 'wack.xml'); writeFileSync(wack, 'simulated evidence from the separately tested WACK validation step');
    const state = { id, mode, version: '1.8.1.0', phase: 'wack', publisher: 'CN=test',
      snapshotCommit: run('git', ['rev-parse', 'HEAD'], source), artifactHash: metadata.sha256,
      wackReport: wack, wackReportHash: sha256(wack), wackArtifactHash: metadata.sha256,
      steps: Object.fromEntries(PIPELINE_STEPS.map((s) => [s, { completedAt: '2026-09-08' }])), releaseNotes: notes,
      initialSubmissionId: null, initialSubmissionFingerprint: null };
    let remote = null; const calls = [];
    const client = {
      app: async () => ({ id: '9NVBSGNRTPLR', packageIdentityName: 'jintaenate.MultiAgent' }),
      create: async () => { calls.push('create'); remote = base(); return structuredClone(remote); },
      submission: async () => structuredClone(remote),
      update: async (id, body) => { calls.push('update'); remote = { ...structuredClone(body), fileUploadUrl: base().fileUploadUrl }; return structuredClone(remote); },
      upload: async () => { calls.push('upload'); },
      commit: async () => { calls.push('commit'); remote.status = 'Certification'; },
      status: async () => ({ status: remote.status }),
    };
    return { submitJob, promoteLocalRun, state, client, calls };
  }
  it('uploads after all checks and commits once; repeated calls poll instead of submitting again', async () => {
    const { submitJob, state, client, calls } = await fixture('deploy');
    state.error = 'Previous resolved failure';
    expect((await submitJob(state, client)).phase).toBe('certification');
    expect(state.error).toBeNull();
    expect(calls).toEqual(['create', 'update', 'upload', 'commit']);
    await submitJob(state, client);
    expect(calls).toEqual(['create', 'update', 'upload', 'commit']);
  });
  it('keeps draft-only scope and submits the same uploaded draft without another upload', async () => {
    const { submitJob, state, client, calls } = await fixture('draft');
    expect((await submitJob(state, client)).phase).toBe('draft');
    expect(calls).toEqual(['create', 'update', 'upload']);
    state.mode = 'deploy'; await submitJob(state, client);
    expect(calls).toEqual(['create', 'update', 'upload', 'commit']);
  });
  it('stops before any remote operation if a required check is missing', async () => {
    const { submitJob, state, client, calls } = await fixture('deploy');
    delete state.steps.wack;
    await expect(submitJob(state, client)).rejects.toThrow(/incomplete/);
    expect(calls).toEqual([]);
  });
  it('does not re-send an ambiguous commit when the server still reports PendingCommit', async () => {
    const { submitJob, state, client, calls } = await fixture('deploy');
    client.commit = async () => { calls.push('commit'); throw new Error('connection lost'); };
    await expect(submitJob(state, client)).rejects.toThrow('connection lost');
    await expect(submitJob(state, client)).rejects.toThrow(/uncertain/);
    expect(calls.filter((c) => c === 'commit')).toHaveLength(1);
  });
  it('promotes a completed local build using the same package without rebuilding', async () => {
    const { submitJob, promoteLocalRun, state, client, calls } = await fixture('local');
    await expect(promoteLocalRun(state, client, notes)).rejects.toThrow(/completed local/);
    state.phase = 'local-complete';
    await promoteLocalRun(state, client, notes);
    expect(state.mode).toBe('deploy');
    expect(state.version).toBe('1.8.1.0');
    await submitJob(state, client);
    expect(calls).toEqual(['create', 'update', 'upload', 'commit']);
  });
});
