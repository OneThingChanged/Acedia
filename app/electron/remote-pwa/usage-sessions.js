import { t, getLanguage } from './i18n.js';
import { make } from './dom.js';
import { requestJson } from './requests.js';

const fields = ['events', 'inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens',
  'reasoningOutputTokens', 'totalTokens', 'baselineUsd', 'pricedEvents', 'unpricedEvents'];
export function sumSessionUsage(items) {
  const total = Object.fromEntries(fields.map(key => [key, 0]));
  for (const item of items) for (const key of fields) total[key] += Number(item?.[key]) || 0;
  return total;
}
export function sessionCostLabel(totals, format = value => '$' + value.toFixed(2)) {
  if (!totals?.events) return '—';
  return totals.pricedEvents ? format(totals.baselineUsd) : t('미산정');
}
export function sessionUsageCsv(rows, range) {
  // Spreadsheet programs interpret user-provided names beginning with =/+/-/@.
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const header = ['Session ID', 'Session', 'Project', 'Provider', 'Range', 'Models', 'Input',
    'Cache read', 'Cache write', 'Output', 'Reasoning', 'Total tokens', 'API baseline USD', 'Priced events', 'Unpriced events'];
  return '\ufeff' + [header, ...rows.map(row => {
    const totals = row.totals;
    return [row.id, row.name, row.projectName, row.provider, range,
      row.models.map(model => model.model || '').join(';'),
      ...(totals.events ? [totals.inputTokens, totals.cacheReadTokens, totals.cacheWriteTokens,
        totals.outputTokens, totals.reasoningOutputTokens, totals.totalTokens] : ['', '', '', '', '', '']),
      totals.pricedEvents ? totals.baselineUsd.toFixed(6) : '', totals.pricedEvents, totals.unpricedEvents];
  })].map(row => row.map(cell).join(',')).join('\r\n');
}

export function createSessionUsageView(root, { isPageActive = () => true, toast = () => {} } = {}) {
  root.className = 'session-usage-view'; root.hidden = true;
  root.innerHTML = `
    <div class="su-toolbar"><div class="su-ranges" aria-label="Usage period">
      <button type="button" data-range="today" data-su-text="오늘"></button>
      <button type="button" data-range="week" data-su-text="최근 7일"></button>
      <button type="button" data-range="month" data-su-text="이번 달"></button>
      <button type="button" data-range="all" data-su-text="전체"></button></div>
      <span class="su-range-label"></span><select class="su-project" aria-label="Project"></select>
      <select class="su-provider" aria-label="AI"><option value="all"></option><option value="codex">Codex</option><option value="claude">Claude Code</option></select>
      <button type="button" class="su-button su-refresh" data-su-text="새로고침"></button>
      <button type="button" class="su-button su-export" data-su-text="CSV 내보내기"></button></div>
    <p class="su-message" role="status" aria-live="polite"></p>
    <div class="su-stats"><article><span data-su-text="사용 토큰"></span><strong class="su-token-total"></strong><small class="su-token-meta"></small></article>
      <article class="su-cost-card"><span data-su-text="API 환산액 · USD"></span><strong class="su-cost-total"></strong><small class="su-cost-meta"></small></article>
      <article><span data-su-text="조회 세션"></span><strong class="su-count"></strong><small class="su-count-meta"></small></article>
      <article><span data-su-text="비용 환산 범위"></span><strong class="su-coverage"></strong><small class="su-coverage-meta"></small></article></div>
    <div class="su-basis"><span data-su-text="API 단가 환산액 · 구독 요금·계정 한도와 별도"></span><button type="button" class="su-pricing" data-su-text="계산 기준"></button></div>
    <div class="su-workspace"><section class="su-list"><div class="su-list-head"><h3 data-su-text="세션 목록"></h3><span class="su-list-count"></span></div>
      <div class="su-list-tools"><input class="su-search" type="search" autocomplete="off"><select class="su-status" aria-label="Session status">
        <option value="all"></option><option value="active"></option><option value="sleeping"></option><option value="inactive"></option><option value="past"></option></select>
        <select class="su-sort" aria-label="Sort"><option value="cost"></option><option value="tokens"></option><option value="name"></option></select></div>
      <label class="su-group-label"><input type="checkbox" class="su-group" checked><span data-su-text="부모·자식 묶기"></span><small data-su-text="각 행은 해당 세션만 집계"></small></label>
      <div class="su-table-scroll"><table><thead><tr><th data-su-text="세션 / 프로젝트"></th><th data-su-text="AI · 모델"></th><th data-su-text="입력"></th><th data-su-text="출력"></th><th data-su-text="총 토큰"></th><th data-su-text="USD 환산액"></th></tr></thead><tbody class="su-rows"></tbody></table></div>
      <div class="su-empty" hidden></div><div class="su-list-footer"><span data-su-text="부모·자식 토큰은 중복 합산하지 않습니다."></span><div><button type="button" class="su-prev">‹</button><span class="su-page"></span><button type="button" class="su-next">›</button></div></div></section>
      <aside class="su-inspector" aria-label="Session details"></aside></div>
    <p class="su-updated"></p>
    <dialog class="su-dialog"><div><h3 data-su-text="API 환산액 계산 기준"></h3><button type="button" class="su-dialog-close">×</button></div><p class="su-pricing-date"></p>
      <p data-su-text="일반 입력 × 입력 단가 + 캐시 읽기 × 캐시 단가 + (일반 출력 + 추론) × 출력 단가"></p>
      <p data-su-text="각 단가는 100만 토큰 기준입니다. 합산한 뒤 USD 소수점 두 자리로 표시합니다."></p>
      <p data-su-text="미지원 모델·형식은 미산정으로 표시합니다. 일부만 환산되면 해당 기록의 소계입니다."></p>
      <p data-su-text="Fast·긴 문맥 할증, 캐시 쓰기, 도구 비용과 세금은 환산액에 포함하지 않습니다."></p>
      <p data-su-text="모델을 바꾼 세션은 기록 당시 모델별로 계산합니다. 캐시와 추론 토큰을 중복 합산하지 않습니다."></p>
      <p data-su-text="폴더가 같아도 대화 연결이 확인되지 않은 기록은 과거 대화로 따로 표시합니다."></p><a class="su-price-source" target="_blank" rel="noreferrer" data-su-text="공식 단가표 열기"></a></dialog>`;
  const $ = selector => root.querySelector(selector);
  let data = null, error = '', loading = false, range = 'today', provider = 'all';
  let entered = false, visible = false, serial = 0, timer = null, page = 0, selectedId = null, includeFamily = false;
  const collapsed = new Set(), cache = new Map(), pageSize = 50;
  const count = value => new Intl.NumberFormat(getLanguage()).format(value);
  const usd = value => new Intl.NumberFormat(getLanguage(), { style: 'currency', currency: 'USD' }).format(value);
  const brief = value => new Intl.NumberFormat(getLanguage(), { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  const cost = totals => sessionCostLabel(totals, usd);
  function displayName(row) { return row.registered || row.agentId ? row.name : t('연결 미확인 대화') + ' · ' + row.name; }
  function stateName(row) { return t({ active: '활성', sleeping: '휴면', inactive: '비활성', past: '지난 대화' }[row.status] || '비활성'); }
  function rows() { return Array.isArray(data?.sessions) ? data.sessions : []; }
  function matches() {
    const query = $('.su-search').value.trim().toLocaleLowerCase(), project = $('.su-project').value, status = $('.su-status').value;
    return rows().filter(row => (project === 'all' || (project === 'unlinked' ? !row.projectId : row.projectId === project))
      && (status === 'all' || row.status === status)
      && (!query || [row.name, row.projectName, row.provider, ...row.models.map(model => model.model)].join(' ').toLocaleLowerCase().includes(query)));
  }
  function sorted(items) {
    return [...items].sort((a, b) => {
      const mode = $('.su-sort').value;
      if (mode === 'name') return displayName(a).localeCompare(displayName(b), getLanguage());
      if (mode === 'tokens') return b.totals.totalTokens - a.totals.totalTokens;
      return (b.totals.pricedEvents ? b.totals.baselineUsd : -1) - (a.totals.pricedEvents ? a.totals.baselineUsd : -1)
        || b.totals.totalTokens - a.totals.totalTokens;
    });
  }
  function family(id, all = rows()) {
    const result = [], pending = [id], visited = new Set();
    while (pending.length) { const next = pending.pop(); if (visited.has(next)) continue; visited.add(next); result.push(next);
      for (const row of all) if (row.parentId === next) pending.push(row.id); }
    return result;
  }
  function visibleRows(filtered) {
    if (!$('.su-group').checked) return sorted(filtered).map(row => ({ row, depth: 0, context: false }));
    const byId = new Map(rows().map(row => [row.id, row])), included = new Set(filtered.map(row => row.id));
    for (const row of filtered) {
      const visited = new Set([row.id]); let parentId = row.parentId;
      while (parentId && !visited.has(parentId)) { visited.add(parentId); included.add(parentId); parentId = byId.get(parentId)?.parentId; }
    }
    const matched = new Set(filtered.map(row => row.id)), result = [], seen = new Set();
    const children = new Map();
    for (const row of rows()) { const key = included.has(row.parentId) ? row.parentId : null;
      if (!children.has(key)) children.set(key, []); children.get(key).push(row); }
    const visit = (row, depth) => { if (!included.has(row.id) || seen.has(row.id)) return;
      seen.add(row.id); result.push({ row, depth, context: !matched.has(row.id) });
      if (!collapsed.has(row.id) || $('.su-search').value.trim()) for (const child of sorted(children.get(row.id) || [])) visit(child, depth + 1); };
    for (const row of sorted(children.get(null) || [])) visit(row, 0);
    return result;
  }
  function staticLabels() {
    for (const node of root.querySelectorAll('[data-su-text]')) node.textContent = t(node.dataset.suText);
    $('.su-search').placeholder = t('세션 이름 · 프로젝트 · 모델 검색');
    $('.su-search').setAttribute('aria-label', t('세션 검색'));
    $('.su-group').setAttribute('aria-label', t('부모·자식 묶기'));
    $('.su-project').setAttribute('aria-label', t('프로젝트 필터'));
    $('.su-provider').setAttribute('aria-label', t('AI 필터'));
    $('.su-status').setAttribute('aria-label', t('세션 상태 필터'));
    $('.su-sort').setAttribute('aria-label', t('정렬'));
    $('.su-prev').setAttribute('aria-label', t('이전 페이지')); $('.su-next').setAttribute('aria-label', t('다음 페이지'));
    $('.su-dialog-close').setAttribute('aria-label', t('닫기'));
    $('.su-provider option[value="all"]').textContent = t('모든 AI');
    const statusLabels = { all: '전체 상태', active: '활성 세션', sleeping: '휴면 세션', inactive: '비활성 세션', past: '지난 대화' };
    for (const option of $('.su-status').options) option.textContent = t(statusLabels[option.value]);
    const sortLabels = { cost: '비용 높은 순', tokens: '토큰 많은 순', name: '이름순' };
    for (const option of $('.su-sort').options) option.textContent = t(sortLabels[option.value]);
    for (const button of root.querySelectorAll('[data-range]')) button.setAttribute('aria-pressed', String(button.dataset.range === range));
  }
  function render() {
    const focused = document.activeElement;
    const focusedRow = focused?.closest('.su-rows tr')?.dataset.sessionId;
    const focusedClass = focused?.classList.contains('su-collapse') ? '.su-collapse' : '.su-name';
    const focusedFamily = focused?.dataset.includeFamily;
    staticLabels();
    const previousProject = $('.su-project').value || 'all';
    $('.su-project').replaceChildren(new Option(t('전체 프로젝트'), 'all'), new Option(t('미연결 기록'), 'unlinked'),
      ...(data?.projects || []).map(project => new Option(project.name || project.id, project.id)));
    $('.su-project').value = [...$('.su-project').options].some(option => option.value === previousProject) ? previousProject : 'all';
    const filtered = matches(), ids = new Set(filtered.map(row => row.id)), total = sumSessionUsage(filtered.map(row => row.totals));
    const allVisible = visibleRows(filtered); page = Math.max(0, Math.min(page, Math.ceil(allVisible.length / pageSize) - 1));
    if (!ids.has(selectedId)) { selectedId = filtered[0]?.id || null; includeFamily = false; }
    $('.su-token-total').textContent = data ? brief(total.totalTokens) : '—';
    $('.su-token-meta').textContent = data ? t('{0} 토큰', [count(total.totalTokens)]) : t('사용 기록 확인 중');
    $('.su-cost-total').textContent = data ? cost(total) : '—';
    $('.su-cost-meta').textContent = t(total.unpricedEvents ? '환산 가능한 기록 소계' : '환산 가능한 기록의 합계');
    $('.su-count').textContent = data ? count(filtered.length) : '—';
    $('.su-count-meta').textContent = t('{0}개 기록 있음 · {1}개 기록 없음', [
      count(filtered.filter(row => row.totals.events).length), count(filtered.filter(row => !row.totals.events).length)]);
    $('.su-coverage').textContent = total.events ? Math.round(total.pricedEvents / total.events * 100) + '%' : '—';
    $('.su-coverage-meta').textContent = t('{0} / {1}건 환산 · {2}건 미산정', [count(total.pricedEvents), count(total.events), count(total.unpricedEvents)]);
    $('.su-range-label').textContent = data?.range ? (data.range.startDate ? data.range.startDate + ' – ' + data.range.endDate : t('수집된 전체 기록')) : '';
    $('.su-message').textContent = error ? t('세션 사용량을 갱신하지 못했습니다. 다시 시도하세요.')
      : data?.tokensRefreshFailed ? t('일부 기록을 수집하지 못했습니다. 저장된 사용량을 표시합니다.')
      : data?.tokensRefreshPending ? t('대화 기록을 수집 중입니다. 저장된 사용량부터 표시합니다.')
      : loading ? t('사용 기록 확인 중') : '';
    $('.su-message').classList.toggle('su-error', Boolean(error || data?.tokensRefreshFailed));
    $('.su-refresh').disabled = loading; $('.su-export').disabled = !data || !filtered.length;
    $('.su-list-count').textContent = t('{0}개 세션', [count(filtered.length)]);
    $('.su-page').textContent = (page + 1) + ' / ' + Math.max(1, Math.ceil(allVisible.length / pageSize));
    $('.su-prev').disabled = page === 0; $('.su-next').disabled = (page + 1) * pageSize >= allVisible.length;
    const fragment = document.createDocumentFragment();
    for (const item of allVisible.slice(page * pageSize, (page + 1) * pageSize)) fragment.append(renderRow(item, filtered));
    $('.su-rows').replaceChildren(fragment);
    $('.su-empty').hidden = filtered.length > 0 || loading;
    $('.su-empty').textContent = data ? t('조건에 맞는 세션이 없습니다.') : t('사용량 정보를 불러오지 못했습니다.');
    $('.su-updated').textContent = data?.tokensUpdatedAt ? t('마지막 수집: {0}', [new Date(data.tokensUpdatedAt).toLocaleString(getLanguage())]) : t('수집 완료 전 · 저장된 기록 기준');
    $('.su-pricing-date').textContent = t('앱 단가 스냅샷: {0} · 실제 청구액과 별도', [data?.pricing?.date || '—']);
    $('.su-price-source').href = data?.pricing?.source === 'https://developers.openai.com/api/docs/pricing' ? data.pricing.source : 'https://developers.openai.com/api/docs/pricing';
    renderInspector(filtered);
    if (focusedRow) [...$('.su-rows').rows].find(row => row.dataset.sessionId === focusedRow)?.querySelector(focusedClass)?.focus({ preventScroll: true });
    else if (focusedFamily != null) [...root.querySelectorAll('[data-include-family]')].find(button => button.dataset.includeFamily === focusedFamily)?.focus({ preventScroll: true });
  }
  function renderRow({ row, depth, context }, filtered) {
    const tr = make('tr', (row.id === selectedId ? 'su-selected ' : '') + (context ? 'su-context' : ''));
    tr.dataset.sessionId = row.id;
    const cell = make('td'), identity = make('div', 'su-identity');
    identity.style.paddingLeft = Math.min(depth, 8) * 13 + 'px';
    const children = rows().filter(candidate => candidate.parentId === row.id);
    if (children.length && $('.su-group').checked) {
      const expand = make('button', 'su-collapse', collapsed.has(row.id) ? '▸' : '▾'); expand.type = 'button';
      expand.setAttribute('aria-expanded', String(!collapsed.has(row.id))); expand.setAttribute('aria-label', t('자식 세션 펼치기·접기'));
      expand.onclick = () => { collapsed.has(row.id) ? collapsed.delete(row.id) : collapsed.add(row.id); page = 0; render(); }; identity.append(expand);
    } else identity.append(make('span', 'su-tree-mark', depth ? '└' : ''));
    const name = make('button', 'su-name', displayName(row)); name.type = 'button'; name.title = displayName(row); name.disabled = context;
    name.setAttribute('aria-pressed', String(row.id === selectedId));
    const select = () => { if (context) return; selectedId = row.id; includeFamily = false; render(); };
    name.onclick = select;
    const info = make('div', 'su-session-info');
    info.append(name, make('small', 'su-state ' + row.status, (row.projectName || t('미연결 기록')) + ' · ' + (context ? t('상위 세션 · 필터 범위 외') : stateName(row))));
    if (children.length && !context && $('.su-group').checked) {
      const familyIds = new Set(family(row.id)), sum = sumSessionUsage(filtered.filter(candidate => familyIds.has(candidate.id)).map(candidate => candidate.totals));
      info.append(make('small', 'su-family-cost', t('자식 {0}개 · 트리 {1}', [children.length, cost(sum)]) + (sum.pricedEvents && sum.unpricedEvents ? ' + ' + t('미산정') : '')));
    }
    identity.append(info); cell.append(identity); tr.append(cell);
    const modelCell = make('td'), models = row.models;
    modelCell.append(make('span', 'su-model', models.length === 1 ? models[0].model || t('모델 미확인') : models.length > 1 ? t('{0}개 모델', [models.length]) : '—'),
      make('small', '', [...new Set(models.map(model => model.provider))].join(' · ') || row.provider)); tr.append(modelCell);
    const totals = row.totals;
    function numericCell(value, note, isCost = false) {
      const td = make('td'), strong = make('span', isCost ? 'su-money' : 'su-number', value);
      td.append(strong, make('small', '', note)); tr.append(td);
    }
    numericCell(context || !totals.events ? '—' : brief(totals.inputTokens + totals.cacheReadTokens), context || !totals.events ? '' : t('캐시 {0}', [brief(totals.cacheReadTokens)]));
    numericCell(context || !totals.events ? '—' : brief(totals.outputTokens + totals.reasoningOutputTokens), context || !totals.events ? '' : t('추론 {0}', [brief(totals.reasoningOutputTokens)]));
    numericCell(context || !totals.events ? '—' : brief(totals.totalTokens), context ? '' : t('{0}개 기록', [count(totals.events)]));
    numericCell(context ? '—' : cost(totals), context ? t('합계 제외') : !totals.events ? t(row.collectionSupported ? '선택 기간 기록 없음' : '이 환경의 수집 미지원')
      : totals.unpricedEvents ? t(totals.pricedEvents ? '일부 기록 소계' : '단가 미지원') : t('API 기준'), true);
    tr.addEventListener('click', event => { if (!event.target.closest('button')) select(); });
    return tr;
  }
  function renderInspector(filtered) {
    const inspector = $('.su-inspector'), row = rows().find(row => row.id === selectedId); inspector.replaceChildren();
    if (!row) { inspector.append(make('p', 'su-empty', t('세션을 선택하면 토큰 상세가 표시됩니다.'))); return; }
    const header = make('div', 'su-inspector-head'); header.append(make('small', '', t('선택한 세션')), make('h3', '', displayName(row)),
      make('p', '', (row.projectName || t('미연결 기록')) + ' · ' + stateName(row))); inspector.append(header);
    const body = make('div', 'su-inspector-body'), descendantIds = new Set(family(row.id));
    const scoped = includeFamily ? filtered.filter(candidate => descendantIds.has(candidate.id)) : [row];
    const totals = sumSessionUsage(scoped.map(candidate => candidate.totals));
    if (descendantIds.size > 1) {
      const tabs = make('div', 'su-detail-tabs');
      for (const [label, include] of [['이 세션', false], ['자식 포함', true]]) {
        const button = make('button', '', t(label)); button.type = 'button'; button.setAttribute('aria-pressed', String(include === includeFamily));
        button.dataset.includeFamily = String(include); button.onclick = () => { includeFamily = include; render(); }; tabs.append(button);
      }
      body.append(tabs);
    }
    body.append(make('small', 'su-detail-caption', t(includeFamily ? '이 세션 + 자식 사용량' : '이 세션 사용량')),
      make('strong', 'su-detail-price', cost(totals)), make('p', 'su-detail-note', t('{0}건 환산 · {1}건 미산정', [count(totals.pricedEvents), count(totals.unpricedEvents)])));
    if (includeFamily) body.append(make('p', 'su-detail-note', t('현재 필터의 {0}개 세션 · 자체 {1}', [scoped.length, cost(row.totals)])));
    const dims = [['일반 입력', 'inputTokens'], ['캐시 읽기', 'cacheReadTokens'], ['일반 출력', 'outputTokens'], ['추론 출력', 'reasoningOutputTokens'], ['캐시 쓰기', 'cacheWriteTokens']];
    const stack = make('div', 'su-token-stack'); stack.setAttribute('aria-hidden', 'true');
    for (const [, key] of dims) { const part = make('i'); part.style.width = (totals.totalTokens ? totals[key] / totals.totalTokens * 100 : 0) + '%'; stack.append(part); }
    body.append(stack);
    for (const [label, key] of [...dims, ['총 토큰', 'totalTokens']]) {
      const line = make('div', 'su-dimension' + (key === 'totalTokens' ? ' su-dimension-total' : ''));
      line.append(make('span', '', t(label)), make('strong', '', totals.events ? count(totals[key]) : '—')); body.append(line);
    }
    const modelGroups = new Map();
    for (const session of scoped) for (const model of session.models) {
      const key = JSON.stringify([model.provider, model.model]);
      if (!modelGroups.has(key)) modelGroups.set(key, { provider: model.provider, model: model.model, items: [] });
      modelGroups.get(key).items.push(model);
    }
    const modelSection = make('section', 'su-detail-section'); modelSection.append(make('h4', '', t('모델별 환산액')));
    for (const model of modelGroups.values()) {
      const line = make('div', 'su-model-cost'); line.append(make('span', '', model.model || t('모델 미확인')),
        make('b', '', cost(sumSessionUsage(model.items)))); modelSection.append(line);
    }
    if (!modelGroups.size) modelSection.append(make('small', '', t('선택 기간 기록 없음')));
    body.append(modelSection);
    const history = make('section', 'su-detail-section'); history.append(make('h4', '', t('최근 7일 토큰')));
    const values = (data?.range.days || []).map(day => ({ day, total: scoped.reduce((sum, candidate) => sum + (candidate.daily.find(item => item.day === day)?.totalTokens || 0), 0) }));
    const max = Math.max(1, ...values.map(value => value.total)), plot = make('div', 'su-history'), axis = make('div', 'su-history-axis');
    plot.setAttribute('role', 'img'); plot.setAttribute('aria-label', values.map(value => value.day + ': ' + count(value.total)).join(', '));
    for (const value of values) { const bar = make('i'); bar.style.height = (value.total ? Math.max(2, value.total / max * 100) : 0) + '%'; bar.title = value.day + ': ' + count(value.total); plot.append(bar); axis.append(make('span', '', value.day.slice(5))); }
    history.append(plot, axis); body.append(history);
    body.append(make('p', 'su-detail-source', t('{0}개 연결 대화 · 로컬 기록', [scoped.reduce((sum, candidate) => sum + candidate.conversationCount, 0)])));
    inspector.append(body);
  }
  function schedule() {
    clearTimeout(timer); timer = null;
    if (!visible || !entered || document.hidden || !isPageActive()) return;
    timer = setTimeout(() => { if (!loading) void load(false); else schedule(); }, data?.tokensRefreshPending ? 1000 : 30_000);
  }
  async function load(refresh = false) {
    if (!visible || !entered || document.hidden || !isPageActive()) return;
    const current = ++serial, key = range + ':' + provider;
    loading = true; error = ''; render();
    try {
      const query = new URLSearchParams({ range, provider }); if (refresh) query.set('refresh', '1');
      const result = await requestJson('/api/usage/sessions?' + query, { credentials: 'same-origin', cache: 'no-store' }, 30_000);
      if ([401, 403].includes(result.response.status)) { location.reload(); return; }
      if (!result.response.ok || !Array.isArray(result.data?.sessions)) throw new Error('Session usage unavailable');
      if (current !== serial) return;
      data = result.data; cache.set(key, data); if (cache.size > 8) cache.delete(cache.keys().next().value);
    } catch { if (current === serial) error = 'unavailable'; }
    finally { if (current === serial) { loading = false; render(); schedule(); } }
  }
  for (const button of root.querySelectorAll('[data-range]')) button.onclick = () => { range = button.dataset.range; page = 0; data = cache.get(range + ':' + provider) || null; void load(false); };
  $('.su-provider').onchange = () => { provider = $('.su-provider').value; page = 0; data = cache.get(range + ':' + provider) || null; void load(false); };
  for (const selector of ['.su-project', '.su-status', '.su-sort', '.su-group']) $(selector).onchange = () => { page = 0; render(); };
  $('.su-search').oninput = () => { page = 0; render(); };
  $('.su-refresh').onclick = () => void load(true);
  $('.su-prev').onclick = () => { page--; render(); }; $('.su-next').onclick = () => { page++; render(); };
  $('.su-export').onclick = () => {
    const filtered = matches(), blob = new Blob([sessionUsageCsv(filtered, range)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Acedia-session-usage-' + range + '.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000); toast(t('현재 필터의 세션별 사용량을 내보냈습니다.'));
  };
  $('.su-pricing').onclick = () => $('.su-dialog').showModal(); $('.su-dialog-close').onclick = () => $('.su-dialog').close();
  $('.su-dialog').addEventListener('click', event => { const dialog = $('.su-dialog'); if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); });
  function suspend() { clearTimeout(timer); timer = null; serial++; loading = false; $('.su-dialog').close(); }
  render();
  return { translate: render,
    setVisible(value) { visible = value; root.hidden = !value; if (value) { render(); if (entered) void load(false); } else suspend(); },
    enter() { if (entered) return; entered = true; if (visible) void load(false); },
    leave() { entered = false; suspend(); },
    activityChanged() { if (!isPageActive() || document.hidden) suspend(); else if (visible && entered) void load(false); },
  };
}
