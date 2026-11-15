import { expect, it } from 'vitest';
import { latestIncoming, sessionTableMatches, sessionTableRows, transferStages } from './sessionTable';
import type { BoardSnapshot } from './workBoard';

const data = { projects: [{ id: 'p', name: 'Project', folder: 'D:/Project' }], sessions: [
  { id: 'parent', name: 'Parent', projectId: 'p', parentId: null },
  { id: 'worker', name: 'Worker', projectId: 'p', parentId: 'parent', folder: 'D:/Work Folder' },
  { id: 'sender', name: 'Actual sender', projectId: 'p', parentId: null },
], transfers: [
  { id: 'old', from: 'parent', to: 'worker', savedAt: 100, startedAt: 900 },
  { id: 'new', from: 'sender', to: 'worker', savedAt: 500, summary: '검증할 요청', status: 'queued' },
  { id: 'outgoing', from: 'worker', to: 'sender', savedAt: 600, summary: 'outgoing response' },
] } as BoardSnapshot;

it('uses incoming save order rather than a late old delivery or an outgoing response as the last request', () => {
  expect(latestIncoming(data, 'worker')?.id).toBe('new');
  expect(latestIncoming(data, 'parent')).toBeUndefined();
  expect(data.sessions[1].parentId).toBe('parent');
});
it('searches the actual sender, incoming work, project and normalized folder independently of parent labels', () => {
  expect(sessionTableMatches(data, data.sessions[1], 'Actual sender')).toBe(true);
  expect(sessionTableMatches(data, data.sessions[1], '검증할')).toBe(true);
  expect(sessionTableMatches(data, data.sessions[1], 'd:\\work folder')).toBe(true);
  expect(sessionTableMatches(data, data.sessions[1], 'outgoing response')).toBe(false);
});
it('preserves only required ancestors for a filtered active child and stops on corrupt parent cycles', () => {
  const cyclic = structuredClone(data); cyclic.sessions[0].parentId = 'worker';
  const result = sessionTableRows(cyclic, new Set(['worker']), s => s.id === 'worker');
  expect(result.sessions.map(s => s.id)).toEqual(['parent', 'worker']);
  expect([...result.direct]).toEqual(['worker']);
  expect(sessionTableRows(data, new Set(['worker']), () => true, 'another').sessions).toEqual([]);
});
it('keeps notification start and original text read as independent evidence, even when timestamps arrive out of order', () => {
  const stages = transferStages({ id: 'x', from: 'parent', to: 'worker', status: 'started', reason: '', isMessage: true, savedAt: 100, startedAt: 200 });
  expect(stages.find(s => s.label[1] === 'Text read')?.at).toBeUndefined();
  expect(stages.find(s => s.label[1] === 'Response started')?.at).toBe(200);
  expect(stages.find(s => s.label[1] === 'Notification sent')?.at).toBeUndefined();
});
