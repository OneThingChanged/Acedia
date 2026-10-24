// Local relay budgets, not provider/model limits. Image-rich history and native
// compaction must fit through the same HTTP and app-server WebSocket paths.
export const CODEX_PAYLOAD_BYTES = 128 * 1024 * 1024;
export const CODEX_BUFFERED_BYTES = 2 * CODEX_PAYLOAD_BYTES;
// Shared HTTP buffer budget, including concatenation and decompression.
// It does not include native CLI processes or the rest of the host heap.
export const CODEX_INFLIGHT_BODY_BYTES = 2 * CODEX_PAYLOAD_BYTES;
export const CODEX_TOOL_UPLOAD_BYTES = 32 * 1024 * 1024;
export const CODEX_FRAME_BYTES = 8 * 1024 * 1024;
