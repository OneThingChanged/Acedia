import { make } from './dom.js';
import { t } from './i18n.js';

// These are observed questions and unread response receipts, never inferred
// task failures or approvals. Opening a question does not answer it.
export function reviewEntries(agents, unread, statusOf) {
  return agents.flatMap(agent => {
    const status = statusOf(agent);
    const question = ['question', 'attention'].includes(status);
    if (!question && !unread.has(agent.id)) return [];
    return [{ id: agent.id, name: agent.name || agent.id, projectId: agent.projectId,
      kind: question ? 'question' : 'result' }];
  }).sort((a, b) => Number(b.kind === 'question') - Number(a.kind === 'question'));
}

export function createWorkspaceReview({ mount, trigger, getEntries, projectName, openSession, beforeOpen = () => {}, returnFocus = () => trigger }) {
  const panel = make('aside', 'workspace-review'); panel.hidden = true;
  panel.id = 'workspaceReviewPanel'; trigger.setAttribute('aria-controls', panel.id);
  panel.setAttribute('aria-label', t('확인할 일'));
  const head = make('header', 'workspace-review-head');
  const title = make('h3', '', t('확인할 일'));
  const closeButton = make('button', 'icon-button', '×'); closeButton.type = 'button';
  closeButton.setAttribute('aria-label', t('닫기'));
  head.append(title, closeButton);
  const description = make('p', 'workspace-review-description', t('질문은 답변이 필요하며, 새 결과는 대화를 열어 확인하면 정리됩니다.'));
  const list = make('div', 'workspace-review-list');
  panel.append(head, description, list); mount.append(panel);
  let fingerprint = '';
  function close() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  function update() {
    const entries = getEntries();
    title.textContent = t('확인할 일'); panel.setAttribute('aria-label', title.textContent);
    description.textContent = t('질문은 답변이 필요하며, 새 결과는 대화를 열어 확인하면 정리됩니다.');
    closeButton.setAttribute('aria-label', t('닫기'));
    trigger.textContent = `${t('확인할 일')}${entries.length ? ` · ${entries.length}` : ''}`;
    trigger.setAttribute('aria-expanded', String(!panel.hidden));
    const key = JSON.stringify([entries.map(item => [item, projectName(item.projectId)]), t('답변 필요'), t('새 결과'), t('모두 확인했습니다.')]);
    if (key === fingerprint) return;
    fingerprint = key;
    const fragment = document.createDocumentFragment();
    if (!entries.length) fragment.append(make('p', 'empty-state', t('모두 확인했습니다.')));
    for (const item of entries) {
      const row = make('button', 'workspace-review-item'); row.type = 'button';
      row.dataset.kind = item.kind;
      row.append(make('small', '', t(item.kind === 'question' ? '답변 필요' : '새 결과')),
        make('strong', '', item.name), make('span', '', projectName(item.projectId)));
      row.addEventListener('click', () => { close(); openSession(item.id); });
      fragment.append(row);
    }
    list.replaceChildren(fragment);
  }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    beforeOpen(); panel.hidden = false; update();
  });
  closeButton.addEventListener('click', () => { close(); returnFocus().focus({ preventScroll: true }); });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); returnFocus().focus({ preventScroll: true }); }
  });
  return { update, close };
}
