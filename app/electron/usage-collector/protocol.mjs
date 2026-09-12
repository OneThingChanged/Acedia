import crypto from 'node:crypto';
import { validateDevice, validateIdentity } from './metadata.mjs';
export const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const token = () => crypto.randomBytes(32).toString('base64url');
export const CAPABILITIES = Object.freeze({
  codex_cli: { collection: 'local-transcript', available: true },
  claude_code_cli: { collection: 'local-transcript', available: true },
  codex_app: { collection: 'local-transcript-if-explicitly-mapped', available: false },
  chatgpt_chat: { collection: null, available: false, reason: 'No verified host-wide token telemetry API. MCP provides collected-usage queries only.' },
  claude_chat: { collection: null, available: false, reason: 'No verified host-wide token telemetry API. MCP provides collected-usage queries only.' },
});
export function text(value, name, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw Error(`Invalid ${name}`);
  return value.trim();
}
export function serverUrl(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Use a server origin without credentials, path or query');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw Error('HTTPS required outside loopback');
  return url.origin;
}
export function validateEvent(value) {
  const keys = ['id', 'provider', 'accountId', 'sessionId', 'model', 'occurredAt', 'input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'total', 'sender', 'providerIdentity', 'effort', 'fast', 'skills', 'turnId', 'parentSessionId', 'agentKind'];
  if (!value || typeof value !== 'object' || Object.keys(value).some(key => !keys.includes(key))) throw Error('Unexpected event field');
  const result = { id: text(value.id, 'event id'), provider: text(value.provider, 'provider'), accountId: text(value.accountId, 'account'),
    sessionId: text(value.sessionId, 'session', 128), model: value.model == null ? null : text(value.model, 'model'), occurredAt: value.occurredAt };
  if (!['codex', 'claude'].includes(result.provider)) throw Error('Unsupported provider');
  if (!Number.isSafeInteger(value.occurredAt) || value.occurredAt < 0 || value.occurredAt > Date.now() + 300000) throw Error('Invalid event time');
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'total']) {
    const n = value[key];
    if (n !== null && (!Number.isSafeInteger(n) || n < 0 || n > 1e12)) throw Error(`Invalid token count: ${key}`);
    result[key] = n;
  }
  for (const key of ['turnId', 'parentSessionId']) result[key] = value[key] == null ? null : text(value[key], key, 128);
  if (value.agentKind != null && !['main', 'subagent'].includes(value.agentKind)) throw Error('Invalid agent kind');
  result.agentKind = value.agentKind ?? null;
  result.effort = value.effort == null ? null : text(value.effort, 'effort', 40);
  if (value.fast != null && typeof value.fast !== 'boolean') throw Error('Invalid fast value');
  result.fast = value.fast ?? null;
  if (value.skills !== undefined && (!Array.isArray(value.skills) || value.skills.length > 100)) throw Error('Invalid skills');
  result.skills = (value.skills || []).map(s => {
    if (!s || Object.keys(s).some(k => !['id','name','occurredAt','evidence'].includes(k)) || s.evidence !== 'skill_read_request') throw Error('Invalid skill observation');
    if (!Number.isSafeInteger(s.occurredAt) || s.occurredAt < 0 || s.occurredAt > value.occurredAt) throw Error('Invalid skill time');
    return { id: text(s.id, 'skill id'), name: text(s.name, 'skill name'), occurredAt: s.occurredAt, evidence: s.evidence };
  });
  if (result.total === null) throw Error('Total tokens required');
  if (value.sender !== undefined) result.sender = validateDevice(value.sender);
  if (value.providerIdentity !== undefined) result.providerIdentity = validateIdentity(value.providerIdentity);
  return result;
}
export async function request(origin, route, { credential, body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(serverUrl(origin) + route, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { ...(credential ? { authorization: `Bearer ${credential}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  if (!response.ok) throw Error(`Server ${response.status}: ${json.error || 'request failed'}`);
  return json;
}
