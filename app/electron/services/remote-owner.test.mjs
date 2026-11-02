import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { RemoteDashboardService } from './web-services.mjs';
import { validGitHubOwner, assertRemoteConfigured, assertTunnelConfigured } from '../shared/tunnel-config.mjs';

it('accepts GitHub usernames and rejects email/profile URLs before saving or starting', async () => {
  for (const owner of ['OneThingChanged', 'octocat', 'team-user', ' owner ']) expect(validGitHubOwner(owner)).toBe(true);
  for (const owner of ['user@example.com', 'https://github.com/user', '-user', 'user-', 'user--name', 'x'.repeat(40)]) {
    expect(validGitHubOwner(owner)).toBe(false);
    expect(() => assertRemoteConfigured({ client_id: 'client', owner })).toThrow('GitHub username');
    expect(() => assertTunnelConfigured({ client_id: 'client', owner })).toThrow('GitHub username');
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-owner-test-'));
  try {
    const service = new RemoteDashboardService({ baseDir: root });
    await service.setConfig({ owner: ' OneThingChanged ' });
    await expect(service.setConfig({ owner: 'user@example.com' })).rejects.toThrow('GitHub username');
    expect(service.config.owner).toBe('OneThingChanged');
    expect(JSON.parse(await fs.readFile(service.configPath, 'utf8')).owner).toBe('OneThingChanged');
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-owner-test-')) throw Error('Invalid cleanup path');
    await fs.rm(root, { recursive: true });
  }
});
