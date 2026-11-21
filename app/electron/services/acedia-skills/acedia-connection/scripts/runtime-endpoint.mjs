import { readFile } from 'node:fs/promises';
import path from 'node:path';

const validPort = value => Number.isInteger(value) && value >= 1 && value <= 65535;
const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[^\x21-\x7e]/.test(value);

export async function sessionEndpoint(env = process.env) {
  const agentId = (env.MULTIAGENT_AGENT_ID || '').trim();
  if (!agentId) return { reason: 'session-environment-missing' };

  const file = env.MULTIAGENT_RUNTIME_FILE;
  const runtimeId = env.MULTIAGENT_RUNTIME_ID;
  if (file || runtimeId) {
    // The launching app supplies both values. A different app instance or
    // profile cannot replace the caller's endpoint through its descriptor.
    if (!file || !path.isAbsolute(file) || !runtimeId) return { reason: 'runtime-descriptor-unavailable' };
    let runtime;
    try { runtime = JSON.parse(await readFile(file, 'utf8')); }
    catch { return { reason: 'runtime-descriptor-unavailable' }; }
    if (runtime?.runtimeId !== runtimeId) return { reason: 'runtime-instance-changed' };
    if (!validPort(runtime.port) || !validToken(runtime.token)) return { reason: 'runtime-descriptor-unavailable' };
    return { port: runtime.port, token: runtime.token, agentId };
  }

  const inheritedPort = (env.MULTIAGENT_PORT || '').trim();
  const token = (env.MULTIAGENT_TOKEN || '').trim();
  const port = Number(inheritedPort);
  if (!/^\d+$/.test(inheritedPort) || !validPort(port) || !validToken(token)) return { reason: 'session-environment-missing' };
  return { port, token, agentId };
}
