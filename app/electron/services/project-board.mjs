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
    this.data = { version: 1, acknowledged: {}, preferences: {}, results: {} };
    this.observed = new Map();
    this.devices = new Map();
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) throw Error();
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (stored.version !== 1 || !stored.acknowledged || Array.isArray(stored.acknowledged)
        || typeof stored.acknowledged !== 'object' || !stored.preferences || typeof stored.preferences !== 'object') throw Error();
      this.data = { ...stored, results: stored.results || {} };
    } catch (error) { if (error.code !== 'ENOENT') this.storageError = '보드 설정을 읽지 못했습니다. 기존 파일을 확인하세요.'; }
  }
  save(next) {
    if (this.storageError) throw Error(this.storageError);
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized) > 2 * 1024 * 1024) throw Error('보드 기록 저장 한도를 초과했습니다.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', serialized, { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file); this.data = next; this.writeError = null;
  }
  observe(event) {
    if (!event?.id) return;
    const state = ['tool-start', 'tool-end'].includes(event.event) ? 'working' : event.event;
    if (['working', 'done', 'blocked', 'waiting', 'question', 'session-start', ...interrupted].includes(state)) {
      const previous = this.observed.get(event.id) || this.data.results[event.id];
      const result = { event: state, at: event.received_at || this.now(), summary: short(event.assistant_message), reason: short(event.interactive_question), detachedTask: previous?.detachedTask || null };
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
      if (!saved || saved.event !== state || saved.detachedTask !== result.detachedTask || state !== 'working') {
        const results = { ...this.data.results, [event.id]: result };
        for (const id of Object.keys(results).slice(0, Math.max(0, Object.keys(results).length - 1000))) delete results[id];
        try { this.save({ ...this.data, results }); } catch { this.writeError = '보드 기록을 저장하지 못했습니다. 저장소 상태를 확인하세요.'; }
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
  seedAttention(items) {
    const latest = new Map();
    for (const item of Array.isArray(items) ? items.slice(-100) : []) {
      if (!item?.agentId || !Number.isFinite(item.createdAt) || latest.get(item.agentId)?.createdAt > item.createdAt) continue;
      latest.set(item.agentId, item);
    }
    const results = { ...this.data.results }; let changed = false;
    for (const [id, item] of latest) {
      if (results[id] || this.observed.has(id)) continue;
      const event = ({ completed: 'done', blocked: 'blocked', waiting: 'waiting', question: 'waiting' })[item.kind];
      if (!event) continue;
      results[id] = { event, at: item.createdAt, summary: event === 'done' ? short(item.body) : '', reason: event !== 'done' ? short(item.body) : '', reviewed: item.read === true }; changed = true;
    }
    if (changed) try { this.save({ ...this.data, results }); } catch { this.writeError = '보드 기록을 저장하지 못했습니다. 저장소 상태를 확인하세요.'; }
  }
  snapshot(revision) {
    const source = this.catalog();
    const tasks = new Map();
    for (const run of this.runs() || []) for (const task of run.tasks || []) {
      const attempt = task.attempts?.at(-1);
      if (attempt?.sessionId && (!tasks.has(attempt.sessionId) || tasks.get(attempt.sessionId).updatedAt <= run.updatedAt)) {
        tasks.set(attempt.sessionId, { runId: run.id, taskId: task.id, attemptId: attempt.id || null, identity: taskIdentity(run, task, attempt), title: short(task.title, 200), state: task.state,
          reason: short(task.reason), updatedAt: run.updatedAt, result: short(task.result?.summary),
          question: short(task.question?.question) });
      }
    }
    const sessions = (source.agents || []).map(agent => {
      const hook = this.hook(agent.id), live = this.live(agent.id);
      const recorded = this.observed.get(agent.id) || this.data.results[agent.id];
      const assigned = tasks.get(agent.id), task = recorded?.detachedTask === assigned?.identity ? null : assigned;
      const event = hook?.event || recorded?.event;
      const eventAt = Math.max(hook?.received_at || hook?.lastTs || 0, recorded?.at || 0);
      const liveStatus = live && !hook && !this.observed.has(agent.id) && ['working', 'question', 'blocked', 'waiting'].includes(agent.status) ? agent.status : null;
      const work = liveStatus || (eventAt >= (agent.activity?.receivedAt || 0) ? event : agent.activity?.workStatus) || agent.activity?.workStatus || agent.status;
      let state = 'idle';
      if (task) state = ({ waiting_user: 'waiting', waiting_approval: 'waiting', result_submitted: 'review', verifying: 'review',
        completed: 'completed', failed: 'failed', cancelled: 'interrupted', reconcile_required: 'unknown',
        running: 'working', dispatching: 'working', ready: 'planned', planned: 'planned' })[task.state] || 'unknown';
      else if (interrupted.has(event)) state = 'interrupted';
      else if (work === 'done') state = 'review';
      else if (['waiting', 'blocked', 'question', 'permission-request'].includes(work) || agent.status === 'question') state = work === 'blocked' ? 'failed' : 'waiting';
      else if (['working', 'tool-start', 'tool-end'].includes(work)) state = 'working';
      else if (agent.runtimeStatus === 'unreachable') state = 'unknown';
      else if (agent.runtimeStatus === 'exited' || agent.status === 'exited') state = 'interrupted';
      if (!live && ['working', 'waiting'].includes(state)) state = 'unknown';
      const item = { id: agent.id, projectId: agent.projectId, name: short(agent.name, 200), provider: short(agent.aiToolId, 60),
        parentId: agent.sessionHierarchy?.parentId || null,
        folder: short(this.folder(agent, source), 4096),
        runtime: live ? 'running' : agent.deferredStart && agent.resumeEligible ? 'sleeping' : 'stopped', state,
        updatedAt: Math.max(agent.activity?.receivedAt || 0, eventAt, task?.updatedAt || 0),
        summary: task?.result || recorded?.summary || short(agent.activity?.lastAssistantMessage), reason: task?.reason || short(hook?.interactive_question || recorded?.reason || agent.activity?.interactiveQuestion),
        task: task || null };
      // Runtime-only changes do not re-open an already reviewed result.
      item.fingerprint = digest([item.id, state, task ? [task.runId, task.taskId, task.attemptId, task.state, task.question] : item.updatedAt, item.summary, item.reason]);
      item.needsAttention = attention.has(state) && !(!task && recorded?.reviewed) && this.data.acknowledged[item.id] !== item.fingerprint;
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
    const value = { sessions, projects: (source.projects || []).map(p => ({ id: p.id, name: short(p.name, 200), folder: short(p.folder || p.remoteFolder, 4096) })),
      devices, preferences: this.data.preferences, storageError: this.storageError || this.writeError || null };
    const nextRevision = digest(value);
    return revision === nextRevision ? { revision, unchanged: true } : { ...value, revision: nextRevision };
  }
  acknowledge(id, fingerprint) {
    const item = this.snapshot().sessions.find(s => s.id === id);
    if (!item || item.fingerprint !== fingerprint) throw Error('작업 상태가 변경되었습니다. 다시 확인하세요.');
    const acknowledged = { ...this.data.acknowledged, [id]: fingerprint };
    const ids = new Set(this.catalog().agents.map(a => a.id));
    for (const key of Object.keys(acknowledged)) if (!ids.has(key)) delete acknowledged[key];
    this.save({ ...this.data, acknowledged });
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
