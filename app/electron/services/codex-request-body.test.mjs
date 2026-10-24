import { gzipSync, zstdCompressSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CodexRequestBodyBudget, decodeCodexRequestBody, readCodexRequestBody } from './codex-request-body.mjs';

const request = (chunks, encoding) => Object.assign(Readable.from(chunks), { headers: { 'content-encoding': encoding } });

describe('shared routed request buffers', () => {
  it('rejects a competing body before copying it and admits it after the first releases', async () => {
    const budget = new CodexRequestBodyBudget(100);
    const first = await readCodexRequestBody(request([Buffer.alloc(40)]), { budget, maxBytes: 100 });
    await expect(readCodexRequestBody(request([Buffer.alloc(40)]), { budget, maxBytes: 100 })).rejects.toMatchObject({ status: 503 });
    expect(budget.used).toBe(40);
    first.release(); first.release();
    const next = await readCodexRequestBody(request([Buffer.alloc(40)]), { budget, maxBytes: 100 });
    next.release(); expect(budget.used).toBe(0);
  });
  it.each(['gzip', 'zstd'])('accounts for expanded %s data and recovers reservations after decode failure', async encoding => {
    const budget = new CodexRequestBodyBudget(2048), body = Buffer.from('A'.repeat(800));
    const compress = encoding === 'gzip' ? gzipSync : zstdCompressSync;
    const result = await readCodexRequestBody(request([compress(body)], encoding), { budget, maxBytes: 1024 });
    expect(result.body).toEqual(body); expect(budget.used).toBe(body.length);
    await expect(readCodexRequestBody(request([compress(body)], encoding), { budget, maxBytes: 2048 })).rejects.toMatchObject({ status: 503 });
    expect(budget.used).toBe(800); result.release();
    await expect(readCodexRequestBody(request([Buffer.from('damaged')], encoding), { budget, maxBytes: 1024 })).rejects.toMatchObject({ status: 415 });
    expect(budget.used).toBe(0);
  });
  it('releases partial reads, oversized input and cancellation without destroying the error response channel', async () => {
    const budget = new CodexRequestBodyBudget(100);
    const oversized = request([Buffer.alloc(30), Buffer.alloc(30)]);
    await expect(readCodexRequestBody(oversized, { budget, maxBytes: 40 })).rejects.toMatchObject({ status: 413 });
    expect(oversized.destroyed).toBe(false); expect(budget.used).toBe(0);
    const failed = Object.assign(Readable.from((async function* () { yield Buffer.alloc(10); throw new Error('disconnected'); })()), { headers: {} });
    await expect(readCodexRequestBody(failed, { budget })).rejects.toThrow('disconnected');
    expect(budget.used).toBe(0);
    await expect(readCodexRequestBody(request([Buffer.alloc(10)]), { budget, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(budget.used).toBe(0);
  });
  it('keeps native tool uploads byte-identical without decompressing them', async () => {
    const budget = new CodexRequestBodyBudget(100), body = Buffer.from([0, 255, 12, 44]);
    const result = await readCodexRequestBody(request([body], 'gzip'), { budget, decode: false });
    expect(result.body).toEqual(body); result.release(); expect(budget.used).toBe(0);
  });
});

describe('Codex request decompression', () => {
  it.each(['gzip', 'zstd'])('distinguishes expanded size overflow from damaged %s data', async encoding => {
    const compress = encoding === 'gzip' ? gzipSync : zstdCompressSync;
    const body = Buffer.from('{"input":[]}' + ' '.repeat(1024));
    const wire = compress(body);
    expect(await decodeCodexRequestBody(wire, encoding, body.length)).toEqual(body);
    await expect(decodeCodexRequestBody(wire, encoding, body.length - 1)).rejects.toMatchObject({ status: 413 });
    await expect(decodeCodexRequestBody(Buffer.from('damaged data'), encoding)).rejects.toMatchObject({ status: 415 });
  });
  it('rejects oversized uncompressed data and unknown encodings without guessing a decoder', async () => {
    await expect(decodeCodexRequestBody(Buffer.alloc(100), 'identity', 99)).rejects.toMatchObject({ status: 413 });
    await expect(decodeCodexRequestBody(Buffer.from('{}'), 'constructor')).rejects.toMatchObject({ status: 415 });
  });
});
