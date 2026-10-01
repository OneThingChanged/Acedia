import { describe, expect, it } from 'vitest';
import { quotaPresentation, recordedTokens, requestStatus } from './account-pool.js';

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
  it('does not turn invalid or absent token values into a measured zero', () => {
    expect(recordedTokens({ usageReported: true })).toBeNull();
    expect(recordedTokens({ usageReported: true, inputTokens: -1, outputTokens: 3 })).toBeNull();
    expect(recordedTokens({ usageReported: true, inputTokens: 12, outputTokens: NaN })).toBeNull();
    expect(recordedTokens({ usageReported: true, inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 })).toBeNull();
    expect(recordedTokens({ usageReported: false, inputTokens: 12, outputTokens: 3 })).toBeNull();
  });
  it('keeps historical disconnects distinct from newly confirmed interruptions', () => {
    expect(requestStatus({ status: 'cancelled', httpStatus: 200 })).toBe('연결 종료 (완료 여부 미확인)');
    expect(requestStatus({ status: 'cancelled', completionObserved: false })).toBe('완료 전 연결 종료');
    expect(requestStatus({ status: 'completed', completionObserved: true })).toBe('완료');
    expect(requestStatus({ status: 'failed' })).toBe('실패');
  });
});
