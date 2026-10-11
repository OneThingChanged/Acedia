import { promisify } from 'node:util';
import { gunzip, zstdDecompress } from 'node:zlib';
import { CODEX_PAYLOAD_BYTES } from './codex-transport-limits.mjs';

const decoders = { gzip: promisify(gunzip), zstd: promisify(zstdDecompress) };
const failure = (message, status) => Object.assign(new Error(message), { status });
const tooLarge = () => failure('이미지가 누적되어 대화 요청이 128 MiB 제한을 넘었습니다. 최근 첨부를 줄이거나 대화 맥락을 정리한 뒤 다시 시도하세요.', 413);

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
