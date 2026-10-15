import { make } from './dom.js';
import { t } from './i18n.js';

export function questionForm(questions, { disabled, answers, onSubmit }) {
  const form = make('form', 'question-form');
  const fields = make('div', 'question-fields');
  const submit = make('button', 'chat-prompt-option question-submit', t('답변 보내기'));
  submit.type = 'submit';
  const sync = () => { submit.disabled = disabled || answers.some((a,i) => questions[i].multiSelect
    ? (!a.optionIndices?.length && !a.text?.trim()) || (a.other && !a.text?.trim())
    : a.optionIndex === undefined || (a.optionIndex === null && !a.text?.trim())); };
  questions.forEach((q, i) => {
    if(q.multiSelect){answers[i].optionIndex=null;answers[i].optionIndices??=[];answers[i].other??=!!answers[i].text;}
    const field = make('fieldset'); field.disabled = disabled;
    field.appendChild(make('legend', '', `${questions.length > 1 ? `${i + 1}. ` : ''}${q.text}`));
    const input = make('input', 'question-text-input'); input.type = 'text'; input.maxLength = 2000;
    input.setAttribute('aria-label', q.text); input.placeholder = t('답변을 입력하세요');
    input.value = answers[i].text || ''; input.hidden = q.multiSelect ? !answers[i].other : answers[i].optionIndex !== null;
    input.addEventListener('input', () => { answers[i].text = input.value; sync(); });
    const options = [...q.options, ...(q.options.length ? [{ label: t('직접 입력'), description: '', other: true }] : [])];
    options.forEach((option, j) => {
      const label = make('label', 'question-choice'); const radio = make('input');
      radio.type = q.multiSelect ? 'checkbox' : 'radio'; radio.name = `question-${q.id}`;
      const value = option.other ? null : j;
      radio.checked = q.multiSelect ? option.other ? answers[i].other : answers[i].optionIndices.includes(j) : answers[i].optionIndex === value;
      radio.addEventListener('change', () => {
        if(q.multiSelect){
          if(option.other){answers[i].other=radio.checked;answers[i].text='';input.value='';}
          else answers[i].optionIndices=radio.checked?[...answers[i].optionIndices,j].sort((a,b)=>a-b):answers[i].optionIndices.filter(index=>index!==j);
          input.hidden=!answers[i].other;
        }else{answers[i].optionIndex=value;if(value!==null){answers[i].text='';input.value='';}input.hidden=value!==null;}
        sync();
      });
      const content = make('span'); content.appendChild(make('strong', '', option.label));
      if (option.description) content.appendChild(make('small', '', option.description));
      label.append(radio, content); field.appendChild(label);
    });
    field.appendChild(input); fields.appendChild(field);
  });
  form.append(fields, submit); sync();
  form.addEventListener('submit', e => { e.preventDefault(); if (!submit.disabled) onSubmit(answers.map(({other,...answer})=>answer)); });
  return form;
}
