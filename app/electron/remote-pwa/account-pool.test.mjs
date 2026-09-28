import { describe, expect, it } from 'vitest';
import { quotaPresentation, recordedTokens } from './account-pool.js';

describe('Remote account quota labels', () => {
  it('shows a recently checked percentage as remaining quota', () => {
    const now = Date.now();
    expect(quotaPresentation({ usedPercent: 93, resetsAt: Math.floor((now + 3600_000) / 1000) }, now - 30_000, now))
      .toEqual({ state: 'current', remaining: 7 });
  });
  it('does not present an expired reset as a current zero or seven percent balance', () => {
    const now = Date.now();
    expect(quotaPresentation({ usedPercent: 100, resetsAt: Math.floor((now - 1000) / 1000) }, now - 86_400_000, now).state).toBe('expired');
    expect(quotaPresentation({ usedPercent: 93, resetsAt: Math.floor((now + 3600_000) / 1000) }, now - 86_400_000, now))
      .toEqual({ state: 'stale', remaining: 7 });
  });
});

describe('Routed request token availability', () => {
  it('distinguishes missing usage from an actual measured zero', () => {
    expect(recordedTokens({ inputTokens: 0, outputTokens: 0 })).toBeNull();
    expect(recordedTokens({ usageReported: false, inputTokens: 0, outputTokens: 0 })).toBeNull();
    expect(recordedTokens({ usageReported: true, inputTokens: 0, outputTokens: 0 })).toBe(0);
    expect(recordedTokens({ inputTokens: 12, outputTokens: 3 })).toBe(15);
  });
});
