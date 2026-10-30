import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskOrchestration, selectTaskModel, taskPath, taskModelsMatch } from './task-orchestration.mjs';

const roots = [], engines = [];
afterEach(() => { engines.splice(0).forEach(e => e.close()); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });
const model = { model: 'fixture-normal', effort: 'medium', serviceTier: 'default' };
const policy = { light: { model: 'fixture-light', effort: 'low' }, normal: model, advanced: { model: 'fixture-advanced', effort: 'high' } };
const task = (id, scopes = [], dependsOn = []) => ({ id, title: id, goal: 'fixture goal', acceptance: 'fixture check passed', writeScopes: scopes, dependsOn });
const until = async predicate => { for (let i = 0; i < 300; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('Fixture timed out'); };
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-tasks-unit-')); roots.push(root);
  const catalog = { projects: [{ id: 'p', folder: root }], agents: [{ id: 'a', projectId: 'p', aiToolId: 'codex' }, { id: 'other', projectId: 'p', aiToolId: 'codex' }] };
  const live = new Map([['a', {}], ['other', {}]]), reads = new Map(), receipts = new Map();
  const createSession = vi.fn(async payload => {
    catalog.agents.push({ id: payload.id, projectId: 'p', aiToolId: 'codex' }); live.set(payload.id, { ...payload, cwd: payload.folder });
    reads.set(payload.id, { sessionId: 'conversation-' + payload.id, turn: { id: 'before' }, question: null });
    if (options.startup) reads.get(payload.id).startup = { startupKind: options.startup };
    if (options.lostCreate) throw Error('creation response lost');
    return { id: payload.id };
  });
  const delivery = { handle: vi.fn(async ({ action, body }) => {
    if (action === 'send') {
      const current = reads.get(body.sessionId); current.turn.id = 'turn-' + body.requestKey;
      receipts.set(body.requestKey, { targetId: body.sessionId, conversationId: body.expectedConversationId, status: options.delayed ? 'sent' : 'started', turnId: current.turn.id, startedAt: Date.now() });
    }
    const receipt = receipts.get(body.requestKey); if (!receipt) throw Error('receipt missing'); return receipt;
  }) };
  const adapter = { file: path.join(root, 'tasks.json'), catalog: () => catalog, runtime: id => live.get(id), createSession, delivery,
    read: async id => reads.get(id), models: async () => ({ models: Object.values(policy).map(s => ({ model: s.model, efforts: [{ effort: s.effort }] })) }),
    launchedModel: id => live.get(id)?.modelSettings, actualModel: async id => options.wrongModel ? policy.advanced : live.get(id)?.modelSettings,
    answer: vi.fn(async (id, request) => { if (reads.get(id).question.id !== request.questionId) throw Error('wrong request'); reads.get(id).question = null; }),
    stop: vi.fn(async id => { if (options.stopFails) throw Error('stop failed'); live.delete(id); }), defaults: () => model,
  };
  const make = () => { const engine = new TaskOrchestration(adapter); engines.push(engine); return engine; };
  const engine = make();
  const call = (action, body = {}, agentId = 'a', operator = false) => engine.handle({ action, body, agentId, operator });
  const plan = (tasks = [task('one')], extra = {}) => call('plan', { requestKey: 'request', title: 'fixture run', request: 'fixture only', tasks, ...extra });
  const result = async (run, id = 'one', patch = {}) => {
    const t = engine.data.runs.find(r => r.id === run.id).tasks.find(t => t.id === id), a = t.attempts.at(-1);
    return call('result', { runId: run.id, taskId: id, attemptId: a.id, conversationId: a.conversationId, turnId: a.turnId,
      result: { summary: 'fixture result', changedFiles: [], checks: [{ command: 'fixture check', passed: true, output: 'passed' }] }, ...patch }, a.sessionId);
  };
  const review = (run, id = 'one', accept = true) => call('review', { runId: run.id, taskId: id, attemptId: engine.data.runs[0].tasks.find(t => t.id === id).attempts.at(-1).id, accept, note: 'fixture validation evidence reviewed' });
  return { root, engine, make, adapter, call, plan, result, review, reads, live, receipts, catalog, createSession, delivery };
}

describe('durable independent Codex task orchestration', () => {
  it('keeps startup approvals waiting past the launch deadline and sends once after confirmation', async () => {
    const f = fixture({ startup: 'folder-trust' });
    let clock = Date.now(); f.engine.now = () => clock;
    await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'waiting_approval');
    const task = f.engine.data.runs[0].tasks[0], attempt = task.attempts[0];
    clock += 60000; await new Promise(resolve => setTimeout(resolve, 190)); await f.engine.tick();
    expect(task.state).toBe('waiting_approval'); expect(task.reason).toContain('폴더 신뢰'); expect(f.delivery.handle).not.toHaveBeenCalled();
    delete f.reads.get(attempt.sessionId).startup;
    await until(() => task.state === 'running');
    expect(f.delivery.handle.mock.calls.filter(([c]) => c.action === 'send')).toHaveLength(1); expect(f.createSession).toHaveBeenCalledTimes(1);
  });
  it('cancels a worker during hook review without submitting or automatically approving it', async () => {
    const f = fixture({ startup: 'hook-review' }), { run } = await f.plan();
    await until(() => f.engine.data.runs[0].tasks[0].state === 'waiting_approval');
    expect(f.engine.data.runs[0].tasks[0].reason).toContain('훅 검토');
    await f.call('cancel', { runId: run.id }); await new Promise(resolve => setTimeout(resolve, 190));
    expect(f.engine.data.runs[0].state).toBe('cancelled'); expect(f.delivery.handle).not.toHaveBeenCalled(); expect(f.adapter.answer).not.toHaveBeenCalled();
  });
  it('requires operator settings, binds trust to the project folder, persists it and supports revocation', async () => {
    const f = fixture();
    expect((await f.call('policy')).startupTrust.enabled).toBe(false);
    await expect(f.call('policy-save', { policy, ownerId: 'a', revision: 0, autoTrustProjectFolders: true })).rejects.toThrow('사용자');
    await f.call('policy-save', { policy, ownerId: 'a', revision: 0, autoTrustProjectFolders: true }, 'a', true);
    expect(f.engine.startupTrustRoot('a')).toBeTruthy();
    f.engine.close(); const restored = f.make(); expect(restored.startupTrustRoot('a')).toBeTruthy();
    const original = f.catalog.projects[0].folder; f.catalog.projects[0].folder = path.dirname(original);
    expect(restored.startupTrustRoot('a')).toBe(null); f.catalog.projects[0].folder = original;
    f.catalog.agents[0].sshHostId = 'ssh'; expect(restored.startupTrustRoot('a')).toBe(null); delete f.catalog.agents[0].sshHostId;
    await restored.handle({ action: 'policy-save', operator: true, body: { policy, ownerId: 'a', revision: 1, autoTrustProjectFolders: false } });
    expect(restored.startupTrustRoot('a')).toBe(null);
  });
  it('automatically scopes API-created Codex trust to its current local project without enabling manual sessions', async () => {
    const f = fixture();
    const child = { id: 'api-child', projectId: 'p', aiToolId: 'codex',
      sessionHierarchy: { createdById: 'deleted-creator', parentId: 'a' } };
    f.catalog.agents.push(child);
    expect((await f.call('policy')).startupTrust.enabled).toBe(false);
    expect(f.engine.startupTrustRoot(child.id)).toBe(taskPath(f.root, '.'));
    expect(f.engine.startupTrustRoot('a')).toBe(null);
    f.catalog.agents[1].sessionHierarchy = { parentId: 'a' }; // User-created child.
    expect(f.engine.startupTrustRoot('other')).toBe(null);
    f.engine.close();
    const restored = f.make();
    expect(restored.startupTrustRoot(child.id)).toBe(taskPath(f.root, '.'));
    // Revoking the manual-session opt-in does not disable API creation behavior.
    await restored.handle({ action: 'policy-save', operator: true,
      body: { policy, ownerId: 'a', revision: 0, autoTrustProjectFolders: false } });
    expect(restored.startupTrustRoot(child.id)).toBe(taskPath(f.root, '.'));
    expect(restored.startupTrustRoot('a')).toBe(null);
    child.aiToolId = 'claude'; expect(restored.startupTrustRoot(child.id)).toBe(null);
    child.aiToolId = 'codex'; child.sshHostId = 'ssh'; expect(restored.startupTrustRoot(child.id)).toBe(null);
    delete child.sshHostId; f.catalog.projects[0].sshHostId = 'ssh'; expect(restored.startupTrustRoot(child.id)).toBe(null);
    delete f.catalog.projects[0].sshHostId;
    child.projectId = 'missing'; expect(restored.startupTrustRoot(child.id)).toBe(null);
  });
  it('scopes API-created external working folders to that exact folder, preserving in-project Git roots',()=>{
    const f=fixture(),project=path.join(f.root,'registered'),dedicated=path.join(f.root,'dedicated');
    fs.mkdirSync(project);fs.mkdirSync(dedicated);f.catalog.projects[0].folder=project;
    const child={id:'api-folder',projectId:'p',aiToolId:'codex',folder:dedicated,sessionHierarchy:{createdById:'a'}};
    f.catalog.agents.push(child);expect(f.engine.startupTrustRoot(child.id)).toBe(taskPath(dedicated,'.'));
    child.folder=path.join(project,'inside');fs.mkdirSync(child.folder);
    expect(f.engine.startupTrustRoot(child.id)).toBe(taskPath(project,'.'));
    delete child.sessionHierarchy.createdById;expect(f.engine.startupTrustRoot(child.id)).toBe(null);
  });
  it('starts two independent workers and gates a dependent task on reviewed results', async () => {
    const f = fixture(), { run } = await f.plan([task('one', ['a.ts']), task('two', ['b.ts']), task('verify', [], ['one', 'two'])]);
    await until(() => f.engine.data.runs[0].tasks.slice(0, 2).every(t => t.state === 'running'));
    expect(f.createSession).toHaveBeenCalledTimes(2); expect(f.engine.data.runs[0].tasks[2].attempts).toHaveLength(0);
    await f.result(run); expect(f.engine.data.runs[0].tasks[0].state).toBe('result_submitted');
    await f.review(run); await f.result(run, 'two'); await f.review(run, 'two');
    await until(() => f.engine.data.runs[0].tasks[2].state === 'running'); expect(f.createSession).toHaveBeenCalledTimes(3);
    expect(f.createSession.mock.calls.every(([p]) => p.ownerId === 'a' && p.id !== 'other')).toBe(true);
    await expect(f.call('finish', { runId: run.id, summary: 'too early' })).rejects.toThrow('필수');
    await f.result(run, 'verify'); await f.review(run, 'verify'); await f.call('finish', { runId: run.id, summary: 'All fixture evidence reviewed' });
    expect(f.engine.data.runs[0].state).toBe('completed');
  });
  it('reserves durable session IDs before creation and never replays a lost acknowledgement after restart', async () => {
    const f = fixture({ lostCreate: true }); await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'reconcile_required');
    const disk = JSON.parse(fs.readFileSync(f.adapter.file)); expect(disk.runs[0].tasks[0].attempts[0].creationReserved).toBe(true);
    f.engine.close(); const restored = f.make(); await restored.tick();
    expect(f.createSession).toHaveBeenCalledTimes(1); expect(restored.data.runs[0].tasks[0].state).toBe('reconcile_required');
    expect(f.delivery.handle.mock.calls.some(([c]) => c.action === 'send')).toBe(false);
  });
  it('treats started as running and reconciles the exact receipt without sending again', async () => {
    const f = fixture({ delayed: true }), { run } = await f.plan();
    await until(() => f.receipts.size === 1); const receipt = [...f.receipts.values()][0];
    expect(f.engine.data.runs[0].tasks[0].state).toBe('dispatching'); f.engine.close(); const restored = f.make();
    receipt.status = 'started';
    await restored.handle({ agentId: 'a', action: 'reconcile', body: { runId: run.id, taskId: 'one' } });
    expect(restored.data.runs[0].tasks[0].state).toBe('running');
    expect(f.delivery.handle.mock.calls.filter(([c]) => c.action === 'send')).toHaveLength(1);
  });
  it('preserves completed results across restart and deduplicates plan keys', async () => {
    const f = fixture(), { run } = await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    await f.result(run); await f.review(run); const duplicate = await f.plan(); expect(duplicate.run.id).toBe(run.id);
    await expect(f.plan([task('different')])).rejects.toThrow('요청 키');
    f.engine.close(); const restored = f.make(); await restored.tick(); expect(restored.data.runs[0].tasks[0].state).toBe('completed'); expect(f.createSession).toHaveBeenCalledTimes(1);
  });
  it('sends only changed board cards and lazy selected details across missed revisions and reconnects', async () => {
    const f = fixture(), { run } = await f.plan([task('one'), task('two')]);
    await until(() => f.engine.data.runs[0].tasks.every(t => t.state === 'running'));
    const board = await f.call('get', { runId: run.id, view: 'board' });
    expect(board.tasks.map(t => t.id)).toEqual(['one', 'two']);
    expect(board.run.request).toBeUndefined(); expect(board.tasks[0].attempts[0].conversationId).toBeUndefined(); expect(board.detail).toBeUndefined();
    expect(await f.call('get', { runId: run.id, view: 'board', revision: board.revision, taskVersions: board.taskVersions })).toEqual({ unchanged: true, revision: board.revision });
    await f.result(run, 'one');
    const delta = await f.call('get', { runId: run.id, view: 'board', revision: board.revision, taskVersions: board.taskVersions });
    expect(delta.tasks.map(t => t.id)).toEqual(['one']); expect(delta.tasks[0].result).toBeUndefined();
    const selected = await f.call('get', { runId: run.id, view: 'board', revision: delta.revision, taskVersions: delta.taskVersions, detailTaskId: 'one' });
    expect(selected.tasks).toHaveLength(0); expect(selected.detail.result.summary).toBe('fixture result'); expect(selected.detail.attempts[0].fileBaseline).toBeUndefined();
    await f.result(run, 'two');
    const other = await f.call('get', { runId: run.id, view: 'board', revision: selected.revision, taskVersions: selected.taskVersions, detailTaskId: 'one', detailVersion: selected.detailVersion });
    expect(other.tasks.map(t => t.id)).toEqual(['two']); expect(other.detail).toBeUndefined();
    const reconnect = await f.call('get', { runId: run.id, view: 'board' }); expect(reconnect.tasks).toHaveLength(2);
    await expect(f.call('get', { runId: run.id, view: 'board', taskVersions: { one: 'invalid' } })).rejects.toThrow('변경분');
    await expect(f.call('get', { runId: run.id, view: 'board', detailTaskId: 'foreign' })).rejects.toThrow('찾을');
  });
  it('projects exact task states for existing sidebar sessions without goals, results or reserved future sessions', async () => {
    const f = fixture(), { run } = await f.plan([task('one'), task('later', [], ['one'])]);
    await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    const id = f.engine.data.runs[0].tasks[0].attempts[0].sessionId;
    const request = { sessionIds: [id, 'not-created'] };
    await expect(f.call('navigation', request)).rejects.toThrow('사용자 화면');
    const nav = await f.call('navigation', request, 'a', true);
    expect(Object.keys(nav.sessions)).toEqual([id]); expect(nav.sessions[id]).toMatchObject({ ownerId: 'a', taskId: 'one', state: 'running', attempt: 1, model });
    expect(JSON.stringify(nav)).not.toContain('fixture goal'); expect(JSON.stringify(nav)).not.toContain('fileBaseline');
    expect(await f.call('navigation', { ...request, revision: nav.revision }, 'a', true)).toEqual({ unchanged: true, revision: nav.revision });
    await f.result(run); expect((await f.call('navigation', request, 'a', true)).sessions[id].state).toBe('result_submitted');
    await f.review(run); expect((await f.call('navigation', request, 'a', true)).sessions[id].state).toBe('completed');
    await expect(f.call('navigation', { sessionIds: ['x'.repeat(201)] }, 'a', true)).rejects.toThrow('목록');
  });
  it('rejects cycles, foreign dependency IDs, unsafe scopes and nonlocal owners before any creation', async () => {
    const f = fixture();
    for (const tasks of [[task('x', [], ['y']), task('y', [], ['x'])], [task('x', [], ['foreign'])], [task('x', ['../outside'])], [task('x', ['*.ts'])]]) await expect(f.plan(tasks)).rejects.toThrow();
    f.catalog.agents[0].sshHostId = 'remote'; await expect(f.plan()).rejects.toThrow('로컬'); expect(f.createSession).not.toHaveBeenCalled();
  });
  it('serializes overlapping file and folder writers across different runs', async () => {
    const f = fixture(); await f.plan([task('one', ['src']), task('two', ['src/component.ts'])]);
    await until(() => f.engine.data.runs[0].tasks[0].state === 'running'); await f.engine.tick();
    await f.plan([task('other', ['src/component.ts'])], { requestKey: 'second' }); await f.engine.tick();
    expect(f.createSession).toHaveBeenCalledTimes(1); expect(f.engine.data.runs[0].tasks[1].reason).toContain('충돌');
    expect(JSON.parse(fs.readFileSync(f.adapter.file)).runs[0].tasks[1].reason).toContain('충돌');
  });
  it('rejects old attempts, wrong conversation/turn and results from A or unrelated sessions', async () => {
    const f = fixture(), { run } = await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    for (const patch of [{ attemptId: 'old' }, { conversationId: 'foreign' }, { turnId: 'old' }]) await expect(f.result(run, 'one', patch)).rejects.toThrow();
    await expect(f.call('get', { runId: run.id }, 'other')).rejects.toThrow('권한');
    await expect(f.call('result', { runId: run.id, taskId: 'one' })).rejects.toThrow('담당');
    expect(f.engine.data.runs[0].tasks[0].state).toBe('running');
  });
  it('requires actual runtime model evidence, including effort and Fast', async () => {
    const f = fixture({ wrongModel: true }), { run } = await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    await expect(f.result(run)).rejects.toThrow('모델'); expect(f.engine.data.runs[0].tasks[0].state).toBe('reconcile_required');
  });
  it.each(['question', 'command-approval'])('routes %s to the original request and attempt', async toolName => {
    const f = fixture(), { run } = await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    const a = f.engine.data.runs[0].tasks[0].attempts[0]; f.reads.get(a.sessionId).question = { id: 'question-id', toolName, question: 'fixture question' }; await f.engine.tick();
    expect(f.engine.data.runs[0].tasks[0].state).toBe(toolName === 'command-approval' ? 'waiting_approval' : 'waiting_user');
    expect((await f.call('navigation', { sessionIds: [a.sessionId] }, 'a', true)).sessions[a.sessionId].state).toBe(toolName === 'command-approval' ? 'waiting_approval' : 'waiting_user');
    const body = { runId: run.id, taskId: 'one', attemptId: a.id, request: { questionId: 'question-id', sessionId: a.conversationId } };
    await expect(f.call('answer', body)).rejects.toThrow('사용자');
    await expect(f.call('answer', { ...body, attemptId: 'old' }, 'a', true)).rejects.toThrow();
    await f.call('answer', body, 'a', true); expect(f.adapter.answer).toHaveBeenCalledWith(a.sessionId, body.request); expect(f.engine.data.runs[0].tasks[0].state).toBe('running');
  });
  it('marks out-of-scope changes and failed validation, bounds retries and keeps old attempts inert', async () => {
    const f = fixture(), { run } = await f.plan([task('one', ['allowed.ts'])]); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    const old = f.engine.data.runs[0].tasks[0].attempts[0];
    await f.result(run, 'one', { result: { summary: 'bad change', changedFiles: ['outside.ts'], checks: [{ command: 'check', passed: true, output: 'ok' }] } }); await f.review(run);
    expect(f.engine.data.runs[0].tasks[0].state).toBe('failed');
    await f.call('retry', { runId: run.id, taskId: 'one', modelOverride: policy.advanced }); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    expect(f.engine.data.runs[0].tasks[0].attempts[1].requestedModel).toEqual(policy.advanced);
    await expect(f.call('result', { runId: run.id, taskId: 'one', attemptId: old.id }, old.sessionId)).rejects.toThrow();
    await f.result(run); await f.review(run, 'one', false); await expect(f.call('retry', { runId: run.id, taskId: 'one' })).rejects.toThrow('2회');
  });
  it('pauses new assignments and preserves cancellation failures without starting more work', async () => {
    const f = fixture({ stopFails: true }), { run } = await f.plan([task('one'), task('two')], { concurrency: 1 });
    await until(() => f.engine.data.runs[0].tasks[0].state === 'running'); await f.call('pause', { runId: run.id });
    await f.engine.tick(); expect(f.createSession).toHaveBeenCalledTimes(1);
    await f.call('cancel', { runId: run.id }); expect(f.engine.data.runs[0].state).toBe('cancelling'); expect(f.engine.data.runs[0].tasks[0].reason).toContain('종료 확인 실패');
    await f.engine.tick(); expect(f.createSession).toHaveBeenCalledTimes(1);
    await expect(f.call('resume', { runId: run.id })).rejects.toThrow();
  });
  it('rejects worker delegation and cross-run controls; blocks corrupt storage', async () => {
    const f = fixture(), { run } = await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    const id = f.engine.data.runs[0].tasks[0].attempts[0].sessionId;
    await expect(f.call('plan', { requestKey: 'nested' }, id)).rejects.toThrow('위임');
    await expect(f.call('pause', { runId: run.id }, id)).rejects.toThrow('제어');
    await expect(f.call('review', { runId: run.id, taskId: 'foreign' })).rejects.toThrow('작업');
    f.engine.close(); fs.writeFileSync(f.adapter.file, '{bad'); const restored = f.make(); await expect(restored.handle({ action: 'list', operator: true })).rejects.toThrow('저장소');
  });
  it('returns bounded summaries and unchanged revisions, without transcripts in polling', async () => {
    const f = fixture(), { run } = await f.plan(); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    const list = await f.call('list'); expect(JSON.stringify(list)).not.toContain('fixture goal');
    const detail = await f.call('get', { runId: run.id }); expect(await f.call('get', { runId: run.id, revision: detail.revision })).toEqual({ unchanged: true, revision: detail.revision });
    expect((await f.call('wait', { runId: run.id, revision: detail.revision, waitMs: 10 })).changed).toBe(false);
  });
  it('audits new changes while preserving dirty baseline files and hides fingerprints from clients', async () => {
    const f = fixture(); let files = { 'prior.txt': 'existing-user-edit' };
    f.engine.audit = async () => ({ available: true, files: { ...files } });
    const { run } = await f.plan([task('one', ['allowed.ts'])]); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    files['unexpected.ts'] = 'worker-or-external-change'; await f.result(run);
    expect(f.engine.data.runs[0].tasks[0].attempts[0].fileAudit.unassigned).toEqual(['unexpected.ts']);
    expect(JSON.stringify(await f.call('get', { runId: run.id }))).not.toContain('existing-user-edit');
    files['after-result.ts'] = 'late action before turn end';
    await f.review(run); expect(f.engine.data.runs[0].tasks[0].state).toBe('failed');
    expect(f.engine.data.runs[0].tasks[0].attempts[0].fileAudit.unassigned).toEqual(['unexpected.ts', 'after-result.ts']);
    expect(f.engine.data.runs[0].tasks[0].reason).toContain('범위 밖');
  });
  it('keeps a frozen model policy and lets the user override a blocked task before launch', async () => {
    const f = fixture();
    await f.call('policy-save', { policy, revision: 0, ownerId: 'a' }, 'a', true);
    const { run } = await f.plan([task('one'), task('two', [], ['one'])]); await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    await f.call('override', { runId: run.id, taskId: 'two', modelOverride: policy.light });
    await f.call('policy-save', { policy: { ...policy, normal: policy.advanced }, revision: 1, ownerId: 'a' }, 'a', true);
    await expect(f.call('policy-save', { policy, revision: 1 }, 'a', true)).rejects.toThrow('다시');
    expect(f.engine.data.runs[0].policy.normal).toEqual(model);
    await f.result(run); await f.review(run); await until(() => f.engine.data.runs[0].tasks[1].state === 'running');
    expect(f.engine.data.runs[0].tasks[1].attempts[0].requestedModel).toEqual(policy.light);
    await expect(f.call('override', { runId: run.id, taskId: 'two', modelOverride: model })).rejects.toThrow('시작 전');
  });
  it('surfaces a disconnected worker and stops new assignments until it is reconciled', async () => {
    const f = fixture(); await f.plan([task('one'), task('two')], { concurrency: 1 });
    await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    f.live.delete(f.engine.data.runs[0].tasks[0].attempts[0].sessionId); await f.engine.tick();
    expect(f.engine.data.runs[0].tasks[0].state).toBe('reconcile_required'); expect(f.createSession).toHaveBeenCalledTimes(1);
  });
  it('holds the file lock until a submitted worker turn stops and ignores late poll observations after review', async () => {
    const f = fixture(), { run } = await f.plan([task('one', ['same.ts']), task('two', ['same.ts'])]);
    await until(() => f.engine.data.runs[0].tasks[0].state === 'running');
    const a = f.engine.data.runs[0].tasks[0].attempts[0];
    f.reads.get(a.sessionId).lifecycle = 'working'; await f.result(run);
    await expect(f.review(run)).rejects.toThrow('턴이 끝난'); await f.engine.tick(); expect(f.createSession).toHaveBeenCalledTimes(1);
    f.reads.get(a.sessionId).lifecycle = 'idle'; await f.review(run); await until(() => f.createSession.mock.calls.length === 2);
    f.reads.get(a.sessionId).turn.id = 'unrelated-later-turn'; await f.engine.syncAttempt(f.engine.data.runs[0], f.engine.data.runs[0].tasks[0]);
    expect(f.engine.data.runs[0].tasks[0].state).toBe('completed');
  });
});

it('selects configured models using risk/context/tools, honors overrides and limits escalation', () => {
  expect(selectTaskModel({ assessment: { complexity: 'low', risk: 'low', context: 'small', tools: false } }, policy).settings).toEqual(policy.light);
  expect(selectTaskModel({ assessment: { risk: 'high' } }, policy).settings).toEqual(policy.advanced);
  expect(selectTaskModel({}, policy, 1).settings).toEqual(policy.advanced);
  expect(selectTaskModel({ modelOverride: policy.light }, policy, 1).settings).toEqual(policy.light);
  expect(taskModelsMatch({ ...model, serviceTier: null }, model)).toBe(true);
  expect(taskModelsMatch({ ...model, serviceTier: 'priority' }, { ...model, serviceTier: 'fast' })).toBe(true);
  expect(taskModelsMatch({ model: model.model, effort: model.effort }, model)).toBe(false);
  expect(taskModelsMatch({ ...model, effort: 'low' }, model)).toBe(false);
  expect(taskModelsMatch({ ...model, serviceTier: 'fast' }, model)).toBe(false);
});
it('normalizes equivalent paths and rejects paths outside a project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-task-path-')); roots.push(root);
  expect(taskPath(root, './src/../a.ts')).toBe(taskPath(root, 'a.ts')); expect(() => taskPath(root, '../outside')).toThrow();
});
