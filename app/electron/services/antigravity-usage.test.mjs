import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, expect, it } from 'vitest';
import { installAntigravityStatusline, readAntigravityQuota } from './antigravity-usage.mjs';
import { UsageService } from './usage-service.mjs';
const { sanitizeQuota } = createRequire(import.meta.url)('./antigravity-statusline.cjs');
const roots = [];
const root = () => { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-quota-')); roots.push(value); return value; };
afterEach(() => roots.splice(0).forEach(value => fs.rmSync(value, { recursive: true, force: true })));
const payload = { email: 'private@example.test', plan_tier: 'Pro', quota: {
  'gemini-weekly': { remaining_fraction: 0.75, reset_time: '2026-10-01T00:00:00Z' },
  exhausted: { remaining_fraction: 0 }, invalid: { remaining_fraction: null }, bad: { remaining_fraction: 1.5 },
}, transcript_path: 'private', access_token: 'secret' };

it('converts remaining quota without leaking credentials or treating missing quota as zero', () => {
  const file = path.join(root(), 'quota.json');
  const data = sanitizeQuota(payload);
  expect(JSON.stringify(data)).not.toMatch(/private|secret|transcript/);
  fs.writeFileSync(file, JSON.stringify(data));
  const result = readAntigravityQuota(file);
  expect(result.status).toBe('success');
  expect(result.snapshots.map(s => (s.primary ?? s.secondary).usedPercent)).toEqual([25, 100]);
  expect(result.snapshots[0].secondary.resetsAt).toBe(Date.parse('2026-10-01T00:00:00Z') / 1000);
  expect(readAntigravityQuota(file, data.updatedAt + 300001).status).toBe('unavailable');
});

it('preserves custom statusline configuration across repeated installation', () => {
  const directory = root();
  const original = { command: 'echo custom', padding: 2, stack_with_default: true };
  fs.writeFileSync(path.join(directory, 'settings.json'), JSON.stringify({ model: 'test', statusLine: original }));
  installAntigravityStatusline({ directory }); installAntigravityStatusline({ directory });
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'acedia-statusline/original.json')))).toEqual(original);
  const settings = JSON.parse(fs.readFileSync(path.join(directory, 'settings.json')));
  expect(settings.model).toBe('test'); expect(settings.statusLine.padding).toBe(2);
});

it('groups Gemini short and weekly windows without inventing a window for unknown buckets', () => {
  const file = path.join(root(), 'quota.json');
  fs.writeFileSync(file, JSON.stringify(sanitizeQuota({ quota: {
    'gemini-weekly': { remaining_fraction: 0.91 }, 'gemini-5h': { remaining_fraction: 0.48 },
    unknown: { remaining_fraction: 0.5 },
  } })));
  const [gemini, unknown] = readAntigravityQuota(file).snapshots;
  expect(gemini.limitId).toBe('agy:gemini');
  expect(gemini.primary).toMatchObject({ usedPercent: 52, windowMinutes: 300 });
  expect(gemini.secondary.usedPercent).toBeCloseTo(9);
  expect(unknown.primary.windowMinutes).toBeNull();
});

it('rejects malformed settings without overwriting them', () => {
  const directory = root(); const settings = path.join(directory, 'settings.json'); fs.writeFileSync(settings, '{broken');
  expect(() => installAntigravityStatusline({ directory })).toThrow();
  expect(fs.readFileSync(settings, 'utf8')).toBe('{broken');
});

it('imports snapshots on polling, replaces old account buckets and supports hiding the provider', () => {
  const directory = root(); const file = path.join(directory, 'quota.json');
  const service = new UsageService(path.join(directory, 'usage.db'), {}, { antigravityQuotaFile: file });
  try {
    const now = Date.now(); fs.writeFileSync(file, JSON.stringify(sanitizeQuota(payload, now)));
    const first = service.rateLimitSummary();
    expect(first.limits[0].profile.provider).toBe('agy');
    expect(first.limits).toHaveLength(2);
    service.setProfileVisibility('agy:default', true);
    expect(service.rateLimitSummary().profiles[0].visible).toBe(false);
    fs.writeFileSync(file, JSON.stringify(sanitizeQuota({ email: 'next@example.test', quota: {} }, now + 1)));
    expect(service.rateLimitSummary().limits).toHaveLength(0);
    expect(service.rateLimitSummary().profiles[0].refresh.status).toBe('unavailable');
  } finally { service.close(); }
});
