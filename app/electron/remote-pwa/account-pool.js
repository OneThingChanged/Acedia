import { requestJson } from './requests.js';
import { t, getLanguage } from './i18n.js';

export function createAccountPoolView(root) {
  const pageUrl = new URL(location.href);
  const loginAccountId = /^[0-9a-f-]{36}$/i.test(pageUrl.searchParams.get('poolLogin') || '') ? pageUrl.searchParams.get('poolLogin') : null;
  const dashboardUrl = new URL(location.pathname, location.origin); dashboardUrl.searchParams.set('usage', '1'); dashboardUrl.searchParams.set('accounts', '1');
  let returnTimer = null;
  let data = null, busy = false, visible = false, timer = null, entered = false, editingId = null;
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
  const form = el('form', '', 'pool-toolbar'); const label = el('label', '계정 이름');
  const input = el('input'); input.required = true; input.maxLength = 80; input.autocomplete = 'off'; label.append(input);
  const add = el('button', '계정 추가'); add.type = 'submit';
  const cancelEdit = el('button', '취소'); cancelEdit.type = 'button'; cancelEdit.hidden = true;
  form.append(label, add, cancelEdit);
  const list = el('div', '', 'pool-list');
  const recordsTitle = el('h3', '최근 분산 요청'); const records = el('div', '', 'pool-records');
  panel.append(intro, toolbar, form, status, list, recordsTitle, records); root.append(tabs, panel);
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
    if (visible && entered && !root.closest('[hidden]')) timer = setTimeout(() => void run(() => api(), true), data?.accounts.some(a => a.state === 'login_pending') ? 2500 : 15000);
  }
  async function run(task, quiet = false) {
    if (busy) return;
    busy = true; panel.setAttribute('aria-busy', 'true');
    if (!quiet) status.textContent = t('처리 중…');
    for (const node of panel.querySelectorAll('button,input')) node.disabled = true;
    try { data = await task(); status.textContent = ''; }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; panel.setAttribute('aria-busy', 'false'); render(); schedule(); }
  }
  function button(text, action, row, disabled = false) {
    const node = el('button', text); node.type = 'button'; node.disabled = disabled;
    node.onclick = () => void run(action); row.append(node); return node;
  }
  const names = { ready: '사용 가능', login_required: '로그인 필요', login_pending: '로그인 대기', login_failed: '로그인 실패' };
  function render() {
    const admin = data?.canManage === true;
    form.hidden = toolbar.hidden = !admin || Boolean(loginAccountId);
    for (const node of panel.querySelectorAll('button,input')) node.disabled = !admin || busy;
    toggle.textContent = t(data?.enabled ? '분산 끄기' : '분산 켜기'); toggle.setAttribute('aria-pressed', String(Boolean(data?.enabled)));
    add.textContent = t(editingId ? '이름 저장' : '계정 추가'); cancelEdit.hidden = !editingId;
    list.replaceChildren(); records.replaceChildren();
    if (!data) return;
    if (!admin) { list.append(el('p', '계정 등록과 분산 설정은 소유자만 관리할 수 있습니다.')); recordsTitle.hidden = true; return; }
    recordsTitle.hidden = records.hidden = Boolean(loginAccountId);
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
      const card = el('article', '', 'pool-card'); const title = el('h3'); title.textContent = account.label;
      const state = el('p', `${account.email || ''} ${account.plan || ''} · ${t(names[account.state] || '확인 필요')} · ${t(account.enabled ? '분산 참여' : '분산 제외')}`);
      if (account.cooldownUntil > Date.now()) state.append(el('span', ' · ' + t('한도 대기')));
      const numbers = el('p', `${t('요청')} ${account.stats.requests.toLocaleString()} · ${t('실패')} ${account.stats.failures.toLocaleString()} · ${t('입력 토큰')} ${account.stats.inputTokens.toLocaleString()} · ${t('출력 토큰')} ${account.stats.outputTokens.toLocaleString()}`);
      card.append(title, state, numbers);
      if (account.error) card.append(el('p', account.error));
      const bucket = account.limits?.rateLimitsByLimitId?.codex || account.limits?.rateLimits;
      for (const [name, w] of [[t('기본 한도'), bucket?.primary], [t('추가 한도'), bucket?.secondary]]) {
        if (typeof w?.usedPercent !== 'number') continue;
        const remaining = Math.max(0, Math.min(100, 100 - w.usedPercent));
        const row = el('label', `${name} · ${t('남음')} ${remaining.toFixed(0)}%`);
        const meter = el('meter'); meter.min = 0; meter.max = 100; meter.value = remaining; meter.setAttribute('aria-label', name); row.append(meter);
        if (w.resetsAt) row.append(el('span', ' · ' + t('초기화') + ' ' + new Date(w.resetsAt * 1000).toLocaleString()));
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
          const start = button(method === 'browser' ? '브라우저 로그인' : '기기 코드 로그인', () => {}, actions, account.active > 0);
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
        button('한도 새로고침', () => api({ action: 'refresh', id: account.id }), actions, account.state !== 'ready');
        const rename = el('button', '이름 변경'); rename.type = 'button';
        rename.onclick = () => { editingId = account.id; input.value = account.label; render(); input.focus(); }; actions.append(rename);
        button('제거', async () => {
          if (!window.confirm(`${account.label}: ${t('계정을 제거하면 이 계정에 연결된 대화를 계속할 수 없습니다. 제거할까요?')}`)) return data;
          return api({ action: 'remove', id: account.id });
        }, actions, account.active > 0);
      }
      card.append(actions); list.append(card);
    }
    if (loginAccountId) return;
    if (!data.recent.length) records.append(el('p', '분산으로 처리한 요청이 없습니다. 분산을 켜고 새 Codex 세션을 시작하세요.'));
    for (const item of data.recent.slice(0, 20)) {
      const name = data.accounts.find(a => a.id === item.accountId)?.label || t('제거된 계정');
      const state = { completed: '완료', failed: '실패', cancelled: '취소' }[item.status] || '처리 중…';
      records.append(el('p', `${new Date(item.at).toLocaleString()} · ${name} · ${t(state)} · ${item.inputTokens + item.outputTokens} ${t('토큰')} · ${t('세션')} ${item.sessionId}`));
    }
  }
  function select(value) {
    visible = value; panel.hidden = !value; root.parentElement.classList.toggle('pool-mode', value);
    history.setAttribute('aria-pressed', String(!value)); accounts.setAttribute('aria-pressed', String(value));
    if (value) void run(() => api()); else clearTimeout(timer);
  }
  history.onclick = () => select(false); accounts.onclick = () => select(true);
  form.onsubmit = event => { event.preventDefault(); void run(async () => {
    const account = data?.accounts.find(a => a.id === editingId);
    const result = await api(editingId ? { action: 'update', id: editingId, label: input.value, enabled: Boolean(account?.enabled) } : { action: 'create', label: input.value });
    input.value = ''; editingId = null; return result;
  }); };
  cancelEdit.onclick = () => { editingId = null; input.value = ''; render(); input.focus(); };
  refresh.onclick = () => void run(() => api()); toggle.onclick = () => void run(() => api({ action: 'configure', enabled: !data.enabled }));
  select(Boolean(loginAccountId) || pageUrl.searchParams.get('accounts') === '1');
  return { translate, enter: () => { if (entered) return; entered = true; if (visible) void run(() => api()); }, leave: () => { entered = false; clearTimeout(timer); clearTimeout(returnTimer); returnTimer = null; } };
}
