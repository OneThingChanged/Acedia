import { questionDetails } from '../shared/chat-prompt.mjs';
import { stripVTControlCharacters } from 'node:util';

export function codexQuestionFrame(raw) {
  // Callers supply the current xterm viewport, never flattened PTY scrollback.
  const screen = stripVTControlCharacters(String(raw || ''));
  const headers = [...screen.matchAll(/Question (\d+)\/(\d+) \((\d+) unanswered\)/g)];
  const header = headers.at(-1);
  if (!header) return null;
  const form = screen.slice(header.index);
  if (!/enter to submit (?:answer|all)/.test(form) || /Questions \d+\/\d+ answered|Worked for/.test(form)) return null;
  const selected = [...form.matchAll(/›\s*(\d+)\./g)].at(-1);
  return { index: Number(header[1]), total: Number(header[2]), unanswered: Number(header[3]),
    selected: selected ? Number(selected[1]) - 1 : null, notes: /tab or esc to clear notes/.test(form) };
}

export function validateQuestionAnswers(question, answers) {
  const { questions } = questionDetails(question);
  if (!questions.length || questions.some(q => !q.id || !q.options.length || q.multiSelect) || new Set(questions.map(q => q.id)).size !== questions.length
    || !Array.isArray(answers) || answers.length !== questions.length) throw new TypeError('Invalid question answers');
  return questions.map((q, i) => {
    const a = answers[i];
    if (a?.id !== q.id || (a.optionIndex !== null && (!Number.isInteger(a.optionIndex) || a.optionIndex < 0 || a.optionIndex >= q.options.length))) throw new TypeError('Question choices changed');
    const text = a.text ?? '';
    // Codex's native notes field is single-line. A newline can submit that form.
    if (typeof text !== 'string' || text.length > 2000 || /[\x00-\x1f\x7f]/.test(text) || (a.optionIndex === null && !text.trim())) throw new TypeError('Invalid answer text');
    return { question: q, optionIndex: a.optionIndex, text: text.trim() };
  });
}

// The CLI owns the form. Verify it before each step and never replay a partly
// sent answer. Every client shares this lock and the same authoritative call ID.
export class QuestionResponder {
  constructor({ entry, current, snapshot, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
    this.entry = entry; this.current = current; this.snapshot = snapshot; this.wait = wait;
    this.busy = new Set(); this.submitted = new Map();
  }
  isBusy(id) { return this.busy.has(id); }
  async answer(id, request) {
    if (this.busy.has(id)) throw new Error('An answer is already being submitted');
    if (typeof request.questionId !== 'string' || !request.questionId || request.questionId.length > 200
      || typeof request.sessionId !== 'string' || !request.sessionId || request.sessionId.length > 200) throw new TypeError('Question identity required');
    const key = JSON.stringify([id, request.sessionId, request.questionId]);
    const previous = this.submitted.get(key);
    if (previous === 'sent') return { status: 'sent' };
    if (previous) throw new Error('Answer outcome unknown. Check the terminal before continuing.');
    this.busy.add(id);
    let wrote = false;
    try {
      const entry = this.entry(id);
      if (!entry?.process || entry.aiToolId !== 'codex') throw new Error('Native question form unavailable');
      const initial = await this.current(id);
      const matches = result => result?.sessionId === request.sessionId && result.question?.id === request.questionId;
      if (!matches(initial)) throw new Error('This question has already changed or been answered');
      const answers = validateQuestionAnswers(initial.question.question, request.answers);
      const current = async () => {
        const result = await this.current(id);
        if (this.entry(id) !== entry || !matches(result) || result.question.question !== initial.question.question) throw new Error('The active question changed');
      };
      const frameFor = (i, selected) => {
        const f = codexQuestionFrame(this.snapshot(id));
        return f && f.index === i + 1 && f.total === answers.length && f.unanswered === answers.length - i
          && (selected === undefined || f.selected === selected) ? f : null;
      };
      const waitFrame = async (i, selected) => {
        for (let n = 0; n < 20; n++) {
          await current();
          const f = frameFor(i, selected);
          if (f) return f;
          await this.wait(100);
        }
        throw new Error('Native question form changed. Check the terminal.');
      };
      const write = async data => { await current(); wrote = true; entry.process.write(data); await this.wait(120); };
      for (let i = 0; i < answers.length; i++) {
        const { question, optionIndex, text } = answers[i];
        const frame = await waitFrame(i);
        if (frame.notes) throw new Error('The question was edited in the terminal');
        if (question.options.length) {
          const selected = optionIndex ?? question.options.length;
          if (frame.selected === null || frame.selected > question.options.length) throw new Error('Native choices unavailable');
          const distance = selected - frame.selected;
          for (let n = 0; n < Math.abs(distance); n++) await write(distance > 0 ? '\x1b[B' : '\x1b[A');
          await waitFrame(i, selected);
          if (text) await write('\t');
        }
        if (text) {
          await write(`\x1b[200~${text}\x1b[201~`);
          await this.wait(500);
          await waitFrame(i);
        }
        await write('\r');
      }
      this.submitted.set(key, 'sent');
      return { status: 'sent' };
    } catch (error) {
      if (wrote) this.submitted.set(key, 'unknown');
      throw error;
    } finally {
      this.busy.delete(id);
      if (this.submitted.size > 256) this.submitted.delete(this.submitted.keys().next().value);
    }
  }
}
