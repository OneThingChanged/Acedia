import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { AccountPoolSession } from '../electron/services/account-pool-session.mjs';

// No native CLI, user profile, account or network is used. Keep the regression
// isolated from the running application and below a small JS heap ceiling.
if (!global.gc) {
  execFileSync(process.execPath, ['--expose-gc', '--max-old-space-size=128', fileURLToPath(import.meta.url)], { stdio: 'inherit', timeout: 20_000 });
} else {
  class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0;
    send() {}
    terminate() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
    close() { this.terminate(); }
  }
  const sockets = [], references = [];
  for (let id = 1; id <= 12; id++) {
    const runtime = new AccountPoolSession({ ensureAvailable() {} });
    const client = new Socket(), upstream = new Socket();
    let connected;
    runtime.connect = () => new Promise(resolve => { connected = resolve; });
    const attaching = runtime.attach(client);
    let raw = Buffer.from(JSON.stringify({ id, method: 'turn/start', params: { text: 'A'.repeat(1024 * 1024) } }));
    references.push(new WeakRef(raw));
    const parse = JSON.parse;
    try {
      JSON.parse = (...args) => {
        const value = parse(...args); references.push(new WeakRef(value)); return value;
      };
      client.emit('message', raw);
    } finally { JSON.parse = parse; }
    raw = null;
    connected(upstream); await attaching;
    // Leave the connection open: closing it would conceal a retained queue.
    sockets.push(client, upstream);
  }
  await setImmediate();
  global.gc();
  await setImmediate();
  global.gc();
  const retained = references.filter(ref => ref.deref() !== undefined).length;
  for (const socket of sockets) socket.terminate();
  assert.equal(retained, 0, 'Startup relay payloads remain reachable after being forwarded');
  console.log(JSON.stringify({ check: 'routed startup queue collection', connections: 12, payloadMiB: 12, retained, heapMiB: +(process.memoryUsage().heapUsed / 1024 ** 2).toFixed(1) }));
}
