import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ActiveQuestions, QUESTION_TAIL_BYTES } from './active-questions.mjs';

const line = payload => JSON.stringify({ type: 'response_item', payload }) + '\n';
const call = { type: 'function_call', call_id: 'q1', name: 'functions.request_user_input', arguments: '{"questions":[{"id":"color","question":"Which?","options":[{"label":"Blue"}]}]}' };
describe('active question tail monitor', () => {
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
