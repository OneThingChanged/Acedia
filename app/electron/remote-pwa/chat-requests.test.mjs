import { expect, it, vi } from 'vitest';
import { createChatRequests } from './chat-requests.js';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

it('retains a slow response while repeated state polls share its request', async () => {
  const requests = createChatRequests(), gate = deferred();
  const read = vi.fn(() => gate.promise);
  const first = requests.run('a', {}, read);
  expect(requests.run('a', {}, read)).toBe(first);
  await Promise.resolve(); expect(read).toHaveBeenCalledTimes(1);
  gate.resolve('latest text'); expect(await first).toBe('latest text'); requests.cancel();
});
it('aborts a previous session and never queues its refresh after switching', async () => {
  const requests = createChatRequests(), gate = deferred(); let signal;
  const read = vi.fn((_options, value) => { signal = value; return gate.promise; });
  const old = requests.run('a', {}, read); await Promise.resolve();
  requests.run('a', { latest: true }, read);
  await requests.run('b', {}, async () => 'b');
  expect(signal.aborted).toBe(true); gate.resolve('a'); await old;
  expect(read).toHaveBeenCalledTimes(1); requests.cancel();
});
it('coalesces an explicit latest/file refresh into one follow-up', async () => {
  const requests = createChatRequests(), gate = deferred();
  const read = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue('updated');
  const first = requests.run('a', {}, read);
  requests.run('a', { latest: true }, read); requests.run('a', { refreshFiles: true }, read);
  gate.resolve('initial'); await first; await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls[1][0]).toEqual({ latest: true, refreshFiles: true }); requests.cancel();
});
it('keeps older-page reads separate and releases failed or timed-out requests', async () => {
  vi.useFakeTimers();
  try {
    const requests = createChatRequests({ timeoutMs: 100 }), gate = deferred(); let signal;
    const current = requests.run('a', {}, (_o, s) => { signal = s; return gate.promise; });
    await requests.run('a', { prepend: true }, async () => 'older');
    await vi.advanceTimersByTimeAsync(101); expect(signal.aborted).toBe(true);
    gate.resolve(null); await current;
    await expect(requests.run('a', {}, async () => { throw Error('offline'); })).rejects.toThrow('offline');
    expect(await requests.run('a', {}, async () => 'retry')).toBe('retry'); requests.cancel();
  } finally { vi.useRealTimers(); }
});
