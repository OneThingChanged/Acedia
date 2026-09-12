import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { it, expect } from 'vitest';
import { fetchAccountQuota } from './quota.mjs';
it('uses only account RPCs and never sends credentials or starts an AI turn', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-quota-rpc-')), sessions = path.join(directory, 'sessions'); fs.mkdirSync(sessions);
  fs.writeFileSync(path.join(directory, 'auth.json'), JSON.stringify({ tokens: { account_id: 'account', id_token: 'header.' + Buffer.from(JSON.stringify({ sub: 'user', email: 'user@example.test' })).toString('base64url') + '.SECRET_SIGNATURE' } }));
  try {
    const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), exitCode: null, kill() { this.exitCode = 0; } }), messages = [];
    child.stdin.on('data', chunk => { const rpc = JSON.parse(String(chunk)); messages.push(rpc); if (!rpc.id) return; const result = rpc.id === 1 ? {} : rpc.id === 2 ? { account: { type: 'chatgpt', email: 'user@example.test' } } : { rateLimits: { primary: { usedPercent: 37, windowDurationMins: 300, resetsAt: 1900000000 }, planType: 'pro' } }; queueMicrotask(() => child.stdout.write(JSON.stringify({ id: rpc.id, result }) + '\n')); });
    const result = await fetchAccountQuota({ path: sessions }, { command: 'fake-codex', start: () => child });
    expect(messages.map(m => m.method)).toEqual(['initialize', 'initialized', 'account/read', 'account/rateLimits/read']);
    expect(result.status).toBe('success'); expect(result.quota.primary.usedPercent).toBe(37); expect(result.identity.email).toBe('user@example.test');
    expect(JSON.stringify(result)).not.toContain('SECRET_SIGNATURE'); expect(JSON.stringify(messages)).not.toContain('SECRET_SIGNATURE'); expect(child.exitCode).toBe(0);
  } finally { if (path.dirname(directory) !== path.resolve(os.tmpdir())) throw Error('Unsafe test directory'); fs.rmSync(directory, { recursive: true, force: true }); }
});
