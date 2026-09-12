import { usagePeriods } from './periods.mjs';
const $ = selector => document.querySelector(selector);
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let theme = 'system';
try { theme = localStorage.getItem('acedia-usage-theme') || 'system'; } catch {}
if (!['system', 'light', 'dark'].includes(theme)) theme = 'system';
function applyTheme() { document.documentElement.dataset.theme = theme === 'system' ? systemTheme.matches ? 'dark' : 'light' : theme; $('#theme').value = theme; }
$('#theme').onchange = () => { theme = $('#theme').value; try { localStorage.setItem('acedia-usage-theme', theme); } catch {} applyTheme(); };
systemTheme.addEventListener('change', applyTheme); applyTheme();
let key = '', data, tab = 'overview', refreshing = false, focusBefore, detailSelection;
let localTestNoLogin = false;
let detailScroll = 0;
let recentPage = 1, recentPageSize = 25;
let analysisUnit = 'day';
const drawerHost = $('.drawer');
function detailLayout(type) {
  const account = type === 'account' || type === 'employee', host = account ? $('#account-page') : drawerHost;
  $('.content').classList.toggle('employee-view', type === 'employee');
  $('#employee-list').hidden = type !== 'employee';
  host.append($('#close-detail'), $('#detail'));
  $('.content').classList.toggle('account-view', account);
  $('#account-page').hidden = !account; $('#overlay').hidden = account || !type;
  $('#close-detail').textContent = account ? '← 목록으로 돌아가기' : '✕';
  $('#close-detail').setAttribute('aria-label', account ? '목록으로 돌아가기' : '상세 닫기');
}
const fmt = n => Number(n || 0).toLocaleString('ko-KR');
const short = n => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const when = value => value ? new Date(value).toLocaleString('ko-KR') : '미수집';
const el = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value != null) n.textContent = value; return n; };
const empty = message => el('div', 'empty', message);
const button = (label, fn) => { const b = el('button', 'linkbtn row-link', label); b.onclick = () => fn(b); return b; };
const allowedAccounts = () => data.accounts.filter(a => $('#account-kind').value === 'all' || a.kind === $('#account-kind').value);
const selectedRows = () => data.rows.filter(r => allowedAccounts().some(a => a.id === r.accountId));
const selectedSenders = () => (data.senders || []).filter(r => allowedAccounts().some(a => a.id === r.accountId));
function windowsUsers(rows) {
  const totals = new Map(), wrap = el('div');
  for (const r of rows) { const name = r.windowsUser || '과거 기록 · 미수집'; totals.set(name, (totals.get(name) || 0) + r.total); }
  for (const [name, total] of [...totals].sort((a, b) => b[1] - a[1])) { const user = el('div', '', name); user.append(el('small', 'secondary', fmt(total) + ' 토큰')); wrap.append(user); }
  if (!rows.length) wrap.textContent = '아직 없음';
  return wrap;
}
const employeeName = id => data.employees.find(e => e.id === id)?.name || id;
const accountName = id => data.accounts.find(a => a.id === id)?.name || id;
const kindLabel = a => (a.kind === 'shared' ? '공용' : '개인') + (a.loginEmail || a.providerIdentityId ? ' · 서버 등록' : ' · 기본 분류');
function employeeAccountUsage(employeeId) {
  const all = data.rows.filter(r => r.employeeId === employeeId), total = all.reduce((sum, r) => sum + r.total, 0), totals = new Map();
  for (const r of selectedRows().filter(r => r.employeeId === employeeId)) totals.set(r.accountId, (totals.get(r.accountId) || 0) + r.total);
  return { total, accounts: [...totals].map(([id, tokens]) => { const accountTotal = (data.accountTotals || []).find(a => a.accountId === id)?.total; return { id, tokens, accountTotal, percent: accountTotal > 0 ? tokens / accountTotal * 100 : null }; }).sort((a, b) => b.tokens - a.tokens) };
}
const percentLabel = value => value == null ? '산정 불가' : value > 0 && value < 0.1 ? '<0.1%' : `${Number(value.toFixed(1))}%`;
function employeeAccountCell(employeeId) {
  const usage = employeeAccountUsage(employeeId), wrap = el('div', 'employee-account-cell');
  for (const a of usage.accounts) { const row = el('div', '', accountName(a.id)); row.append(el('small', 'secondary', `${fmt(a.tokens)} 토큰 · ${percentLabel(a.percent)}`)); wrap.append(row); }
  if (!usage.accounts.length) wrap.textContent = '사용 기록 없음';
  return wrap;
}
function employeeAccountBreakdown(employeeId) {
  const usage = employeeAccountUsage(employeeId), wrap = el('section', 'employee-breakdown');
  wrap.append(el('h2', '', '계정 전체 사용량 중 직원 사용률'), el('p', 'note', '직원이 이 계정에서 사용한 토큰 ÷ 모든 직원이 이 계정에서 사용한 토큰 × 100. 같은 조회 기간의 수집 기록 기준이며 구독 한도 소진율과는 다릅니다.'));
  for (const a of usage.accounts) {
    const account = data.accounts.find(account => account.id === a.id), card = el('div', 'employee-account-card'); card.dataset.employeeAccount = a.id;
    const heading = el('div', 'employee-account-heading'), identity = el('div'); identity.append(accountLabel(a.id), el('small', 'secondary', kindLabel(account)));
    const numbers = el('div', 'employee-account-numbers'); numbers.append(el('strong', '', percentLabel(a.percent)), el('span', '', `직원 사용 ${fmt(a.tokens)} 토큰`), el('span', '', a.accountTotal == null ? '계정 전체 사용량 미확인' : `계정 전체 ${fmt(a.accountTotal)} 토큰`)); heading.append(identity, numbers);
    card.append(heading); if (a.percent != null) card.append(track(a.percent)); wrap.append(card);
  }
  if (!usage.accounts.length) wrap.append(empty('선택한 기간·필터에 해당하는 사용 기록이 없습니다.'));
  return wrap;
}
const deviceName = id => data.devices.find(d => d.id === id)?.name || id;
function accountInfo(id) {
  const reports = (data.reports || []).filter(r => r.accountId === id).sort((a, b) => b.checkedAt - a.checkedAt);
  const identities = [...new Set(reports.map(r => r.identity?.id).filter(Boolean))];
  return { report: reports[0], conflict: identities.length > 1 };
}
function accountLabel(id) {
  const { report, conflict } = accountInfo(id), wrap = el('div');
  wrap.append(button(accountName(id), b => showDetail('account', id, b)));
  wrap.append(el('small', 'secondary', conflict ? '서로 다른 로그인 계정 연결 · 매핑 확인 필요' : report?.identity?.email || data.accounts.find(a => a.id === id)?.loginEmail || '로그인 계정 미확인'));
  if (conflict) wrap.classList.add('identity-conflict');
  return wrap;
}
async function api(route, body) {
  const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
}
async function guarded(fn) { $('#error').textContent = ''; try { await fn(); } catch (error) { $('#error').textContent = error.message; } }
function table(headers, rows) {
  const wrap = el('div', 'tablewrap'), t = el('table'), head = t.createTHead().insertRow(), body = t.createTBody();
  for (const value of headers) head.append(el('th', '', value));
  for (const row of rows) { const tr = body.insertRow(); for (const value of row) { const cell = tr.insertCell(); if (value instanceof Node) cell.append(value); else cell.textContent = value; } }
  if (!rows.length) { const cell = body.insertRow().insertCell(); cell.colSpan = headers.length; cell.append(empty('해당 기간에 수집된 기록이 없습니다.')); }
  wrap.append(t); return wrap;
}
function recentHistory(records) {
  const root = el('div', 'recent-history'), toolbar = el('div', 'history-pagination'), sizeLabel = el('label', '', '페이지당 '), size = el('select'), status = el('span', 'history-range'), controls = el('div', 'history-controls'), previous = el('button', '', '이전'), pages = el('select'), next = el('button', '', '다음'), body = el('div');
  size.setAttribute('aria-label', '페이지당 기록 수'); pages.setAttribute('aria-label', '기록 페이지'); status.setAttribute('aria-live', 'polite');
  previous.dataset.action = 'previous'; next.dataset.action = 'next';
  for (const count of [25, 50, 100]) { const o = el('option', '', `${count}개`); o.value = count; size.append(o); }
  size.value = recentPageSize; sizeLabel.append(size); controls.append(previous, pages, next); toolbar.append(sizeLabel, status, controls); root.append(toolbar, body);
  function draw() {
    const count = Math.max(1, Math.ceil(records.length / recentPageSize)); recentPage = Math.min(Math.max(1, recentPage), count);
    const start = (recentPage - 1) * recentPageSize, end = Math.min(start + recentPageSize, records.length);
    status.textContent = records.length ? `총 ${fmt(records.length)}건 중 ${start + 1}–${end}건` : '기록 없음';
    pages.replaceChildren(...Array.from({ length: count }, (_, i) => { const o = el('option', '', `${i + 1} / ${count} 페이지`); o.value = i + 1; return o; })); pages.value = recentPage;
    previous.disabled = recentPage === 1; next.disabled = recentPage === count; pages.disabled = records.length === 0;
    const hideAccount = detailSelection?.type === 'account';
    const showCacheWrite = records.some(r => r.cacheWrite > 0), tokens = n => n == null ? '미수집' : fmt(n);
    body.replaceChildren(table(['시각', ...(hideAccount ? [] : ['AI 계정']), '사용자 · PC', '모델 · 실행 설정', '일반 입력', '캐시 입력', ...(showCacheWrite ? ['캐시 쓰기'] : []), '출력·추론', '요청 전체'], records.slice(start, end).map(r => { const sender = el('div', '', r.sender?.windowsUser || '과거 기록 · 미수집'); const connection = el('details', 'connection-details'); connection.append(el('summary', '', '접속 정보'), el('small', 'secondary', r.sender?.localIps?.join(', ') || 'IP 미수집'), el('small', 'secondary', deviceName(r.deviceId))); sender.append(connection); const account = el('div', '', accountName(r.accountId)); account.append(el('small', 'secondary', r.providerIdentity?.email || '당시 로그인 미확인')); const output = r.output == null || (r.provider === 'codex' && r.reasoning == null) ? null : r.output + (r.reasoning || 0); const runtime = el('div', '', r.model || '모델 미확인'); runtime.append(el('small', 'secondary', `Effort: ${r.effort || '미확인'} · Fast: ${r.fast == null ? '미확인' : r.fast ? '켜짐' : '꺼짐'}`)); return [when(r.occurredAt), ...(hideAccount ? [] : [account]), sender, runtime, tokens(r.input), tokens(r.cacheRead), ...(showCacheWrite ? [tokens(r.cacheWrite)] : []), tokens(output), fmt(r.total)]; })));
  }
  size.onchange = () => { recentPageSize = Number(size.value); recentPage = 1; draw(); };
  pages.onchange = () => { recentPage = Number(pages.value); draw(); };
  previous.onclick = () => { recentPage--; draw(); }; next.onclick = () => { recentPage++; draw(); };
  draw(); return root;
}
function periodAnalysis(selection) {
  const root = el('section', 'period-analysis'), heading = el('div', 'cardhead'), choices = el('div', 'period-choices'), content = el('div');
  heading.append(el('h2', '', '기간별 사용량 분석'), choices); root.append(heading, el('p', 'note', '한국 시간(Asia/Seoul) · 주 시작은 월요일입니다. 선택한 조회 기간 전체 기록을 집계하며, 기간 경계의 주·월은 조회 범위에 포함된 사용량만 표시합니다.'), content);
  let page = 1;
  const entries = (data.timeline || []).filter(r => !selection || (selection.type === 'account' ? r.accountId === selection.id : selection.type === 'employee' ? r.employeeId === selection.id : r.deviceId === selection.id));
  function draw() {
    const periods = usagePeriods(entries, analysisUnit, data.from, data.to, allowedAccounts()), pages = Math.max(1, Math.ceil(periods.length / 12));
    page = Math.min(page, pages); choices.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === analysisUnit)));
    const visible = periods.slice((page - 1) * 12, page * 12), max = Math.max(1, ...periods.map(p => p.total));
    const rows = visible.map(p => { const amount = el('div', 'period-amount', fmt(p.total)); amount.append(track(p.total / max * 100)); return [p.label, amount, fmt(p.shared), fmt(p.personal), fmt(p.events)]; });
    const nav = el('div', 'history-pagination'), prev = el('button', '', '이전'), next = el('button', '', '다음');
    prev.disabled = page === 1; next.disabled = page === pages; prev.onclick = () => { page--; draw(); }; next.onclick = () => { page++; draw(); };
    nav.append(el('span', 'period-summary', `전체 ${fmt(periods.reduce((sum, p) => sum + p.total, 0))} 토큰 · ${page} / ${pages} 페이지`), prev, next);
    content.replaceChildren(nav, table(['기간', '전체 토큰', '공용 토큰', '개인 토큰', '기록 수'], rows));
  }
  for (const [unit, title] of [['day', '일별'], ['week', '주별'], ['month', '월별']]) { const b = el('button', '', title); b.dataset.unit = unit; b.onclick = () => { analysisUnit = unit; page = 1; draw(); }; choices.append(b); }
  draw(); return root;
}
function track(percent) { const t = el('div', 'track'), bar = el('i'); bar.style.width = `${Math.max(0, Math.min(100, percent))}%`; t.append(bar); return t; }
function quotaCard(account, compact = false) {
  const card = el('section', 'quota-card'), { report, conflict } = accountInfo(account.id), q = report?.quota;
  const header = el('div', 'cardhead'); header.append(button(account.name, b => showDetail('account', account.id, b)), el('span', 'pill', kindLabel(account))); if (!compact) card.append(header);
  if (!compact) card.append(el('div', 'identity', report?.identity ? `${report.identity.email || '이메일 미제공'} · ${report.identity.id.slice(0, 10)}` : '연결한 로그인 계정 미확인'));
  if (conflict) { card.append(el('p', 'identity-conflict', '여러 로그인 계정이 연결되어 한도를 표시하지 않습니다. 폴더 매핑을 확인하세요.')); return card; }
  const status = { success: '조회 완료', failed: '조회 실패', timeout: '조회 시간 초과', login_required: '로그인 필요', cli_missing: 'Codex 실행 파일 확인 필요', unavailable: '한도 정보 미제공', identity_changed: '로그인 계정 변경됨' }[report?.status] || '수집기 보고 대기';
  if (!q?.primary && !q?.secondary) card.append(empty(status + ' · 남은 한도 미확인'));
  for (const [index, w] of [q?.primary, q?.secondary].entries()) {
    if (!w) continue;
    const expired = Boolean(w.resetsAt && w.resetsAt * 1000 <= Date.now());
    const stale = expired || Date.now() - q.updatedAt > 900000 || report.status !== 'success';
    const box = el('div', 'quota-window' + (stale ? ' stale' : ''));
    const label = w.windowMinutes === 10080 ? '주간 한도' : w.windowMinutes === 300 ? '5시간 한도' : w.windowMinutes ? `${w.windowMinutes >= 1440 ? w.windowMinutes / 1440 + '일' : w.windowMinutes / 60 + '시간'} 한도` : index ? '추가 한도' : '기본 한도';
    const row = el('div', 'ranktitle'); row.append(el('span', '', label), el('strong', '', `${Math.round((100 - w.usedPercent) * 10) / 10}% 남음`)); box.append(row, track(100 - w.usedPercent));
    box.append(el('small', '', expired ? '리셋 시각 경과 · 이전 관측값, 재조회 필요' : `리셋 ${when(w.resetsAt ? w.resetsAt * 1000 : null)}`));
    if (stale && !expired) box.append(el('small', '', '이전 관측값 · 최신 한도 확인 필요'));
    card.append(box);
  }
  card.append(el('p', 'quota-status', `${q?.plan || '요금제 미확인'} · ${status}\n한도 관측 ${when(q?.updatedAt)}`));
  return card;
}
function render() {
  const rows = selectedRows(), accounts = allowedAccounts(), total = rows.reduce((s, r) => s + r.total, 0), shared = rows.filter(r => data.accounts.find(a => a.id === r.accountId)?.kind === 'shared').reduce((s, r) => s + r.total, 0);
  const titles = { overview: ['전체 현황', '팀의 AI 사용량을 한눈에'], accounts: ['계정별 분석', '어느 계정을 얼마나 사용했나요?'], employees: ['직원별 분석', '직원별 사용량과 사용 계정'], devices: ['수집 상태', '전송한 PC와 Windows 사용자'], setup: ['등록 관리', '직원과 계정, 기기 연결'] };
  $('#page-description').textContent = { overview: '팀 전체 사용 추이와 계정 잔여 한도를 확인하세요.', accounts: '계정별 사용량과 한도를 비교하고, 계정을 선택해 상세 기록을 확인하세요.', employees: '직원별 사용 계정을 비교하고, 직원을 선택해 기간별 사용량을 확인하세요.', devices: '전송 기기와 마지막 보고 상태를 확인하세요.', setup: '직원·계정·수집 기기를 연결하고 관리하세요.' }[tab];
  $('#breadcrumb').textContent = titles[tab][0]; $('#page-title').textContent = titles[tab][1];
  $('#access-role').textContent = data.role === 'admin' ? '관리자 · 회사 전체' : '직원 · 내 사용량';
  $('#setup-nav').hidden = data.role !== 'admin';
  $('#registry-section').hidden = tab !== 'setup' || data.role !== 'admin';
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#overview').hidden = tab !== 'overview'; $('#setup').hidden = tab !== 'setup'; $('#table-section').hidden = ['setup', 'overview'].includes(tab);
  $('#limits-section').hidden = tab !== 'overview'; $('#stats').hidden = tab !== 'overview';
  $('#stats').replaceChildren(...[['전체 토큰', total, '선택한 기간의 수집 합계'], ['공용 계정', shared, '직원별 사용량을 합산'], ['개인 계정', total - shared, '등록된 개인 계정'], ['보고 기기', data.devices.filter(d => !d.revoked).length, '접근 권한이 있는 기기']].map(([label, value, note]) => { const s = el('section', 'stat'); s.append(el('label', '', label), el('strong', '', fmt(value)), el('small', '', note)); return s; }));
  $('#analysis-section').hidden = tab !== 'overview';
  $('#analysis-section').replaceChildren(periodAnalysis());
  $('#limits').replaceChildren(...(accounts.length ? accounts.map(quotaCard) : [empty('연결할 AI 계정을 등록하세요.')]));
  const pending = (data.refreshRequests || []).filter(r => accounts.some(a => a.id === r.accountId) && !(data.reports || []).some(s => s.accountId === r.accountId && s.checkedAt >= r.requestedAt));
  $('#refresh-state').textContent = pending.length ? `${pending.length}개 계정 · 수집기 응답 대기` : '';
  $('#synced').textContent = `마지막 동기화 ${new Date().toLocaleTimeString('ko-KR')}`;
  if (tab === 'overview') {
    const employees = data.employees.map(e => ({ ...e, total: rows.filter(r => r.employeeId === e.id).reduce((s, r) => s + r.total, 0) })).filter(e => e.total).sort((a, b) => b.total - a.total).slice(0, 5);
    $('#ranking').replaceChildren(...(employees.length ? employees.map(e => { const rank = el('div', 'rank'), title = el('div', 'ranktitle'); title.append(button(e.name, b => showDetail('employee', e.id, b)), el('span', '', short(e.total))); rank.append(title, track(e.total / total * 100), el('small', '', `${(e.total / total * 100).toFixed(1)}%`)); return rank; }) : [empty('아직 보고된 사용량이 없습니다.')]));
  }
  let headers, entries;
  if (tab === 'devices') {
    $('#table-title').textContent = '기기별 수집 상태'; $('#table-note').textContent = 'IP는 기기가 보고한 로컬 주소입니다. VPN·DHCP에 따라 바뀔 수 있습니다.';
    headers = ['기기', '직원', 'Windows 계정', '로컬 IP', '마지막 보고', '상태'];
    entries = data.devices.map(d => [button(d.name, b => showDetail('device', d.id, b)), employeeName(d.employeeId), d.metadata?.windowsUser || '미수집', d.metadata?.localIps?.join(', ') || '미수집', when(d.lastSeen), d.revoked ? '폐기됨' : Date.now() - d.lastSeen < 120000 ? '최근 보고' : '보고 지연']);
  } else if (tab === 'employees') {
    $('#table-title').textContent = '직원별 사용량'; $('#table-note').textContent = '사용률은 해당 계정 전체 사용량 중 이 직원이 사용한 비율입니다. 같은 조회 기간 기준입니다.';
    headers = ['직원', 'Windows 계정 · 사용 토큰', '사용 계정 · 토큰 · 비율', '공용 토큰', '개인 토큰', '합계'];
    entries = data.employees.map(e => { const r = rows.filter(r => r.employeeId === e.id), all = r.reduce((s, r) => s + r.total, 0), common = r.filter(r => accounts.find(a => a.id === r.accountId)?.kind === 'shared').reduce((s, r) => s + r.total, 0); return [button(e.name, b => showDetail('employee', e.id, b)), windowsUsers(selectedSenders().filter(s => s.employeeId === e.id)), employeeAccountCell(e.id), fmt(common), fmt(all - common), fmt(all)]; });
  } else {
    $('#table-title').textContent = '계정별 사용량'; $('#table-note').textContent = '실제 사용 당시 Windows 계정별 토큰입니다. AI 계정을 선택하면 PC와 로컬 IP도 볼 수 있습니다.';
    headers = ['AI 계정 · 로그인 이메일', '구분', '사용 직원', 'Windows 계정 · 사용 토큰', '수집 토큰', '한도 상태'];
    entries = accounts.map(a => { const r = rows.filter(r => r.accountId === a.id), info = accountInfo(a.id); return [accountLabel(a.id), a.kind === 'shared' ? '공용' : '개인', [...new Set(r.map(r => employeeName(r.employeeId)))].join(', ') || '아직 없음', windowsUsers(selectedSenders().filter(s => s.accountId === a.id)), fmt(r.reduce((s, r) => s + r.total, 0)), quotaCard(a, true)]; });
  }
  $('#table').replaceChildren(table(headers, entries));
  if (data.role === 'admin') {
    $('#registry-table').replaceChildren(table(['계정', '등록 로그인', '구분', '소유자', ''], data.accounts.map(a => [a.name, a.loginEmail || '로그인 미등록 · 기본 개인', a.kind === 'shared' ? '공용' : '개인', a.ownerId ? employeeName(a.ownerId) : a.kind === 'shared' ? '모든 직원' : '전송 직원 기준', button('수정', () => editAccount(a))])));
    const value = $('#observed-login').value, seen = new Set();
    const choices = (data.reports || []).filter(r => r.identity?.id && !seen.has(r.identity.id) && seen.add(r.identity.id));
    const first = el('option', '', '직접 입력'); first.value = '';
    $('#observed-login').replaceChildren(first, ...choices.map(r => { const o = el('option', '', r.identity.email || r.identity.id.slice(0, 12)); o.value = r.identity.id; return o; }));
    $('#observed-login').value = value;
  }
  for (const selector of ['#employee', '#owner']) { const value = $(selector).value; $(selector).replaceChildren(...data.employees.map(e => { const o = el('option', '', e.name); o.value = e.id; return o; })); if (data.employees.some(e => e.id === value)) $(selector).value = value; }
  if (detailSelection) renderDetail();
}
function showDetail(type, id, source) { if (detailSelection?.type === type && detailSelection.id === id) return; recentPage = 1; focusBefore = source; detailScroll = window.scrollY; detailSelection = { type, id }; detailLayout(type); renderDetail(); if (type === 'account' || type === 'employee') window.scrollTo(0, 0); $('#close-detail').focus({ preventScroll: true }); }
function renderDetail() {
  const { type, id } = detailSelection, detail = $('#detail'), name = type === 'account' ? accountName(id) : type === 'employee' ? employeeName(id) : deviceName(id);
  $('#overlay').dataset.detailType = type;
  if (type === 'employee') {
    $('#breadcrumb').textContent = '직원 상세 / ' + name;
    $('#employee-list').replaceChildren(...data.employees.map(employee => {
      const b = el('button', '', employee.name); b.type = 'button';
      b.setAttribute('aria-current', employee.id === id ? 'page' : 'false');
      b.onclick = () => { showDetail('employee', employee.id, b); $('#detail-title').focus({ preventScroll: true }); };
      return b;
    }));
  }

  const title = el('h1', '', name); title.id = 'detail-title'; title.tabIndex = -1; detail.replaceChildren(el('div', 'eyebrow', type.toUpperCase() + ' DETAIL'), title);
  const field = (name, value) => { const row = el('div', 'formrow'); row.append(el('span', '', name), el('strong', '', value)); detail.append(row); };
  if (type === 'account') {
    $('#breadcrumb').textContent = '계정 상세 / ' + name;
    const a = data.accounts.find(a => a.id === id), r = accountInfo(id).report, accountRows = data.rows.filter(row => row.accountId === id);
    const total = accountRows.reduce((sum, row) => sum + row.total, 0), stats = el('div', 'stats');
    detail.append(el('p', 'account-subtitle', `${a.provider === 'codex' ? 'Codex' : 'Claude'} · ${kindLabel(a)} · ${r?.identity?.email || a.loginEmail || '로그인 미확인'}`));
    for (const [label, value, note] of [['수집 토큰', total, '선택한 조회 기간'], ['사용 직원', new Set(accountRows.map(row => row.employeeId)).size, '조회 가능한 직원'], ['사용 기록', accountRows.reduce((sum, row) => sum + row.events, 0), '선택 기간 전체 기록']]) { const stat = el('div', 'stat'); stat.append(el('label', '', label), el('strong', '', fmt(value)), el('small', '', note)); stats.append(stat); }
    detail.append(stats);
    const grid = el('div', 'account-info-grid'), info = el('section', 'card account-info'), limits = el('section', 'card');
    info.append(el('h2', '', '계정 정보'));
    for (const [label, value] of [['계정 구분', kindLabel(a)], ['로그인 이메일', r?.identity?.email || a.loginEmail || '미확인'], ['공급자', a.provider === 'codex' ? 'Codex' : 'Claude'], ['마지막 한도 조회', when(r?.checkedAt)]]) { const row = el('div', 'formrow'); row.append(el('span', '', label), el('strong', '', value)); info.append(row); }
    const identifier = el('details'); identifier.append(el('summary', '', '계정 식별자 보기'), el('p', '', r?.identity?.id || a.providerIdentityId || '미확인')); info.append(identifier);
    limits.append(el('h2', '', '남은 사용 한도'), quotaCard(a, true)); grid.append(info, limits); detail.append(grid);
  }
  if (type === 'device') {
    const d = data.devices.find(d => d.id === id); field('등록 직원', employeeName(d.employeeId)); field('PC 이름', d.metadata?.hostname || '미수집'); field('Windows 계정', d.metadata?.windowsUser || '미수집'); field('현재 로컬 IP', d.metadata?.localIps?.join(', ') || '미수집'); field('기기 정보 갱신', when(d.metadataAt));
    if (data.role === 'admin' && !d.revoked) detail.append(button('기기 접근 폐기', async () => { if (confirm('이 기기의 전송·조회 권한을 폐기할까요?')) await guarded(async () => { await api('/v1/admin/revoke', { id }); await refresh(); }); }));
  }
  const rows = selectedRows().filter(r => type === 'account' ? r.accountId === id : type === 'employee' ? r.employeeId === id : true);
  if (type === 'employee') { field('선택 기간 직원 전체 토큰', fmt(employeeAccountUsage(id).total)); detail.append(employeeAccountBreakdown(id)); }
  if (type === 'account') {
    const card = el('section', 'card account-section'), total = (data.accountTotals || []).find(a => a.accountId === id)?.total;
    card.append(el('h2', '', '직원별 사용량'), el('p', 'note', '선택한 기간의 계정 전체 사용량 중 각 직원이 사용한 비율입니다.'), table(['직원', '사용 토큰', '계정 사용률'], rows.sort((a, b) => b.total - a.total).map(r => { const share = total > 0 ? r.total / total * 100 : null, cell = el('div', 'account-employee-share', percentLabel(share)); if (share != null) cell.append(track(share)); return [employeeName(r.employeeId), fmt(r.total), cell]; })));
    detail.append(card);
  }
  if (type === 'employee' || type === 'account') {
    const observations = (data.skills || []).filter(s => (type === 'employee' ? s.employeeId === id : s.accountId === id) && allowedAccounts().some(a => a.id === s.accountId));
    const grouped = new Map();
    for (const s of observations) { const old = grouped.get(s.name) || { name: s.name, calls: 0, lastUsed: 0 }; old.calls += s.calls; old.lastUsed = Math.max(old.lastUsed, s.lastUsed); grouped.set(s.name, old); }
    const card = el('section', 'card account-section skill-usage'); card.append(el('h2', '', '사용한 스킬'), el('p', 'note', '실행 로그의 SKILL.md 읽기 요청을 감지합니다. 설치 목록이나 대화 중 언급은 집계하지 않으며, 실제 실행 성공·스킬별 토큰은 의미하지 않습니다. 이후 토큰 기록과 함께 전송됩니다.'), table(['스킬', '읽기 요청 수', '마지막 감지'], [...grouped.values()].sort((a,b)=>b.calls-a.calls).map(s=>[s.name,fmt(s.calls),when(s.lastUsed)]))); detail.append(card);
  }
  const analysis = periodAnalysis({ type, id }); if (type === 'account' || type === 'employee') analysis.classList.add('card', 'account-section'); detail.append(analysis);
  const appendSection = (title, note, content) => { if (title === 'Windows 계정별 사용량') { const fold = el('details', 'sender-details'); fold.append(el('summary', '', 'PC·Windows 계정별 상세'), el('h2', '', title), el('p', 'note', note), content); detail.append(fold); return; } if (type === 'account' || type === 'employee') { const card = el('section', 'card account-section'); card.append(el('h2', '', title), el('p', 'note', note), content); detail.append(card); } else detail.append(el('h2', '', title), el('p', 'note', note), content); };
  const senders = selectedSenders().filter(r => type === 'account' ? r.accountId === id : type === 'employee' ? r.employeeId === id : r.deviceId === id);
  appendSection('Windows 계정별 사용량', '선택 기간 전체 합계입니다. 사용 당시 PC·IP가 달라지면 나누어 표시합니다.', table(['Windows 계정', '직원 · AI 계정', 'PC · 로컬 IP', '토큰'], senders.map(r => { const pc = el('div', '', r.hostname || 'PC 미수집'); pc.append(el('small', 'secondary', r.localIps.join(', ') || 'IP 미수집')); const owner = el('div', '', employeeName(r.employeeId)); owner.append(el('small', 'secondary', accountName(r.accountId))); return [r.windowsUser || '과거 기록 · 미수집', owner, pc, fmt(r.total)]; })));
  const recent = (data.recent || []).filter(r => allowedAccounts().some(a => a.id === r.accountId) && (type === 'account' ? r.accountId === id : type === 'employee' ? r.employeeId === id : r.deviceId === id));
  appendSection('최근 사용량 · 전송한 PC', '각 행은 CLI가 보고한 요청별 토큰이며 누적 합계가 아닙니다. 일반 입력은 캐시를 제외한 입력, 캐시 입력은 재사용한 입력입니다. 출력·추론을 더한 요청 전체에는 이전 대화가 다시 처리된 토큰도 포함됩니다. 최신 500건을 페이지로 표시하며 없는 세부 수치는 미수집으로 표시합니다.', recentHistory(recent));
}
async function refresh() { if (refreshing) return; refreshing = true; try { data = await api(`/v1/summary?from=${Date.now() - Number($('#days').value) * 86400000}`); render(); } finally { refreshing = false; } }
$('#loginform').onsubmit = e => { e.preventDefault(); void guarded(async () => { key = $('#key').value.trim(); await refresh(); $('#key').value = ''; $('#login').hidden = true; $('#workspace').hidden = false; }); };
$('#logout').onclick = () => { key = ''; data = null; location.reload(); };
$('#refresh').onclick = () => void guarded(async () => { $('#refresh').disabled = true; try { await api('/v1/refresh', {}); await refresh(); } finally { $('#refresh').disabled = false; } });
$('#days').onchange = () => { recentPage = 1; void guarded(refresh); }; $('#account-kind').onchange = () => { recentPage = 1; render(); };
for (const b of document.querySelectorAll('[data-tab],[data-go]')) b.onclick = () => { if (detailSelection) { detailSelection = null; detailLayout(null); } tab = b.dataset.tab || b.dataset.go; render(); };
$('#employeeform').onsubmit = e => { e.preventDefault(); void guarded(async () => { await api('/v1/admin/employees', { name: $('#employee-name').value }); $('#employee-name').value = ''; await refresh(); }); };
function resetAccountForm() { $('#accountform').reset(); $('#account-edit-id').value = ''; $('#account-form-title').textContent = 'AI 계정 등록'; $('#account-save').textContent = '등록'; $('#account-cancel').hidden = true; $('#owner').disabled = $('#kind').value !== 'personal'; }
function editAccount(a) {
  $('#account-edit-id').value = a.id; $('#account-name').value = a.name; $('#provider').value = a.provider; $('#kind').value = a.kind; const owners = [...new Set(data.rows.filter(r => r.accountId === a.id).map(r => r.employeeId))]; $('#owner').value = a.ownerId || (owners.length === 1 ? owners[0] : ''); $('#login-email').value = a.loginEmail || ''; $('#login-identity').value = a.providerIdentityId || ''; $('#observed-login').value = '';
  $('#account-form-title').textContent = 'AI 계정 수정'; $('#account-save').textContent = '저장'; $('#account-cancel').hidden = false; $('#owner').disabled = a.kind !== 'personal'; $('#accountform').scrollIntoView({ block: 'center' }); $('#login-email').focus();
}
$('#kind').onchange = () => { $('#owner').disabled = $('#kind').value !== 'personal'; };
$('#owner').disabled = $('#kind').value !== 'personal';
$('#account-cancel').onclick = resetAccountForm;
$('#observed-login').onchange = () => { const r = (data.reports || []).find(r => r.identity?.id === $('#observed-login').value); if (r) { $('#login-email').value = r.identity.email || ''; $('#login-identity').value = r.identity.id; } };
$('#login-email').oninput = () => { $('#login-identity').value = ''; $('#observed-login').value = ''; };
$('#accountform').onsubmit = e => { e.preventDefault(); void guarded(async () => { await api('/v1/admin/accounts', { id: $('#account-edit-id').value || undefined, name: $('#account-name').value, provider: $('#provider').value, kind: $('#kind').value, ownerId: $('#owner').value, loginEmail: $('#login-email').value, providerIdentityId: $('#login-identity').value || null }); resetAccountForm(); await refresh(); }); };
$('#enrollform').onsubmit = e => { e.preventDefault(); void guarded(async () => { const result = await api('/v1/admin/enrollments', { employeeId: $('#employee').value }); $('#enrollment').textContent = result.code + '\n만료: ' + when(result.expires); $('#enrollment').hidden = false; }); };
$('#export').onclick = () => { const csv = '\uFEFFemployee_id,account_id,provider,tokens\n' + selectedRows().map(r => [r.employeeId, r.accountId, r.provider, r.total].join(',')).join('\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = el('a'); a.href = url; a.download = 'acedia-usage.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
function closeDetail() { const wasAccount = ['account', 'employee'].includes(detailSelection?.type); detailSelection = null; detailLayout(null); render(); if (wasAccount) window.scrollTo(0, detailScroll); if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true }); else document.querySelector('.nav button.active')?.focus({ preventScroll: true }); }
$('#close-detail').onclick = closeDetail; $('#overlay').onclick = e => { if (e.target === $('#overlay')) closeDetail(); };
document.addEventListener('keydown', e => { if (!detailSelection) return; if (e.key === 'Escape') { closeDetail(); return; } if ($('#overlay').hidden) return; if (e.key === 'Tab') { const nodes = [...$('#overlay').querySelectorAll('button,a,input,select')].filter(n => !n.disabled), first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } });
setInterval(() => { if ((key || localTestNoLogin) && !$('#workspace').hidden && !document.hidden && !detailSelection) void guarded(refresh); }, 5000);
void guarded(async () => {
  const access = await api('/v1/access');
  if (!access.localTestNoLogin) return;
  localTestNoLogin = true; await refresh(); $('#login').hidden = true; $('#workspace').hidden = false;
  $('#logout').textContent = '로컬 테스트 · 로그인 생략'; $('#logout').disabled = true;
});
