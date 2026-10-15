import { stripVTControlCharacters } from 'node:util';
import { claudeQuestionDetails } from '../shared/chat-prompt.mjs';

const compact = text => String(text).replace(/\s/g, '');

export function validateClaudeQuestionAnswers(raw, answers) {
  const { questions } = claudeQuestionDetails(raw);
  if (!questions.length || !Array.isArray(answers) || answers.length !== questions.length) throw new TypeError('Invalid Claude answers');
  return questions.map((question, i) => {
    const answer = answers[i], text = answer?.text ?? '';
    if (answer?.id !== question.id || question.options.length < 2
      || typeof text !== 'string' || text.length > 2000 || /[\x00-\x1f\x7f]/.test(text)) throw new TypeError('Invalid Claude answer');
    const valid = index => Number.isInteger(index) && index >= 0 && index < question.options.length;
    let indices;
    if (question.multiSelect) {
      if (answer.optionIndex !== null || !Array.isArray(answer.optionIndices)
        || !answer.optionIndices.every(valid) || new Set(answer.optionIndices).size !== answer.optionIndices.length) throw new TypeError('Claude choices changed');
      indices = [...answer.optionIndices].sort((a,b) => a-b);
    } else {
      if (answer.optionIndices != null || (answer.optionIndex !== null && !valid(answer.optionIndex))
        || (answer.optionIndex !== null && text.trim())) throw new TypeError('Claude choices changed');
      indices = answer.optionIndex === null ? [] : [answer.optionIndex];
    }
    if (!indices.length && !text.trim()) throw new TypeError('An answer is required');
    return { question, indices, text:text.trim() };
  });
}

export function claudeQuestionFrame(raw) {
  const lines = stripVTControlCharacters(String(raw ?? '')).split(/\r?\n/);
  const start = lines.findLastIndex(line => /^\s*(?:←\s*)?[☐☒☑]\s/.test(line));
  if (start < 0) return null;
  const body = lines.slice(start + 1).join('\n'), checks = [...lines[start].matchAll(/[☐☒☑]/g)].map(match => match[0] !== '☐');
  const selected = body.match(/^\s*❯\s*(\d+)\.\s*(.*)$/m);
  if (!selected) return null;
  const choices = [...body.matchAll(/^\s*(?:❯\s*)?(\d+)\.\s*(?:\[([ ✔xX✓])\]\s*)?(.*)$/gm)]
    .map(match => ({ index:Number(match[1])-1, checked:match[2] === undefined ? null : match[2] !== ' ', label:match[3].trim() }));
  const review = /Review your answers/.test(body) && /Ready to submit your answers\?/.test(body)
    && choices.some(choice => choice.index === 0 && choice.label === 'Submit answers');
  if (!review && !/Enter to select/.test(body)) return null;
  return { checks, body, choices, selected:Number(selected[1])-1, review };
}

// The containing QuestionResponder owns identity checks, input serialization and
// no-replay receipts. Each movement is confirmed against the current viewport.
export async function respondClaudeQuestion({ raw, answers: input, current, snapshot, write, wait }) {
  const answers = validateClaudeQuestionAnswers(raw, input), count = answers.length;
  const poll = async test => {
    for (let n=0;n<25;n++) {
      await current(); const frame = claudeQuestionFrame(snapshot());
      if (frame && test(frame)) return frame;
      await wait(80);
    }
    throw new Error('Claude question form changed. Check the terminal.');
  };
  const questionFrame = (i, selected, checked) => poll(frame => {
    const q = answers[i].question;
    if (frame.review || frame.checks.length !== count || !compact(frame.body).includes(compact(q.text))
      || frame.checks.some((value,j) => j < i ? !value : j > i ? value : !q.multiSelect && value)
      || frame.selected > q.options.length || (selected !== undefined && frame.selected !== selected)) return false;
    const choice = frame.choices.find(choice => choice.index === frame.selected);
    if (!choice) return false;
    if (frame.selected < q.options.length && compact(choice.label) !== compact(q.options[frame.selected].label)) return false;
    if (checked && q.multiSelect && frame.choices.some(choice => choice.index < q.options.length && choice.checked !== checked.has(choice.index))) return false;
    return true;
  });
  for (let i=0;i<count;i++) {
    const {question:q, indices, text} = answers[i];
    let expected = q.multiSelect ? new Set() : null;
    let frame = await questionFrame(i);
    if (q.multiSelect && (frame.checks[i] || frame.choices.some(choice => choice.checked))) throw new Error('Claude question was edited in the terminal');
    // A freshly painted Ink dialog can precede its input subscription effect.
    // Let it settle, then verify the same untouched form before the first key.
    await wait(180); frame = await questionFrame(i, frame.selected, expected);
    const move = async target => {
      frame = await questionFrame(i, undefined, expected);
      while (frame.selected !== target) {
        const next = frame.selected + Math.sign(target - frame.selected);
        await write(next > frame.selected ? '\x1b[B' : '\x1b[A');
        frame = await questionFrame(i, next, expected);
      }
    };
    if (q.multiSelect) {
      for (const index of indices) {
        await move(index); await write(' '); expected.add(index);
        frame = await questionFrame(i, index, expected);
      }
    } else await move(indices.length ? indices[0] : q.options.length);
    if (text) {
      await move(q.options.length);
      const other = frame.choices.find(choice => choice.index === q.options.length);
      if (!other || !/^Type something\.?$/.test(other.label)) throw new Error('Claude answer text was edited in the terminal');
      await write(`\x1b[200~${text}\x1b[201~`);
      await poll(value => value.selected === q.options.length && compact(value.body).includes(compact(text))
        && value.checks.length === count && compact(value.body).includes(compact(q.text)));
      // Left/right edits text while Other has focus. Leave the text field
      // before moving to the next question/review tab.
      if (q.multiSelect) await move(q.options.length - 1);
    }
    await write(q.multiSelect ? '\x1b[C' : '\r');
  }
  // Single-question selectors can submit immediately. Multi-question/multi-select
  // dialogs show a review page; only submit once the displayed answers match.
  for (let n=0;n<25;n++) {
    if (!await current(true)) return;
    const frame = claudeQuestionFrame(snapshot());
    if (frame?.review && frame.checks.length === count && frame.checks.every(Boolean) && frame.selected === 0) {
      const body = compact(frame.body);
      for (const {question,indices,text} of answers) {
        const start = body.indexOf(compact(question.text));
        const next = body.indexOf('●',start+1), end = body.indexOf('Readytosubmityouranswers?');
        const section = start < 0 ? '' : body.slice(start,next < 0 ? end : next);
        const expected = compact([...indices.map(index => question.options[index].label), ...(text ? [text] : [])].join(','));
        if (!section.includes('→') || section.slice(section.indexOf('→')+1) !== expected) throw new Error('Claude review does not match the selected answers');
      }
      await write('\r'); return;
    }
    await wait(80);
  }
  throw new Error('Claude answer confirmation unavailable. Check the terminal.');
}
