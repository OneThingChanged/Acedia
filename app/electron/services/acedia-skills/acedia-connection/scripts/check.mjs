// Standalone, read-only fallback for a client whose cached MCP list is stale.
// node:http talks directly to loopback; HTTP_PROXY is deliberately not used.
import http from 'node:http';

async function check() {
  if (process.argv.length !== 2) return { ok: false, reason: 'no-arguments-accepted' };
  const [port, token, agent] = ['MULTIAGENT_PORT', 'MULTIAGENT_TOKEN', 'MULTIAGENT_AGENT_ID'].map(key => (process.env[key] || '').trim());
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !token || !agent) return {
    ok: false, connected: false, reason: 'session-environment-missing', recovery: 'Start this CLI from Acedia. Do not copy another session identity or credentials.' };
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const request = http.get({ hostname: '127.0.0.1', port: Number(port), path: '/integration/v1/workspace/capabilities',
        headers: { authorization: 'Bearer ' + token, 'x-acedia-agent-id': agent } }, response => {
        if (response.statusCode !== 200) { response.resume(); resolve({ status: response.statusCode }); return; }
        const chunks = []; let bytes = 0;
        response.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) response.destroy(new Error('Response limit')); else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => { try { resolve({ status: 200, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { reject(new Error('Invalid JSON')); } });
      });
      request.setTimeout(5000, () => request.destroy(new Error('Timeout'))); request.on('error', reject);
    });
  } catch { return { ok: false, connected: false, reason: 'host-unreachable-or-invalid-response', recovery: 'Check Acedia and restart this CLI from Acedia if its runtime is stale.' }; }
  if (result.status !== 200) return { ok: false, connected: true, httpStatus: result.status,
    reason: result.status === 404 ? 'capabilities-unavailable' : [401, 403].includes(result.status) ? 'authentication-failed' : 'host-error',
    recovery: 'Update Acedia if this endpoint is unavailable, then reload the MCP/CLI from Acedia. Do not retry mutations or replace credentials.' };
  const payload = result.body;
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.tools)) return { ok: false, connected: true, reason: 'unsupported-capabilities-schema' };
  const select = (value, keys) => Object.fromEntries(keys.map(key => [key, value?.[key] ?? null]));
  return { ok: payload.ok === true, connected: true, status: payload.status,
    host: select(payload.host, ['name', 'version', 'apiVersion']), caller: select(payload.caller, ['registered', 'active', 'aiToolId']),
    features: Object.fromEntries(Object.entries(payload.features || {}).map(([name, value]) => [name, select(value, ['supported', 'available', 'reason'])])),
    tools: payload.tools, skills: select(payload.skills, ['state', 'ready', 'bundleVersion', 'expectedBundleVersion', 'skills', 'reason']) };
}
const result = await check();
process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.ok ? 0 : 1;
