import { gzipSync, zstdCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeCodexRequestBody } from './codex-request-body.mjs';

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
