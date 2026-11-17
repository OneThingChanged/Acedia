import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DelegatedWork, pendingTaskDelegations, delegatedCompletion } from './delegated-work.mjs';
import { SessionMessages } from './session-messages.mjs';
import { RemoteDashboardService } from './web-services.mjs';

const roots = [], services = [];
afterEach(() => {
  for (const s of services.splice(0)) s.archive.close();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-delegation-')) throw Error('Unexpected cleanup path');
    fs.rmSync(root, { recursive: true });
  }
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-delegation-')); roots.push(root);
  let time = 100;
  const options = { file: path.join(root, 'delegated.json'), now: () => time, parentOf: id => ({ child: 'leader', other: 'leader', grandchild: 'child' })[id] };
  const work = new DelegatedWork(options);
  const tick = () => ++time;
  const assign = (id = 'job', to = 'child', from = 'leader') => {
    const record = { messageId: id, sourceId: from, targetId: to, createdAt: tick(), delivery: { status: 'queued' } };
    work.transfer(record, true); return record;
  };
  const read = record => { record.readAt = tick(); record.delivery = { status: 'started', startedAt: time }; work.transfer(record, true); };
  const done = id => work.hook({ id, event: 'done', received_at: tick() });
  const reply = (job, extra = {}) => { const record = { messageId: 'reply-' + job.messageId, sourceId: job.targetId, targetId: job.sourceId,
    createdAt: tick(), replyTo: job.messageId, delivery: { status: 'inbox' }, ...extra }; work.transfer(record, true); return record; };
  return { root, work, options, tick, assign, read, done, reply };
}
it('holds leader completion through queued work, child completion and unread result, without changing receipts', () => {
  const f = fixture(), job = f.assign();
  expect(f.work.blocks('leader')).toBe(true);
  f.done('leader'); expect(f.work.done.has('leader')).toBe(false);
  f.read(job); f.done('child'); expect(f.work.blocks('leader')).toBe(true);
  const report = f.reply(job); expect(f.work.blocks('leader')).toBe(true);
  f.read(report); expect(f.work.blocks('leader')).toBe(false);
  expect(job.delivery.status).toBe('started'); expect(job.readAt).toBeTruthy();
  expect(f.work.edges()).toEqual([]);
  expect(delegatedCompletion({ id: 'leader', event: 'done', received_at: f.tick() }, f.work, []).completion_notification).toBe(true);
});
it('accepts a result read before the final child hook, but never completes on read alone', () => {
  const f = fixture(), job = f.assign(); f.read(job);
  f.read(f.reply(job)); expect(f.work.blocks('leader')).toBe(true);
  f.done('child'); expect(f.work.blocks('leader')).toBe(false);
});
it('waits for every assignment and keeps independent child work from creating ownership', () => {
  const f = fixture(), one = f.assign('one'), two = f.assign('two', 'other');
  f.read(one); f.read(two); f.done('child'); f.read(f.reply(one));
  expect(f.work.pending('leader').map(j => j.id)).toEqual(['two']);
  f.done('other'); f.read(f.reply(two)); expect(f.work.blocks('leader')).toBe(false);
  f.done('grandchild'); expect(f.work.blocks('child')).toBe(false);
});
it('notifies only the final leader, preserving worker completion evidence and unrelated manual work', () => {
  const f = fixture(), job = f.assign(); f.read(job);
  const finish = id => delegatedCompletion({ id, event: 'done', received_at: f.tick() }, f.work, []);
  expect(finish('leader').completion_notification).toBe(false);
  expect(finish('child').completion_notification).toBe(false);
  expect(f.work.done.has('child')).toBe(true);
  expect(finish('leader').completion_notification).toBe(false); // Result not yet read.
  f.read(f.reply(job));
  expect(finish('leader').completion_notification).toBe(true);
  expect(finish('child').completion_notification).toBe(true); // Later independent task.
});
it('publishes one remote workflow completion after result collection, while preserving questions', async () => {
  const f = fixture(), events = [], pushes = [];
  const remote = new RemoteDashboardService({ baseDir: f.root, deviceMonitorService: { publish: e => events.push(e) },
    pushService: { notifyDone: e => pushes.push(e), notifyQuestion: e => pushes.push(e) } });
  const finish = async id => remote.notifyAgentDone(delegatedCompletion({ id, event: 'done', received_at: f.tick() }, f.work, []));
  const job = f.assign(); await finish('leader'); f.read(job); await finish('child');
  const report = f.reply(job); await finish('leader');
  expect(events).toEqual([]); expect(pushes).toEqual([]);
  await remote.notifyAgentQuestion({ id: 'leader', event: 'waiting', interactive_question: '승인이 필요한가요?' });
  expect(events.map(e => e.type)).toEqual(['agent-question']);
  f.read(report); await finish('leader');
  expect(events.map(e => e.type)).toEqual(['agent-question', 'agent-done']);
  expect(pushes).toHaveLength(2); expect(pushes[1].agentId).toBe('leader');
});
it('does not treat a nested leader handoff turn as final child completion', () => {
  const f = fixture(), job = f.assign(), nested = f.assign('nested', 'grandchild', 'child');
  f.read(job); f.read(nested); f.read(f.reply(job)); f.done('child');
  expect(f.work.blocks('leader')).toBe(true);
  f.done('grandchild'); f.read(f.reply(nested)); expect(f.work.blocks('child')).toBe(false);
  expect(f.work.blocks('leader')).toBe(true);
  f.done('child'); expect(f.work.blocks('leader')).toBe(false);
});
it('ignores transport duplicates, unrelated replies and polling, and does not replay closed jobs', () => {
  const f = fixture(), job = f.assign(); f.read(job);
  f.work.transfer({ deliveryId: 'envelope', requestKey: 'text_job', sourceId: 'leader', targetId: 'child', createdAt: f.tick(), status: 'started' });
  f.done('child'); f.read(f.reply(job, { replyTo: 'different' }));
  expect(f.work.pending('leader')).toHaveLength(1);
  f.read(f.reply(job)); f.work.transfer(job, true); expect(f.work.pending()).toHaveLength(0);
});
it('keeps the assignment owner when the organization parent changes during execution', () => {
  const f = fixture(), job = f.assign();
  f.work.parentOf = () => 'another-leader';
  f.read(job); f.done('child'); f.read(f.reply(job));
  expect(f.work.blocks('leader')).toBe(false);
  expect(f.work.blocks('another-leader')).toBe(false);
});
it('preserves pending work across restart and beyond the last fifty UI transfers', () => {
  const f = fixture(), first = f.assign('first'); f.read(first);
  for (let i = 0; i < 60; i++) f.assign('later-' + i, 'other');
  const restored = new DelegatedWork(f.options);
  expect(restored.pending('leader')).toHaveLength(61);
  expect(restored.pending('leader')[0].id).toBe('first');
  const text = fs.readFileSync(f.options.file, 'utf8');
  expect(text).not.toMatch(/message|secret|transcript/);
});
it('fails closed on damaged state and leaves old history outside the new assignment watermark', () => {
  const f = fixture();
  f.work.transfer({ messageId: 'old', sourceId: 'leader', targetId: 'child', createdAt: 1, readAt: 2 }, true);
  expect(f.work.blocks('leader')).toBe(false);
  fs.writeFileSync(f.options.file, '{invalid');
  const broken = new DelegatedWork(f.options); expect(broken.blocks('leader')).toBe(true);
  expect(fs.readFileSync(f.options.file, 'utf8')).toBe('{invalid');
});
it('observes actual UTF-8 mailbox save/read synchronously, including notify:false and final result return', async () => {
  const f = fixture();
  const mailbox = new SessionMessages({ file: path.join(f.root, 'messages.json'), now: f.tick,
    sessionFor: id => ({ id, aiToolId: 'codex' }), context: () => ({ entry: { aiToolId: 'codex' } }),
    notify: async () => { throw Error('Must not notify'); }, observe: r => f.work.transfer(r, true) });
  services.push(mailbox);
  const send = (source, target, requestKey, replyTo) => mailbox.send(source, { sessionId: target, message: '한글 업무와 결과', requestKey, notify: false, ...(replyTo ? { replyTo } : {}) });
  const job = await send('leader', 'child', 'assignment'); expect(f.work.blocks('leader')).toBe(true);
  await mailbox.receive('child', { messageId: job.messageId });
  f.done('child'); const result = await send('child', 'leader', 'result', job.messageId);
  expect(f.work.blocks('leader')).toBe(true);
  await mailbox.receive('leader', { messageId: result.messageId, markRead: false }); expect(f.work.blocks('leader')).toBe(true);
  await mailbox.receive('leader', { messageId: result.messageId }); expect(f.work.blocks('leader')).toBe(false);
});
it('includes result verification and queued tasks until the task workflow is resolved', () => {
  const runs = [{ id: 'run', ownerId: 'leader', state: 'running', tasks: [
    { id: 'a', state: 'planned' }, { id: 'b', state: 'verifying', attempts: [{ sessionId: 'child' }] }, { id: 'c', state: 'completed' },
  ] }];
  expect(pendingTaskDelegations(runs).map(t => t.id)).toEqual(['task:run:a', 'task:run:b']);
  runs[0].state = 'cancelled'; expect(pendingTaskDelegations(runs)).toEqual([]);
});
