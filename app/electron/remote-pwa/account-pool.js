import { requestJson } from './requests.js';
import { t, getLanguage } from './i18n.js';

export function quotaPresentation(window, limitsAt, now = Date.now()) {
  const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
  if (Number.isFinite(window.resetsAt) && window.resetsAt * 1000 <= now) return { state: 'expired', remaining };
  if (!Number.isFinite(limitsAt) || now - limitsAt > 60 * 60_000) return { state: 'stale', remaining };
  return { state: 'current', remaining };
}

export function recordedTokens(record) {
  const input = record?.inputTokens;
  const output = record?.outputTokens;
  if (!Number.isSafeInteger(input) || input < 0 || !Number.isSafeInteger(output) || output < 0) return null;
  const known = record?.usageReported === true
    || (record?.usageReported !== false && input + output > 0);
  return known && Number.isSafeInteger(input + output) ? input + output : null;
}

export function requestStatus(record) {
  if (record.status === 'cancelled') return record.completionObserved === false
    ? '완료 전 연결 종료' : '연결 종료 (완료 여부 미확인)';
  return { completed: '완료', failed: '실패' }[record.status] || '처리 중…';
}

export function createAccountPoolView(root, { sessionLabel = (id) => id, onChange = () => {} } = {}) {
  const pageUrl = new URL(location.href);
  const loginAccountId = /^[0-9a-f-]{36}$/i.test(pageUrl.searchParams.get('poolLogin') || '') ? pageUrl.searchParams.get('poolLogin') : null;
  const dashboardUrl = new URL(location.pathname, location.origin); dashboardUrl.searchParams.set('usage', '1'); dashboardUrl.searchParams.set('accounts', '1');
  let returnTimer = null;
  let data = null, busy = false, visible = false, timer = null, entered = false, editingId = null;
  let usageSignature = '';
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = t(text); if (className) node.className = className; return node; };
  const tabs = el('div', '', 'pool-tabs'); tabs.setAttribute('aria-label', t('사용량 보기'));
  const history = el('button', '사용량'); const accounts = el('button', '계정 관리·분산');
  history.type = accounts.type = 'button'; tabs.append(history, accounts);
  const panel = el('section', '', 'pool-panel'); panel.hidden = true;
  const intro = el('p', '분산 전용 계정을 등록하면 새로 시작하는 Codex 세션에 적용됩니다. 진행 중인 세션은 다시 열어야 합니다.');
  const status = el('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const toolbar = el('div', '', 'pool-toolbar');
  const toggle = el('button', '분산 켜기'); toggle.type = 'button';
  const refresh = el('button', '목록 새로고침'); refresh.type = 'button'; toolbar.append(toggle, refresh);
  const refreshStatus = el('p', '', 'pool-refresh-status'); refreshStatus.setAttribute('role', 'status'); refreshStatus.setAttribute('aria-live', 'polite');
  const form = el('form', '', 'pool-toolbar'); const label = el('label', '계정 이름');
  const input = el('input'); input.required = true; input.maxLength = 80; input.autocomplete = 'off'; label.append(input);
  const add = el('button', '계정 추가'); add.type = 'submit';
  const cancelEdit = el('button', '취소'); cancelEdit.type = 'button'; cancelEdit.hidden = true;
  form.append(label, add, cancelEdit);
  const list = el('div', '', 'pool-list');
  const recordsTitle = el('h3', '최근 분산 요청'); const records = el('div', '', 'pool-records');
  const recordsHint = el('p', '요청별 토큰 정보가 없어도 사용량이 발생할 수 있습니다. 대화 기록의 토큰 합계는 위 계정 카드에서 확인하세요.', 'pool-records-hint');
  panel.append(intro, toolbar, refreshStatus, form, status, list, recordsTitle, recordsHint, records); root.append(tabs, panel);
  if (loginAccountId) {
    tabs.hidden = true;
    intro.textContent = t('인증 탭에서 로그인한 뒤 이 화면으로 돌아오세요. 완료되면 계정 관리 화면으로 자동 이동합니다.');
    const back = el('a', 'Dashboard로 돌아가기', 'pool-return'); back.href = dashboardUrl.href; panel.prepend(back);
  }
  const textBindings = []; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) textBindings.push([walker.currentNode, walker.currentNode.nodeValue]);
  let language = getLanguage();
  function translate() {
    if (language === getLanguage()) return; language = getLanguage();
    for (const [node, source] of textBindings) if (node.isConnected) node.nodeValue = t(source);
    render();
  }
  async function api(body) {
    const { response, data: result } = await requestJson('/api/account-pool', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}, 45000);
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }
  function schedule() {
    clearTimeout(timer);
    if (visible && entered && !root.closest('[hidden]')) timer = setTimeout(() => void run(() => api(), true), data?.quotaRefresh?.running ? 1500
      : data?.accounts.some(a => a.state === 'login_pending') ? 2500 : 15000);
  }
  async function run(task, quiet = false) {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy', 'true');
    if (!quiet) status.textContent = t('처리 중…');
    for (const node of panel.querySelectorAll('button,input')) node.disabled = true;
    try {
      data = await task(); status.textContent = '';
      const signature = JSON.stringify(data.accounts.map(account => [account.id, account.label, account.enabled, account.state, account.limitsAt]));
      if (signature !== usageSignature) { usageSignature = signature; onChange(); }
    }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; panel.setAttribute('aria-busy', 'false'); render(); schedule(); }
  }
  function button(text, action, row, disabled = false) {
    const node = el('button', text); node.type = 'button'; node.disabled = disabled;
    node.onclick = () => void run(action); row.append(node); return node;
  }
  const names = { ready: '인증 완료', login_required: '로그인 필요', login_pending: '로그인 대기', login_failed: '로그인 실패' };
  function render() {
    const admin = data?.canManage === true;
    form.hidden = toolbar.hidden = !admin || Boolean(loginAccountId);
    refreshStatus.hidden = !admin || Boolean(loginAccountId);
    for (const node of panel.querySelectorAll('button,input')) node.disabled = !admin || busy;
    toggle.textContent = t(data?.enabled ? '분산 끄기' : '분산 켜기'); toggle.setAttribute('aria-pressed', String(Boolean(data?.enabled)));
    const job = data?.quotaRefresh;
    refresh.disabled = !admin || busy || Boolean(job?.running);
    refresh.textContent = t(job?.running ? '갱신 중…' : '목록 새로고침');
    refresh.title = t('모든 계정의 한도와 목록을 새로고칩니다.');
    refreshStatus.textContent = !job ? '' : job.running
      ? t('계정 한도 갱신 중… {0}/{1}', [job.completed, job.total])
      : job.total === 0 ? t('갱신할 계정이 없습니다. 계정을 추가하고 로그인하세요.')
      : t('목록 갱신 완료 · 성공 {0} · 실패 {1} · 건너뜀 {2}', [job.succeeded, job.failed, job.skipped]);
    add.textContent = t(editingId ? '이름 저장' : '계정 추가'); cancelEdit.hidden = !editingId;
    list.replaceChildren(); records.replaceChildren();
    if (!data) return;
    if (!admin) { list.append(el('p', '계정 등록과 분산 설정은 소유자만 관리할 수 있습니다.')); recordsTitle.hidden = recordsHint.hidden = true; return; }
    recordsTitle.hidden = recordsHint.hidden = records.hidden = Boolean(loginAccountId);
    if (loginAccountId) {
      const target = data.accounts.find(account => account.id === loginAccountId);
      if (!target) status.textContent = t('로그인 계정을 찾을 수 없습니다. Dashboard로 돌아가 다시 시작하세요.');
      else if (target.state === 'ready' && !target.login) {
        status.textContent = t('로그인이 완료되었습니다. Dashboard로 이동합니다.');
        if (visible && entered && !returnTimer) returnTimer = setTimeout(() => location.replace(dashboardUrl.href), 1200);
      }
    }
    if (!data.accounts.length) list.append(el('p', '등록한 분산 계정이 없습니다. 계정을 추가한 뒤 로그인하세요.'));
    for (const account of data.accounts.filter(account => !loginAccountId || account.id === loginAccountId)) {
      const quotaResult = job?.results?.find(item => item.id === account.id);
      const quotaBusy = job?.running && quotaResult?.status === 'running';
      const card = el('article', '', 'pool-card'); const title = el('h3'); title.textContent = account.label;
      const state = el('p', `${account.email || ''} ${account.plan || ''} · ${t(names[account.state] || '확인 필요')} · ${t(account.enabled ? '분산 참여' : '분산 제외')}`);
      if (account.cooldownUntil > Date.now()) state.append(el('span', ' · ' + t('한도 대기')));
      const statistics = account.stats;
      const legacy = Number(statistics.legacyFailedOrCancelled) || 0;
      const legacyDisconnected = Number(statistics.version >= 3 ? statistics.legacyDisconnected : statistics.cancelled) || 0;
      const cancelled = statistics.version >= 3 ? Number(statistics.cancelled) || 0 : 0;
      const numbers = el('p', `${t('요청')} ${statistics.requests.toLocaleString()} · ${t(legacy ? '새 집계 실패' : '실패')} ${statistics.failures.toLocaleString()} · ${t('완료 전 연결 종료')} ${cancelled.toLocaleString()}`);
      const measured = Number(statistics.measuredRequests) > 0 || statistics.inputTokens + statistics.outputTokens > 0;
      const transcript = account.transcriptUsage;
      const usage = el('p', transcript?.events > 0
        ? `${t('대화 기록 입력 토큰')} ${transcript.inputTokens.toLocaleString()} · ${t('대화 기록 출력 토큰')} ${transcript.outputTokens.toLocaleString()}`
        : measured
          ? `${t('확인된 입력 토큰')} ${statistics.inputTokens.toLocaleString()} · ${t('확인된 출력 토큰')} ${statistics.outputTokens.toLocaleString()}`
          : t('토큰 사용량 미집계'));
      card.append(title, state, numbers, usage);
      if (transcript?.events > 0) card.append(el('small', '기록된 계정 배정 기간의 Codex 대화 토큰입니다.'));
      if (legacy) card.append(el('small', t('기존 실패·취소 혼합 {0}건은 분리할 수 없습니다.', [legacy.toLocaleString()])));
      if (legacyDisconnected) card.append(el('small', t('기존 연결 종료 {0}건은 완료 여부를 확인할 수 없습니다.', [legacyDisconnected.toLocaleString()])));
      if (statistics.unmeasuredRequests > 0) card.append(el('small', t('응답 토큰 정보가 없는 생성 요청 {0}건', [statistics.unmeasuredRequests.toLocaleString()])));
      if (account.error) card.append(el('p', account.error));
      if (quotaResult?.status === 'failed') card.append(el('p', '한도 갱신에 실패했습니다. 이전 조회값을 유지합니다.'));
      if (quotaResult?.reason === 'login_required') card.append(el('small', '로그인이 필요해 한도 갱신을 건너뛰었습니다.'));
      if (quotaResult?.reason === 'login_pending') card.append(el('small', '로그인 진행 중인 계정은 한도 갱신을 건너뜁니다.'));
      const bucket = account.limits?.rateLimitsByLimitId?.codex || account.limits?.rateLimits;
      for (const [name, w] of [[t('기본 한도'), bucket?.primary], [t('추가 한도'), bucket?.secondary]]) {
        if (typeof w?.usedPercent !== 'number') continue;
        const quota = quotaPresentation(w, account.limitsAt);
        const description = quota.state === 'expired' ? t('한도 갱신 필요')
          : quota.state === 'stale' ? `${t('마지막 조회 당시 남음')} ${quota.remaining.toFixed(0)}%`
          : `${t('남음')} ${quota.remaining.toFixed(0)}%`;
        const row = el('label', `${name} · ${description}`);
        if (quota.state !== 'expired') {
          const meter = el('meter'); meter.min = 0; meter.max = 100; meter.value = quota.remaining; meter.setAttribute('aria-label', name); row.append(meter);
        }
        if (w.resetsAt) row.append(el('span', ' · ' + t(quota.state === 'expired' ? '지난 초기화' : '초기화') + ' ' + new Date(w.resetsAt * 1000).toLocaleString()));
        card.append(row);
      }
      card.append(el('small', account.limitsAt ? `${t('한도 조회')} ${new Date(account.limitsAt).toLocaleString()}` : '한도를 아직 조회하지 않았습니다.'));
      const actions = el('div', '', 'pool-toolbar');
      if (account.login) {
        const login = el('div', '', 'pool-login');
        const link = el('a', '로그인 페이지 열기');
        link.href = account.login.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        if (account.login.code) login.append(el('p', '로그인 페이지에서 아래 코드를 입력하세요.'), el('strong', account.login.code));
        else login.append(el('p', 'Acedia가 실행 중인 PC의 브라우저에서 링크를 열고 로그인하세요. 휴대폰에서는 기기 코드 로그인을 사용하세요.'));
        const address = el('input'); address.type = 'text'; address.readOnly = true;
        address.value = account.login.url; address.setAttribute('aria-label', t('로그인 페이지 열기'));
        address.style.cssText = 'display:block;width:100%;min-width:0;box-sizing:border-box;margin-top:12px';
        address.onclick = () => address.select();
        login.append(link, address); card.append(login);
        button('로그인 취소', () => api({ action: 'cancel', id: account.id }), actions);
      } else if (!loginAccountId) {
        const methods = data.defaultLoginMethod === 'device' ? ['device', 'browser'] : ['browser', 'device'];
        for (const method of methods) {
          const start = button(method === 'browser' ? '브라우저 로그인' : '기기 코드 로그인', () => {}, actions, account.active > 0 || quotaBusy);
          start.onclick = () => {
            if (busy) return;
            // Reserve the tab during the user gesture, before the asynchronous request.
            const authTab = window.open('about:blank', '_blank');
            if (authTab) authTab.opener = null;
            void run(async () => {
              try {
                const result = await api({ action: 'login', id: account.id, method });
                const url = result.accounts.find(item => item.id === account.id)?.login?.url;
                if (authTab && !authTab.closed) {
                  if (url) authTab.location.replace(url); else authTab.close();
                }
                return result;
              } catch (error) { if (authTab && !authTab.closed) authTab.close(); throw error; }
            });
          };
        }
        if (data.defaultLoginMethod === 'device') card.append(el('small', '다른 기기에서는 기기 코드 로그인을 사용하세요. ChatGPT 보안 설정에서 기기 코드 로그인을 활성화해야 합니다.'));
        button(account.enabled ? '분산 제외' : '분산 참여', () => api({ action: 'update', id: account.id, enabled: !account.enabled }), actions, account.state !== 'ready' && !account.enabled);
        const rename = el('button', '이름 변경'); rename.type = 'button';
        rename.onclick = () => { editingId = account.id; input.value = account.label; render(); input.focus(); }; actions.append(rename);
        button('제거', async () => {
          if (!window.confirm(`${account.label}: ${t('계정을 제거하면 이 계정에 연결된 대화를 계속할 수 없습니다. 제거할까요?')}`)) return data;
          return api({ action: 'remove', id: account.id });
        }, actions, account.active > 0 || quotaBusy);
      }
      card.append(actions); list.append(card);
    }
    if (loginAccountId) return;
    if (!data.recent.length) records.append(el('p', '분산으로 처리한 요청이 없습니다. 분산을 켜고 새 Codex 세션을 시작하세요.'));
    for (const item of data.recent.slice(0, 20)) {
      const name = data.accounts.find(a => a.id === item.accountId)?.label || t('제거된 계정');
      const state = requestStatus(item);
      const total = recordedTokens(item);
      const tokens = item.operation === 'models' ? t('사용량 대상 아님')
        : total == null ? t('요청별 토큰 정보 없음') : `${total.toLocaleString()} ${t('토큰')}`;
      records.append(el('p', `${new Date(item.at).toLocaleString()} · ${name} · ${t(state)} · ${tokens} · ${t('세션')} ${sessionLabel(item.sessionId)}`));
    }
  }
  function select(value) {
    visible = value; panel.hidden = !value; root.parentElement.classList.toggle('pool-mode', value);
    history.setAttribute('aria-pressed', String(!value)); accounts.setAttribute('aria-pressed', String(value));
    if (value) void run(() => api()); else clearTimeout(timer);
  }
  history.onclick = () => { select(false); onChange(); }; accounts.onclick = () => select(true);
  form.onsubmit = event => { event.preventDefault(); void run(async () => {
    const account = data?.accounts.find(a => a.id === editingId);
    const result = await api(editingId ? { action: 'update', id: editingId, label: input.value, enabled: Boolean(account?.enabled) } : { action: 'create', label: input.value });
    input.value = ''; editingId = null; return result;
  }); };
  cancelEdit.onclick = () => { editingId = null; input.value = ''; render(); input.focus(); };
  refresh.onclick = () => { refresh.textContent = t('갱신 중…'); void run(() => api({ action: 'refresh_all' })); };
  toggle.onclick = () => void run(() => api({ action: 'configure', enabled: !data.enabled }));
  select(Boolean(loginAccountId) || pageUrl.searchParams.get('accounts') === '1');
  return { translate, enter: () => { if (entered) return; entered = true; if (visible) void run(() => api()); }, leave: () => { entered = false; clearTimeout(timer); clearTimeout(returnTimer); returnTimer = null; } };
}
