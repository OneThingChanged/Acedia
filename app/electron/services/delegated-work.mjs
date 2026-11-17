import fs from 'node:fs';
import path from 'node:path';

export function pendingTaskDelegations(runs) {
  return runs.filter(r => ['running', 'paused'].includes(r.state)).flatMap(r => (r.tasks || [])
    .filter(t => !['completed', 'failed', 'cancelled'].includes(t.state))
    .map(t => ({ id: `task:${r.id}:${t.id}`, from: r.ownerId, to: t.attempts?.at(-1)?.sessionId || '' })));
}

export function delegatedCompletion(payload, work, runs) {
  if (payload.event !== 'done') return payload;
  const tasks = pendingTaskDelegations(runs);
  const blocked = work.blocks(payload.id) || tasks.some(t => t.from === payload.id);
  const assigned = work.pending().some(t => t.to === payload.id) || tasks.some(t => t.to === payload.id);
  // A delegated worker's final turn is evidence for its owner, even though it
  // must not publish a second user-level workflow completion notification.
  work.hook({ ...payload, completion_notification: !blocked });
  return { ...payload, completion_notification: !blocked && !assigned };
}

/** Completion evidence, separate from delivery/read receipts and UI turn state.
 * Keep outstanding assignments across hot-mailbox rotation and app restarts.
 * No message bodies, transcript paths or credentials are retained here. */
export class DelegatedWork {
  constructor({ file, parentOf, now = Date.now }) {
    Object.assign(this, { file, parentOf, now });
    this.since = now(); this.jobs = new Map(); this.done = new Map();
    try {
      if (fs.statSync(file).size > 8 * 1024 * 1024) throw Error('Delegation state too large');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.version !== 1 || !Number.isFinite(data.since) || !Array.isArray(data.jobs) || !Array.isArray(data.done)
        || data.jobs.length > 10000 || data.done.length > 10000
        || data.jobs.some(j => !j || typeof j.id !== 'string' || typeof j.from !== 'string' || typeof j.to !== 'string'
          || !Number.isFinite(j.createdAt) || ['startedAt', 'returnedAt', 'closedAt'].some(k => j[k] !== undefined && !Number.isFinite(j[k])))
        || data.done.some(r => !Array.isArray(r) || typeof r[0] !== 'string' || !Number.isFinite(r[1]))) throw Error('Invalid delegation state');
      this.since = data.since; this.jobs = new Map(data.jobs.map(j => [j.id, j])); this.done = new Map(data.done);
    } catch (error) { if (error.code !== 'ENOENT') this.error = 'delegation-state-unavailable'; }
  }
  save() {
    if (this.error) return;
    // Prune closed history only. Pending work must never disappear to fit a UI limit.
    const closed = [...this.jobs.values()].filter(j => j.closedAt).sort((a, b) => b.closedAt - a.closedAt);
    for (const j of closed.slice(1000)) { this.jobs.delete(j.id); this.since = Math.max(this.since, j.createdAt + 1); }
    const targets = new Set(this.pending().map(j => j.to));
    for (const id of this.done.keys()) if (!targets.has(id)) this.done.delete(id);
    if (this.jobs.size > 10000 || this.done.size > 10000) { this.error = 'delegation-state-full'; return; }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify({ version: 1, since: this.since, jobs: [...this.jobs.values()], done: [...this.done] }), { mode: 0o600 });
      fs.renameSync(this.file + '.tmp', this.file);
    } catch { this.error = 'delegation-state-unavailable'; }
  }
  settle() {
    let changed = false;
    for (const job of this.jobs.values()) {
      if (!job.closedAt && job.startedAt && job.returnedAt && (this.done.get(job.to) || 0) >= job.startedAt) { job.closedAt = this.now(); changed = true; }
    }
    return changed;
  }
  transfer(record, message = false) {
    if (this.error) return;
    const id = message ? record.messageId : record.deliveryId;
    // The ASCII transport envelope duplicates the UTF-8 mailbox assignment.
    if (!id || !message && record.requestKey?.startsWith('text_')) return;
    const status = message ? record.delivery?.status : record.status;
    const startedAt = message ? record.delivery?.startedAt : record.startedAt;
    const readAt = message ? record.readAt : record.startedAt;
    let changed = false;
    if (this.jobs.has(id) || this.parentOf(record.targetId) === record.sourceId && !record.replyTo) {
      let job = this.jobs.get(id);
      // Do not reinterpret historical read-receipt updates as newly assigned work.
      if (!job && record.createdAt >= this.since) {
        job = { id, from: record.sourceId, to: record.targetId, createdAt: record.createdAt };
        this.jobs.set(id, job); changed = true;
      }
      if (job && !job.closedAt) {
        if ((message ? readAt : startedAt) && job.startedAt !== (startedAt || readAt)) { job.startedAt = startedAt || readAt; changed = true; }
        // A proven nothing-sent failure is not outstanding execution.
        if (status === 'failed' && (record.nothingSent === true || record.reason === 'not-sent')
          || status === 'notification-error' && record.delivery?.nothingSent === true) { job.closedAt = this.now(); changed = true; }
      }
    } else if (readAt) {
      for (const job of this.jobs.values()) {
        if (!job.closedAt && job.from === record.targetId && job.to === record.sourceId
          && record.createdAt >= job.createdAt && (!record.replyTo || record.replyTo === job.id)) {
          if ((job.returnedAt || 0) < readAt) { job.returnedAt = readAt; changed = true; }
        }
      }
    }
    changed = this.settle() || changed;
    if (changed) this.save();
  }
  hook(payload) {
    if (payload.event !== 'done' || payload.completion_notification === false || this.blocks(payload.id)) return;
    if (!this.pending().some(j => j.to === payload.id)) return;
    const at = payload.received_at || this.now();
    if ((this.done.get(payload.id) || 0) >= at) return;
    this.done.set(payload.id, at); this.settle(); this.save();
  }
  pending(ownerId) { return [...this.jobs.values()].filter(j => !j.closedAt && (!ownerId || j.from === ownerId)); }
  blocks(ownerId) { return !!this.error || this.pending(ownerId).length > 0; }
  edges() { return this.pending().map(j => ({ id: j.id, from: j.from, to: j.to })); }
}
