import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionRecovery, recoveryConfiguration, recoveryWorkMode, RECOVERY_CONTINUATION } from './session-recovery.mjs';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('acedia-recovery-')) throw Error('Unexpected cleanup path');
    fs.rmSync(root, { recursive: true });
  }
});
function fixture(modes = ['working', 'idle', 'waiting']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acedia-recovery-')); roots.push(root);
  let now = 1000, closing = false;
  const catalog = { projects: [{ id: 'p', folder: root }], agents: modes.map((_, i) => ({ id: 'a' + i, name: 'Session ' + i,
    projectId: 'p', aiToolId: i % 2 ? 'claude' : 'codex', folder: root, codexAccountId: 'chosen', claudeAccountId: 'chosen',
    ...(i ? { sessionHierarchy: { parentId: 'a0' } } : {}) })) };
  const contexts = new Map(), readiness = vi.fn(async () => ({ ready: true, phase: 'ready' }));
  const submit = vi.fn(async (_id, _entry, _text, isCurrent) => isCurrent());
  const options = { file: path.join(root, 'recovery.json'), catalog: () => catalog, context: id => contexts.get(id), readiness, submit, now: () => now, closing: () => closing };
  const service = new SessionRecovery(options);
  const records = modes.map((mode, i) => ({ id: 'a' + i, name: 'Session ' + i, provider: catalog.agents[i].aiToolId, cwd: root, sessionId: 'conversation-' + i,
    mode, configuration: recoveryConfiguration(catalog.agents[i], catalog.projects[0]), parentId: i ? 'a0' : null }));
  const offer = service.capture(records);
  const args = id => ({ checkpointId: offer.checkpointId, id });
  const yes = () => service.decide({ checkpointId: offer.checkpointId, restore: true });
  const launch = id => {
    const plan = service.claim(args(id));
    const entry = { cwd: root, resumeContext: { sessionId: plan.resumeSessionId }, startedAt: 1500, lastInputAt: 1500,
      firstMessageInput: false, firstMessageSubmitted: false };
    contexts.set(id, { entry, conversationId: plan.resumeSessionId });
    service.launched(args(id)); return entry;
  };
  return { root, catalog, contexts, readiness, submit, service, options, offer, records, args, yes, launch, time: value => { now = value; }, close: () => { closing = true; } };
}
it('persists the full-exit active set, offers once and performs no launch/input before an explicit Yes', async () => {
  const f = fixture(), restarted = new SessionRecovery(f.options);
  expect(restarted.offer()).toMatchObject({ activeCount: 3, workingCount: 1, decision: 'pending' });
  expect(restarted.waitingDecision()).toBe(true);
  await restarted.tick(); expect(f.submit).not.toHaveBeenCalled();
  expect(() => restarted.claim(f.args('a0'))).toThrow('승인');
  const saved = fs.readFileSync(f.options.file, 'utf8'); expect(saved).not.toMatch(/token|assistant_message|prompt|secret/);
});
it('No keeps the catalog and session layout untouched and never starts or submits work', async () => {
  const f = fixture(), before = JSON.stringify(f.catalog);
  expect(f.service.decide({ checkpointId: f.offer.checkpointId, restore: false }).sessionIds).toEqual([]);
  await f.service.tick(); expect(f.submit).not.toHaveBeenCalled(); expect(f.service.offer().activeCount).toBe(0);
  expect(new SessionRecovery(f.options).waitingDecision()).toBe(false); expect(JSON.stringify(f.catalog)).toBe(before);
  expect(() => f.service.claim(f.args('a0'))).toThrow();
});
it('restores a proven unused Claude startup without a conversation ID, but never sends it a continuation', async () => {
  const f = fixture(['idle', 'waiting']);
  f.records[1].sessionId = null; f.records[1].fresh = true;
  const offer = f.service.capture(f.records);
  f.service.decide({ checkpointId: offer.checkpointId, restore: true });
  expect(f.service.claim({ checkpointId: offer.checkpointId, id: 'a1' })).toMatchObject({ fresh: true });
  const entry = { cwd: f.root, startedAt: 1500, lastInputAt: 1500 };
  f.contexts.set('a1', { entry, conversationId: 'new-native-claude' });
  f.catalog.agents[1].lastSessionId = 'new-native-claude';
  expect(f.service.launched({ checkpointId: offer.checkpointId, id: 'a1' }).state).toBe('waiting-ready');
  await f.service.tick(); expect(f.submit).not.toHaveBeenCalled();
  expect(f.service.status().sessions[1].state).toBe('restored');
});
it('Yes restores exact conversations, workers before leaders, and only asks previously working sessions to continue once', async () => {
  const f = fixture(); expect(f.yes().sessionIds).toEqual(['a1', 'a2', 'a0']);
  f.launch('a0'); f.launch('a1'); f.launch('a2');
  await f.service.tick(); await f.service.tick();
  expect(f.submit).toHaveBeenCalledOnce(); expect(f.submit.mock.calls[0][0]).toBe('a0'); expect(f.submit.mock.calls[0][2]).toBe(RECOVERY_CONTINUATION);
  expect(f.service.status().sessions.map(r => r.state)).toEqual(['continued', 'restored', 'restored']);
  expect(f.service.claim(f.args('a0'))).toEqual({ id: 'a0', state: 'continued' });
});
it.each(['question', 'working'])('preserves a live %s instead of pasting another command', async phase => {
  const f = fixture(['working']); f.yes(); f.launch('a0'); f.readiness.mockResolvedValue({ ready: false, phase });
  await f.service.tick(); expect(f.submit).not.toHaveBeenCalled();
  expect(f.service.status().sessions[0].state).toBe(phase === 'question' ? 'needs-attention' : 'already-working');
});
it.each(['firstMessageInput', 'firstMessageSubmitted'])('never overwrites existing input or an already delivered handoff (%s)', async key => {
  const f = fixture(['working']); f.yes(); const entry = f.launch('a0'); entry[key] = true;
  await f.service.tick(); expect(f.submit).not.toHaveBeenCalled(); expect(f.service.status().sessions[0].reason).toBe('input-already-provided');
});
it('rejects changed accounts, missing transcripts, already active sessions and a different resumed conversation', () => {
  const f = fixture(['working', 'working', 'working']); f.yes();
  f.catalog.agents[0].codexAccountId = 'another'; expect(f.service.claim(f.args('a0')).state).toBe('skipped');
  f.service.data.sessions[1].sessionId = null; expect(f.service.claim(f.args('a1')).reason).toBe('exact-conversation-unavailable');
  f.contexts.set('a2', { entry: {} }); expect(f.service.claim(f.args('a2')).reason).toBe('already-active');
  const g = fixture(['working']); g.yes(); g.service.claim(g.args('a0'));
  g.contexts.set('a0', { entry: { cwd: g.root, resumeContext: { sessionId: 'wrong' } }, conversationId: 'wrong' });
  expect(g.service.launched(g.args('a0')).reason).toBe('exact-resume-not-confirmed');
});
it('pins routed-account ownership in the launch plan and rejects stale checkpoint/decision requests', () => {
  const f = fixture(['working']); f.records[0].poolResumeOwnerId = 'pool-owner';
  const offer = f.service.capture(f.records);
  expect(() => f.service.decide({ checkpointId: f.offer.checkpointId, restore: true })).toThrow('변경');
  f.service.decide({ checkpointId: offer.checkpointId, restore: true });
  expect(f.service.claim({ checkpointId: offer.checkpointId, id: 'a0' })).toMatchObject({ resumeSessionId: 'conversation-0', poolResumeOwnerId: 'pool-owner' });
  expect(() => f.service.decide({ checkpointId: offer.checkpointId, restore: false })).toThrow('이미');
});
it('rechecks process/conversation/user-input identity after asynchronous readiness and during the paste', async () => {
  const f = fixture(['working']); f.yes(); const entry = f.launch('a0');
  f.readiness.mockImplementation(async () => { f.contexts.set('a0', { entry: {}, conversationId: 'conversation-0' }); return { ready: true }; });
  await f.service.tick(); expect(f.submit).not.toHaveBeenCalled();
  const g = fixture(['working']); g.yes(); const live = g.launch('a0');
  g.submit.mockImplementation(async (_id, _entry, _message, valid) => { live.lastInputAt++; return valid(); });
  await g.service.tick(); expect(g.service.status().sessions[0].state).toBe('needs-attention');
  expect(entry).toBeDefined();
});
it('records durable intent before paste, and never retries an uncertain paste or interrupted launch after restart', async () => {
  const f = fixture(['working']); f.yes(); f.launch('a0');
  f.submit.mockImplementation(async () => {
    expect(JSON.parse(fs.readFileSync(f.options.file, 'utf8')).sessions[0].state).toBe('uncertain'); throw Error('lost after write');
  });
  await Promise.all([f.service.tick(), f.service.tick()]); await f.service.tick(); expect(f.submit).toHaveBeenCalledOnce();
  expect(new SessionRecovery(f.options).status().sessions[0].state).toBe('uncertain');
  const g = fixture(['working']); g.yes(); g.service.claim(g.args('a0'));
  const restarted = new SessionRecovery(g.options); expect(restarted.status().sessions[0].state).toBe('uncertain');
  await restarted.tick(); expect(g.submit).not.toHaveBeenCalled();
});
it('uses bounded round-robin readiness checks so slow sessions cannot starve ready ones', async () => {
  const f = fixture(Array(6).fill('working')); f.yes(); for (let i = 0; i < 6; i++) f.launch('a' + i);
  f.readiness.mockImplementation(async id => ({ ready: id === 'a5', phase: id === 'a5' ? 'ready' : 'starting' }));
  await f.service.tick(); await f.service.tick();
  expect(f.submit).toHaveBeenCalledOnce(); expect(f.submit.mock.calls[0][0]).toBe('a5');
  f.time(130000); await f.service.tick(); await f.service.tick();
  expect(f.service.status().sessions.every(r => ['continued', 'needs-attention'].includes(r.state))).toBe(true);
});
it('keeps closing, failed launches, damaged checkpoints and unsupported SSH/shell sessions from automatic continuation', async () => {
  const f = fixture(['working']); f.yes(); f.launch('a0'); f.close(); await f.service.tick(); expect(f.submit).not.toHaveBeenCalled();
  const g = fixture(['working']); g.yes(); g.service.claim(g.args('a0')); expect(g.service.launched({ ...g.args('a0'), failed: true }).state).toBe('needs-attention');
  g.service.capture([{ ...g.records[0], provider: 'none' }, { ...g.records[0], ssh: true }]); expect(g.service.offer().activeCount).toBe(0);
  fs.writeFileSync(g.options.file, '{invalid'); expect(new SessionRecovery(g.options).offer().error).toBeTruthy();
});
it('classifies foreground tool calls, delegated waits, done and unanswered questions separately', () => {
  expect(recoveryWorkMode({}, { event: 'tool-start' })).toBe('working');
  expect(recoveryWorkMode({}, { event: 'done' }, true)).toBe('working');
  expect(recoveryWorkMode({}, { event: 'done' })).toBe('idle');
  expect(recoveryWorkMode({}, { event: 'waiting' }, true)).toBe('waiting');
});
