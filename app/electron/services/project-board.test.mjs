import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectBoard } from './project-board.mjs';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) {
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-board-')) throw Error('Unexpected fixture path');
  fs.rmSync(root, { recursive: true });
} });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-board-')); roots.push(root);
  const source = { projects: [{ id: 'p', name: '프로젝트', folder: 'G:/example' }], agents: [
    { id: 'a', name: '관리자', projectId: 'p', aiToolId: 'codex', activity: { workStatus: 'done', receivedAt: 1000, lastAssistantMessage: '완료 보고' } },
    { id: 'b', name: '자식', projectId: 'p', aiToolId: 'claude', deferredStart: true, resumeEligible: true, sessionHierarchy: { parentId: 'a', inheritFolder: false, folderOverride: 'D:/child' } },
  ] };
  const live = new Set(['a']), hooks = new Map(), runs = []; let now = 2000;
  const options = { file: path.join(root, 'board.json'), catalog: () => source, live: id => live.has(id), hook: id => hooks.get(id), runs: () => runs, now: () => now };
  return { board: new ProjectBoard(options), source, live, hooks, runs, options, time: value => { now = value; } };
}
describe('Independent project board', () => {
  it('keeps sleeping children, folder identity and turn completion distinct from verified completion', () => {
    const f = fixture();
    expect(f.board.snapshot().sessions).toMatchObject([{ id: 'a', state: 'review', needsAttention: true }, { id: 'b', parentId: 'a', runtime: 'sleeping', folder: 'D:/child' }]);
    f.runs.push({ id: 'r', updatedAt: 1500, tasks: [{ id: 't', title: '검증', state: 'completed', attempts: [{ sessionId: 'b' }], result: { summary: '검증 통과' } }] });
    expect(f.board.snapshot().sessions[1]).toMatchObject({ state: 'completed', summary: '검증 통과' });
  });
  it('persists a human review independently and reopens it only for a new result', () => {
    const f = fixture(), first = f.board.snapshot();
    f.board.acknowledge('a', first.sessions[0].fingerprint);
    expect(new ProjectBoard(f.options).snapshot().sessions[0].needsAttention).toBe(false);
    f.live.delete('a'); expect(f.board.snapshot().sessions[0].needsAttention).toBe(false);
    f.source.agents[0].activity.receivedAt = 3000; f.source.agents[0].activity.lastAssistantMessage = '새 결과';
    expect(f.board.snapshot().sessions[0].needsAttention).toBe(true);
    expect(() => f.board.acknowledge('a', first.sessions[0].fingerprint)).toThrow('상태가 변경');
  });
  it('does not reopen reviewed work when another task in the run changes', () => {
    const f = fixture(); f.runs.push({ id: 'r', updatedAt: 1500, tasks: [{ id: 't', state: 'completed', attempts: [{ sessionId: 'b' }], result: { summary: '통과' } }] });
    f.board.acknowledge('b', f.board.snapshot().sessions[1].fingerprint);
    f.runs[0].updatedAt = 3000;
    expect(f.board.snapshot().sessions[1].needsAttention).toBe(false);
  });
  it('projects blocking states and does not call an offline worker running', () => {
    const f = fixture(); f.runs.push({ id: 'r', updatedAt: 1500, tasks: [{ id: 't', state: 'running', attempts: [{ sessionId: 'b' }] }] });
    expect(f.board.snapshot().sessions[1].state).toBe('unknown');
    f.runs[0].tasks[0].state = 'failed'; expect(f.board.snapshot().sessions[1].state).toBe('failed');
    f.runs[0].tasks[0].state = 'cancelled'; expect(f.board.snapshot().sessions[1].state).toBe('interrupted');
  });
  it('returns unchanged metadata and never copies transcript, credentials or tool arguments', () => {
    const f = fixture(); Object.assign(f.source.agents[0], { output: 'PRIVATE_TRANSCRIPT', auth: 'SECRET_CREDENTIAL', tool_input: 'SECRET_ARGUMENT' });
    const first = f.board.snapshot();
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE_TRANSCRIPT|SECRET_CREDENTIAL|SECRET_ARGUMENT/);
    expect(f.board.snapshot(first.revision)).toEqual({ revision: first.revision, unchanged: true });
    f.hooks.set('a', { event: 'waiting', lastTs: 3000, interactive_question: '질문' });
    expect(f.board.snapshot(first.revision).sessions[0].state).toBe('waiting');
  });
  it('repairs cycles and cross-project parents without modifying the registry', () => {
    const f = fixture(); f.source.agents[0].sessionHierarchy = { parentId: 'b' };
    expect(f.board.snapshot().sessions.some(s => s.parentId === null)).toBe(true);
    expect(f.source.agents[0].sessionHierarchy.parentId).toBe('b');
    f.source.agents[1].projectId = 'other';
    expect(f.board.snapshot().sessions.every(s => s.parentId === null)).toBe(true);
  });
  it('associates computer activity with a session and expires missing end signals', async () => {
    const f = fixture();
    f.board.observe({ id: 'a', event: 'tool-start', tool_name: 'mcp__cua_repl__js' });
    f.board.observe({ id: 'a', event: 'tool-end', tool_name: 'Read' });
    expect(f.board.snapshot().devices[0]).toMatchObject({ sessionId: 'a', kind: 'desktop', state: 'active' });
    f.time(123000); expect(f.board.snapshot().devices[0].state).toBe('unconfirmed');
    f.board.observe({ id: 'a', event: 'done' }); expect(f.board.snapshot().devices).toEqual([]);
    let resolve; const held = new Promise(r => { resolve = r; });
    const pending = f.board.browserAction('a', 'click', () => held);
    expect(f.board.snapshot().devices[0]).toMatchObject({ kind: 'browser', source: 'bridge' });
    resolve('ok'); expect(await pending).toBe('ok'); expect(f.board.snapshot().devices).toEqual([]);
    await expect(f.board.browserAction('a', 'click', async () => { throw Error('failure'); })).rejects.toThrow();
    expect(f.board.snapshot().devices).toEqual([]);
    f.board.observe({ id: 'a', event: 'tool-start', tool_name: 'mcp__cua_repl__js' }); f.live.clear();
    expect(f.board.snapshot().devices).toEqual([]);
  });
  it('preserves reviewed state on failed writes and refuses to overwrite a corrupt store', () => {
    const f = fixture(); const saved = f.board.snapshot().sessions[0];
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw Error('disk'); });
    try { expect(() => f.board.acknowledge('a', saved.fingerprint)).toThrow('disk'); expect(f.board.snapshot().sessions[0].needsAttention).toBe(true); }
    finally { spy.mockRestore(); }
    fs.writeFileSync(f.options.file, 'corrupted');
    const board = new ProjectBoard(f.options); expect(board.snapshot().storageError).toBeTruthy();
    expect(() => board.preferences({ zoom: 1 })).toThrow(); expect(fs.readFileSync(f.options.file, 'utf8')).toBe('corrupted');
  });
  it('retains concise completed results across restarts without requiring an activity-bearing catalog', () => {
    const f = fixture(); delete f.source.agents[0].activity;
    f.board.observe({ id: 'a', event: 'done', received_at: 3000, assistant_message: '검증 보고' });
    const original = f.board.snapshot().sessions[0];
    expect(original).toMatchObject({ state: 'review', summary: '검증 보고', needsAttention: true });
    f.board.acknowledge('a', original.fingerprint); f.live.clear();
    const restored = new ProjectBoard(f.options);
    expect(restored.snapshot().sessions[0]).toMatchObject({ fingerprint: original.fingerprint, needsAttention: false, runtime: 'stopped' });
    f.live.add('a'); restored.observe({ id: 'a', event: 'working', received_at: 4000 });
    restored.observe({ id: 'a', event: 'done', received_at: 5000, assistant_message: '다음 결과' });
    expect(restored.snapshot().sessions[0]).toMatchObject({ needsAttention: true, summary: '다음 결과' });
  });
  it('imports existing completion notices without overwriting fresh work or claiming verified completion', () => {
    const f = fixture(); delete f.source.agents[0].activity;
    f.board.seedAttention([{ agentId: 'a', kind: 'completed', createdAt: 1000, body: '기존 결과', read: true }]);
    expect(f.board.snapshot().sessions[0]).toMatchObject({ state: 'review', summary: '기존 결과', needsAttention: false });
    f.source.agents[0].status = 'working';
    expect(f.board.snapshot().sessions[0].state).toBe('working');
    f.board.observe({ id: 'a', event: 'done', received_at: 3000, assistant_message: '새 결과' });
    f.board.seedAttention([{ agentId: 'a', kind: 'completed', createdAt: 1000, body: '기존 결과' }]);
    expect(f.board.snapshot().sessions[0]).toMatchObject({ summary: '새 결과', needsAttention: true });
  });
  it('shows a follow-up turn as new work after a completed assignment and binds a new attempt separately', () => {
    const f = fixture(); f.live.add('b');
    f.runs.push({ id: 'r', updatedAt: 1500, tasks: [{ id: 't', state: 'completed', attempts: [{ id: 'first', sessionId: 'b' }], result: { summary: '이전 검증 결과' } }] });
    f.board.acknowledge('b', f.board.snapshot().sessions[1].fingerprint);
    f.board.observe({ id: 'b', event: 'working', received_at: 2000 });
    expect(f.board.snapshot().sessions[1]).toMatchObject({ state: 'working', task: null });
    f.runs[0].updatedAt = 4000;
    f.board.observe({ id: 'b', event: 'done', received_at: 5000, assistant_message: '추가 업무 결과' });
    expect(f.board.snapshot().sessions[1]).toMatchObject({ state: 'review', summary: '추가 업무 결과', needsAttention: true });
    const task = f.runs[0].tasks[0]; task.attempts.push({ id: 'second', sessionId: 'b' });
    expect(f.board.snapshot().sessions[1]).toMatchObject({ state: 'completed', needsAttention: true, task: { attemptId: 'second' } });
  });
});
