import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isIP } from 'node:net';
import { hash, text } from './protocol.mjs';

export function deviceMetadata() {
  const username = os.userInfo().username;
  return { hostname: os.hostname(), windowsUser: process.platform === 'win32' && process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${username}` : username,
    localIps: [...new Set(Object.values(os.networkInterfaces()).flat().filter(n => n && !n.internal && n.family === 'IPv4').map(n => n.address))].sort().slice(0, 16) };
}
export function validateDevice(value) {
  if (!value || Object.keys(value).some(k => !['hostname', 'windowsUser', 'localIps'].includes(k))) throw Error('Invalid device metadata');
  if (!Array.isArray(value.localIps) || value.localIps.length > 16 || value.localIps.some(ip => typeof ip !== 'string' || !isIP(ip))) throw Error('Invalid local IP');
  return { hostname: text(value.hostname, 'hostname'), windowsUser: text(value.windowsUser, 'Windows user'), localIps: [...new Set(value.localIps)] };
}
export function validateIdentity(value) {
  if (value == null) return null;
  if (Object.keys(value).some(k => !['id', 'email'].includes(k)) || !/^[a-f0-9]{64}$/.test(value.id)) throw Error('Invalid provider identity');
  return { id: value.id, email: value.email == null ? null : text(value.email, 'account email', 256) };
}
export function loginIdentity(transcriptRoot) {
  try {
    if (path.basename(transcriptRoot).toLowerCase() !== 'sessions') return null;
    const auth = JSON.parse(fs.readFileSync(path.join(path.dirname(transcriptRoot), 'auth.json'), 'utf8'));
    const payload = JSON.parse(Buffer.from(auth.tokens?.id_token?.split('.')[1] || '', 'base64url').toString('utf8'));
    const claims = payload['https://api.openai.com/auth'] || {};
    const account = auth.tokens?.account_id || claims.chatgpt_account_id, user = claims.chatgpt_user_id || payload.sub;
    if (!account || !user) return null;
    return validateIdentity({ id: hash(`codex:${account}:${user}`), email: payload.email || null });
  } catch { return null; }
}
export function validateQuota(value) {
  if (value == null) return null;
  if (Object.keys(value).some(k => !['primary', 'secondary', 'plan', 'updatedAt'].includes(k))) throw Error('Invalid quota');
  if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0 || value.updatedAt > Date.now() + 300000) throw Error('Invalid quota time');
  const window = w => {
    if (w == null) return null;
    if (Object.keys(w).some(k => !['usedPercent', 'windowMinutes', 'resetsAt'].includes(k)) || !Number.isFinite(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100) throw Error('Invalid quota window');
    for (const k of ['windowMinutes', 'resetsAt']) if (w[k] !== null && (!Number.isSafeInteger(w[k]) || w[k] < 0)) throw Error('Invalid quota window');
    return { usedPercent: w.usedPercent, windowMinutes: w.windowMinutes, resetsAt: w.resetsAt };
  };
  return { primary: window(value.primary), secondary: window(value.secondary), plan: value.plan == null ? null : text(value.plan, 'plan'), updatedAt: value.updatedAt };
}
