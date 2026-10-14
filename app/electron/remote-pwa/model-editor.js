import { t } from './i18n.js';
export function createSessionModelEditor({ getAgent, selectedId, projectName, showToast, refresh, rename, closeSession, restartSession }) {
  const $ = id => document.getElementById(id);
  const menu = $('sessionContextMenu'), overlay = $('sessionModelOverlay'), form = $('sessionModelForm');
  const model = $('sessionModelSelect'), effort = $('sessionEffortSelect'), fast = $('sessionFastSelect');
  const message = $('sessionModelMessage'), save = $('sessionModelSave'), restart = $('sessionModelRestart'), retry = $('sessionModelRetry');
  const triggerButton = $('composerModelButton'), header = $('sessionModelButton'), providerSelect = $('sessionModelDefaultProvider');
  let target = null, defaults = false, source = null, catalog = null, busy = false, generation = 0, speedChanged = false, lastRead = 0, currentId = null, pending = false;
  const supported = agent => ['codex', 'claude'].includes(agent?.aiToolId) && !agent.sshHostId;
  const provider = () => defaults ? providerSelect.value : getAgent(target)?.aiToolId;
  const tier = value => ['priority', 'fast', 'ultrafast'].includes(value) ? 'fast' : value === 'default' || value === null ? 'default' : 'keep';
  const label = value => value ? `${value.model}${value.effort ? ` · ${value.effort}` : ''}${Object.hasOwn(value, 'serviceTier') ? ` · ${tier(value.serviceTier) === 'fast' ? 'Fast' : t('기본 속도')}` : ''}` : t('확인되지 않음');
  const error = value => { message.textContent = value; message.hidden = !value; };
  function controls() {
    const ready = !!catalog && !busy;
    model.disabled = !ready; effort.disabled = !ready || !model.value; fast.disabled = !ready || !model.value;
    save.disabled = !ready; restart.disabled = !ready || catalog.canRestart !== true;
    restart.hidden = defaults; $('sessionFastField').hidden = provider() !== 'codex';
    $('sessionModelDefaultField').hidden = !defaults;
    $('sessionModelDefaultNote').hidden = !defaults; $('sessionModelSessionNote').hidden = defaults;
    save.textContent = t(defaults ? '기본 모델 저장' : '저장 (다음 시작)');
    for (const id of ['sessionModelClose', 'sessionModelCancel', 'sessionModelRetry', 'sessionModelDefaultProvider']) $(id).disabled = busy;
  }
  function efforts(value = '') {
    const empty = new Option(t('모델 기본값'), ''); effort.replaceChildren(empty);
    const selected = catalog?.models.find(item => item.model === model.value);
    for (const item of selected?.efforts || []) effort.append(new Option(item.effort, item.effort));
    effort.value = [...effort.options].some(item => item.value === value) ? value : '';
    $('sessionEffortHint').textContent = selected?.defaultEffort ? `${t('모델 기본 effort')}: ${selected.defaultEffort}` : '';
    controls();
  }
  function close() { if (busy) return; generation++; pending = false; overlay.hidden = true; catalog = null; source?.focus?.(); }
  async function load(preserve = false) {
    const ticket = ++generation, id = target, selectedProvider = provider();
    pending = true;
    if (!preserve) { catalog = null; controls(); error(t('계정의 모델 목록을 불러오는 중…')); }
    retry.hidden = true;
    try {
      const url = defaults ? `/api/session/defaults?provider=${selectedProvider}` : `/api/session/model?id=${encodeURIComponent(id)}`;
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (ticket !== generation || overlay.hidden) return;
      if (!response.ok || !data.models?.length) throw Error(data.error || t('사용 가능한 모델이 없습니다.'));
      catalog = data; lastRead = Date.now(); error('');
      $('sessionModelCurrent').textContent = `${t(defaults ? '기본 모델' : '현재 모델')}: ${label(defaults ? data.settings : data.current)}`;
      $('sessionModelSaved').textContent = `${t('저장된 설정')}: ${label(data.saved || data.settings)} · ${data.accountLabel || selectedProvider}`;
      $('sessionModelCatalogNote').hidden = data.capabilitiesSource !== 'cli-help';
      if (!preserve) {
        const initial = defaults ? data.settings : data.pending || data.current || data.saved;
        model.replaceChildren(new Option(t('Acedia 기본값'), ''));
        for (const item of data.models) model.append(new Option(item.label || item.model, item.model));
        if (initial && !data.models.some(item => item.model === initial.model)) {
          const unavailable = new Option(`${initial.model} (${t('현재 계정에서 사용 불가')})`, initial.model); unavailable.disabled = true; model.append(unavailable);
        }
        model.value = initial?.model || ''; efforts(initial?.effort || '');
        fast.value = tier(initial?.serviceTier); speedChanged = false;
        model.focus({ preventScroll: true });
      }
      controls();
    } catch (problem) { if (ticket === generation && !overlay.hidden) { error(problem.message); retry.hidden = false; } }
    finally { if (ticket === generation) pending = false; }
  }
  function open(id, node, mode = false) {
    if (!mode && !supported(getAgent(id))) return;
    source = node || document.activeElement; target = id; defaults = mode; menu.hidden = true;
    $('sessionModelTitle').textContent = t(mode ? '기본 모델' : '모델 / effort 변경');
    $('sessionModelProvider').textContent = (mode ? providerSelect.value : getAgent(id).aiToolId).toUpperCase();
    $('sessionModelTarget').textContent = mode ? t('모델 설정이 없는 세션에 적용합니다.') : `${projectName(getAgent(id))} / ${getAgent(id).name}`;
    $('sessionModelCurrent').textContent = ''; $('sessionModelSaved').textContent = '';
    overlay.hidden = false; void load();
  }
  async function submit(applyNow) {
    if (!catalog || busy) return;
    const chosen = catalog.models.find(item => item.model === model.value);
    if (model.value && !chosen) { error(t('지원하는 모델을 선택하세요.')); return; }
    if (defaults && !chosen) { error(t('지원하는 모델을 선택하세요.')); return; }
    const settings = chosen ? { model: model.value, ...(effort.value ? { effort: effort.value } : {}),
      ...(provider() === 'codex' && (defaults || speedChanged) ? { serviceTier: fast.value === 'fast' ? 'fast' : 'default' } : {}) } : null;
    busy = true; controls(); error('');
    try {
      const body = defaults ? { provider: provider(), settings, revision: catalog.revision } : { id: target, settings, restart: applyNow };
      const response = await fetch(defaults ? '/api/session/defaults' : '/api/session/model', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw Error(result.error || t('설정을 변경하지 못했습니다.'));
      busy = false; close(); lastRead = 0;
      showToast(t(defaults ? '기본 모델을 저장했습니다.' : result.restarted ? '같은 대화를 새 모델 설정으로 재시작했습니다.' : '저장했습니다. 다음 세션 시작에 적용됩니다.')); await refresh();
    } catch (problem) { error(problem.message); } finally { busy = false; controls(); }
  }
  let menuTarget;
  function openMenu(event, row) {
    if (!row) return;
    event.preventDefault(); menuTarget = row.dataset.agentId; source = row;
    menu.querySelector('[data-session-action=model]').hidden = !supported(getAgent(menuTarget));
    const restarting = menu.querySelector('[data-session-action=restart]');
    restarting.disabled = !restartSession || ['starting', 'recovering'].includes(getAgent(menuTarget)?.runtimeStatus || getAgent(menuTarget)?.status);
    menu.hidden = false; menu.style.left = `${Math.max(8, Math.min(event.clientX || 12, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY || 60, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector('button:not([hidden]):not(:disabled)')?.focus();
  }
  $('sessionList').addEventListener('contextmenu', event => openMenu(event, event.target.closest('[data-agent-id]')));
  $('sessionList').addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openMenu(event, event.target.closest('[data-agent-id]')); });
  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-session-action]');
    if (button?.disabled) return;
    const action = button?.dataset.sessionAction;
    if (!action) return; menu.hidden = true;
    if (action === 'model') open(menuTarget, source);
    if (action === 'rename') rename?.(menuTarget);
    if (action === 'close') void closeSession?.(menuTarget);
    if (action === 'restart') void restartSession?.(menuTarget);
  });
  menu.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...menu.querySelectorAll('button:not([hidden]):not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    event.preventDefault();
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  });
  for (const node of [header, triggerButton]) node?.addEventListener('click', () => open(selectedId(), node));
  $('defaultModelsButton').addEventListener('click', event => open(null, event.currentTarget, true));
  providerSelect.addEventListener('change', () => { $('sessionModelProvider').textContent = provider().toUpperCase(); void load(); });
  model.addEventListener('change', () => efforts()); fast.addEventListener('change', () => { speedChanged = true; });
  form.addEventListener('submit', event => { event.preventDefault(); void submit(false); });
  restart.addEventListener('click', () => { void submit(true); }); retry.addEventListener('click', () => load());
  for (const id of ['sessionModelCancel', 'sessionModelClose']) $(id).addEventListener('click', close);
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) menu.hidden = true; });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (!menu.hidden || !overlay.hidden)) { event.preventDefault(); event.stopImmediatePropagation(); menu.hidden = true; close(); }
    if (event.key === 'Tab' && !overlay.hidden) {
      const nodes = [...form.querySelectorAll('button,select')].filter(node => !node.disabled && node.getClientRects().length);
      const first = nodes[0], last = nodes.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    }
  }, true);
  return { update() {
    const id = selectedId(), agent = getAgent(id); header.hidden = !supported(agent) || !$('chatView').hidden; triggerButton.hidden = !supported(agent);
    if (id !== currentId) { currentId = id; lastRead = 0; triggerButton.textContent = agent?.modelSettings?.model || t('모델 / effort'); }
    if (!overlay.hidden && !busy && Date.now() - lastRead > 2500 && !pending) { void load(true); }
    else if (overlay.hidden && supported(agent) && Date.now() - lastRead > 10000 && !pending) {
      const ticket = generation; pending = true; lastRead = Date.now();
      void fetch(`/api/session/model?id=${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'same-origin' }).then(response => response.ok ? response.json() : null).then(data => {
        if (ticket === generation && id === selectedId() && data) { triggerButton.textContent = data.models?.find(item => item.model === data.current?.model)?.label || data.current?.model || data.saved?.model || t('확인되지 않음'); triggerButton.title = label(data.current); }
      }).catch(() => {}).finally(() => { if (ticket === generation) pending = false; });
    }
  } };
}
