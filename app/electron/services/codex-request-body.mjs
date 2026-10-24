import { promisify } from 'node:util';
import { gunzip, zstdDecompress } from 'node:zlib';
import { CODEX_PAYLOAD_BYTES, CODEX_INFLIGHT_BODY_BYTES } from './codex-transport-limits.mjs';

const decoders = { gzip: promisify(gunzip), zstd: promisify(zstdDecompress) };
const failure = (message, status) => Object.assign(new Error(message), { status });
const tooLarge = () => failure('이미지가 누적되어 대화 요청이 128 MiB 제한을 넘었습니다. 최근 첨부를 줄이거나 대화 맥락을 정리한 뒤 다시 시도하세요.', 413);

export class CodexRequestBodyBudget {
  constructor(limit = CODEX_INFLIGHT_BODY_BYTES) {
    this.limit = limit; this.used = 0;
  }
  acquire() {
    let held = 0;
    return {
      grow: bytes => {
        if (this.used + bytes > this.limit) throw failure('동시 대화 요청의 메모리 한도에 도달했습니다. 진행 중인 요청이 끝난 뒤 다시 시도하세요.', 503);
        held += bytes; this.used += bytes;
      },
      shrink: bytes => { held -= bytes; this.used -= bytes; },
      release: () => { this.used -= held; held = 0; },
    };
  }
}

// Reserve before allocating. Do not queue whole requests while waiting for
// space: a temporary 503 leaves account ownership and credentials unchanged.
export async function readCodexRequestBody(req, { budget, maxBytes = CODEX_PAYLOAD_BYTES, decode = true, signal } = {}) {
  const lease = budget.acquire();
  const chunks = []; let size = 0;
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      signal?.throwIfAborted();
      size += chunk.length;
      if (size > maxBytes) throw decode ? tooLarge() : failure('도구 업로드가 32 MiB 제한을 넘었습니다.', 413);
      lease.grow(chunk.length); chunks.push(chunk);
    }
    signal?.throwIfAborted();
    lease.grow(size);
    let body = Buffer.concat(chunks, size);
    chunks.length = 0; lease.shrink(size);
    const encoding = req.headers['content-encoding'];
    if (decode && encoding && encoding !== 'identity') {
      // Expanded size is unknown until the worker finishes. Reserve its maximum
      // first so simultaneous compressed requests cannot all inflate at once.
      lease.grow(maxBytes);
      body = await decodeCodexRequestBody(body, encoding, maxBytes);
      lease.shrink(size + maxBytes - body.length);
    }
    signal?.throwIfAborted();
    return { body, release: lease.release };
  } catch (error) { lease.release(); req.resume(); throw error; }
  finally { chunks.length = 0; }
}

export async function decodeCodexRequestBody(body, encoding, maxBytes = CODEX_PAYLOAD_BYTES) {
  if (body.length > maxBytes) throw tooLarge();
  if (!encoding || encoding === 'identity') return body;
  if (!Object.hasOwn(decoders, encoding)) throw failure('지원하지 않는 요청 압축 방식입니다.', 415);
  try {
    // Keep decompression off Electron's main thread and cap expanded data too.
    return await decoders[encoding](body, { maxOutputLength: maxBytes });
  } catch (error) {
    if (error.code === 'ERR_BUFFER_TOO_LARGE') throw tooLarge();
    throw failure('압축 요청이 손상되어 처리할 수 없습니다.', 415);
  }
}
