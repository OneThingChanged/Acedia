import { expect, it, vi } from 'vitest';
import { restorePreviousSessions } from './sessionRecovery';

it('claims exact identities before spawning, limits concurrency, and acknowledges each result once', async () => {
  let active = 0, peak = 0;
  const request = vi.fn(async args => args.action === 'claim'
    ? { state: 'launching', resumeSessionId: 'native-' + args.id, poolResumeOwnerId: 'account' } : { state: 'waiting-ready' });
  const spawn = vi.fn(async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return { ok: true }; });
  expect(await restorePreviousSessions('checkpoint', ['leaf-a', 'leaf-b', 'leader'], request, spawn)).toEqual({ requested: 3, attention: 0 });
  expect(peak).toBe(2);
  expect(spawn).toHaveBeenCalledWith('leaf-a', { recovering: true, verifyActive: true, resumeSessionId: 'native-leaf-a', poolResumeOwnerId: 'account' });
  expect(request.mock.calls.filter(([r]) => r.action === 'launched')).toHaveLength(3);
});
it('does not spawn already claimed, active or missing-conversation sessions, and records failed launches', async () => {
  const request = vi.fn(async args => args.action === 'claim'
    ? args.id === 'fail' ? { state: 'launching', resumeSessionId: 'native-fail' }
      : args.id === 'claimed' ? { state: 'launching' } : { state: 'needs-attention' }
    : { state: 'needs-attention' });
  const spawn = vi.fn(async () => ({ ok: false }));
  expect(await restorePreviousSessions('checkpoint', ['claimed', 'missing', 'fail'], request, spawn)).toEqual({ requested: 0, attention: 2 });
  expect(spawn).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith({ action: 'launched', checkpointId: 'checkpoint', id: 'fail', failed: true });
});
it('marks an interrupted launch for review without attempting a second spawn', async () => {
  const request = vi.fn(async args => args.action === 'claim' ? { state: 'launching', resumeSessionId: 'native' } : { state: 'needs-attention' });
  const spawn = vi.fn(async () => { throw Error('launch response lost'); });
  expect(await restorePreviousSessions('checkpoint', ['a'], request, spawn)).toEqual({ requested: 0, attention: 1 });
  expect(spawn).toHaveBeenCalledOnce(); expect(request).toHaveBeenLastCalledWith({ action: 'launched', checkpointId: 'checkpoint', id: 'a', failed: true });
});
it('uses explicit fresh startup only when the host proved the previous session had no conversation or user input', async () => {
  const request = vi.fn(async args => args.action === 'claim' ? { state: 'launching', fresh: true } : { state: 'waiting-ready' });
  const spawn = vi.fn(async () => ({ ok: true }));
  expect(await restorePreviousSessions('checkpoint', ['claude'], request, spawn)).toEqual({ requested: 1, attention: 0 });
  expect(spawn).toHaveBeenCalledExactlyOnceWith('claude', { recovering: true, verifyActive: true, freshSession: true });
});
