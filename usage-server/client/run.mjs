import fs from 'node:fs';
import { ensureWatcher } from './runtime/watcher.mjs';
const config = JSON.parse(fs.readFileSync(new URL('./client.json', import.meta.url), 'utf8'));
process.env.ACEDIA_USAGE_ALLOW_LAN_HTTP = config.lan ? '1' : '0';
await ensureWatcher(config.home);
console.log('Usage collector started.');
