import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

export const PRODUCT_ID = '9NVBSGNRTPLR';
export const IDENTITY_NAME = 'jintaenate.MultiAgent';
export const PIPELINE_STEPS = ['dependencies', 'tests', 'electron', 'build', 'verify', 'packaged', 'lifecycle', 'wack'];
export const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
export const digest = (value) => createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}

export function versionParts(value) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(value)) throw new Error(`Invalid four-part version: ${value}`);
  const parts = value.split('.').map(Number);
  if (!parts[0] || parts.some((n) => n > 65535)) throw new Error(`Version out of range: ${value}`);
  return parts;
}
export function compareVersions(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return Math.sign(x[i] - y[i]);
  return 0;
}
export function chooseStoreVersion(current, existing = [], requested) {
  const versions = [current, ...existing];
  versions.forEach(versionParts);
  if (requested) {
    if (versionParts(requested)[3] !== 0 || compareVersions(requested, current) < 0 ||
        existing.some((v) => compareVersions(requested, v) <= 0)) {
      throw new Error('Requested Store version must end in .0 and exceed existing Store packages.');
    }
    return requested;
  }
  const parts = versionParts(current);
  const greatest = versions.sort(compareVersions).at(-1);
  if (parts[3] === 0 && existing.every((v) => compareVersions(current, v) > 0)) return current;
  const next = versionParts(greatest); next[3] = 0;
  for (let i = 2; i >= 0; i--) {
    if (next[i] < 65535) { next[i]++; return next.join('.'); }
    next[i] = 0;
  }
  throw new Error('Store version space exhausted.');
}

// Store responses may contain upload SAS URLs or certification download tokens.
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) =>
    [k, /secret|access.?token|refresh.?token|authorization|fileUploadUrl/i.test(k) ? '[REDACTED]' : redact(v)]));
  if (typeof value === 'string') return value.replace(/https?:\/\/[^\s"<>]+/g, (url) => {
    try { const u = new URL(url); if (u.search) u.search = '?REDACTED'; return u.href; } catch { return '[URL]'; }
  });
  return value;
}
export function assertArtifact(metadata, artifact, version, publisher) {
  if (metadata.productId !== PRODUCT_ID || metadata.identityName !== IDENTITY_NAME || metadata.publisher !== publisher ||
      metadata.mode !== 'production' || metadata.signedForDevelopment !== false || metadata.architecture !== 'x64' ||
      metadata.packageVersion !== version || metadata.artifact !== basename(artifact) ||
      basename(artifact) !== `Acedia-Store-Release-${version}-x64.msix` ||
      metadata.size !== statSync(artifact).size || metadata.sha256.toLowerCase() !== sha256(artifact)) {
    throw new Error('Store artifact identity, version, size, signature mode or SHA-256 mismatch.');
  }
}
export function classifyStatus(status) {
  if (status === 'Published') return 'published';
  if (['CommitFailed', 'PreProcessingFailed', 'CertificationFailed', 'ReleaseFailed', 'PublishFailed', 'Canceled'].includes(status)) return 'failed';
  if (status === 'PendingCommit') return 'draft';
  if (['CommitStarted', 'PreProcessing', 'Certification', 'Release', 'Publishing'].includes(status)) return 'processing';
  return 'attention';
}
export function submissionFingerprint(submission) {
  const data = structuredClone(submission);
  for (const key of ['fileUploadUrl', 'status', 'statusDetails', 'friendlyName']) delete data[key];
  // Stable across server JSON key ordering.
  return digest(canonical(data));
}
export function prepareSubmission(base, artifactName, releaseNotes) {
  if (base.status !== 'PendingCommit') throw new Error(`Submission is not editable: ${base.status}`);
  const result = structuredClone(base);
  if (result.visibility !== 'Public') throw new Error('Expected an existing Public Store listing.');
  // Preserve markets, pricing, declarations, age ratings, screenshots and unknown fields.
  result.targetPublishMode = 'Immediate';
  if (result.packageDeliveryOptions?.packageRollout?.isPackageRollout) {
    throw new Error('An active gradual rollout must be resolved before a full release.');
  }
  for (const language of ['ko-kr', 'en-us']) {
    const key = Object.keys(result.listings || {}).find((k) => k.toLowerCase() === language);
    const listing = result.listings?.[key]?.baseListing;
    const notes = releaseNotes[language];
    if (!listing || typeof notes !== 'string' || !notes.trim() || notes.length > 1500) {
      throw new Error(`Missing listing or valid release notes: ${language}`);
    }
    listing.releaseNotes = notes;
  }
  result.applicationPackages = (result.applicationPackages || []).map((p) => ({ ...p, fileStatus: 'PendingDelete' }));
  result.applicationPackages.push({ fileName: artifactName, fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' });
  delete result.fileUploadUrl;
  delete result.statusDetails;
  return result;
}
export function assertSubmission(saved, expected, verifiedTitleAliases = {}) {
  if (saved.id !== expected.id || saved.status !== 'PendingCommit' || saved.visibility !== 'Public' || saved.targetPublishMode !== 'Immediate') {
    throw new Error('Submission identity/status/publication policy changed.');
  }
  const active = saved.applicationPackages.filter((p) => p.fileStatus !== 'PendingDelete');
  const wanted = expected.applicationPackages.find((p) => p.fileStatus === 'PendingUpload');
  if (active.length !== 1 || active[0].fileName !== wanted.fileName || !['PendingUpload', 'Uploaded'].includes(active[0].fileStatus)) {
    throw new Error('Stored package differs from the exact upload artifact.');
  }
  for (const key of Object.keys(expected).filter((k) => !['applicationPackages', 'status', 'statusDetails', 'fileUploadUrl', 'friendlyName'].includes(k))) {
    if (key === 'listings' && Object.keys(verifiedTitleAliases).length) {
      const listings = structuredClone(saved.listings);
      for (const [locale, alias] of Object.entries(verifiedTitleAliases)) {
        const listing = listings?.[locale]?.baseListing;
        if (!listing || expected.listings?.[locale]?.baseListing?.title !== alias.productName ||
            ![alias.productName, alias.apiName].includes(listing.title)) throw new Error('Unverified listing title change.');
        listing.title = alias.productName;
      }
      if (digest(canonical(listings)) !== digest(canonical(expected.listings))) throw new Error('Stored submission field differs: listings');
      continue;
    }
    if (key === 'pricing' && saved.pricing?.priceId === 'Free' && expected.pricing?.priceId === 'Free' &&
        [saved.pricing, expected.pricing].every((p) => Object.values(p.marketSpecificPricings || {}).every((v) => ['Free', 'NotAvailable'].includes(v)))) {
      // The API normalizes this read-only tier-catalog flag on free submissions.
      // Keep every actual price, market, trial and unknown field in the comparison.
      const actualPricing = { ...saved.pricing }, expectedPricing = { ...expected.pricing };
      delete actualPricing.isAdvancedPricingModel; delete expectedPricing.isAdvancedPricingModel;
      if (digest(canonical(actualPricing)) !== digest(canonical(expectedPricing))) throw new Error('Stored submission field differs: pricing');
      continue;
    }
    if (digest(canonical(saved[key])) !== digest(canonical(expected[key]))) throw new Error(`Stored submission field differs: ${key}`);
  }
  if (saved.statusDetails?.errors?.length) throw new Error('Partner Center reports submission errors.');
}
