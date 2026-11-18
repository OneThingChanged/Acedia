import { expect, it } from 'vitest';
import { boardOfficeData } from './boardOffice';
import { officeRooms, officeState } from './pixelOffice';
import type { BoardSession, BoardSnapshot } from './workBoard';

const now = 10_000_000;
function fixture(): BoardSnapshot {
  const session: BoardSession = { id: 'leader', name: 'Team lead', projectId: 'p', provider: 'claude', parentId: null,
    folder: 'C:/team/leader', runtime: 'running', state: 'working', updatedAt: 1000, startedAt: 500,
    summary: 'Current work', reason: '', fingerprint: 'f', needsAttention: false, task: null };
  return { revision: 'r', sampledAt: 1000, preferences: {}, storageError: null, devices: [],
    projects: [{ id: 'p', name: 'Team', folder: 'C:/team' }],
    sessions: [session, { ...session, id: 'child', name: 'Worker', parentId: 'leader', folder: 'C:/team/worker', provider: 'codex',
      model: { model: 'gpt-6.1-sol', effort: 'high' } }] };
}

it('projects only real snapshot sessions while preserving hierarchy, own folders and models', () => {
  const data = fixture(), before = structuredClone(data);
  const { agents, projects } = boardOfficeData(data, now, true);
  expect(agents.map(a => a.id)).toEqual(['leader', 'child']);
  const [room] = officeRooms(agents, projects);
  expect(room.roles.get('leader')?.role).toBe('lead');
  expect(room.roles.get('child')?.role).toBe('member');
  expect(room.sessions.find(a => a.id === 'child')).toMatchObject({ folder: 'C:/team/worker', modelSettings: { model: 'gpt-6.1-sol' } });
  expect(agents.map(a => officeState(a, now))).toEqual(['working', 'working']);
  expect(data).toEqual(before);
  expect(boardOfficeData({ ...data, sessions: [] }, now, true).agents).toEqual([]);
});

it('preserves sleeping, stopped, question and finished states instead of animating every session', () => {
  const data = fixture(), base = data.sessions[0];
  data.sessions = [
    { ...base, id: 'sleep', runtime: 'sleeping' },
    { ...base, id: 'stop', runtime: 'stopped' },
    { ...base, id: 'question', state: 'waiting', reason: 'Answer needed' },
    { ...base, id: 'done', state: 'review' },
    { ...base, id: 'failed', state: 'failed' },
    { ...base, id: 'idle', state: 'idle' },
    { ...base, id: 'delegated', state: 'idle', delegatedWait: { childIds: ['child'], count: 1, observedAt: now } },
  ];
  const { agents } = boardOfficeData(data, now, true);
  expect(agents.map(a => officeState(a, now))).toEqual(['sleeping', 'stopped', 'waiting', 'done', 'blocked', 'idle', 'working']);
  expect(agents.find(a => a.id === 'question')?.activity?.interactiveQuestion).toBe('Answer needed');
});

it('uses fresh host sample times for long-running work and marks every actor disconnected on poll failure', () => {
  const data = fixture(); data.sessions[1].runtime = 'sleeping';
  expect(officeState(boardOfficeData(data, now, true).agents[0], now)).toBe('working');
  expect(boardOfficeData(data, now, false).agents.map(a => officeState(a, now))).toEqual(['disconnected', 'disconnected']);
});

it('keeps remote teams distinct without creating launch configuration or losing the remote folder', () => {
  const data = fixture(); data.projects.push({ id: 'remote', name: 'Team', folder: 'C:/team', sshHostId: 'host', remoteFolder: '/team' });
  data.sessions.push({ ...data.sessions[1], id: 'remote-worker', parentId: null, projectId: 'remote', folder: '/team/worker' });
  const { agents, projects } = boardOfficeData(data, now, true);
  expect(officeRooms(agents, projects)).toHaveLength(2);
  expect(agents[2]).toMatchObject({ sshHostId: 'host', remoteFolder: '/team/worker' });
  expect(agents.every(a => !('initialPrompt' in a) && !('sessionInstructions' in a))).toBe(true);
});
