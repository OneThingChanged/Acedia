#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUsageServer } from './runtime/server.mjs';
import { seal, unseal } from './runtime/credentials.mjs';
import { token } from './runtime/protocol.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const home = path.resolve(option('home', path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')));
const port = Number(option('port', '3007')), host = option('host', '127.0.0.1');
const localTestNoLogin = args.includes('--local-test-no-login');
if (localTestNoLogin && !['127.0.0.1', '::1'].includes(host)) throw Error('Local test mode requires a loopback host');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid port');
fs.mkdirSync(home, { recursive: true, mode: 0o700 });
const keyPath = path.join(home, 'admin.protected');
if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, seal(token()), { mode: 0o600, flag: 'wx' });
const adminToken = process.env.ACEDIA_USAGE_ADMIN_TOKEN || unseal(fs.readFileSync(keyPath, 'utf8'));
const service = createUsageServer({ databasePath: path.join(home, 'server.db'), adminToken, localTestNoLogin, allowLocalAdmin: adminToken === 'admin' && ['127.0.0.1', '::1'].includes(host) });
service.server.on('error', error => { console.error(error.message); process.exitCode = 1; void service.close(); });
service.server.listen(port, host, () => console.log(JSON.stringify({ url: `http://${host}:${port}`, home, pid: process.pid })));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await service.close(); process.exit(0); });
