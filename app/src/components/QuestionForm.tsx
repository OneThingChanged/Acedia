import { useState } from 'react';
import type { ChatAnswer, ChatQuestion } from '../../electron/shared/chat-prompt.mjs';
import { useAppLanguage } from '../lib/appLanguage';

export function QuestionForm({ questions, disabled, onSubmit }: { questions: ChatQuestion[]; disabled: boolean; onSubmit: (answers: ChatAnswer[]) => void }) {
  const { text } = useAppLanguage();
  const [answers, setAnswers] = useState(questions.map(q => ({ id: q.id, optionIndex: q.options.length ? undefined as number | null | undefined : null, text: '' })));
  const complete = answers.every(a => a.optionIndex !== undefined && (a.optionIndex !== null || a.text.trim()));
  const update = (index: number, patch: Partial<typeof answers[number]>) => setAnswers(old => old.map((a, i) => i === index ? { ...a, ...patch } : a));
  return <form className="question-form" onSubmit={e => { e.preventDefault(); if (complete && !disabled) onSubmit(answers as ChatAnswer[]); }}>
    <div className="question-fields">
      {questions.map((q, i) => <fieldset key={q.id} disabled={disabled}>
        <legend>{questions.length > 1 ? `${i + 1}. ` : ''}{q.text}</legend>
        {q.options.map((option, j) => <label className="question-choice" key={j}>
          <input type="radio" name={`question-${q.id}`} checked={answers[i].optionIndex === j} onChange={() => update(i, { optionIndex: j, text: '' })}/>
          <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
        </label>)}
        {!!q.options.length && <label className="question-choice"><input type="radio" name={`question-${q.id}`} checked={answers[i].optionIndex === null} onChange={() => update(i, { optionIndex: null })}/><span>{text('직접 입력', 'Write an answer')}</span></label>}
        {answers[i].optionIndex === null && <input type="text" className="question-text-input" aria-label={q.text} placeholder={text('답변을 입력하세요', 'Enter your answer')} value={answers[i].text} maxLength={2000} onChange={e => update(i, { text: e.target.value })}/>}
      </fieldset>)}
    </div>
    <button type="submit" className="chat-prompt-option question-submit" disabled={disabled || !complete}>{text('답변 보내기', 'Send answers')}</button>
  </form>;
}
