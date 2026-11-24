import { mkdir, mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { extractStudioJobStatus, extractStudioReceipts } from './extract-studio-background.mjs';

const jobId = '0123456789abcdef01234567';
const otherJob = '1123456789abcdef01234567';

it('matches receipts to the exact registered session, conversation and supported service', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'acedia-extract-receipt-'));
  const folder = path.join(root, '.acedia');
  const file = path.join(folder, 'background-jobs.json');
  await mkdir(folder);
  try {
    const receipt = { provider: 'extract-studio', sessionId: 'a', conversationId: 'native', jobId };
    await writeFile(file, JSON.stringify([
      receipt, receipt, { ...receipt, sessionId: 'b', jobId: otherJob },
      { ...receipt, conversationId: 'old', jobId: otherJob }, { ...receipt, provider: 'other', jobId: otherJob },
      { ...receipt, jobId: '../jobs/' + otherJob },
    ]));
    expect(await extractStudioReceipts({ id: 'a', cwd: root }, 'native')).toEqual([jobId]);
    expect(await extractStudioReceipts({ id: 'a', cwd: root, ssh: {} }, 'native')).toEqual([]);
  } finally {
    await unlink(file);
    await rmdir(folder);
    await rmdir(root);
  }
});

it('counts pending jobs, clears successes and preserves failure and connection loss as distinct results', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ id: jobId, status: 'running' }))
    .mockResolvedValueOnce(Response.json({ job: { id: jobId, status: 'succeeded' } }))
    .mockResolvedValueOnce(Response.json({ id: jobId, status: 'failed' }))
    .mockResolvedValueOnce(Response.json({ id: otherJob, status: 'succeeded' }))
    .mockRejectedValueOnce(Error('offline'));
  expect(await extractStudioJobStatus(jobId, fetcher)).toBe('pending');
  expect(await extractStudioJobStatus(jobId, fetcher)).toBe('done');
  expect(await extractStudioJobStatus(jobId, fetcher)).toBe('blocked');
  expect(await extractStudioJobStatus(jobId, fetcher)).toBeNull();
  expect(await extractStudioJobStatus(jobId, fetcher)).toBeNull();
  expect(await extractStudioJobStatus('../other', fetcher)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(fetcher).toHaveBeenCalledWith(`http://127.0.0.1:18820/api/jobs/${jobId}`, expect.objectContaining({ redirect: 'error' }));
});
