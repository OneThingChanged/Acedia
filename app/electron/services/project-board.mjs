import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const short = (value, size = 1000) => typeof value === 'string' ? value.slice(0, size) : '';
const attention = new Set(['waiting', 'review', 'completed', 'interrupted', 'failed', 'unknown']);
const interrupted = new Set(['cancelled', 'canceled', 'interrupted', 'aborted']);
const taskIdentity = (run, task, attempt) => JSON.stringify([run.id, task.id, attempt?.id || null]);

/** Host-owned, bounded projection. No transcripts, tool arguments, credentials or PTY subscriptions. */
export class ProjectBoard {
  constructor({ file, catalog, live, hook, runs, now = Date.now }) {
    Object.assign(this, { file, catalog, live, hook, runs, now });
    this.data = { version: 2, acknowledged: {}, preferences: {}, results: {}, inbox: {} };
    this.observed = new Map();
    this.devices = new Map();
    this.references = new Map();
    try {
      if (fs.statSync(file).size > 4 * 1024 * 1024) throw Error();
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (![1, 2].includes(stored.version) || !stored.acknowledged || Array.isArray(stored.acknowledged)
        || typeof stored.acknowledged !== 'object' || !stored.preferences || typeof stored.preferences !== 'object') throw Error();
      if (stored.inbox && (typeof stored.inbox !== 'object' || Array.isArray(stored.inbox))) throw Error();
      if (Object.entries(stored.inbox || {}).some(([id, i]) => !i || id !== i.id || !/^[a-f0-9]{64}$/.test(id)
        || typeof i.sessionId !== 'string' || i.kind !== 'result' || !Number.isFinite(i.createdAt)
        || typeof i.summary !== 'string' || !/^[a-f0-9]{64}$/.test(i.fingerprint))) throw Error();
      this.data = { ...stored, version: 2, results: stored.results || {}, inbox: stored.inbox || {} };
    } catch (error) { if (error.code !== 'ENOENT') this.storageError = '보드 설정을 읽지 못했습니다. 기존 파일을 확인하세요.'; }
  }
  save(next) {
    if (this.storageError) throw Error(this.storageError);
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw Error('보드 기록 저장 한도를 초과했습니다.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', serialized, { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file); this.data = next; this.writeError = null;
  }
  observe(event) {
    if (!event?.id) return;
    const state = ['tool-start', 'tool-end'].includes(event.event) ? 'working' : event.event;
    if (['working', 'background-wait', 'done', 'blocked', 'waiting', 'question', 'session-start', ...interrupted].includes(state)) {
      const previous = this.observed.get(event.id) || this.data.results[event.id];
      const result = { event: state, at: event.received_at || this.now(), summary: short(event.assistant_message), reason: short(event.interactive_question), detachedTask: previous?.detachedTask || null,
        execution: previous?.execution || '', resultKey: previous?.resultKey || null, startedAt: previous?.startedAt || 0, tool: event.event === 'tool-start' ? short(event.tool_name, 160) : '', backgroundCount: state === 'background-wait' ? event.background_count : undefined };
      if (event.event === 'working') {
        result.execution = digest([event.session_id || event.id, result.at]); result.startedAt = result.at;
      }
      if (state === 'done') result.resultKey = previous?.resultKey && this.data.inbox[previous.resultKey]?.execution === result.execution && this.data.inbox[previous.resultKey]?.summary === result.summary
        ? previous.resultKey : digest(['response', event.id, event.session_id || '', result.execution, result.at, result.summary]);
      if (event.event === 'working') {
        const candidates = (this.runs() || []).flatMap(run => (run.tasks || []).filter(t => t.attempts?.at(-1)?.sessionId === event.id).map(task => ({ run, task, attempt: task.attempts.at(-1) })));
        const latest = candidates.sort((a, b) => b.run.updatedAt - a.run.updatedAt)[0];
        // A new user turn after a finished assignment is separate work. Late
        // tool-end/done events from the old worker never detach its verified result.
        if (latest && ['completed', 'failed', 'cancelled'].includes(latest.task.state) && result.at > latest.run.updatedAt) result.detachedTask = taskIdentity(latest.run, latest.task, latest.attempt);
      }
      this.observed.set(event.id, result);
      if (this.observed.size > 1000) this.observed.delete(this.observed.keys().next().value);
      const saved = this.data.results[event.id];
      if (!saved || saved.event !== state || saved.execution !== result.execution || saved.detachedTask !== result.detachedTask || state !== 'working') {
        const results = { ...this.data.results, [event.id]: result };
        for (const id of Object.keys(results).slice(0, Math.max(0, Object.keys(results).length - 1000))) delete results[id];
        let inbox = this.data.inbox;
        if (state === 'done') inbox = this.withResult(inbox, { id: result.resultKey, sessionId: event.id, createdAt: result.at, summary: result.summary,
          scope: 'response', conversationId: short(event.session_id, 256), execution: result.execution, observedAt: result.at });
        try { this.save({ ...this.data, results, inbox }); } catch { this.writeError = '보드 기록을 저장하지 못했습니다. 저장소 상태를 확인하세요.'; }
      }
    }
    const tool = short(event.tool_name, 160);
    const kind = /(?:computer[_-]?use|cua_repl|computer\.(?:click|type|screenshot)|desktop[_-]?(?:click|input|control))/i.test(tool) ? 'desktop'
      : /(?:browser|playwright|puppeteer)/i.test(tool) ? 'browser' : null;
    if (['done', 'session-start', ...interrupted].includes(event.event)) for (const [key, item] of this.devices) if (item.sessionId === event.id) this.devices.delete(key);
    if (!kind) return;
    const key = `${event.id}:${tool}`;
    if (['tool-start', 'PreToolUse'].includes(event.event)) this.devices.set(key, { sessionId: event.id, kind, tool, startedAt: this.now(), source: 'hook' });
    if (['tool-end', 'PostToolUse', 'PostToolUseFailure'].includes(event.event)) this.devices.delete(key);
  }
  async browserAction(id, action, task) {
    if (['status', 'tabs', 'show', 'hide'].includes(action)) return task();
    const key = Symbol();
    this.devices.set(key, { sessionId: id, kind: 'browser', tool: `Acedia · ${action}`, source: 'bridge', startedAt: this.now() });
    try { return await task(); } finally { this.devices.delete(key); }
  }
  withResult(inbox, item) {
    if (inbox[item.id]) {
      // A replayed completion can have a later receipt time. Keep its identity,
      // review state and content while correlating the legacy desktop notice.
      return item.observedAt > (inbox[item.id].observedAt || 0)
        ? { ...inbox, [item.id]: { ...inbox[item.id], observedAt: item.observedAt } } : inbox;
    }
    const next = { ...inbox };
    const reviewed = Object.values(next).filter(i => i.reviewedAt).sort((a, b) => a.createdAt - b.createdAt);
    while (Object.keys(next).length >= 1500 && reviewed.length) delete next[reviewed.shift().id];
    if (Object.keys(next).length >= 1500) { this.capacityError = '미확인 결과가 저장 한도에 도달했습니다. 결과를 확인한 뒤 다시 갱신하세요.'; return inbox; }
    this.capacityError = null;
    const value = { ...item, kind: 'result', summary: short(item.summary), reviewedAt: item.reviewedAt || null };
    value.fingerprint = digest([value.id, value.summary, value.scope, value.createdAt]);
    next[value.id] = value; return next;
  }
  async referenceRead(sessionId, targets, task) {
    const keys = [...new Set(targets)].filter(id => id && id !== sessionId).slice(0, 20).map(targetId => {
      const key = `${sessionId}:${targetId}`, previous = this.references.get(key);
      this.references.set(key, { id: key, from: sessionId, to: targetId, kind: 'message', source: 'session-message-read',
        startedAt: previous?.readers ? previous.startedAt : this.now(), endedAt: null, readers: (previous?.readers || 0) + 1 }); return key;
    });
    try { return await task(); } finally {
      for (const key of keys) { const item = this.references.get(key); if (item) { item.readers--; if (!item.readers) item.endedAt = this.now(); } }
      for (const [key, item] of this.references) if (this.references.size > 300 && !item.readers) this.references.delete(key);
    }
  }
  seedAttention(items) {
    const latest = new Map();
    for (const item of Array.isArray(items) ? items.slice(-100) : []) {
      if (!item?.agentId || !Number.isFinite(item.createdAt) || latest.get(item.agentId)?.createdAt > item.createdAt) continue;
      latest.set(item.agentId, item);
    }
    const results = { ...this.data.results }; let changed = false;
    let inbox = this.data.inbox;
    const receipts = new Set(Object.values(inbox).filter(i => i.scope === 'response')
      .flatMap(i => [i.createdAt, i.observedAt].filter(Number.isFinite).map(at => JSON.stringify([i.sessionId, at]))));
    for (const item of Array.isArray(items) ? items.slice(-100) : []) {
      // Desktop notices carry a generic translated label, not the response
      // summary. Correlate by the same hook receipt, never by a fuzzy time window.
      if (item?.kind === 'completed' && item.agentId && Number.isFinite(item.createdAt)
        && !receipts.has(JSON.stringify([item.agentId, item.createdAt]))) inbox = this.withResult(inbox, {
        id: digest(['notice', item.id || '', item.agentId, item.createdAt, short(item.body)]), sessionId: item.agentId,
        summary: short(item.body), createdAt: item.createdAt, scope: 'response', reviewedAt: item.read ? item.createdAt : null });
    }
    for (const [id, item] of latest) {
      if (results[id] || this.observed.has(id)) continue;
      const event = ({ completed: 'done', blocked: 'blocked', waiting: 'waiting', question: 'waiting' })[item.kind];
      if (!event) continue;
      results[id] = { event, at: item.createdAt, summary: event === 'done' ? short(item.body) : '', reason: event !== 'done' ? short(item.body) : '', reviewed: item.read === true }; changed = true;
    }
    if (changed || inbox !== this.data.inbox) try { this.save({ ...this.data, results, inbox }); } catch { this.writeError = '보드 기록을 저장하지 못했습니다. 저장소 상태를 확인하세요.'; }
  }
  snapshot(revision) {
    const source = this.catalog();
    const tasks = new Map();
    for (const run of this.runs() || []) for (const task of run.tasks || []) {
      const attempt = task.attempts?.at(-1);
      if (attempt?.sessionId && (!tasks.has(attempt.sessionId) || tasks.get(attempt.sessionId).updatedAt <= run.updatedAt)) {
        tasks.set(attempt.sessionId, { runId: run.id, taskId: task.id, attemptId: attempt.id || null, identity: taskIdentity(run, task, attempt), title: short(task.title, 200), state: task.state,
          reason: short(task.reason), updatedAt: run.updatedAt, result: short(task.result?.summary),
          question: short(task.question?.question), artifacts: (Array.isArray(task.result?.artifacts) ? task.result.artifacts : [])
            .filter(a => typeof a === 'string').slice(0, 20).map(a => short(a, 4096)) });
      }
    }
    const candidates = [];
    const priorResults = new Map(Object.values(this.data.inbox).map(i => [JSON.stringify([i.sessionId, i.createdAt, i.summary]), i]));
    const sessions = (source.agents || []).map(agent => {
      const hook = this.hook(agent.id), live = this.live(agent.id);
      const recorded = this.observed.get(agent.id) || this.data.results[agent.id];
      const assigned = tasks.get(agent.id), task = recorded?.detachedTask === assigned?.identity ? null : assigned;
      const event = hook?.event || recorded?.event;
      const eventAt = Math.max(hook?.received_at || hook?.lastTs || 0, recorded?.at || 0);
      const liveStatus = live && !hook && !this.observed.has(agent.id)
        && !['waiting-tool', 'waiting-external', 'paused', 'suspended'].includes(agent.activity?.workStatus)
        && ['working', 'background', 'question', 'blocked', 'waiting'].includes(agent.status) ? agent.status : null;
      const work = liveStatus || (eventAt >= (agent.activity?.receivedAt || 0) ? event : agent.activity?.workStatus) || agent.activity?.workStatus || agent.status;
      let state = 'idle';
      if (task) state = ({ waiting_user: 'waiting', waiting_approval: 'waiting', result_submitted: 'review', verifying: 'review',
        completed: 'completed', failed: 'failed', cancelled: 'interrupted', reconcile_required: 'unknown',
        running: 'working', dispatching: 'working', ready: 'planned', planned: 'planned' })[task.state] || 'unknown';
      else if (interrupted.has(event)) state = 'interrupted';
      else if (work === 'done') state = 'review';
      else if (['waiting', 'blocked', 'question', 'permission-request'].includes(work) || agent.status === 'question') state = work === 'blocked' ? 'failed' : 'waiting';
      else if (['working', 'tool-start', 'tool-end'].includes(work)) state = 'working';
      else if (['background-wait', 'background'].includes(work)) state = 'background';
      else if (agent.runtimeStatus === 'unreachable') state = 'unknown';
      else if (agent.runtimeStatus === 'exited' || agent.status === 'exited') state = 'interrupted';
      if (['waiting-tool', 'waiting-external'].includes(work) || ['waiting_tool', 'waiting_dependency'].includes(task?.state)) state = 'waiting_external';
      if (['background-wait', 'background'].includes(work) && ['working', 'idle', 'review'].includes(state)) state = 'background';
      if (['paused', 'suspended'].includes(work) || agent.runtimeStatus === 'suspended') state = 'paused';
      if (agent.runtimeStatus === 'unreachable') state = 'unknown';
      if (!live && ['working', 'background', 'waiting'].includes(state)) state = 'unknown';
      const count = hook?.background_count || recorded?.backgroundCount || agent.activity?.backgroundCount;
      const backgroundCount = state === 'background' && Number.isInteger(count) && count > 0 && count <= 1000 ? count : null;
      const item = { id: agent.id, projectId: agent.projectId, name: short(agent.name, 200), provider: short(agent.aiToolId, 60),
        parentId: agent.sessionHierarchy?.parentId || null,
        folder: short(this.folder(agent, source), 4096),
        runtime: live ? 'running' : agent.deferredStart && agent.resumeEligible ? 'sleeping' : 'stopped', state,
        updatedAt: Math.max(agent.activity?.receivedAt || 0, eventAt, task?.updatedAt || 0),
        summary: task?.result || recorded?.summary || short(agent.activity?.lastAssistantMessage), reason: task?.reason || short(hook?.interactive_question || recorded?.reason || agent.activity?.interactiveQuestion),
        startedAt: recorded?.startedAt || 0, lastActivityAt: Math.max(agent.activity?.receivedAt || 0, recorded?.at || 0),
        backgroundCount,
        step: state === 'working' ? (recorded?.tool ? `${recorded.tool} 실행 중` : task?.title || '작업 실행 중')
          : state === 'background' ? backgroundCount ? `백그라운드 ${backgroundCount}개 작업 완료 대기` : '백그라운드 작업 완료 대기'
          : state === 'idle' ? '할당된 작업 없음' : '', task: task || null };
      // Runtime-only changes do not re-open an already reviewed result.
      item.fingerprint = digest([item.id, state, task ? [task.runId, task.taskId, task.attemptId, task.state, task.question] : item.updatedAt, item.summary, item.reason]);
      item.needsAttention = attention.has(state) && !(!task && recorded?.reviewed) && this.data.acknowledged[item.id] !== item.fingerprint;
      if (['review', 'completed'].includes(state)) {
        const scope = task?.state === 'completed' ? 'task' : task ? 'partial' : 'response';
        const existing = priorResults.get(JSON.stringify([item.id, item.updatedAt, item.summary]));
        const resultId = task ? digest(['task', task.identity, scope, item.summary]) : recorded?.event === 'done' && recorded.resultKey || existing?.id || digest(['catalog', item.id, item.updatedAt, item.summary]);
        item.resultId = resultId;
        candidates.push({ id: resultId, sessionId: item.id, createdAt: item.updatedAt, summary: item.summary, scope,
          runId: task?.runId || null, taskId: task?.taskId || null, artifacts: task?.artifacts || [], reviewedAt: item.needsAttention ? null : this.now() });
      }
      return item;
    });
    const byId = new Map(sessions.map(item => [item.id, item]));
    for (const session of sessions) {
      const visited = new Set([session.id]); let parent = byId.get(session.parentId);
      while (parent && parent.projectId === session.projectId && !visited.has(parent.id)) { visited.add(parent.id); parent = byId.get(parent.parentId); }
      if (parent || session.parentId && (!byId.has(session.parentId) || byId.get(session.parentId).projectId !== session.projectId)) session.parentId = null;
    }
    const devices = [];
    for (const [key, item] of this.devices) {
      if (!this.live(item.sessionId) || !byId.has(item.sessionId) || this.now() - item.startedAt > 5 * 60_000) { this.devices.delete(key); continue; }
      devices.push({ ...item, state: this.now() - item.startedAt > 120_000 ? 'unconfirmed' : 'active' });
    }
    let inbox = this.data.inbox;
    for (const candidate of candidates) inbox = this.withResult(inbox, candidate);
    if (inbox !== this.data.inbox) try { this.save({ ...this.data, inbox }); } catch { this.writeError = '결과 기록을 저장하지 못했습니다. 다시 확인해 주세요.'; }
    const items = Object.values(inbox).filter(i => !i.reviewedAt && byId.has(i.sessionId));
    for (const session of sessions) {
      if (['waiting', 'failed', 'unknown', 'interrupted'].includes(session.state) && session.needsAttention) {
        items.push({ id: digest(['current', session.id, session.fingerprint]), sessionId: session.id,
          kind: session.state === 'waiting' ? 'question' : 'error', createdAt: session.updatedAt,
          summary: session.reason || (session.state === 'unknown' ? '현재 실행 상태를 확인할 수 없습니다.' : session.state === 'interrupted' ? '실행이 중단되었습니다.' : '실행 실패가 확인되었습니다.'), fingerprint: session.fingerprint });
      }
    }
    const itemCounts = new Map();
    for (const item of items) { const count = itemCounts.get(item.sessionId) || { results: 0, total: 0 }; count.total++; if (item.kind === 'result') count.results++; itemCounts.set(item.sessionId, count); }
    for (const session of sessions) { const count = itemCounts.get(session.id); session.unreviewedResults = count?.results || 0; session.needsAttention = !!count?.total; }
    const references = [...this.references.values()].filter(r => byId.has(r.from) && byId.has(r.to)).map(({ readers, ...r }) => ({ ...r, active: readers > 0 }));
    const value = { sessions, projects: (source.projects || []).map(p => ({ id: p.id, name: short(p.name, 200), folder: short(p.folder || p.remoteFolder, 4096) })),
      items, references, devices, preferences: this.data.preferences, storageError: this.storageError || this.writeError || this.capacityError || null };
    const nextRevision = digest(value);
    return revision === nextRevision ? { revision, unchanged: true, sampledAt: this.now() } : { ...value, revision: nextRevision, sampledAt: this.now() };
  }
  acknowledge(id, fingerprint, itemId) {
    if (itemId) {
      const snapshot = this.snapshot(), item = snapshot.items.find(i => i.id === itemId && i.sessionId === id);
      if (!item || item.fingerprint !== fingerprint) throw Error('확인할 항목이 변경되었습니다. 다시 확인하세요.');
      if (item.kind === 'question') throw Error('질문은 해당 세션에서 답변해 주세요.');
      if (item.kind === 'result') this.save({ ...this.data, inbox: { ...this.data.inbox, [item.id]: { ...this.data.inbox[item.id], reviewedAt: this.now() } } });
      else this.save({ ...this.data, acknowledged: { ...this.data.acknowledged, [id]: fingerprint } });
      return this.snapshot();
    }
    const item = this.snapshot().sessions.find(s => s.id === id);
    if (!item || item.fingerprint !== fingerprint) throw Error('작업 상태가 변경되었습니다. 다시 확인하세요.');
    const acknowledged = { ...this.data.acknowledged, [id]: fingerprint };
    const ids = new Set(this.catalog().agents.map(a => a.id));
    for (const key of Object.keys(acknowledged)) if (!ids.has(key)) delete acknowledged[key];
    const inbox = item.resultId && this.data.inbox[item.resultId] ? { ...this.data.inbox, [item.resultId]: { ...this.data.inbox[item.resultId], reviewedAt: this.now() } } : this.data.inbox;
    this.save({ ...this.data, acknowledged, inbox });
    return this.snapshot();
  }
  folder(agent, source) {
    const visited = new Set(); let current = agent;
    while (current.sessionHierarchy?.parentId && current.sessionHierarchy.inheritFolder !== false && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = source.agents.find(a => a.id === current.sessionHierarchy.parentId && a.projectId === current.projectId);
      if (!parent || visited.has(parent.id)) break; current = parent;
    }
    const project = source.projects?.find(p => p.id === current.projectId);
    return current.sessionHierarchy?.folderOverride || current.remoteFolder || current.folder || project?.remoteFolder || project?.folder;
  }
  preferences(value) { this.save({ ...this.data, preferences: { ...this.data.preferences, ...value } }); return this.data.preferences; }
}
