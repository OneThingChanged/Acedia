import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { RemoteDashboardService } from './web-services.mjs';
import { remoteAgentStatus, remoteAgentView } from '../../src/lib/remoteSessionProjection.ts';
import { buildSessionFamilies } from '../remote-pwa/session-tree.js';
import { matchesSessionFilter } from '../shared/session-state.mjs';

it('delivers actual renderer payloads through /api/state and retains inactive parents across live reparenting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-remote-tree-sync-'));
  const service = new RemoteDashboardService({ baseDir: root });
  service.config.server_port = 0;
  const names = new Map([['p', 'RnDHub']]);
  const all = [{ id: 'root', name: 'RnDHub', status: 'exited', runtimeStatus: 'exited' },
    { id: 'parent', name: 'VFX_New · Codex', deferredStart: true, resumeEligible: true, status: 'idle', runtimeStatus: 'idle', sessionHierarchy: { parentId: 'root' } },
    { id: 'worker', name: 'VFX_New · 몬스터 · Sol', status: 'working', runtimeStatus: 'running', sessionHierarchy: { parentId: 'parent' } }]
    .map(agent => ({ projectId: 'p', folder: root, aiToolId: 'codex', ...agent }));
  const sync = () => {
    service.syncAgents(JSON.parse(JSON.stringify(all.map(agent => remoteAgentStatus(agent, names)))));
    service.syncView(JSON.stringify({ projects: [{ id: 'p', name: 'RnDHub' }], agents: all.map(remoteAgentView) }));
  };
  try {
    sync(); const status = await service.start();
    const tree = async () => {
      const response = await fetch(`${status.url}/api/state`); expect(response.status).toBe(200);
      const state = await response.json(), catalog = state.view.agents.map(agent => ({ ...agent, ...state.agents.find(value => value.id === agent.id) }));
      return buildSessionFamilies(catalog.filter(agent => matchesSessionFilter(agent, 'active')), catalog);
    };
    let families = await tree();
    expect(families.roots.map(agent => agent.name)).toEqual(['RnDHub']);
    expect(families.children.get('root').map(agent => agent.id)).toEqual(['parent']);
    expect(families.children.get('parent').map(agent => agent.id)).toEqual(['worker']);
    all[2].sessionHierarchy.parentId = 'root'; sync(); families = await tree();
    expect(families.children.get('root').map(agent => agent.id)).toEqual(['worker']);
    delete all[2].sessionHierarchy; sync(); families = await tree();
    expect(families.roots.map(agent => agent.id)).toEqual(['worker']);
  } finally {
    await service.stop();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-remote-tree-sync-')) throw Error('Unexpected cleanup path');
    fs.rmSync(root, { recursive: true });
  }
});
