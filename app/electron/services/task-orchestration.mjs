import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { normalizeSessionModel } from '../shared/session-model.mjs';

const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const copy = value => structuredClone(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const active = new Set(['dispatching', 'running', 'waiting_user', 'waiting_approval', 'reconcile_required', 'result_submitted', 'verifying']);
const terminal = new Set(['completed', 'failed', 'cancelled']);
const states = new Set(['planned', 'ready', ...active, ...terminal]);
const text = (value, max = 2000) => typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const levels = ['light', 'normal', 'advanced'];
const taskModel = value => {
  const model = normalizeSessionModel(value);
  if (model && Object.hasOwn(model, 'serviceTier')) model.serviceTier = model.serviceTier == null ? 'default' : model.serviceTier === 'priority' ? 'fast' : model.serviceTier;
  return model;
};
export const taskModelsMatch = (a, b) => {
  const actual = taskModel(a), requested = taskModel(b);
  return !!actual && !!requested && actual.model === requested.model
    && (!Object.hasOwn(requested, 'effort') || actual.effort === requested.effort)
    && (!Object.hasOwn(requested, 'serviceTier') || Object.hasOwn(actual, 'serviceTier') && actual.serviceTier === requested.serviceTier);
};

// Resolve existing ancestors too: symlink aliases must share the same lock.
export function taskPath(root, input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 4096 || /[\x00-\x1f*?]/.test(input)) throw fail('수정 경로를 정확히 지정하세요.', 400);
  const canonical = candidate => {
    const suffix = [];
    while (!fs.existsSync(candidate)) { const parent = path.dirname(candidate); if (parent === candidate) break; suffix.unshift(path.basename(candidate)); candidate = parent; }
    let result = path.resolve(fs.realpathSync(candidate), ...suffix);
    if (process.platform === 'win32') result = result.toLowerCase();
    return result;
  };
  const base = canonical(root), result = canonical(path.resolve(root, input));
  if (result !== base && !result.startsWith(base + path.sep)) throw fail('프로젝트 범위 밖의 경로입니다.', 400);
  return result;
}
const overlaps = (a, b) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);

export function selectTaskModel(task, policy, attempt = 0) {
  const evidence = task.assessment || {};
  let level = evidence.complexity === 'high' || evidence.risk === 'high' || evidence.context === 'large' ? 'advanced'
    : evidence.complexity === 'low' && evidence.risk === 'low' && evidence.context === 'small' && !evidence.tools ? 'light' : 'normal';
  if (attempt && !task.modelOverride) level = levels[Math.min(2, levels.indexOf(level) + 1)];
  const settings = normalizeSessionModel(task.modelOverride || policy[level]);
  if (!settings) throw fail('작업 모델 정책을 설정하세요.', 400);
  return { settings, level, reason: task.modelOverride ? '사용자 지정 모델 우선' : `${level}: 난도 ${evidence.complexity || 'normal'}, 위험 ${evidence.risk || 'normal'}, 문맥 ${evidence.context || 'normal'}${attempt ? ' · 검증 실패 후 1회 승격' : ''}` };
}

/** Host-owned orchestration. Adapters reuse the creation/delivery/model brokers.
 * Durable intent precedes every external effect. Recovery never replays it.
 * Scope locks coordinate workers; they are not a CLI filesystem sandbox.
 */
export class TaskOrchestration {
  constructor({ file, catalog, createSession, delivery, runtime, read, models, launchedModel, actualModel, answer, stop,
    defaults, audit = async () => ({ available: false, reason: '파일 관찰 어댑터 없음' }), publish = () => {}, now = Date.now }) {
    Object.assign(this, { file, catalog, createSession, delivery, runtime, read, models, launchedModel, actualModel, answer, stop, defaults, audit, publish, now });
    this.data = { version: 1, revision: 0, policyRevision: 0, policy: null, runs: [] };
    this.queue = Promise.resolve(); this.inflight = new Set(); this.closed = false;
    try {
      if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error('작업 기록이 너무 큽니다.');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.version !== 1 || !Number.isSafeInteger(data.revision) || !Array.isArray(data.runs) || data.runs.length > 100
        || data.runs.some(r => !key(r.requestKey) || !text(r.id, 128) || !text(r.ownerId, 200) || !Array.isArray(r.tasks) || r.tasks.length > 32
          || r.tasks.some(t => !key(t.id) || !states.has(t.state) || !Array.isArray(t.attempts)))) throw Error('작업 기록 형식 오류');
      this.data = data;
      for (const run of data.runs) for (const task of run.tasks) if (active.has(task.state) && !['result_submitted', 'verifying'].includes(task.state)) {
        task.state = 'reconcile_required'; task.reason = '앱 재시작 후 실제 세션·전달 확인 필요';
      }
      this.save();
    } catch (error) { if (error.code !== 'ENOENT') this.unavailable = true; }
  }
  save() {
    if (this.unavailable) throw fail('작업 저장소를 확인하세요. 자동 실행을 중단했습니다.', 503);
    this.data.revision++;
    try {
      const serialized = JSON.stringify(this.data);
      if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) throw Error('작업 저장 한도');
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', serialized, { mode: 0o600 });
      fs.renameSync(this.file + '.tmp', this.file);
    } catch { this.unavailable = true; throw fail('작업 기록 저장 실패. 자동 실행을 중단했습니다.', 503); }
    // Event carries only invalidation metadata, never prompts/transcripts/images.
    this.publish({ revision: this.data.revision });
  }
  policy() { return copy(this.data.policy || Object.fromEntries(levels.map(level => [level, this.defaults()]))); }
  session(id) { return (this.catalog().agents || []).find(a => a.id === id); }
  folderFor(id) {
    const agent = this.session(id), project = (this.catalog().projects || []).find(p => p.id === agent?.projectId);
    return fs.realpathSync(this.runtime(id)?.cwd || agent?.folder || project?.folder || '');
  }
  worker(id) { return this.data.runs.flatMap(r => r.tasks.map(t => ({ run: r, task: t }))).find(x => x.task.attempts.some(a => a.sessionId === id)); }
  owned(id, runId, operator) {
    const run = this.data.runs.find(r => r.id === runId);
    if (!run || (!operator && run.ownerId !== id && !run.tasks.some(t => t.attempts.some(a => a.sessionId === id)))) throw fail('실행 접근 권한이 없습니다.', 404);
    return run;
  }
  summary(run) { return { id: run.id, ownerId: run.ownerId, projectId: run.projectId, title: run.title, state: run.state,
    updatedAt: run.updatedAt, counts: Object.fromEntries([...states].map(s => [s, run.tasks.filter(t => t.state === s).length])) }; }
  view(run) { const value = copy(run); delete value.signature; for (const t of value.tasks) for (const a of t.attempts) delete a.fileBaseline; return value; }
  board(run, body) {
    const known = body.taskVersions;
    if (known != null && (typeof known !== 'object' || Array.isArray(known) || Object.keys(known).length > 32
      || Object.entries(known).some(([id, value]) => !key(id) || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)))) throw fail('잘못된 작업 변경분 요청', 400);
    if (body.detailTaskId != null && !run.tasks.some(t => t.id === body.detailTaskId)) throw fail('작업을 찾을 수 없습니다.', 404);
    const tasks = run.tasks.map(t => ({ id: t.id, title: t.title, role: t.role, state: t.state, reason: t.reason, dependsOn: t.dependsOn,
      attempts: t.attempts.slice(-1).map(a => ({ id: a.id, requestedModel: a.requestedModel })) }));
    const taskVersions = Object.fromEntries(tasks.map(t => [t.id, digest(t)]));
    const changed = tasks.filter(t => known?.[t.id] !== taskVersions[t.id]);
    const selected = run.tasks.find(t => t.id === body.detailTaskId);
    const detail = selected ? copy(selected) : null;
    if (detail) for (const a of detail.attempts) delete a.fileBaseline;
    const detailVersion = detail ? digest(detail) : null;
    const detailChanged = detail && detailVersion !== body.detailVersion;
    if (body.revision === this.data.revision && !changed.length && known && Object.keys(known).length === tasks.length && !detailChanged) return { unchanged: true, revision: this.data.revision };
    // Board polling never contains prompts or every worker's checks/transcript.
    // Digests allow reconnects and missed revisions without a server-side cache.
    return { revision: this.data.revision, run: { ...this.summary(run), policy: copy(run.policy) }, tasks: copy(changed), taskIds: tasks.map(t => t.id), taskVersions,
      ...(detailChanged ? { detail, detailVersion } : {}) };
  }
  async handle({ agentId, action, body = {}, operator = false }) {
    if (action === 'wait') {
      if (this.unavailable || this.closed) throw fail('작업 저장소를 사용할 수 없습니다.', 503);
      if (!Number.isSafeInteger(body.revision) || !Number.isInteger(body.waitMs ?? 10000) || (body.waitMs ?? 10000) < 0 || (body.waitMs ?? 10000) > 10000) throw fail('잘못된 대기 요청', 400);
      if (!operator && !this.runtime(agentId)) throw fail('호출 세션이 실행 중이 아닙니다.', 403);
      this.owned(agentId, body.runId, operator);
      const deadline = this.now() + (body.waitMs ?? 10000);
      while (!this.closed && this.data.revision === body.revision && this.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      return { revision: this.data.revision, changed: this.data.revision !== body.revision, run: this.view(this.owned(agentId, body.runId, operator)) };
    }
    const operation = this.queue.catch(() => {}).then(() => this.command({ agentId, action, body, operator }));
    this.queue = operation; return operation;
  }
  async command({ agentId, action, body, operator }) {
    if (this.unavailable || this.closed) throw fail('작업 저장소를 사용할 수 없습니다.', 503);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 64 * 1024) throw fail('작업 요청 형식 오류', 400);
    if (!operator && (!this.session(agentId) || !this.runtime(agentId))) throw fail('호출 세션이 실행 중이 아닙니다.', 403);
    if (action === 'navigation') {
      if (!operator) throw fail('세션 탐색 상태는 사용자 화면에서 조회하세요.', 403);
      if (!Array.isArray(body.sessionIds) || body.sessionIds.length > 1024 || body.sessionIds.some(id => typeof id !== 'string' || !id || id.length > 200)) throw fail('잘못된 세션 목록', 400);
      if (body.revision === this.data.revision) return { revision: this.data.revision, unchanged: true };
      const ids = new Set(body.sessionIds), sessions = {};
      for (const run of this.data.runs) for (const task of run.tasks) task.attempts.forEach((attempt, index) => {
        if (ids.has(attempt.sessionId)) sessions[attempt.sessionId] = { ownerId: run.ownerId, runId: run.id, taskId: task.id, role: task.role,
          state: index === task.attempts.length - 1 ? task.state : 'failed', model: attempt.requestedModel, attempt: index + 1 };
      });
      return { revision: this.data.revision, sessions };
    }
    if (action === 'list') {
      const offset = body.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0) throw fail('잘못된 페이지', 400);
      const runs = this.data.runs.filter(r => operator || r.ownerId === agentId || r.tasks.some(t => t.attempts.some(a => a.sessionId === agentId)))
        .filter(r => !body.ownerId || r.ownerId === body.ownerId).sort((a, b) => b.updatedAt - a.updatedAt);
      return { revision: this.data.revision, runs: runs.slice(offset, offset + 20).map(r => this.summary(r)), nextOffset: offset + 20 < runs.length ? offset + 20 : null };
    }
    if (action === 'policy') return { policy: this.policy(), revision: this.data.policyRevision };
    if (action === 'catalog') {
      if (!operator || !this.session(body.ownerId)) throw fail('A 세션을 선택하세요.', 403);
      return this.models(body.ownerId);
    }
    if (action === 'policy-save') {
      if (!operator) throw fail('모델 정책은 사용자 설정에서 변경하세요.', 403);
      if (body.revision !== this.data.policyRevision) throw fail('모델 정책을 다시 불러오세요.');
      const policy = {};
      for (const level of levels) { policy[level] = normalizeSessionModel(body.policy?.[level]); if (!policy[level]) throw fail('세 등급의 모델을 설정하세요.', 400); await this.checkModel(policy[level], body.ownerId); }
      this.data.policy = policy; this.data.policyRevision++; this.save(); return { policy: copy(policy), revision: this.data.policyRevision };
    }
    if (action === 'plan') return this.plan(agentId, body, operator);
    const run = this.owned(agentId, body.runId, operator);
    const owner = operator || run.ownerId === agentId;
    if (action === 'get') {
      if (!owner && this.worker(agentId)?.task) await this.syncAttempt(run, this.worker(agentId).task);
      if (body.view === 'board') return this.board(run, body);
      if (body.revision === this.data.revision) return { unchanged: true, revision: this.data.revision };
      return { run: this.view(run), revision: this.data.revision };
    }
    const task = run.tasks.find(t => t.id === body.taskId), attempt = task?.attempts.at(-1);
    if (action === 'answer' && !operator) throw fail('질문·승인은 사용자 화면에서 답변하세요.', 403);
    if (['pause', 'resume', 'cancel', 'retry', 'override', 'review', 'answer', 'reconcile', 'finish'].includes(action) && !owner) throw fail('A 또는 사용자만 제어할 수 있습니다.', 403);
    if (action === 'pause') { if (run.state !== 'running') throw fail('진행 중인 실행만 정지할 수 있습니다.'); run.state = 'paused'; }
    else if (action === 'resume') { if (run.state !== 'paused') throw fail('정지된 실행만 재개할 수 있습니다.'); run.state = 'running'; }
    else if (action === 'cancel') {
      if (run.state === 'completed') throw fail('완료 실행입니다.');
      run.state = 'cancelling'; this.touch(run);
      for (const t of run.tasks) {
        if (terminal.has(t.state)) continue;
        const a = t.attempts.at(-1);
        if (!a) { t.state = 'cancelled'; continue; }
        if (!this.runtime(a.sessionId)) {
          t.state = this.inflight.has(a.id) ? 'reconcile_required' : 'cancelled';
          t.reason = this.inflight.has(a.id) ? '생성 중 취소 요청 · 생성 결과와 종료 확인 필요' : '종료 확인'; continue;
        }
        try { await this.stop(a.sessionId); t.state = 'cancelled'; t.reason = '종료 확인'; }
        catch { t.state = 'reconcile_required'; t.reason = '취소 요청 후 실제 종료 확인 실패'; }
        this.touch(run);
      }
      if (run.tasks.every(t => terminal.has(t.state))) run.state = 'cancelled';
    } else if (action === 'finish') {
      if (!['running', 'paused', 'awaiting_summary'].includes(run.state) || run.tasks.some(t => t.required && t.state !== 'completed') || run.tasks.some(t => active.has(t.state))) throw fail('모든 필수 작업을 검증한 뒤 보고하세요.');
      if (!text(body.summary, 6000)) throw fail('최종 결과 요약이 필요합니다.', 400);
      run.state = 'completed'; run.summary = body.summary;
    } else {
      if (!task) throw fail('작업을 찾을 수 없습니다.', 404);
      if (['retry', 'override', 'review', 'answer', 'result'].includes(action) && !['running', 'paused', 'awaiting_summary'].includes(run.state)) throw fail('종료 또는 취소 중인 실행입니다.');
      if (action === 'override') {
        if (!['planned', 'ready'].includes(task.state)) throw fail('시작 전인 작업만 모델을 변경할 수 있습니다.');
        const settings = normalizeSessionModel(body.modelOverride); if (!settings) throw fail('모델 형식 오류', 400);
        await this.checkModel(settings, run.ownerId);
        if (!['planned', 'ready'].includes(task.state)) throw fail('이미 시작된 작업입니다.');
        task.modelOverride = settings; task.reason = '다음 배정에 사용자 모델 적용';
      } else if (action === 'retry') {
        if (task.state !== 'failed' || task.attempts.length >= 2) throw fail('실패한 작업만 최대 2회 시도할 수 있습니다.');
        if (attempt && this.runtime(attempt.sessionId)) await this.stop(attempt.sessionId);
        if (body.modelOverride != null) { const settings = normalizeSessionModel(body.modelOverride); if (!settings) throw fail('모델 형식 오류', 400); await this.checkModel(settings, run.ownerId); task.modelOverride = settings; }
        task.state = 'planned'; task.reason = '새 시도 대기'; task.result = null;
        if (run.state === 'awaiting_summary') run.state = 'running';
      } else if (action === 'review') {
        if (!['result_submitted', 'verifying'].includes(task.state) || body.attemptId !== attempt?.id || typeof body.accept !== 'boolean' || !text(body.note)) throw fail('현재 제출 결과와 검토 근거가 필요합니다.');
        task.state = 'verifying'; this.touch(run);
        // A result can be submitted from an MCP tool before the worker's turn
        // ends. Keep its file lock until that exact turn actually stops.
        const current = await this.read(attempt.sessionId);
        if (this.runtime(attempt.sessionId) && (current?.sessionId !== attempt.conversationId || current?.turn?.id !== attempt.turnId || current.question || current.lifecycle === 'working')) throw fail('결과는 저장되었습니다. 해당 작업 턴이 끝난 뒤 검토를 완료하세요.');
        // The result tool may be followed by more worker actions in the same
        // turn. Observe once more after it stops, before releasing its lock.
        await this.captureAudit(run, attempt);
        const outside = [...new Set([...task.result.changedFiles.filter(file => !task.scopes.some(scope => overlaps(scope, taskPath(run.folder, file)) && (taskPath(run.folder, file) === scope || taskPath(run.folder, file).startsWith(scope + path.sep)))), ...(attempt.fileAudit?.unassigned || [])])];
        const passed = task.result.checks.length > 0 && task.result.checks.every(c => c.passed === true);
        task.review = { accept: body.accept, note: body.note, at: this.now(), outside };
        task.state = body.accept && passed && !outside.length ? 'completed' : 'failed';
        task.reason = outside.length ? '수정 범위 밖 변경: 검토 필요' : !passed ? '검증 실패 또는 검증 근거 없음' : body.note;
      } else if (action === 'result') {
        if (operator || agentId !== attempt?.sessionId || body.attemptId !== attempt.id || !['running', 'dispatching'].includes(task.state)) throw fail('현재 담당 시도만 결과를 제출할 수 있습니다.');
        await this.syncAttempt(run, task);
        if (task.state !== 'running' || !attempt.turnId || body.conversationId !== attempt.conversationId || body.turnId !== attempt.turnId) throw fail('현재 전달의 대화·턴이 아닙니다.');
        const current = await this.read(attempt.sessionId);
        if (current?.sessionId !== attempt.conversationId || current.turn?.id !== attempt.turnId || current.question) throw fail('현재 대화·턴 또는 질문 상태가 다릅니다.');
        const actual = await this.actualModel(attempt.sessionId, attempt.sentAt);
        if (!taskModelsMatch(actual, attempt.requestedModel)) { task.state = 'reconcile_required'; task.reason = '실제 턴 모델·effort·Fast 불일치 또는 미확인'; this.touch(run); throw fail(task.reason); }
        const result = body.result;
        if (!text(result?.summary, 6000) || !Array.isArray(result.changedFiles) || result.changedFiles.length > 100 || result.changedFiles.some(p => !text(p, 4096))
          || !Array.isArray(result.checks) || result.checks.length > 30 || result.checks.some(c => !text(c.command, 500) || typeof c.passed !== 'boolean' || !text(c.output, 2000))
          || (result.artifacts != null && (!Array.isArray(result.artifacts) || result.artifacts.length > 30 || result.artifacts.some(p => !text(p, 4096))))
          || (result.issues != null && result.issues !== '' && !text(result.issues, 3000))) throw fail('결과 요약·변경 파일·검증 명령과 결과가 필요합니다.', 400);
        for (const file of result.changedFiles) taskPath(run.folder, file);
        await this.captureAudit(run, attempt);
        attempt.actualModel = actual;
        task.result = copy({ summary: result.summary, changedFiles: result.changedFiles, checks: result.checks, artifacts: result.artifacts || [], issues: result.issues || '' });
        task.state = 'result_submitted'; task.reason = 'A의 검토 대기';
      } else if (action === 'answer') {
        if (!['waiting_user', 'waiting_approval'].includes(task.state) || body.attemptId !== attempt?.id || body.request?.questionId !== task.question?.id || body.request?.sessionId !== attempt.conversationId) throw fail('원래 질문 ID와 현재 시도를 확인하세요.');
        await this.answer(attempt.sessionId, body.request); task.state = 'running'; delete task.question; task.reason = '답변 전달 확인';
      } else if (action === 'reconcile') {
        if (task.state !== 'reconcile_required') throw fail('상태 확인이 필요한 작업이 아닙니다.');
        if (body.markFailed === true) {
          if (attempt && this.runtime(attempt.sessionId)) throw fail('담당 세션을 먼저 종료하세요.');
          task.state = 'failed'; task.reason = '사용자가 종료 상태를 확인함';
        } else await this.syncAttempt(run, task, true);
      } else throw fail('지원하지 않는 작업 API', 404);
    }
    if (run.state === 'cancelling' && run.tasks.every(t => terminal.has(t.state))) run.state = 'cancelled';
    this.touch(run); this.schedule(); return { run: this.view(run), revision: this.data.revision };
  }
  touch(run) { run.updatedAt = this.now(); this.save(); }
  async captureAudit(run, attempt) {
    const after = await this.audit(run.folder), before = attempt.fileBaseline;
    if (after.available && before?.available) {
      const observed = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].filter(file => before.files[file] !== after.files[file]);
      const allScopes = this.data.runs.filter(r => !['completed', 'cancelled'].includes(r.state)).flatMap(r => r.tasks.flatMap(t => t.scopes));
      attempt.fileAudit = { available: true, observed, unassigned: observed.filter(file => !allScopes.some(scope => { const value = taskPath(run.folder, file); return value === scope || value.startsWith(scope + path.sep); })) };
    } else attempt.fileAudit = { available: false, reason: after.reason || before?.reason || '기준점 없음' };
  }
  waiting(run, task, reason) { if (task.reason !== reason) { task.reason = reason; this.touch(run); } }
  async checkModel(settings, ownerId) {
    const catalog = await this.models(ownerId);
    const selected = catalog.models.find(m => m.model === settings.model);
    if (!selected || settings.effort && !selected.efforts.some(e => e.effort === settings.effort)
      || settings.serviceTier != null && !['default', 'fast'].includes(settings.serviceTier)) throw fail('지원되지 않는 작업 모델·effort·Fast입니다.', 400);
  }
  async plan(agentId, body, operator) {
    const ownerId = operator ? body.ownerId : agentId, owner = this.session(ownerId);
    if (this.worker(ownerId)) throw fail('하위 세션은 추가 위임할 수 없습니다.', 403);
    const project = (this.catalog().projects || []).find(p => p.id === owner?.projectId);
    if (!owner || owner.aiToolId !== 'codex' || owner.sshHostId || project?.sshHostId || !project?.folder || !this.runtime(ownerId)) throw fail('실행 중인 로컬 Codex A 세션이 필요합니다.', 400);
    const folder = this.folderFor(ownerId);
    if (!key(body.requestKey) || !text(body.title, 200) || !text(body.request, 6000) || !Array.isArray(body.tasks) || !body.tasks.length || body.tasks.length > 32) throw fail('계획·요청 키·1~32개 작업을 지정하세요.', 400);
    const signature = digest(body), old = this.data.runs.find(r => r.ownerId === ownerId && r.requestKey === body.requestKey);
    if (old) { if (old.signature !== signature) throw fail('같은 요청 키에 다른 계획을 사용할 수 없습니다.'); return { run: this.view(old), revision: this.data.revision }; }
    if (this.data.runs.length >= 100) throw fail('실행 기록 한도에 도달했습니다.', 503);
    const concurrency = body.concurrency ?? 2;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw fail('동시 실행은 1~4개입니다.', 400);
    const ids = new Set(body.tasks.map(t => t.id)), policy = this.policy();
    if (ids.size !== body.tasks.length) throw fail('작업 ID 중복', 400);
    const tasks = body.tasks.map(t => {
      if (!key(t.id) || !text(t.title, 120) || !text(t.goal, 2000) || !text(t.acceptance, 2000) || !Array.isArray(t.dependsOn) || t.dependsOn.some(id => !ids.has(id) || id === t.id)
        || !Array.isArray(t.writeScopes) || t.writeScopes.length > 32 || t.required != null && typeof t.required !== 'boolean'
        || t.modelOverride != null && !normalizeSessionModel(t.modelOverride)) throw fail('작업 범위·선행 관계·완료 조건을 확인하세요.', 400);
      const assessment = t.assessment || {};
      if (Buffer.byteLength([t.goal, t.acceptance, ...t.writeScopes].join('\n')) > 5500) throw fail('목표·완료 조건·경로 합계는 UTF-8 5,500바이트 이내로 지정하세요.', 400);
      if (['complexity', 'risk'].some(k => assessment[k] != null && !['low', 'normal', 'high'].includes(assessment[k]))
        || assessment.context != null && !['small', 'normal', 'large'].includes(assessment.context) || assessment.tools != null && typeof assessment.tools !== 'boolean') throw fail('작업 평가 형식 오류', 400);
      return { id: t.id, title: t.title, goal: t.goal, acceptance: t.acceptance, role: typeof t.role === 'string' ? t.role.slice(0, 80) : 'worker',
        dependsOn: [...new Set(t.dependsOn)], writeScopes: t.writeScopes, scopes: t.writeScopes.map(p => taskPath(folder, p)),
        required: t.required !== false, assessment, ...(t.modelOverride ? { modelOverride: normalizeSessionModel(t.modelOverride) } : {}), state: 'planned', attempts: [] };
    });
    const visiting = new Set(), visited = new Set();
    function visit(t) { if (visiting.has(t.id)) throw fail('순환 의존 관계입니다.', 400); if (visited.has(t.id)) return; visiting.add(t.id); t.dependsOn.forEach(id => visit(tasks.find(x => x.id === id))); visiting.delete(t.id); visited.add(t.id); }
    tasks.forEach(visit);
    for (const task of tasks) await this.checkModel(selectTaskModel(task, policy).settings, ownerId);
    const run = { id: randomUUID(), ownerId, projectId: owner.projectId, folder, requestKey: body.requestKey, signature,
      title: body.title, request: body.request, policy, concurrency, state: 'running', createdAt: this.now(), updatedAt: this.now(), tasks };
    this.data.runs.push(run); this.touch(run); this.schedule(); return { run: this.view(run), revision: this.data.revision };
  }
  schedule() { if (!this.closed && !this.unavailable) queueMicrotask(() => { void this.tick().catch(() => {}); }); }
  async tick() {
    if (this.ticking || this.closed || this.unavailable) return;
    this.ticking = true;
    try {
      for (const run of this.data.runs) {
        if (!['running', 'paused', 'awaiting_summary'].includes(run.state)) continue;
        for (const task of run.tasks) if (['dispatching', 'running', 'waiting_user', 'waiting_approval'].includes(task.state)) await this.syncAttempt(run, task);
        if (run.state !== 'running') continue;
        for (const task of run.tasks) {
          if (!['planned', 'ready'].includes(task.state)) continue;
          if (!task.dependsOn.every(id => run.tasks.find(t => t.id === id).state === 'completed')) { this.waiting(run, task, '선행 작업의 검증 완료 대기'); continue; }
          const executing = run.tasks.filter(t => active.has(t.state));
          if (executing.length >= run.concurrency) { this.waiting(run, task, '동시 실행 한도 대기'); continue; }
          const locked = this.data.runs.flatMap(r => r.tasks).filter(t => active.has(t.state));
          if (locked.some(t => task.scopes.some(a => t.scopes.some(b => overlaps(a, b))))) { this.waiting(run, task, '수정 파일 범위 충돌 대기'); continue; }
          task.state = 'ready'; this.touch(run);
          // Reserve synchronously; independent worker launches then run in parallel.
          const chosen = selectTaskModel(task, run.policy, task.attempts.length);
          const attempt = { id: randomUUID(), sessionId: randomUUID(), deliveryKey: randomUUID(), requestedModel: chosen.settings,
            selection: chosen, createdAt: this.now(), creationReserved: true };
          task.attempts.push(attempt); task.state = 'dispatching'; task.reason = '전용 하위 세션 생성 예약'; this.touch(run);
          this.inflight.add(attempt.id);
          void this.dispatch(run, task, attempt).catch(error => {
            if (this.unavailable || this.closed) return;
            if (!terminal.has(task.state)) { task.state = 'reconcile_required'; task.reason = String(error.message || error).slice(0, 500); this.touch(run); }
          }).finally(() => { this.inflight.delete(attempt.id); this.schedule(); });
        }
        if (run.tasks.every(t => terminal.has(t.state)) && run.tasks.filter(t => t.required).every(t => t.state === 'completed')) { run.state = 'awaiting_summary'; this.touch(run); }
      }
    } finally { this.ticking = false; }
  }
  async dispatch(run, task, attempt) {
    await this.checkModel(attempt.requestedModel, run.ownerId);
    if (this.closed || task.state !== 'dispatching') return;
    if (!['running', 'paused'].includes(run.state)) { task.state = 'cancelled'; task.reason = '생성 전 취소 확인'; this.touch(run); return; }
    if (this.session(run.ownerId)?.projectId !== run.projectId || taskPath(run.folder, '.') !== taskPath(this.folderFor(run.ownerId), '.')) throw fail('A의 프로젝트·작업 폴더가 변경되었습니다. 상태를 확인하세요.');
    const result = await this.createSession({ id: attempt.sessionId, ownerId: run.ownerId, projectId: run.projectId, folder: run.folder, name: task.title, modelSettings: attempt.requestedModel });
    if (result.id !== attempt.sessionId || result.startError) throw fail(result.startError || '생성 세션 ID 불일치');
    attempt.creationAcknowledged = true; this.touch(run);
    if (!['running', 'paused'].includes(run.state)) {
      try { await this.stop(attempt.sessionId); task.state = 'cancelled'; }
      catch { task.state = 'reconcile_required'; run.state = 'cancelling'; task.reason = '생성 직후 취소: 실제 종료 확인 실패'; }
      this.touch(run); return;
    }
    const deadline = this.now() + 30000;
    while (!this.closed && this.now() < deadline) {
      const current = await this.read(attempt.sessionId);
      if (current && !current.question && taskModelsMatch(this.launchedModel(attempt.sessionId), attempt.requestedModel)) { attempt.conversationId = current.sessionId ?? null; attempt.launchModelVerified = true; break; }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (this.closed || !attempt.launchModelVerified) throw fail('첫 전달 전 모델·대화 확인 실패');
    if (taskPath(run.folder, '.') !== taskPath(this.folderFor(attempt.sessionId), '.')) throw fail('하위 CLI의 실제 작업 폴더가 실행 범위와 다릅니다.');
    await this.checkModel(attempt.requestedModel, attempt.sessionId);
    attempt.fileBaseline = await this.audit(run.folder);
    if (!['running', 'paused'].includes(run.state)) throw fail('배정 중 취소됨');
    const message = ['Acedia 독립 작업. 추가 위임하지 말고 맡은 작업을 수행하세요.', `runId=${run.id} taskId=${task.id} attemptId=${attempt.id}`,
      `목표: ${task.goal}`, `완료 조건: ${task.acceptance}`, `수정 범위: ${task.writeScopes.join(', ') || '읽기 전용'}`,
      '선행 결과는 acedia_task_get의 dependsOn과 해당 결과를 조회하세요. 부모 대화 전체를 복사하지 않습니다.', '질문·승인은 원래 Codex 요청을 사용하세요. 완료 후 acedia_task_get으로 정확한 conversationId/turnId를 조회하고 acedia_task_result로 summary, changedFiles, checks(command, passed, output), artifacts, issues를 제출하세요. 전달 시작이나 한 턴 종료만으로 완료되지 않습니다.'].join('\n');
    attempt.sendReserved = true; attempt.sentAt = this.now(); this.touch(run);
    await this.delivery.handle({ action: 'send', agentId: run.ownerId, freshSession: true, body: { sessionId: attempt.sessionId, expectedConversationId: attempt.conversationId, requestKey: attempt.deliveryKey, message, waitMs: 0 } });
    await this.syncAttempt(run, task);
  }
  async syncAttempt(run, task, recover = false) {
    const attempt = task.attempts.at(-1); if (!attempt || this.closed) return;
    const eligible = () => task.attempts.at(-1) === attempt && (['dispatching', 'running', 'waiting_user', 'waiting_approval'].includes(task.state) || recover && task.state === 'reconcile_required');
    if (!eligible()) return;
    if (!attempt.sendReserved) { if (recover) { task.reason = '생성 예약 후 전달 근거 없음. 자동 재전송하지 않습니다.'; this.touch(run); } return; }
    if (!this.runtime(attempt.sessionId)) { task.state = 'reconcile_required'; task.reason = '담당 CLI 종료 또는 연결 단절: 실제 상태 확인 필요'; this.touch(run); return; }
    if (recover) await this.delivery.reconcile?.(run.ownerId, attempt.deliveryKey);
    const receipt = await this.delivery.handle({ action: 'delivery', agentId: run.ownerId, body: { requestKey: attempt.deliveryKey, waitMs: 0 } }).catch(() => null);
    if (!eligible() || receipt?.targetId !== attempt.sessionId || attempt.conversationId && receipt?.conversationId !== attempt.conversationId) return;
    if (receipt.status !== 'started') {
      if (['failed', 'unconfirmed'].includes(receipt.status)) { task.state = 'reconcile_required'; task.reason = `전달 확인 필요: ${receipt.reason || receipt.status}`; this.touch(run); }
      return;
    }
    if (attempt.turnId && attempt.turnId !== receipt.turnId) return;
    if (!receipt.conversationId) return;
    attempt.conversationId = receipt.conversationId;
    attempt.turnId = receipt.turnId; attempt.startedAt = receipt.startedAt;
    const current = await this.read(attempt.sessionId);
    if (!eligible()) return;
    if (!current || current.sessionId !== attempt.conversationId || current.turn?.id !== attempt.turnId) {
      task.state = 'reconcile_required'; task.reason = '현재 대화·턴 근거 불일치'; this.touch(run);
      return;
    }
    if (!['dispatching', 'running', 'waiting_user', 'waiting_approval'].includes(task.state) && !recover) return;
    if (current.question) {
      const question = copy(current.question);
      const state = question.toolName === 'command-approval' || question.kind === 'approval' || question.approval ? 'waiting_approval' : 'waiting_user';
      if (task.state !== state || JSON.stringify(task.question) !== JSON.stringify(question)) { task.question = question; task.state = state; task.reason = state === 'waiting_approval' ? '원래 명령 승인 대기' : '사용자 답변 대기'; this.touch(run); }
    } else if (task.state !== 'running') { task.state = 'running'; delete task.question; task.reason = '정확한 전달 시작 확인 · 결과 제출 대기'; this.touch(run); }
  }
  close() { this.closed = true; }
}
