import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { ActiveQuestions, AsyncQuestionNotifier, QUESTION_TAIL_BYTES } from './active-questions.mjs';
import { hasQueuedCodexQuestion, codexQuestionFrame } from './question-responder.mjs';

const line = payload => JSON.stringify({ type: 'response_item', payload }) + '\n';
const call = { type: 'function_call', call_id: 'q1', name: 'functions.request_user_input', arguments: '{"questions":[{"id":"color","question":"Which?","options":[{"label":"Blue"}]}]}' };
describe('active question tail monitor', () => {
  it('keeps working async questions visible through the live host guard with either CLI shortcut', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-active-question-'));
    const transcriptPath = path.join(root, 'session-one.jsonl');
    try {
      const asyncCall = { ...call, name: 'request_user_input_async', arguments: JSON.stringify({ questions: [
        { title: 'Which body bones?', options: ['Existing bones', 'Custom bones'] },
        { title: 'Which input meshes?', options: ['All meshes', 'Body only'] },
      ] }) };
      await fs.writeFile(transcriptPath, line(asyncCall) + line({ type: 'function_call_output', call_id: 'q1', output: '{"accepted":true}' }));
      let screen = '';
      const source = await fs.readFile(new URL('../main.mjs', import.meta.url), 'utf8');
      const currentQuestionSource = source.match(/async function currentQuestion\(id\) \{[\s\S]*?\r?\n\}/)?.[0];
      expect(currentQuestionSource).toBeTruthy();
      const currentQuestion = vm.runInNewContext(`(${currentQuestionSource})`, {
        ptys: new Map([['a', { aiToolId: 'codex', startedAt: 0, filter: { viewportText: () => screen } }]]),
        agentSessionIds: new Map([['a', 'session-one']]), accountBindings: new Map(),
        accountTranscriptRoot: () => root, selectedAccountId: () => 'default',
        agentTranscripts: new Map([['a', transcriptPath]]), activeQuestions: new ActiveQuestions(),
        hasQueuedCodexQuestion, codexQuestionFrame,
      });
      for (const hint of ['shift+tab', 'shift+↑']) {
        screen = `Working (2m 21s · esc to interrupt)\nQueued follow-up inputs\n  ? 2 questions\n    ${hint} to answer\n› Ask Codex to do anything`;
        expect((await currentQuestion('a')).question).toMatchObject({ id: 'q1', async: true, question: asyncCall.arguments });
      }
      screen = 'Question 1/2 (2 unanswered)\nWhich body bones?\n› 1. Existing bones\nenter to submit all';
      expect((await currentQuestion('a')).question?.id).toBe('q1');
      screen = 'Working · Browsing\nQueued follow-up inputs\n› Continue';
      expect((await currentQuestion('a')).question).toBeNull();
    } finally { await fs.rm(root, { recursive: true }); }
  });
  it('reads a bounded tail, retains unanswered calls across large output, and resolves only matching results', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'acedia-active-question-'));
    const file = path.join(root, 'session-one.jsonl');
    try {
      await fs.writeFile(file, 'x'.repeat(QUESTION_TAIL_BYTES * 3) + '\n' + line(call));
      const monitor = new ActiveQuestions();
      const request = { id: 'a', tool: 'codex', root, transcriptPath: file, sessionId: 'session-one' };
      const first = await monitor.read(request);
      expect(first.question.id).toBe('q1');
      expect(await monitor.read(request)).toBe(first);
      await fs.appendFile(file, 'x'.repeat(QUESTION_TAIL_BYTES + 1) + '\n' + line({ type: 'function_call_output', call_id: 'another', output: 'ok' }));
      expect((await monitor.read(request)).question.id).toBe('q1');
      await fs.appendFile(file, '{"type":');
      expect((await monitor.read(request)).question.id).toBe('q1');
      await fs.appendFile(file, '"ignored"}\n' + line({ type: 'function_call_output', call_id: 'q1', output: '{}' }));
      expect((await monitor.read(request)).question).toBeNull();
      expect(await monitor.read({ ...request, root: path.join(root, 'other') })).toBeNull();
      expect(await monitor.read({ ...request, sessionId: 'wrong' })).toBeNull();
      expect(await monitor.read({ ...request, startedAt: Date.now() + 1000 })).toBeNull();
      monitor.prune([]); expect(monitor.cache.size).toBe(0);
      await fs.writeFile(file, line({ ...call, name: 'functions.request_user_input_async' }));
      expect((await monitor.read(request)).question).toMatchObject({ async: true, id: call.call_id });
    } finally { await fs.rm(root, { recursive: true }); }
  });
});

const pendingAsync = (id = 'q1', sessionId = 'session-one') => ({ sessionId,
  question: { async: true, id, toolName: 'functions.request_user_input_async',
    question: '{"questions":[{"title":"Continue?","options":["Yes","No"]}]}', answeredIndices: [] } });
describe('async question notifications', () => {
  it('alerts once per call, retaining dedupe across partial answers and queued forms', async () => {
    const sent = [];
    const notifier = new AsyncQuestionNotifier(async payload => { sent.push(payload); });
    const result = pendingAsync();
    expect(await notifier.publish('a', result)).toBe(true);
    expect(await notifier.publish('a', { ...result, question: { ...result.question, answeredIndices: [0] } })).toBe(false);
    expect(await notifier.publish('a', pendingAsync('q2'))).toBe(true);
    expect(await notifier.publish('a', result)).toBe(false);
    expect(await notifier.publish('a', pendingAsync('q1', 'session-two'))).toBe(true);
    expect(sent.map(p => [p.session_id, p.question_id])).toEqual([
      ['session-one', 'q1'], ['session-one', 'q2'], ['session-two', 'q1'],
    ]);
    expect(sent[0]).toMatchObject({ id: 'a', event: 'waiting', tool_name: result.question.toolName,
      interactive_question: result.question.question });
    expect(result.question.answeredIndices).toEqual([]);
  });

  it('rejects missing and synchronous questions and prunes stopped sessions', async () => {
    const sent = [];
    const notifier = new AsyncQuestionNotifier(async payload => { sent.push(payload); });
    expect(await notifier.publish('a', null)).toBe(false);
    expect(await notifier.publish('a', { ...pendingAsync(), question: { ...pendingAsync().question, async: false } })).toBe(false);
    expect(await notifier.publish('a', { ...pendingAsync(), sessionId: '' })).toBe(false);
    expect(await notifier.publish('a', pendingAsync())).toBe(true);
    expect(await notifier.publish('b', pendingAsync())).toBe(true);
    notifier.prune(['b']);
    expect(notifier.seen.has('a')).toBe(false);
    expect(await notifier.publish('b', pendingAsync())).toBe(false);
    expect(await notifier.publish('a', pendingAsync())).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it('guards concurrent delivery and retries a failed notification', async () => {
    let fail;
    const notifier = new AsyncQuestionNotifier(() => new Promise((_, reject) => { fail = reject; }));
    const first = notifier.publish('a', pendingAsync());
    const rejected = expect(first).rejects.toThrow('transport unavailable');
    expect(await notifier.publish('a', pendingAsync())).toBe(false);
    fail(new Error('transport unavailable'));
    await rejected;
    let delivered = 0;
    notifier.notify = async () => { delivered++; };
    expect(await notifier.publish('a', pendingAsync())).toBe(true);
    expect(delivered).toBe(1);
  });
});
