import { open } from 'node:fs/promises';
import path from 'node:path';

const jobIdPattern = /^[0-9a-f]{24}$/;
const activeStatuses = new Set(['queued', 'running']);
const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'interrupted', 'requires_review', 'unsupported']);
const maxReceiptsBytes = 32 * 1024;

export async function extractStudioReceipts(entry, conversationId) {
  if (entry.ssh || !entry.cwd || !conversationId) return [];
  const file = await open(path.join(entry.cwd, '.acedia', 'background-jobs.json'), 'r').catch(() => null);
  if (!file) return [];
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxReceiptsBytes) return [];
    const buffer = Buffer.alloc(maxReceiptsBytes + 1);
    const { bytesRead } = await file.read(buffer);
    if (bytesRead > maxReceiptsBytes) return [];
    const receipts = JSON.parse(buffer.toString('utf8', 0, bytesRead));
    if (!Array.isArray(receipts)) return [];
    return [...new Set(receipts.filter(item => item?.provider === 'extract-studio' && item.sessionId === entry.id
      && item.conversationId === conversationId && typeof item.jobId === 'string' && jobIdPattern.test(item.jobId))
      .map(item => item.jobId))].slice(0, 8);
  } catch { return []; }
  finally { await file.close(); }
}

export async function extractStudioJobStatus(jobId, fetchImpl = fetch) {
  if (!jobIdPattern.test(jobId)) return null;
  try {
    const response = await fetchImpl(`http://127.0.0.1:18820/api/jobs/${jobId}`, {
      redirect: 'error', signal: AbortSignal.timeout(1200),
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 256 * 1024) return null;
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const job = body.job ?? body;
    if (job.id !== jobId) return null;
    if (activeStatuses.has(job.status)) return 'pending';
    if (terminalStatuses.has(job.status)) return job.status === 'succeeded' ? 'done' : 'blocked';
    return null;
  } catch { return null; }
}
