const labels = { planned: '선행 작업 대기', ready: '배정 준비', dispatching: '생성·전달 확인 중', running: '진행 중', waiting_user: '답변 대기', waiting_approval: '승인 대기', result_submitted: '결과 검토 대기', verifying: '검증 중', completed: '완료', failed: '실패', cancelled: '취소됨', reconcile_required: '상태 확인 필요', paused: '새 배정 정지', cancelling: '종료 확인 중', awaiting_summary: 'A의 최종 보고 대기' };
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const modelLabel = value => value ? `${value.model} · ${value.effort || '기본 effort'}${value.serviceTier === 'fast' ? ' · Fast' : ''}` : '확인 전';
const button = (action, label, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
export const taskDelegationRequest = value => `[Acedia 작업 분담 요청]\nA는 계획·배정·진행 관리·결과 검토를 담당하고 독립 하위 Codex 세션이 실제 작업을 수행하도록 acedia_task_plan을 사용하세요. 작업 범위·완료 조건·선행 관계를 정하고 모델은 자동 정책을 사용하세요. acedia_task_wait/get으로 결과를 회수하고 검토한 뒤 모든 필수 작업이 통과하면 finish로 보고하세요. 사용자 질문·승인은 대신 결정하지 마세요.\n\n${value}`;

// One view implementation for desktop and Remote. It never navigates a session
// except after an explicit Open conversation click. Hidden views stop polling.
export function createTaskFlowView(root, { api, ownerId, openSession = () => {} }) {
  root.classList.add('task-flow');
  let generation = 0;
  let visible = false, stopped = false, loading = false, timer, runId, selected, run, detail, detailVersion, taskVersions = {}, summaries = [], offset = 0, nextOffset = null, revision = -1, policy, catalog, editingPolicy = false, collapsed = false, error = '', busy = false;
  const call = async (action, body = {}) => api(action, { ...(ownerId ? { ownerId } : {}), ...body });
  const current = () => detail?.id === selected ? detail : null;
  const attempt = () => current()?.attempts.at(-1);
  function modelFields(prefix, value) {
    return `<div class="task-model-fields" data-editor><label>모델<select data-model="${prefix}">${(catalog?.models || []).map(m => `<option value="${esc(m.model)}" ${m.model === value?.model ? 'selected' : ''}>${esc(m.label || m.model)}</option>`).join('')}</select></label><label>effort<select data-effort="${prefix}">${(catalog?.models.find(m => m.model === value?.model)?.efforts || []).map(e => `<option ${e.effort === value?.effort ? 'selected' : ''}>${esc(e.effort)}</option>`).join('')}</select></label><label>Fast<select data-tier="${prefix}"><option value="default">꺼짐</option><option value="fast" ${value?.serviceTier === 'fast' ? 'selected' : ''}>켜짐</option></select></label></div>`;
  }
  function readModel(prefix) {
    return { model: root.querySelector(`[data-model="${prefix}"]`).value, effort: root.querySelector(`[data-effort="${prefix}"]`).value || undefined, serviceTier: root.querySelector(`[data-tier="${prefix}"]`).value };
  }
  function drawEdges() {
    const board = root.querySelector('.task-board'), svg = root.querySelector('.task-edges');
    if (!board || !svg || board.clientWidth < 580 || !run) return;
    const base = board.getBoundingClientRect();
    svg.setAttribute('width', board.scrollWidth); svg.setAttribute('height', board.scrollHeight);
    svg.innerHTML = run.tasks.flatMap(t => t.dependsOn.map(id => {
      const source = [...board.querySelectorAll('[data-task]')].find(e => e.dataset.task === id), target = [...board.querySelectorAll('[data-task]')].find(e => e.dataset.task === t.id);
      if (!source || !target) return '';
      const a = source.getBoundingClientRect(), b = target.getBoundingClientRect(), x = a.right - base.left, y = a.top + a.height / 2 - base.top, bx = b.left - base.left, by = b.top + b.height / 2 - base.top;
      return `<path d="M${x} ${y} H${x + 14} V${by} H${bx}"/>`;
    })).join('');
  }
  function patch(markup) {
    const next = document.createElement('template'); next.innerHTML = markup;
    const board = root.querySelector('.task-board'), nextBoard = next.content.querySelector('.task-board');
    // A plan's graph is immutable. Keep every unaffected card and the board
    // itself mounted while worker states change; only update changed content.
    if (!board || !nextBoard || board.style.cssText !== nextBoard.style.cssText) return false;
    const cards = [...board.querySelectorAll('[data-task]')], newCards = [...nextBoard.querySelectorAll('[data-task]')];
    if (cards.length !== newCards.length || cards.some((c, i) => c.dataset.task !== newCards[i].dataset.task)) return false;
    cards.forEach((c, i) => {
      const value = newCards[i];
      if (c.isEqualNode(value)) return;
      for (const a of [...c.attributes]) if (!value.hasAttribute(a.name)) c.removeAttribute(a.name);
      for (const a of value.attributes) if (c.getAttribute(a.name) !== a.value) c.setAttribute(a.name, a.value);
      if (c.innerHTML !== value.innerHTML) c.innerHTML = value.innerHTML;
    });
    for (const selector of ['.task-head', '.task-note', '.task-error', '.task-runs', '.task-detail']) {
      const target = root.querySelector(selector), value = next.content.querySelector(selector);
      if (!target || !value) return false;
      const previous = selector === '.task-detail' ? target.taskMarkup : target.innerHTML;
      if (previous !== value.innerHTML) target.innerHTML = value.innerHTML;
      if (selector === '.task-detail') target.taskMarkup = value.innerHTML;
    }
    root.querySelector('.task-content').className = next.content.querySelector('.task-content').className;
    return true;
  }
  function render(incremental = false) {
    if (stopped) return;
    const t = current(), a = attempt();
    const depth = task => task.dependsOn.length ? 1 + Math.max(...task.dependsOn.map(id => depth(run.tasks.find(x => x.id === id)))) : 0;
    const columns = run ? Math.max(...run.tasks.map(depth), 0) + 1 : 1;
    const markup = `<header class="task-head"><div><small>세션 조직도 / 작업 흐름</small><h2>작업 분담 <span>${esc(labels[run?.state] || '')}</span></h2></div><div class="task-actions">${button('refresh', '새로고침')}${button('policy', '모델 정책')}${button('collapse', collapsed ? '완료 펼치기' : '완료 접기')}${run && run.state === 'running' ? button('pause', '새 배정 정지') : ''}${run?.state === 'paused' ? button('resume', '배정 재개') : ''}${run && ['running', 'paused', 'awaiting_summary', 'cancelling'].includes(run.state) ? button('cancel', '실행 취소') : ''}</div></header>
      <p class="task-note">A는 계획·배정·결과 검토, 독립 Codex 세션은 실제 작업을 담당합니다. 전달 시작 후에도 결과 검증을 기다립니다.</p><p class="task-error" role="alert">${esc(error)}</p>
      <div class="task-runs"><label>실행 선택<select data-run><option value="">실행을 선택하세요</option>${summaries.map(s => `<option value="${esc(s.id)}" ${s.id === runId ? 'selected' : ''}>${esc(s.title)} · ${esc(labels[s.state] || s.state)}</option>`).join('')}</select></label>${offset ? button('previous', '이전 20개') : ''}${nextOffset != null ? button('next', '다음 20개') : ''}</div>
      ${editingPolicy && policy && catalog ? `<section class="task-policy"><h3>모델 자동 선택 정책</h3><p>난도·문맥·도구·위험으로 선택합니다. 사용자 지정이 우선하며 재시도는 최대 1회입니다.</p>${['light', 'normal', 'advanced'].map((level, i) => `<h4>${['경량', '일반', '고성능'][i]}</h4>${modelFields(level, policy.policy[level])}`).join('')}${button('save-policy', '정책 저장')}${button('close-policy', '닫기')}<small>현재 실행은 저장 당시 정책을 유지합니다.</small></section>` : ''}
      ${run ? `<div class="task-content ${selected ? 'task-detail-open' : ''}"><div class="task-board" style="--task-columns:${columns}"><svg class="task-edges" aria-hidden="true"></svg>${Array.from({ length: columns }, (_, i) => `<div class="task-column">${run.tasks.filter(t => depth(t) === i && !(collapsed && t.state === 'completed')).map(t => { const a = t.attempts.at(-1); return `<button type="button" class="task-card ${selected === t.id ? 'selected' : ''}" data-task="${esc(t.id)}" data-state="${t.state}" aria-pressed="${selected === t.id}"><small>${esc(t.role)} · Codex</small><strong>${esc(t.title)}</strong><span>${esc(labels[t.state])}</span><small>${esc(modelLabel(a?.requestedModel))}</small><small>${esc(t.reason || '')}</small>${t.dependsOn.length ? `<small>선행: ${t.dependsOn.map(esc).join(', ')}</small>` : ''}</button>`; }).join('')}</div>`).join('')}</div><aside class="task-detail">${button('back', '← 작업 목록', 'class="task-mobile-back"')}${t ? `<small>${esc(t.id)} · 시도 ${t.attempts.length}/2</small><h3>${esc(t.title)}</h3><p>${esc(t.goal)}</p><h4>완료 조건</h4><p>${esc(t.acceptance)}</p><h4>모델 선택과 적용 확인</h4><p>${esc(modelLabel(a?.requestedModel))}<br><small>${esc(a?.selection?.reason)}</small></p><p>실제 턴: ${esc(modelLabel(a?.actualModel))}<br><small>시작 설정: ${a?.launchModelVerified ? '확인됨' : '확인 전'}</small></p><h4>파일 변경 관찰</h4><p>${a?.fileAudit?.available ? esc(a.fileAudit.observed.join(', ') || '관찰된 추가 변경 없음') : esc(a?.fileAudit?.reason || '결과 제출 후 확인')}</p><small>공유 폴더 관찰이며 프로세스별 보안 격리가 아닙니다.</small><h4>수정 범위</h4><p>${esc(t.writeScopes.join(', ') || '읽기 전용')}</p><p>${esc(labels[t.state])}: ${esc(t.reason || '')}</p>${t.question ? '<div class="task-question"></div>' : ''}${t.result ? `<h4>결과</h4><p>${esc(t.result.summary)}</p><p>${t.result.changedFiles.map(esc).join('<br>')}</p><ul>${t.result.checks.map(c => `<li>${c.passed ? '✓' : '✕'} ${esc(c.command)}<pre>${esc(c.output)}</pre></li>`).join('')}</ul><p>${t.result.artifacts.map(esc).join('<br>')}</p><p>${esc(t.result.issues)}</p>` : ''}${['result_submitted', 'verifying'].includes(t.state) ? `<label>검토 근거<textarea data-review maxlength="2000" placeholder="검증 근거와 완료 조건을 확인한 내용을 적어 주세요"></textarea></label>${button('accept', '검증 통과')}${button('reject', '검증 실패')}` : ''}${t.state === 'failed' && t.attempts.length < 2 ? `<label><input type="checkbox" data-override> 다음 시도 모델 직접 지정</label>${catalog ? modelFields('retry', a?.requestedModel) : ''}${button('retry', '새 시도로 재시도')}` : ''}${['planned', 'ready'].includes(t.state) && catalog ? `${modelFields('next', t.modelOverride || run.policy.normal)}${button('override', '다음 배정 모델 지정')}` : ''}${t.state === 'reconcile_required' ? `${button('reconcile', '실제 상태 대조')}${button('mark-failed', '종료 확인 후 실패 처리')}` : ''}${a ? `<p>${button('open', '하위 대화 열기')}</p><small>대화 ${esc(a.conversationId)}<br>턴 ${esc(a.turnId)}</small>` : ''}` : '<p>작업 카드를 선택하면 결과와 검증 내역을 확인할 수 있습니다.</p>'}</aside></div>` : '<p class="task-empty">실행 기록이 없습니다. A의 대화에서 작업 분담을 선택하고 요청을 보내세요. 로컬 Codex만 지원합니다.</p>'}`;
    if (!incremental || !patch(markup)) {
      root.innerHTML = markup;
      const detailElement = root.querySelector('.task-detail');
      if (detailElement) detailElement.taskMarkup = detailElement.innerHTML;
    }
    root.querySelectorAll('button').forEach(b => { if (busy) b.disabled = true; });
    if (t?.question) renderQuestion(t, a);
    requestAnimationFrame(drawEdges);
  }
  function renderQuestion(t, a) {
    const target = root.querySelector('.task-question'); let parsed;
    const questionKey = JSON.stringify([a.id, t.question]);
    if (target.taskQuestionKey === questionKey) return;
    target.taskQuestionKey = questionKey;
    try { parsed = JSON.parse(t.question.question); } catch { target.textContent = t.question.question; return; }
    if (parsed.approval) {
      target.innerHTML = `<h4>명령 승인 · ${esc(t.question.id)}</h4><pre>${esc(parsed.approval.text)}</pre>${parsed.approval.options.map((o, i) => button('approve', esc(typeof o === 'string' ? o : o.label), `data-choice="${i}"`)).join('')}`;
    } else if (parsed.questions) {
      target.innerHTML = `<form data-question><h4>사용자 질문 · ${esc(t.question.id)}</h4>${parsed.questions.map((q, i) => `<label>${esc(q.question || q.title || q.header)}<select name="choice-${i}"><option value="">직접 입력</option>${(q.options || []).map((o, j) => `<option value="${j}">${esc(typeof o === 'string' ? o : o.label)}</option>`).join('')}</select><input name="answer-${i}" maxlength="2000" placeholder="추가 답변"></label>`).join('')}<button>원래 요청에 답변</button></form>`;
      target.querySelector('form').onsubmit = e => { e.preventDefault(); const data = new FormData(e.target); const answers = parsed.questions.map((q, i) => ({ id: q.id || (q.title ? `async-${i}` : ''), optionIndex: data.get(`choice-${i}`) === '' ? null : Number(data.get(`choice-${i}`)), text: data.get(`answer-${i}`) || '' })); void control('answer', { request: { questionId: t.question.id, sessionId: a.conversationId, answers } }); };
    }
  }
  async function loadCatalog() { if (!catalog && (ownerId || run?.ownerId)) catalog = await call('catalog', { ownerId: ownerId || run.ownerId }); }
  async function refresh(force = false) {
    if (!visible || stopped || loading || busy || document.hidden || (!force && root.contains(document.activeElement) && document.activeElement.matches('input,select,textarea'))) return;
    loading = true;
    const requestedDetail = selected, previousRunId = run?.id, requestedGeneration = generation;
    try {
      const list = await call('list', { offset });
      if (generation !== requestedGeneration || !visible || stopped) return;
      let changed = list.revision !== revision; summaries = list.runs; nextOffset = list.nextOffset;
      if (!runId && summaries.length) runId = summaries[0].id;
      if (runId) {
        const result = await call('get', { runId, view: 'board', taskVersions, revision,
          ...(requestedDetail ? { detailTaskId: requestedDetail, detailVersion } : {}) });
        if (generation !== requestedGeneration || !visible || stopped) return;
        if (!result.unchanged) {
          const cards = new Map((run?.id === result.run.id ? run.tasks : []).map(t => [t.id, t]));
          for (const t of result.tasks) cards.set(t.id, t);
          run = { ...result.run, tasks: result.taskIds.map(id => cards.get(id)) };
          taskVersions = result.taskVersions; revision = result.revision; changed = true;
          if (result.detail?.id === selected) { detail = result.detail; detailVersion = result.detailVersion; }
        }
        if (run?.tasks.some(t => t.state === 'failed')) await loadCatalog();
      } else revision = list.revision;
      if (changed || force || !root.childElementCount) render(!force && previousRunId === run?.id);
    } catch (e) { error = e.message || String(e); render(); }
    finally { loading = false; if (visible && (requestedDetail !== selected || requestedGeneration !== generation)) void refresh(); }
  }
  async function control(action, extra = {}) {
    if (busy) return; busy = true; error = '';
    try { await call(action, { runId, ...(selected ? { taskId: selected, attemptId: attempt()?.id } : {}), ...extra }); }
    catch (e) { error = e.message || String(e); }
    finally { busy = false; await refresh(true); }
  }
  const onClick = async event => {
    const card = event.target.closest('[data-task]'); if (card) { selected = card.dataset.task; detail = null; detailVersion = null; try { if (['planned', 'ready', 'failed'].includes(run.tasks.find(t => t.id === selected)?.state)) await loadCatalog(); } catch (e) { error = e.message || String(e); } await refresh(true); return; }
    const b = event.target.closest('[data-action]'); if (!b) return;
    const action = b.dataset.action;
    try {
      if (action === 'refresh') return refresh(true);
      if (action === 'open') return openSession(attempt().sessionId);
      if (action === 'back') { selected = null; detail = null; detailVersion = null; render(); return; }
      if (action === 'collapse') { collapsed = !collapsed; render(); return; }
      if (action === 'next' || action === 'previous') { generation++; offset = action === 'next' ? nextOffset : Math.max(0, offset - 20); runId = null; run = null; selected = null; detail = null; detailVersion = null; taskVersions = {}; return refresh(true); }
      if (action === 'policy') { await loadCatalog(); if (!catalog) throw Error('A 세션을 선택한 뒤 모델 정책을 설정하세요.'); policy = await call('policy'); editingPolicy = true; render(); return; }
      if (action === 'close-policy') { editingPolicy = false; render(); return; }
      if (action === 'save-policy') { await call('policy-save', { ownerId: ownerId || run.ownerId, revision: policy.revision, policy: Object.fromEntries(['light', 'normal', 'advanced'].map(l => [l, readModel(l)])) }); editingPolicy = false; return refresh(true); }
      if (action === 'accept' || action === 'reject') return control('review', { accept: action === 'accept', note: root.querySelector('[data-review]').value });
      if (action === 'approve') return control('answer', { request: { questionId: current().question.id, sessionId: attempt().conversationId, approvalChoice: Number(b.dataset.choice) } });
      if (action === 'retry') return control('retry', catalog && root.querySelector('[data-override]')?.checked ? { modelOverride: readModel('retry') } : {});
      if (action === 'override') return control('override', { modelOverride: readModel('next') });
      if (action === 'mark-failed') return control('reconcile', { markFailed: true });
      if (['pause', 'resume', 'cancel', 'reconcile'].includes(action)) return control(action);
    } catch (e) { error = e.message || String(e); render(); }
  };
  const onChange = event => {
    if (event.target.matches('[data-run]')) { generation++; runId = event.target.value || null; run = null; selected = null; detail = null; detailVersion = null; taskVersions = {}; catalog = null; editingPolicy = false; revision = -1; void refresh(true); }
    if (event.target.matches('[data-model]')) {
      const prefix = event.target.dataset.model, selectedModel = catalog.models.find(m => m.model === event.target.value);
      root.querySelector(`[data-effort="${prefix}"]`).innerHTML = (selectedModel?.efforts || []).map(e => `<option>${esc(e.effort)}</option>`).join('');
    }
  };
  root.addEventListener('click', onClick); root.addEventListener('change', onChange);
  const visibility = () => { if (!document.hidden && visible) void refresh(); };
  document.addEventListener('visibilitychange', visibility);
  return {
    enter() { if (visible || stopped) return; visible = true; void refresh(true); timer = setInterval(() => { void refresh(); }, 2000); },
    leave() { visible = false; clearInterval(timer); },
    destroy() { stopped = true; visible = false; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); },
  };
}
