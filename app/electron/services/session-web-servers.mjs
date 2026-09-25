import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function sessionWebServers(ports, agentId, projectId) {
  const candidates = ports.filter(p => !p.own_app && (p.terminal_id === agentId || (!p.terminal_id && projectId && p.project_id === projectId)));
  const unique = [...new Map(candidates.map(p => [p.port, p])).values()].slice(0, 16);
  const results = await Promise.all(unique.map(async p => {
    const host = p.connect_host.includes(':') && !p.connect_host.startsWith('[') ? `[${p.connect_host}]` : p.connect_host;
    const url = `http://${host}:${p.port}/`;
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(1200) });
      await response.body?.cancel();
      return { url, port: p.port, name: p.process_name || 'Server' };
    } catch { return null; }
  }));
  return results.filter(Boolean).sort((a,b) => a.port - b.port);
}
export async function openServerChrome(raw) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid server URL');
  const candidates = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter(Boolean).map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Google Chrome 설치 경로를 찾지 못했습니다. / Google Chrome was not found.');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [url.href], { detached: true, stdio: 'ignore' });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
