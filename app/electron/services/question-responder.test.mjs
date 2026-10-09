import { describe, it, expect } from 'vitest';
import { QuestionResponder, validateQuestionAnswers, codexQuestionFrame, hasQueuedCodexQuestion, queuedCodexQuestionKey } from './question-responder.mjs';

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
  it.each([
    ['shift+↑', '\x1b[1;2A', 'Working · Running hooks\n? 1 question · 6s'],
    ['shift+up', '\x1b[1;2A', 'Working · Running hooks\n? 1 question · 6s'],
    ['shift+tab', '\x1b[Z', 'Working (2m 21s · esc to interrupt)\nQueued follow-up inputs\n  ? 2 questions'],
  ])('opens a queued async question using its %s hint before answering', async (hint, key, status) => {
    const writes = []; let opened = false; let selected = 0;
    const question = JSON.stringify({ questions: [{ title: 'Which folder?', options: ['Current', 'Other'] }] });
    const entry = { aiToolId: 'codex', process: { write: data => { writes.push(data); if (data === key) opened = true; if (data === '\x1b[B') selected++; } } };
    const snapshot = () => opened ? `Question 1/1 (1 unanswered)\nWhich folder?\n${selected === 0 ? '›' : ' '} 1. Current\n${selected === 1 ? '›' : ' '} 2. Other\nenter to submit all` : `${status}\n${hint} to answer`;
    expect(hasQueuedCodexQuestion(snapshot())).toBe(true);
    const service = new QuestionResponder({ entry: () => entry, current: async () => ({ sessionId: 's', question: { id: 'q', question, async: true } }), snapshot, wait: async () => {} });
    await service.answer('a', { sessionId: 's', questionId: 'q', answers: [{ id: 'async-0', optionIndex: 1 }] });
    expect(writes).toEqual([key, '\x1b[B', '\r']);
  });
  it('ignores queued messages and missing or unrelated question shortcuts', () => {
    for (const screen of ['Queued follow-up inputs\n› continue', '0 questions\nshift+tab to answer', '2 questions\nshift+tab to edit', '2 questions', 'shift+tab to answer']) {
      expect(hasQueuedCodexQuestion(screen)).toBe(false);
      expect(queuedCodexQuestionKey(screen)).toBeNull();
    }
    expect(queuedCodexQuestionKey('\x1b[33m? 2 questions\x1b[0m\r\n  shift + TAB\n to answer')).toBe('\x1b[Z');
  });
  it('answers both queued questions with a choice and free text without interrupting work', async () => {
    const writes = []; let opened = false, index = 0, selected = 0;
    const question = JSON.stringify({ questions: [
      { title: 'Which body bones?', options: ['Existing bones', 'Custom bones'] },
      { title: 'Which input meshes?', options: ['All meshes', 'Body only'] },
    ] });
    const entry = { aiToolId: 'codex', process: { write: data => {
      writes.push(data);
      if (data === '\x1b[Z') opened = true;
      if (data === '\x1b[B') selected++;
      if (data === '\r') { index++; selected = 0; }
    } } };
    const service = new QuestionResponder({ entry: () => entry,
      current: async () => ({ sessionId: 's', question: index < 2 ? { id: 'q', question, async: true } : null }),
      snapshot: () => !opened ? 'Working · Browsing\nQueued follow-up inputs\n? 2 questions\nshift+tab to answer'
        : `Question ${index + 1}/2 (${2 - index} unanswered)\n${index === 0 ? 'Which body bones?' : 'Which input meshes?'}\n› ${selected + 1}. Choice\nenter to submit all`, wait: async () => {} });
    const request = { sessionId: 's', questionId: 'q', answers: [
      { id: 'async-0', optionIndex: 1 }, { id: 'async-1', optionIndex: null, text: '직접 지정한 메시' },
    ] };
    expect(await service.answer('a', request)).toEqual({ status: 'sent' });
    expect(writes).toEqual(['\x1b[Z', '\x1b[B', '\r', '\x1b[B', '\x1b[B', '\t', '\x1b[200~직접 지정한 메시\x1b[201~', '\r']);
    expect(await service.answer('a', request)).toEqual({ status: 'sent' });
    expect(writes).toHaveLength(8);
  });
  it('does not send a shortcut or answer when the queued form has disappeared', async () => {
    const writes = [];
    const entry = { aiToolId: 'codex', process: { write: data => writes.push(data) } };
    const service = new QuestionResponder({ entry: () => entry, current: async () => ({ sessionId: 's', question: { id: 'q', question, async: true } }), snapshot: () => 'Queued follow-up inputs\n› continue', wait: async () => {} });
    await expect(service.answer('a', request)).rejects.toThrow('Queued question unavailable');
    expect(writes).toEqual([]);
  });
  it('does not send an answer into a different queued question', async () => {
    const writes = [];let opened=false;
    const entry = { aiToolId: 'codex', process: { write: data => { writes.push(data);opened=true; } } };
    const question = JSON.stringify({ questions: [{ title: 'Expected question?', options: ['Yes'] }] });
    const service = new QuestionResponder({ entry: () => entry, current: async () => ({ sessionId:'s', question:{ id:'q', question, async:true } }), snapshot:()=>opened?'Question 1/1 (1 unanswered)\nDifferent question?\n› 1. Yes\nenter to submit all':'? 1 question · 6s\nshift+↑ to answer', wait:async()=>{} });
    await expect(service.answer('a',{ sessionId:'s',questionId:'q',answers:[{ id:'async-0',optionIndex:0 }] })).rejects.toThrow('different queued');
    expect(writes).toEqual(['\x1b[1;2A']);
  });
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
