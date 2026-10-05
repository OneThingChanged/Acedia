import { expect, it } from 'vitest';
import { capacityRetryMessage, type CapacityRetryState } from './capacityRetry';
it('shows a bounded countdown, retry count and final failure in both languages', () => {
  const state: CapacityRetryState = { id: 'a', status: 'scheduled', attempt: 1, maxAttempts: 3, at: 1000, nextRetryAt: 31000 };
  expect(capacityRetryMessage(state, false, 1000)).toContain('30초 후 같은 모델로 재시도 2/3');
  expect(capacityRetryMessage(state, true, 32000)).toContain('retry 2/3 in 0s');
  expect(capacityRetryMessage({ ...state, status: 'failed', attempt: 3, reason: 'exhausted' }, false)).toContain('3회 재시도');
  expect(capacityRetryMessage({ ...state, status: 'failed', attempt: 3, reason: 'exhausted' }, true)).toContain('Automatic retries stopped');
});
