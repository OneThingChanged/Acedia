import { describe, it, expect } from 'vitest';
import { QuestionResponder, validateQuestionAnswers, codexQuestionFrame } from './question-responder.mjs';

const question = JSON.stringify({ questions: [ { id: 'color', question: 'Choose?', options: [{ label: 'Blue' }, { label: 'Green' }] } ] });
const request = { sessionId: 's', questionId: 'q', answers: [{ id: 'color', optionIndex: 1 }] };
function fixture() {
  const writes = []; let selection = 0; let active = true; let fail = false;
  const entry = { aiToolId: 'codex', process: { write: data => { writes.push(data); if (fail) throw new Error('transport'); if (data === '\x1b[B') selection++; if (data === '\r') active = false; } } };
  const service = new QuestionResponder({ entry: () => entry, current: async () => ({ sessionId: 's', question: active ? { id: 'q', question } : null }),
    snapshot: () => `Question 1/1 (1 unanswered)\r\nChoose?\r\n${selection === 0 ? '›' : ' '} 1. Blue\r\n${selection === 1 ? '›' : ' '} 2. Green\r\nenter to submit all`, wait: async () => {} });
  return { writes, service, stop: () => { active = false; }, fail: () => { fail = true; } };
}
describe('native question response coordination', () => {
  it('submits the chosen option once across repeated clients', async () => {
    const f = fixture();
    expect(await f.service.answer('a', request)).toEqual({ status: 'sent' });
    expect(await f.service.answer('a', request)).toEqual({ status: 'sent' });
    expect(f.writes).toEqual(['\x1b[B', '\r']);
  });
  it('rejects obsolete questions and control sequences before writing', async () => {
    const f = fixture(); f.stop();
    await expect(f.service.answer('a', request)).rejects.toThrow('already changed');
    expect(f.writes).toEqual([]);
    expect(() => validateQuestionAnswers(question, [{ id: 'color', optionIndex: null, text: 'a\x1b[B' }])).toThrow('Invalid answer text');
    expect(() => validateQuestionAnswers(question, [{ id: 'color', optionIndex: null, text: 'first\nsecond' }])).toThrow('Invalid answer text');
    expect(() => validateQuestionAnswers(question, [{ id: 'wrong', optionIndex: 0 }])).toThrow('changed');
  });
  it('locks concurrent submissions and never retries after a possibly delivered key', async () => {
    const f = fixture();
    const first = f.service.answer('a', request);
    await expect(f.service.answer('a', request)).rejects.toThrow('already'); await first;
    const broken = fixture(); broken.fail();
    await expect(broken.service.answer('a', request)).rejects.toThrow('transport');
    await expect(broken.service.answer('a', request)).rejects.toThrow('outcome unknown');
    expect(broken.writes).toHaveLength(1);
  });
  it('does not treat completed or edited native forms as an untouched menu', () => {
    expect(codexQuestionFrame('Question 1/1 (1 unanswered)\r\nenter to submit all\r\nQuestions 1/1 answered')).toBeNull();
    expect(codexQuestionFrame('Question 1/1 (1 unanswered)\r\n› 2. Other\r\ntab or esc to clear notes | enter to submit all').notes).toBe(true);
  });
});
