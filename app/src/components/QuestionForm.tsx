import { useState } from 'react';
import type { ChatAnswer, ChatQuestion } from '../../electron/shared/chat-prompt.mjs';
import { useAppLanguage } from '../lib/appLanguage';

export function QuestionForm({ questions, disabled, onSubmit }: { questions: ChatQuestion[]; disabled: boolean; onSubmit: (answers: ChatAnswer[]) => void }) {
  const { text } = useAppLanguage();
  const [answers, setAnswers] = useState(questions.map(q => ({ id:q.id,
    optionIndex:q.multiSelect ? null : q.options.length ? undefined as number | null | undefined : null,
    optionIndices:q.multiSelect ? [] as number[] : undefined, text:'', other:!q.options.length })));
  const complete = answers.every((a,i) => questions[i].multiSelect
    ? (!!a.optionIndices?.length || (a.other && !!a.text.trim())) && (!a.other || !!a.text.trim())
    : a.optionIndex !== undefined && (a.optionIndex !== null || !!a.text.trim()));
  const update = (index: number, patch: Partial<typeof answers[number]>) => setAnswers(old => old.map((a, i) => i === index ? { ...a, ...patch } : a));
  return <form className="question-form" onSubmit={e => { e.preventDefault(); if (complete && !disabled) onSubmit(answers.map(({other,...answer}) => ({...answer,text:other ? answer.text : ''})) as ChatAnswer[]); }}>
    <div className="question-fields">
      {questions.map((q, i) => <fieldset key={q.id} disabled={disabled}>
        <legend>{questions.length > 1 ? `${i + 1}. ` : ''}{q.text}</legend>
        {q.options.map((option, j) => <label className="question-choice" key={j}>
          <input type={q.multiSelect ? 'checkbox' : 'radio'} name={`question-${q.id}`} checked={q.multiSelect ? answers[i].optionIndices?.includes(j) : answers[i].optionIndex === j}
            onChange={() => q.multiSelect ? update(i,{optionIndices:answers[i].optionIndices?.includes(j) ? answers[i].optionIndices?.filter(index=>index!==j) : [...(answers[i].optionIndices||[]),j].sort((a,b)=>a-b)}) : update(i,{optionIndex:j,text:'',other:false})}/>
          <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
        </label>)}
        {!!q.options.length && <label className="question-choice"><input type={q.multiSelect ? 'checkbox' : 'radio'} name={`question-${q.id}`} checked={q.multiSelect ? answers[i].other : answers[i].optionIndex === null}
          onChange={() => update(i, {optionIndex:null,other:q.multiSelect ? !answers[i].other : true,text:''})}/><span>{text('직접 입력', 'Write an answer')}</span></label>}
        {answers[i].other && <input type="text" className="question-text-input" aria-label={q.text} placeholder={text('답변을 입력하세요', 'Enter your answer')} value={answers[i].text} maxLength={2000} onChange={e => update(i, { text: e.target.value })}/>}
      </fieldset>)}
    </div>
    <button type="submit" className="chat-prompt-option question-submit" disabled={disabled || !complete}>{text('답변 보내기', 'Send answers')}</button>
  </form>;
}
