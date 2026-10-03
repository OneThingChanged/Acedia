import { make } from './dom.js';
import { t } from './i18n.js';

export function questionForm(questions, { disabled, answers, onSubmit }) {
  const form = make('form', 'question-form');
  const fields = make('div', 'question-fields');
  const submit = make('button', 'chat-prompt-option question-submit', t('답변 보내기'));
  submit.type = 'submit';
  const sync = () => { submit.disabled = disabled || answers.some(a => a.optionIndex === undefined || (a.optionIndex === null && !a.text?.trim())); };
  questions.forEach((q, i) => {
    const field = make('fieldset'); field.disabled = disabled;
    field.appendChild(make('legend', '', `${questions.length > 1 ? `${i + 1}. ` : ''}${q.text}`));
    const input = make('input', 'question-text-input'); input.type = 'text'; input.maxLength = 2000;
    input.setAttribute('aria-label', q.text); input.placeholder = t('답변을 입력하세요');
    input.value = answers[i].text || ''; input.hidden = answers[i].optionIndex !== null;
    input.addEventListener('input', () => { answers[i].text = input.value; sync(); });
    const options = [...q.options, ...(q.options.length ? [{ label: t('직접 입력'), description: '', other: true }] : [])];
    options.forEach((option, j) => {
      const label = make('label', 'question-choice'); const radio = make('input');
      radio.type = 'radio'; radio.name = `question-${q.id}`;
      const value = option.other ? null : j;
      radio.checked = answers[i].optionIndex === value;
      radio.addEventListener('change', () => { answers[i].optionIndex = value; if (value !== null) { answers[i].text = ''; input.value = ''; } input.hidden = value !== null; sync(); });
      const content = make('span'); content.appendChild(make('strong', '', option.label));
      if (option.description) content.appendChild(make('small', '', option.description));
      label.append(radio, content); field.appendChild(label);
    });
    field.appendChild(input); fields.appendChild(field);
  });
  form.append(fields, submit); sync();
  form.addEventListener('submit', e => { e.preventDefault(); if (!submit.disabled) onSubmit(answers); });
  return form;
}
