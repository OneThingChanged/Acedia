import WebSocket from 'ws';
import { CODEX_PAYLOAD_BYTES, CODEX_BUFFERED_BYTES, CODEX_FRAME_BYTES } from './codex-transport-limits.mjs';

// One logical JSON RPC can span several frames. Bound UTF-8 bytes before
// enqueueing any frame, preserving text-message semantics even when a frame
// boundary falls inside a Unicode character.
export function sendCodexJson(socket, message) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const data = JSON.stringify(message);
  const bytes = Buffer.byteLength(data);
  if (bytes > CODEX_PAYLOAD_BYTES || socket.bufferedAmount + bytes > CODEX_BUFFERED_BYTES) {
    socket.close(1009);
    return;
  }
  if (bytes <= CODEX_FRAME_BYTES) {
    socket.send(data);
    return;
  }
  const buffer = Buffer.from(data);
  for (let offset = 0; offset < buffer.length; offset += CODEX_FRAME_BYTES) {
    socket.send(buffer.subarray(offset, offset + CODEX_FRAME_BYTES), {
      binary: false, fin: offset + CODEX_FRAME_BYTES >= buffer.length,
    });
  }
}
