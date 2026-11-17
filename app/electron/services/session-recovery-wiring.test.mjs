import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { SessionRecovery, recoveryConfiguration, recoveryWorkMode } from './session-recovery.mjs';

it('captures the real main-process active sessions before the renderer receives full-exit preparation, including a tray-only host', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-recovery-wiring-'));
  try {
    const catalog = { projects: [{ id: 'p', folder: root }], agents: ['leader', 'claude', 'done', 'dormant', 'ssh', 'shell'].map(id => ({ id, name: id,
      projectId: 'p', folder: root, aiToolId: id === 'claude' ? 'claude' : id === 'shell' ? 'none' : 'codex', ...(id === 'ssh' ? { sshHostId: 'remote' } : {}) })) };
    const ptys = new Map(catalog.agents.filter(a => a.id !== 'dormant').map(a => [a.id, { cwd: root, aiToolId: a.aiToolId, poolRouted: a.id === 'leader' }]));
    const recovery = new SessionRecovery({ file: path.join(root, 'recovery.json'), catalog: () => catalog, context: () => null });
    const source = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
    const capture = source.slice(source.indexOf('function captureSessionRecovery()'), source.indexOf('const sessionRegistry =', source.indexOf('function captureSessionRecovery()')));
    const order = [], context = { monitorService: { state: catalog }, savedBoardCatalog: {}, sessionRecovery: recovery, ptys,
      usageIndex: { catalog }, agentSessionIds: new Map([['leader', 'native-leader'], ['claude', 'native-claude'], ['done', 'native-done']]),
      accountBindings: new Map(), monitorHooks: new Map([['leader', { event: 'done' }], ['claude', { event: 'tool-start' }], ['done', { event: 'done' }]]),
      pendingDelegations: () => [{ from: 'leader', to: 'claude' }], accountPool: { state: { sessions: { leader: { accountId: 'pool-owner' } } } }, recoveryConfiguration, recoveryWorkMode,
      sessionService: { notes: new Map() },
    };
    vm.createContext(context); vm.runInContext(capture, context);
    const requestBody = source.match(/closeCoordinator = new CloseCoordinator\(\{\s+onRequest\(\) \{([\s\S]*?)\n  \},\n  onComplete/)[1];
    context.workspaceWindows = new Map();
    const realCapture = context.captureSessionRecovery;
    context.captureSessionRecovery = () => { order.push('checkpoint'); return realCapture(); };
    context.sendEventToAll = (event, payload) => { order.push(event); expect(payload).toBeNull(); expect(recovery.offer().activeCount).toBe(3); };
    expect(vm.runInContext(`(function () {${requestBody}})()`, context)).toEqual([]);
    expect(order).toEqual(['checkpoint', 'app:close-requested']);
    const saved = new SessionRecovery({ file: path.join(root, 'recovery.json') });
    expect(saved.data.sessions.map(r => [r.id, r.mode])).toEqual([['leader', 'working'], ['claude', 'working'], ['done', 'idle']]);
    expect(saved.data.sessions[0].poolResumeOwnerId).toBe('pool-owner');
    expect(saved.data.sessions.every(r => r.sessionId.startsWith('native-'))).toBe(true);
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-recovery-wiring-')) throw Error('Unexpected cleanup path');
    fs.rmSync(root, { recursive: true });
  }
});
