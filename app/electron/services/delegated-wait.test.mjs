import { describe, expect, it } from 'vitest';
import { delegatedWaitProjection } from './delegated-wait.mjs';

function fixture() {
  const sessions = [
    { id: 'leader', runtime: 'running', state: 'review', updatedAt: 1000, lastActivityAt: 1000 },
    { id: 'child', parentId: 'leader', runtime: 'running', state: 'working', updatedAt: 2000, lastActivityAt: 2000 },
  ];
  const transfers = [{ from: 'leader', to: 'child', status: 'started', savedAt: 1400, startedAt: 1500, isMessage: true, readAt: 1600 }];
  const runs = [], completedAt = new Map(), hooks = new Map(), waits = new Map();
  const project = () => delegatedWaitProjection({ sessions, transfers, runs, completedAt, hook: id => hooks.get(id), waitingSince: id => waits.get(id) || 0 });
  return { sessions, transfers, runs, completedAt, hooks, waits, project };
}
describe('waiting for delegated Acedia children', () => {
  it('requires exact start and original-text read evidence, not a running child or an unprocessed notification', () => {
    const f = fixture(), before = JSON.stringify(f.transfers);
    expect(f.project().get('leader')).toEqual({ count: 1, childIds: ['child'], observedAt: 1000 });
    expect(JSON.stringify(f.transfers)).toBe(before);
    f.transfers[0].readAt = null; expect(f.project().size).toBe(0);
    f.transfers[0].isMessage = false; expect(f.project().get('leader').count).toBe(1);
    f.transfers[0].status = 'sent'; expect(f.project().size).toBe(0);
    f.transfers.length = 0; expect(f.project().size).toBe(0);
  });
  it('does not revive an old assignment when the child starts unrelated work after responding', () => {
    const f = fixture(); f.completedAt.set('child', 2500); f.sessions[1].lastActivityAt = 3000;
    expect(f.project().size).toBe(0);
    f.transfers.push({ ...f.transfers[0], savedAt: 3100, startedAt: 3200, readAt: 3300 });
    expect(f.project().size).toBe(0); // No activity for the new request yet.
    f.sessions[1].lastActivityAt = 3400; expect(f.project().get('leader').count).toBe(1);
  });
  it('supersedes the previous sender when a newer request arrives, including a queued request', () => {
    const f = fixture();
    f.transfers.push({ ...f.transfers[0], from: 'peer', savedAt: 1800, status: 'queued' });
    expect(f.project().size).toBe(0);
  });
  it.each(['working', 'waiting', 'failed', 'paused', 'unknown', 'interrupted'])('gives leader %s precedence over a waiting border', state => {
    const f = fixture(); f.sessions[0].state = state; expect(f.project().size).toBe(0);
  });
  it('recognizes an observed Acedia wait call but stops on the next foreground tool', () => {
    const f = fixture(); f.sessions[0].state = 'working';
    f.hooks.set('leader', { event: 'tool-start', tool_name: 'mcp__multiagent_browser__acedia_task_wait' });
    expect(f.project().get('leader').count).toBe(1);
    f.hooks.set('leader', { event: 'tool-start', tool_name: 'functions.exec' }); expect(f.project().size).toBe(0);
    f.sessions[0].runtime = 'sleeping'; expect(f.project().size).toBe(0);
  });
  it('uses an actual owner wait even through a generic tool wrapper, with a newer foreground event taking precedence', () => {
    const f = fixture(); f.sessions[0].state = 'working';
    f.hooks.set('leader', { event: 'tool-start', tool_name: 'functions.exec' });
    f.waits.set('leader', 1200); expect(f.project().get('leader').count).toBe(1);
    f.sessions[0].lastActivityAt = 1300; expect(f.project().size).toBe(0);
  });
  it.each(['review', 'completed', 'waiting', 'failed', 'unknown', 'interrupted'])('stops when a child is %s', state => {
    const f = fixture(); f.sessions[1].state = state; expect(f.project().size).toBe(0);
  });
  it('uses only the latest active task attempt and counts each actual child once', () => {
    const f = fixture(); f.transfers.length = 0; f.sessions[1].parentId = 'organizational-parent';
    const task = { state: 'running', attempts: [{ sessionId: 'old-child', startedAt: 100 }, { sessionId: 'child', startedAt: 1500 }] };
    f.runs.push({ ownerId: 'leader', state: 'running', tasks: [task, task] });
    expect(f.project().get('leader')).toEqual({ count: 1, childIds: ['child'], observedAt: 1000 });
    f.completedAt.set('child', 2000); expect(f.project().size).toBe(0);
    f.completedAt.clear(); f.hooks.set('child', { event: 'done' }); expect(f.project().size).toBe(0);
    f.hooks.clear(); f.runs[0].state = 'paused'; expect(f.project().get('leader').count).toBe(1);
    f.runs[0].state = 'cancelled'; expect(f.project().size).toBe(0);
  });
});
