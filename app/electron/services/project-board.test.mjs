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
  it('exposes only the project hierarchy and host fields needed by the reference-style layout', () => {
    const f = fixture();
    Object.assign(f.source.projects[0], { sshHostId: 'host', remoteFolder: '/work', hierarchy: { parentId: 'master', instructions: 'private instructions' } });
    expect(f.board.snapshot().projects).toEqual([{ id: 'p', name: '프로젝트', folder: 'G:/example', sshHostId: 'host', remoteFolder: '/work', hierarchy: { parentId: 'master' } }]);
    f.board.preferences({ layoutVersion: 2, zoom: .8 });
    expect(new ProjectBoard(f.options).snapshot().preferences).toEqual({ layoutVersion: 2, zoom: .8 });
  });
  it('projects native background wait separately while retaining old results, then returns to foreground/done', () => {
    const f = fixture(); f.board.observe({ id: 'a', event: 'working', received_at: 1000 });
    f.board.observe({ id: 'a', event: 'done', received_at: 2000, assistant_message: '이전 결과' });
    f.board.observe({ id: 'a', event: 'working', received_at: 3000 });
    f.board.observe({ id: 'a', event: 'background-wait', received_at: 4000, background_count: 2 });
    expect(f.board.snapshot().sessions[0]).toMatchObject({ state: 'background', backgroundCount: 2, unreviewedResults: 1 });
    expect(f.board.snapshot().items.filter(i => i.kind === 'question')).toHaveLength(0);
    f.live.delete('a'); expect(f.board.snapshot().sessions[0].state).toBe('unknown'); f.live.add('a');
    f.board.observe({ id: 'a', event: 'tool-end', received_at: 5000 });
    expect(f.board.snapshot().sessions[0]).toMatchObject({ state: 'working', backgroundCount: null, unreviewedResults: 1 });
    f.board.observe({ id: 'a', event: 'done', received_at: 6000, assistant_message: '최종 결과' });
    expect(f.board.snapshot().sessions[0]).toMatchObject({ state: 'review', backgroundCount: null, unreviewedResults: 2 });
  });
  it('correlates legacy completion notices by exact hook receipts without duplicating replayed results', () => {
    const f = fixture(); delete f.source.agents[0].activity;
    f.board.observe({ id: 'a', event: 'working', received_at: 1000 });
    f.board.observe({ id: 'a', event: 'done', received_at: 2000, assistant_message: '응답 내용' });
    f.board.observe({ id: 'a', event: 'done', received_at: 3000, assistant_message: '응답 내용' });
    f.board.observe({ id: 'a', event: 'working', received_at: 4000 });
    f.board.seedAttention([{ id: 'desktop-notice', agentId: 'a', kind: 'completed', createdAt: 3000, body: '작업이 끝났습니다.', read: true }]);
    expect(f.board.snapshot().items.filter(i => i.kind === 'result')).toMatchObject([{ summary: '응답 내용', reviewedAt: null }]);
    // Nearby distinct events must not be merged by a time-window heuristic.
    f.board.seedAttention([{ id: 'older-notice', agentId: 'a', kind: 'completed', createdAt: 1999, body: '이전 알림' }]);
    expect(new ProjectBoard(f.options).snapshot().items.filter(i => i.kind === 'result')).toHaveLength(2);
    f.board.observe({ id: 'a', event: 'working', received_at: 5000 });
    expect(new ProjectBoard(f.options).snapshot().sessions[0].startedAt).toBe(5000);
  });
  it('does not discard unread results at the journal limit and prunes only explicitly reviewed history', () => {
    const f = fixture(); const inbox = {};
    for (let i = 0; i < 1500; i++) { const id = i.toString(16).padStart(64, '0'); inbox[id] = { id, sessionId: 'a', createdAt: i, reviewedAt: null }; }
    const next = { id: 'f'.repeat(64), sessionId: 'b', createdAt: 2000, summary: '새 결과', scope: 'response' };
    expect(f.board.withResult(inbox, next)).toBe(inbox); expect(f.board.capacityError).toContain('한도');
    inbox['0'.repeat(64)].reviewedAt = 1000;
    const updated = f.board.withResult(inbox, next);
    expect(Object.keys(updated)).toHaveLength(1500); expect(updated['0'.repeat(64)]).toBeUndefined();
    expect(updated[next.id]).toMatchObject({ summary: '새 결과', reviewedAt: null });
    expect(inbox['0'.repeat(64)]).toBeTruthy();
  });
  it('keeps multiple response results during new work and reviews exactly one across restarts', () => {
    const f = fixture(); delete f.source.agents[0].activity;
    f.board.observe({ id: 'a', event: 'working', received_at: 1000 });
    f.board.observe({ id: 'a', event: 'done', received_at: 2000, assistant_message: '첫 결과' });
    const first = f.board.snapshot().items.find(i => i.kind === 'result');
    f.board.observe({ id: 'a', event: 'working', received_at: 3000 });
    expect(f.board.snapshot().sessions[0]).toMatchObject({ state: 'working', unreviewedResults: 1 });
    f.board.observe({ id: 'a', event: 'done', received_at: 4000, assistant_message: '두 번째 결과' });
    f.board.observe({ id: 'a', event: 'tool-end', received_at: 4500 });
    f.board.observe({ id: 'a', event: 'done', received_at: 5000, assistant_message: '두 번째 결과' });
    expect(f.board.snapshot().items.filter(i => i.kind === 'result')).toHaveLength(2);
    f.board.observe({ id: 'a', event: 'working', received_at: 6000 });
    f.board.acknowledge('a', first.fingerprint, first.id);
    expect(f.board.snapshot().sessions[0]).toMatchObject({ state: 'working', unreviewedResults: 1 });
    const restored = new ProjectBoard(f.options);
    expect(restored.snapshot().items.filter(i => i.kind === 'result').map(i => i.summary)).toEqual(['두 번째 결과']);
    expect(restored.snapshot().sessions[0].state).toBe('working');
    expect(() => restored.acknowledge('b', first.fingerprint, first.id)).toThrow();
  });
  it('does not acknowledge questions by viewing or result-review actions and preserves separate failures', () => {
    const f = fixture(); f.hooks.set('a', { event: 'waiting', received_at: 3000, interactive_question: '어느 경로?' });
    const first = f.board.snapshot(), question = first.items.find(i => i.kind === 'question');
    expect(f.board.snapshot().items.some(i => i.id === question.id)).toBe(true);
    expect(() => f.board.acknowledge('a', question.fingerprint, question.id)).toThrow('답변');
    f.hooks.set('a', { event: 'blocked', received_at: 4000, interactive_question: '출력 경로 오류' });
    const error = f.board.snapshot().items.find(i => i.kind === 'error');
    f.board.acknowledge('a', error.fingerprint, error.id);
    expect(f.board.snapshot().sessions[0].state).toBe('failed');
    expect(f.board.snapshot().items.some(i => i.kind === 'error')).toBe(false);
  });
  it('migrates a reviewed v1 result without reopening it and refuses malformed v2 inboxes', () => {
    const f = fixture(); f.board.observe({ id: 'a', event: 'done', received_at: 3000, assistant_message: '기존 결과' });
    f.board.acknowledge('a', f.board.snapshot().sessions[0].fingerprint);
    const { inbox: _inbox, ...old } = f.board.data;
    fs.writeFileSync(f.options.file, JSON.stringify({ ...old, version: 1 }));
    const migrated = new ProjectBoard(f.options);
    expect(migrated.snapshot().items.filter(i => i.kind === 'result')).toHaveLength(0);
    fs.writeFileSync(f.options.file, JSON.stringify({ ...old, version: 2, inbox: { invalid: null } }));
    const damaged = new ProjectBoard(f.options); expect(damaged.snapshot().storageError).toBeTruthy();
    expect(() => damaged.preferences({ motion: false })).toThrow();
  });
  it('distinguishes explicit external wait, pause and unreachable signals without an idle timeout', () => {
    const f = fixture(); delete f.source.agents[0].activity;
    f.source.agents[0].status = 'working'; expect(f.board.snapshot().sessions[0].state).toBe('working');
    f.time(999999999); expect(f.board.snapshot().sessions[0].state).toBe('working');
    f.source.agents[0].activity = { receivedAt: 1000, workStatus: 'waiting-tool' };
    expect(f.board.snapshot().sessions[0].state).toBe('waiting_external');
    f.source.agents[0].activity.workStatus = 'paused'; expect(f.board.snapshot().sessions[0].state).toBe('paused');
    f.source.agents[0].runtimeStatus = 'unreachable'; expect(f.board.snapshot().sessions[0].state).toBe('unknown');
  });
  it('animates only observed message reads, stops on completion/error and never starts a sleeping target', async () => {
    const f = fixture(); const before = f.board.snapshot().sessions[1];
    let release; const held = new Promise(resolve => { release = resolve; });
    const pending = f.board.referenceRead('a', ['b'], () => held);
    expect(f.board.snapshot().references).toMatchObject([{ from: 'a', to: 'b', active: true, endedAt: null }]);
    expect(f.board.snapshot().sessions[1]).toEqual(before);
    f.time(3000); release('read'); expect(await pending).toBe('read');
    expect(f.board.snapshot().references[0]).toMatchObject({ active: false, endedAt: 3000 });
    await expect(f.board.referenceRead('a', ['b'], async () => { throw Error('read failure'); })).rejects.toThrow();
    expect(f.board.snapshot().references[0].active).toBe(false);
    expect(f.live.has('b')).toBe(false);
  });
  it('keeps sleeping children, folder identity and turn completion distinct from verified completion', () => {
    const f = fixture();
    expect(f.board.snapshot().sessions).toMatchObject([{ id: 'a', state: 'review', needsAttention: true }, { id: 'b', parentId: 'a', runtime: 'sleeping', folder: 'D:/child' }]);
    f.runs.push({ id: 'r', updatedAt: 1500, tasks: [{ id: 't', title: '검증', state: 'completed', attempts: [{ sessionId: 'b' }], result: { summary: '검증 통과', artifacts: ['Saved/결과.html'] } }] });
    expect(f.board.snapshot().sessions[1]).toMatchObject({ state: 'completed', summary: '검증 통과' });
    expect(f.board.snapshot().items.find(i => i.sessionId === 'b')).toMatchObject({ scope: 'task', artifacts: ['Saved/결과.html'] });
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
    expect(f.board.snapshot(first.revision)).toEqual({ revision: first.revision, unchanged: true, sampledAt: 2000 });
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
    const f = fixture(); const snapshot = f.board.snapshot(), saved = snapshot.sessions[0], result = snapshot.items.find(i => i.kind === 'result');
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw Error('disk'); });
    try { expect(() => f.board.acknowledge('a', saved.fingerprint)).toThrow('disk');
      expect(() => f.board.acknowledge('a', result.fingerprint, result.id)).toThrow('disk');
      expect(f.board.snapshot().sessions[0].needsAttention).toBe(true); expect(f.board.data.inbox[result.id].reviewedAt).toBeNull(); }
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
