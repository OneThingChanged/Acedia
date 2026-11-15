import { describe, expect, it } from 'vitest';
import type { Agent } from '../types';
import { visibleDelegatedWait } from './useDelegatedWait';

const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({ id, name: id, projectId: 'p', folder: 'C:/work', aiToolId: 'codex', aiLabel: 'Codex', dangerous: false,
  createdAt: 1, status: 'running', runtimeStatus: 'running', ...extra });
describe('live delegated-wait display', () => {
  const waits = { leader: { count: 1, childIds: ['child'], observedAt: 1000 } };
  it('immediately hides a cached wait after fresh foreground work, a question or shutdown', () => {
    const child = agent('child', { status: 'working' }), leader = agent('leader');
    expect(visibleDelegatedWait([leader, child], waits)).toEqual(waits);
    expect(visibleDelegatedWait([agent('leader', { activity: { workStatus: 'working', source: 'hook', stateStartedAt: 1100, receivedAt: 1100 } }), child], waits)).toEqual({});
    for (const status of ['question', 'blocked', 'waiting', 'exited'] as const) expect(visibleDelegatedWait([agent('leader', { status, runtimeStatus: status === 'exited' ? 'exited' : 'running' }), child], waits)).toEqual({});
  });
  it('recounts live children and removes a stopped, sleeping, completed or removed child without waiting for a poll', () => {
    const leader = agent('leader');
    for (const child of [undefined, agent('child', { deferredStart: true, resumeEligible: true }), agent('child', { status: 'exited', runtimeStatus: 'exited' }),
      agent('child', { activity: { workStatus: 'done', source: 'hook', stateStartedAt: 1100, receivedAt: 1100 } })]) {
      expect(visibleDelegatedWait(child ? [leader, child] : [leader], waits)).toEqual({});
    }
  });
});
