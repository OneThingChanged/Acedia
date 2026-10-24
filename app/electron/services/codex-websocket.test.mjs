import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { sendCodexJson, sendCodexText } from './codex-websocket.mjs';
import { CODEX_BUFFERED_BYTES, CODEX_PAYLOAD_BYTES, CODEX_FRAME_BYTES } from './codex-transport-limits.mjs';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe('Codex JSON WebSocket transport', () => {
  it('forwards an existing UTF-8 payload as text without copying or reserializing it', () => {
    const socket = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
    const raw = Buffer.from(' { "method": "turn/start", "params": { "text": "한글 🚀" } } ');
    sendCodexText(socket, raw);
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(raw, { binary: false });
    expect(socket.send.mock.calls[0][0]).toBe(raw);
  });
  it('reassembles a fragmented Unicode RPC as one text message and preserves the next RPC', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: CODEX_PAYLOAD_BYTES });
    cleanups.push(() => new Promise(resolve => { for (const socket of server.clients) socket.terminate(); server.close(resolve); }));
    await once(server, 'listening');
    const connected = once(server, 'connection');
    const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
    cleanups.push(() => client.terminate());
    const [peer] = await connected;
    await once(client, 'open');
    // Put a multibyte character across the first frame boundary.
    const prefixBytes = Buffer.byteLength('{"text":"');
    const large = { text: 'A'.repeat(CODEX_FRAME_BYTES - prefixBytes - 1) + '한🚀끝' };
    const messages = [];
    const received = new Promise(resolve => peer.on('message', (data, binary) => {
      messages.push({ data: JSON.parse(data.toString()), binary });
      if (messages.length === 2) resolve();
    }));
    sendCodexJson(client, large);
    sendCodexJson(client, { id: 2, method: 'turn/start' });
    await received;
    expect(messages).toEqual([
      { data: large, binary: false },
      { data: { id: 2, method: 'turn/start' }, binary: false },
    ]);
  });

  it.each([undefined, WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED])('does not queue data for an unavailable socket (%s)', state => {
    const socket = state == null ? undefined : { readyState: state, send: vi.fn(), close: vi.fn() };
    sendCodexJson(socket, { method: 'turn/start' });
    if (socket) {
      expect(socket.send).not.toHaveBeenCalled();
      expect(socket.close).not.toHaveBeenCalled();
    }
  });

  it('closes a saturated socket before enqueueing even one frame', () => {
    const socket = { readyState: WebSocket.OPEN, bufferedAmount: CODEX_BUFFERED_BYTES, send: vi.fn(), close: vi.fn() };
    sendCodexJson(socket, { method: 'turn/start' });
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(1009);
  });

  it('rejects a message exceeding the payload budget even when the socket queue is empty', () => {
    const socket = { readyState: WebSocket.OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
    sendCodexJson(socket, { text: 'A'.repeat(CODEX_PAYLOAD_BYTES) });
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(1009);
  });
});
