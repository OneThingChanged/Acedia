import { t } from "./i18n.js";

export function createSessionModelEditor({ getAgent, selectedId, projectName, statusOf, showToast, refresh }) {
  const $ = id => document.getElementById(id);
  const menu = $("sessionContextMenu"), overlay = $("sessionModelOverlay"), form = $("sessionModelForm");
  const model = $("sessionModelSelect"), effort = $("sessionEffortSelect"), message = $("sessionModelMessage");
  const save = $("sessionModelSave"), restart = $("sessionModelRestart"), retry = $("sessionModelRetry");
  const headerButton = $("sessionModelButton");
  let menuId = null, targetId = null, trigger = null, catalog = null, busy = false, sequence = 0;
  const supported = agent => ["codex", "claude"].includes(agent?.aiToolId) && !agent.sshHostId;
  const label = (settings, current = false) => settings ? `${settings.model}${settings.effort ? ` · ${settings.effort}` : ` · ${t(current ? "effort 확인되지 않음" : "모델 기본값")}`}` : t("CLI 기본값");

  function closeMenu(restore = false) {
    menu.hidden = true; menuId = null;
    if (restore) trigger?.focus?.({ preventScroll: true });
  }
  function openMenu(id, node, x, y) {
    if (!supported(getAgent(id))) return false;
    closeMenu(); trigger = node; menuId = id;
    menu.querySelector("button").textContent = t("모델 / effort 변경");
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    menu.querySelector("button").focus({ preventScroll: true });
    return true;
  }
  function error(text) { message.textContent = text; message.hidden = false; }
  function controls() {
    const ready = Boolean(catalog) && !busy;
    model.disabled = !ready; effort.disabled = !ready || !model.value;
    save.disabled = !ready; restart.disabled = !ready || !catalog.canRestart;
    for (const id of ["sessionModelClose", "sessionModelCancel"]) $(id).disabled = busy;
    retry.disabled = busy;
  }
  function efforts(initial = "") {
    const option = document.createElement("option"); option.value = ""; option.textContent = t("모델 기본값");
    effort.replaceChildren(option);
    const selected = catalog?.models.find(item => item.model === model.value);
    for (const item of selected?.efforts || []) {
      const node = document.createElement("option"); node.value = item.effort;
      node.textContent = item.effort; node.title = item.description; effort.append(node);
    }
    effort.value = [...effort.options].some(item => item.value === initial) ? initial : "";
    $("sessionEffortHint").textContent = selected?.defaultEffort ? `${t("모델 기본 effort")}: ${selected.defaultEffort}` : "";
    controls();
  }
  function close() {
    if (busy || overlay.hidden) return;
    sequence++; overlay.hidden = true; targetId = null; catalog = null;
    trigger?.focus?.({ preventScroll: true }); trigger = null;
  }
  async function load() {
    const ticket = ++sequence, id = targetId;
    catalog = null; controls(); retry.hidden = true;
    error(t("계정의 모델 목록을 불러오는 중…"));
    try {
      const response = await fetch(`/api/session/model?id=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json();
      if (ticket !== sequence || overlay.hidden) return;
      if (!response.ok) throw new Error(result.error || t("모델 목록을 불러오지 못했습니다."));
      if (!Array.isArray(result.models) || !result.models.length) throw new Error(t("사용 가능한 모델이 없습니다."));
      catalog = result; message.hidden = true;
      $("sessionModelCatalogNote").hidden = result.capabilitiesSource !== "cli-help";
      $("sessionModelCurrent").textContent = `${t(result.currentSource === "last-turn" ? "최근 대화 설정" : "시작 시 설정")}: ${result.current ? label(result.current, true) : t("확인되지 않음")}`;
      $("sessionModelSaved").textContent = `${t("저장된 설정")}: ${label(result.saved)} · ${result.accountLabel || "Codex"}`;
      const defaultOption = document.createElement("option"); defaultOption.value = ""; defaultOption.textContent = t("CLI 기본값");
      model.replaceChildren(defaultOption);
      for (const item of result.models) {
        const node = document.createElement("option"); node.value = item.model;
        node.textContent = item.label === item.model ? item.model : `${item.label} (${item.model})`; model.append(node);
      }
      const initial = result.saved || result.current;
      if (initial && !result.models.some(item => item.model === initial.model)) {
        // Do not silently replace a saved model when account entitlements changed.
        const unavailable = document.createElement("option"); unavailable.value = initial.model;
        unavailable.textContent = `${initial.model} (${t("현재 계정에서 사용 불가")})`; unavailable.disabled = true; model.append(unavailable);
      }
      model.value = initial?.model || ""; efforts(initial?.effort || "");
      model.focus({ preventScroll: true });
    } catch (problem) {
      if (ticket !== sequence || overlay.hidden) return;
      error(String(problem.message || problem)); retry.hidden = false;
    }
    controls();
  }
  function open(id, node) {
    const agent = getAgent(id);
    if (!supported(agent)) return;
    closeMenu(); trigger = node || document.activeElement; targetId = id;
    $("sessionModelTitle").textContent = t("모델 / effort 변경");
    $("sessionModelProvider").textContent = agent.aiToolId === "claude" ? "CLAUDE" : "CODEX";
    $("sessionModelCatalogNote").hidden = true;
    $("sessionModelTarget").textContent = `${projectName(agent)} / ${agent.name || agent.id}`;
    $("sessionModelCurrent").textContent = ""; $("sessionModelSaved").textContent = "";
    overlay.hidden = false; $("sessionModelCancel").focus(); void load();
  }
  async function submit(applyNow) {
    if (busy || !catalog || !targetId) return;
    const id = targetId;
    const selected = catalog.models.find(item => item.model === model.value);
    if (model.value && !selected) { error(t("지원하는 모델을 선택하세요.")); return; }
    const selectedEffort = effort.value || selected?.defaultEffort;
    const settings = model.value ? { model: model.value, ...(selectedEffort ? { effort: selectedEffort } : {}) } : null;
    busy = true; controls(); message.hidden = true;
    form.tabIndex = -1; form.focus({ preventScroll: true });
    save.textContent = t("처리 중…");
    try {
      const response = await fetch("/api/session/model", { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ id, settings, restart: applyNow }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("설정을 변경하지 못했습니다."));
      busy = false; close();
      showToast(t(result.restarted ? "같은 대화를 새 모델 설정으로 재시작했습니다." : "저장했습니다. 다음 세션 시작에 적용됩니다."));
      await refresh();
    } catch (problem) { error(String(problem.message || problem)); }
    finally { busy = false; save.textContent = t("저장 (다음 시작)"); controls(); }
  }
  $("sessionList").addEventListener("contextmenu", event => {
    const row = event.target.closest(".session-row[data-agent-id]");
    if (row && openMenu(row.dataset.agentId, row, event.clientX, event.clientY)) event.preventDefault();
  });
  $("sessionList").addEventListener("keydown", event => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    const row = event.target.closest(".session-row[data-agent-id]");
    if (!row) return;
    const rect = row.getBoundingClientRect();
    if (openMenu(row.dataset.agentId, row, rect.left + 12, rect.bottom)) event.preventDefault();
  });
  $("detailName").addEventListener("contextmenu", event => {
    if (openMenu(selectedId(), headerButton, event.clientX, event.clientY)) event.preventDefault();
  });
  menu.querySelector("button").addEventListener("click", () => { const id = menuId, node = trigger; open(id, node); });
  headerButton.addEventListener("click", () => open(selectedId(), headerButton));
  model.addEventListener("change", () => efforts());
  form.addEventListener("submit", event => { event.preventDefault(); void submit(false); });
  restart.addEventListener("click", () => { void submit(true); });
  retry.addEventListener("click", load);
  $("sessionModelCancel").addEventListener("click", close);
  $("sessionModelClose").addEventListener("click", close);
  document.addEventListener("pointerdown", event => { if (!menu.hidden && !menu.contains(event.target)) closeMenu(); });
  window.addEventListener("resize", () => closeMenu());
  window.addEventListener("scroll", () => closeMenu(), true);
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && (!menu.hidden || !overlay.hidden)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!menu.hidden) closeMenu(true); else close();
    } else if (event.key === "Tab" && !overlay.hidden) {
      const nodes = [...form.querySelectorAll("button, select")].filter(node => !node.disabled && !node.hidden);
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    } else if (!menu.hidden && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); menu.querySelector("button").focus();
    }
  }, true);
  return { update() {
    headerButton.hidden = !supported(getAgent(selectedId()));
    headerButton.textContent = t("모델 / effort");
    if (!overlay.hidden && !getAgent(targetId)) { if (!busy) close(); }
    if (catalog) {
      const agent = getAgent(targetId), status = statusOf(agent);
      catalog.canRestart = status === "offline" || (status === "done" || status === "idle")
        && ["done", "idle", "session-start"].includes(agent?.hook?.event);
      controls();
    }
  } };
}
