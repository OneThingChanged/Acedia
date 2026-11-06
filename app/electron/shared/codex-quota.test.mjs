import { describe, expect, it } from 'vitest';
import { codexQuotaInfo } from './codex-quota.mjs';

const now = 2_000_000;
const full = { usedPercent: 100, resetsAt: now / 1000 + 60 };

describe('included Codex usage and additional credit eligibility', () => {
  it.each(['primary', 'secondary'])('allows server-authorized credits after the %s window is exhausted', key => {
    for (const credits of [{ hasCredits: true, unlimited: false }, { hasCredits: false, unlimited: true }]) {
      expect(codexQuotaInfo({ rateLimits: { [key]: full, credits } }, now))
        .toEqual({ includedExhausted: true, creditsAvailable: true, creditFallbackAvailable: true });
    }
  });
  it.each([undefined, { hasCredits: false, unlimited: false, balance: '500' },
    { balance: 500 }, { hasCredits: 'true', unlimited: 'true' }])('does not infer authorization from an unconfirmed balance (%j)', credits => {
    expect(codexQuotaInfo({ rateLimits: { primary: full, credits } }, now))
      .toEqual({ includedExhausted: true, creditsAvailable: false, creditFallbackAvailable: false });
  });
  it('handles flattened desktop limits without claiming credit fallback before exhaustion or after reset', () => {
    const limit = { primary: { ...full, usedPercent: 99 }, credits: { hasCredits: true } };
    expect(codexQuotaInfo(limit, now).creditFallbackAvailable).toBe(false);
    expect(codexQuotaInfo({ ...limit, primary: { ...full, resetsAt: now / 1000 } }, now).includedExhausted).toBe(false);
    expect(codexQuotaInfo({ ...limit, primary: { usedPercent: 100 } }, now).creditFallbackAvailable).toBe(true);
    expect(codexQuotaInfo(null, now).includedExhausted).toBe(false);
  });
  it('uses the account-wide codex bucket rather than another model or a legacy fallback', () => {
    const exhausted = { primary: full, credits: { hasCredits: false } };
    const credited = { primary: full, credits: { hasCredits: true } };
    expect(codexQuotaInfo({ rateLimits: credited, rateLimitsByLimitId: { codex: exhausted, model: credited } }, now).creditsAvailable).toBe(false);
    expect(codexQuotaInfo({ rateLimits: exhausted, rateLimitsByLimitId: { codex: credited } }, now).creditFallbackAvailable).toBe(true);
    expect(codexQuotaInfo({ rateLimits: exhausted, rateLimitsByLimitId: { model: credited } }, now).creditsAvailable).toBe(false);
  });
});
