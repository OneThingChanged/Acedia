import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { SessionModel, SessionModelCatalog } from "../../electron/shared/session-model.mjs";
import { useAppLanguage } from "../lib/appLanguage";
import { applyChatSessionModel, settingsForChatModel, useChatSessionModelChanging } from "../lib/chatSessionModel";
import { useNativeViewOcclusion } from "../hooks/useNativeViewOcclusion";
import { invoke } from "../platform/runtime";
import { ChatIcon } from "./ChatIcon";
import "./ChatModelPicker.css";

const sameSettings = (a: SessionModel | null, b: SessionModel | null) => a?.model === b?.model && a?.effort === b?.effort;

export function ChatModelPicker({ agentId, provider, active, busy, sessionId, settingsKey }: {
  agentId: string;
  provider: string;
  active: boolean;
  busy: boolean;
  sessionId?: string;
  settingsKey?: string;
}) {
  const { text } = useAppLanguage();
  const applying = useChatSessionModelChanging(agentId);
  const [catalog, setCatalog] = useState<SessionModelCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [draft, setDraft] = useState<SessionModel | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const id = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sequence = useRef(0);
  const edited = useRef(false);
  const target = useRef({ agentId, provider });
  target.current = { agentId, provider };
  const applyingRef = useRef(applying);
  applyingRef.current = applying;
  useNativeViewOcclusion(isOpen);

  const load = useCallback(async () => {
    const ticket = ++sequence.current;
    setLoading(true); setError("");
    try {
      const result = await invoke("get_session_model", { id: agentId });
      if (ticket !== sequence.current || applyingRef.current) return;
      if (!result?.models?.length) throw new Error(text("사용 가능한 모델을 확인하지 못했습니다.", "Could not find available models."));
      setCatalog(result);
    } catch (problem) {
      if (ticket === sequence.current) setError(String(problem instanceof Error ? problem.message : problem));
    } finally { if (ticket === sequence.current) setLoading(false); }
  }, [agentId, text]);

  useEffect(() => {
    setCatalog(null); setOpen(false); setDraft(null); setError(""); setApplyError("");
    return () => { sequence.current++; };
  }, [agentId, provider]);
  useEffect(() => {
    if (!active || applying) return;
    void load();
    return () => { sequence.current++; };
  }, [active, applying, busy, sessionId, provider, settingsKey, load]);
  useEffect(() => { if (!active && !applying) setOpen(false); }, [active, applying]);
  useEffect(() => {
    if (!active || applying) return;
    // CLI /model changes can happen without a busy/status transition.
    const timer = window.setInterval(() => { void load(); }, isOpen && catalog?.canRestart === false ? 2000 : 15000);
    return () => window.clearInterval(timer);
  }, [active, applying, isOpen, catalog?.canRestart, load]);

  const current = catalog?.current ?? catalog?.saved ?? null;
  const model = catalog?.models.find(item => item.model === current?.model);
  const selected = catalog?.models.find(item => item.model === draft?.model);
  const modelLabel = model?.label || current?.model || text("모델 확인 중", "Checking model");
  const effortLabel = current?.effort || model?.defaultEffort || text("기본값", "Default");
  const disabled = applying || catalog?.canEdit === false;
  const unchanged = sameSettings(draft, model ? settingsForChatModel(model, current) : current);
  const canApply = !!draft && !!selected && !busy && !loading && !error && !applying && !!catalog?.canEdit
    && catalog.canRestart && !unchanged;

  useEffect(() => {
    if (!isOpen || !catalog || edited.current) return;
    const value = catalog.current ?? catalog.saved;
    const option = catalog.models.find(item => item.model === value?.model);
    setDraft(option ? settingsForChatModel(option, value) : value);
  }, [catalog, isOpen]);

  const close = useCallback(() => {
    if (applyingRef.current) return;
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);

  function open(button: HTMLButtonElement) {
    if (disabled) return;
    triggerRef.current = button;
    edited.current = false;
    setDraft(model ? settingsForChatModel(model, current) : current);
    setApplyError("");
    setOpen(true);
    // Recheck account capabilities and session readiness at the point of use.
    void load();
  }

  useLayoutEffect(() => {
    if (!isOpen) return;
    const root = rowRef.current?.closest<HTMLElement>(".chat-view-modern");
    if (!root) return;
    setPortal(root);
    const place = () => {
      const rect = root.getBoundingClientRect();
      const anchor = rowRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(360, rect.width - 24);
      setPosition({ width, left: Math.max(12, Math.min(anchor.left - rect.left, rect.width - width - 12)),
        bottom: rect.bottom - anchor.top + 8, maxHeight: Math.max(90, anchor.top - rect.top - 20) });
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(root);
    window.addEventListener("resize", place);
    const outside = (event: PointerEvent) => {
      if (!applyingRef.current && !panelRef.current?.contains(event.target as Node) && !rowRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); document.removeEventListener("pointerdown", outside); };
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen || !portal) return;
    const timer = requestAnimationFrame(() => {
      const checked = panelRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      (checked || panelRef.current?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(timer);
  }, [isOpen, portal]);
  useEffect(() => {
    if (!isOpen || loading || edited.current) return;
    panelRef.current?.querySelector('.chat-model-options [aria-checked="true"]')?.scrollIntoView({ block: "nearest" });
  }, [isOpen, loading, catalog]);

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Tab") {
      const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") || [])];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const group = (event.target as HTMLElement).closest('[role="radiogroup"]');
      if (!group) return;
      const nodes = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
      const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
      if (!nodes.length) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1
        : (index + (event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1) + nodes.length) % nodes.length;
      nodes[next].focus(); nodes[next].click();
    }
  }

  async function apply() {
    if (!canApply || !draft) return;
    const settings = draft, id = agentId, tool = provider;
    sequence.current++; setLoading(false); setError(""); setApplyError("");
    try {
      await applyChatSessionModel(id, settings);
      if (target.current.agentId !== id || target.current.provider !== tool) return;
      setCatalog(value => value ? { ...value, current: settings, currentSource: "launch", saved: settings } : value);
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    } catch (problem) {
      if (target.current.agentId === id && target.current.provider === tool) {
        setApplyError(String(problem instanceof Error ? problem.message : problem));
      }
    }
  }

  const title = applying ? text("모델 설정을 적용하고 있습니다.", "Applying model settings.") : catalog?.canEdit === false ? text("기본 작업창에서 모델을 변경하세요.", "Change the model in the main workspace.")
    : text("모델 및 추론 강도 변경", "Change model and reasoning effort");
  return <div className="chat-model-picker" ref={rowRef}>
    <button type="button" className="chat-model-trigger" aria-label={text("모델 및 추론 강도 변경", "Change model and reasoning effort")} title={`${title} · ${modelLabel} · ${effortLabel}`}
      aria-haspopup="dialog" aria-expanded={isOpen} aria-controls={isOpen ? id : undefined} disabled={disabled}
      onClick={event => open(event.currentTarget)}><span>{applying ? text("적용 중…", "Applying…") : modelLabel}</span><ChatIcon name="chevron" /></button>
    {isOpen && portal && createPortal(<div className="chat-model-popover" ref={panelRef} id={id} style={position}
      role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-busy={loading || applying} onKeyDown={keys}>
      <header className="chat-model-head"><strong id={`${id}-title`}>{text("모델 선택", "Choose a model")}</strong>
        <button type="button" className="chat-copy-button" aria-label={text("닫기", "Close")} disabled={applying} onClick={close}><ChatIcon name="close" /></button></header>
      <div className="chat-model-body">
        <div className="chat-model-account">{provider === "claude" ? "Claude" : "Codex"}{catalog?.accountLabel ? ` · ${catalog.accountLabel}` : ""}</div>
        {current && <div className="chat-model-current">{text("현재 모델", "Current model")}: <strong>{modelLabel}</strong>{current.effort ? ` · ${current.effort}` : ""}</div>}
        {loading && <div className="chat-model-notice" role="status">{text("모델 목록을 확인하는 중…", "Checking available models…")}</div>}
        {catalog && <>
          <div className="chat-model-options" role="radiogroup" aria-label={text("모델", "Model")}>
            {catalog.models.map(item => <button type="button" role="radio" aria-checked={draft?.model === item.model}
              className="chat-model-option" data-model={item.model} key={item.model} disabled={applying || loading}
              onClick={() => { edited.current = true; setDraft(settingsForChatModel(item, draft)); }}><span><strong>{item.label}</strong>{item.label !== item.model && <small>{item.model}</small>}</span>{draft?.model === item.model && <ChatIcon name="check" />}</button>)}
          </div>
          {selected && <fieldset className="chat-effort-field"><legend>{text("추론 강도", "Reasoning effort")}</legend>
            <div className="chat-effort-options" role="radiogroup" aria-label={text("추론 강도 선택", "Choose reasoning effort")}>
              {!selected.defaultEffort && <button type="button" role="radio" aria-checked={!draft?.effort} disabled={applying || loading}
                onClick={() => { edited.current = true; setDraft({ model: selected.model }); }}>{text("기본값", "Default")}</button>}
              {selected.efforts.map(item => <button type="button" role="radio" key={item.effort} data-effort={item.effort}
                aria-checked={draft?.effort === item.effort} title={item.description} disabled={applying || loading}
                onClick={() => { edited.current = true; setDraft({ model: selected.model, effort: item.effort }); }}>{item.effort}</button>)}
            </div>
            {selected.defaultEffort && <small>{text("모델 기본값", "Model default")}: {selected.defaultEffort}</small>}
          </fieldset>}
          {catalog.capabilitiesSource === "cli-help" && <p className="chat-model-notice">{text("Claude가 모델과 추론 강도의 지원 여부를 실행 시 확인합니다.", "Claude checks model and effort availability when it starts.")}</p>}
          <p className="chat-model-notice" role="status">{unchanged
            ? text("이미 적용된 설정입니다. 모델 또는 추론 강도를 변경해 주세요.", "These settings are already applied. Choose a different model or effort.")
            : busy ? text("작업 또는 질문이 끝나면 변경할 수 있습니다.", "You can change settings after the work or question finishes.")
            : !catalog.canRestart ? text("세션의 입력 대기를 확인하고 있습니다. 계속되면 터미널 상태를 확인해 주세요.", "Checking that the session is ready. If this continues, check the terminal.")
            : text("같은 대화를 유지하며 다음 메시지부터 적용합니다.", "Applies to your next message while keeping this conversation.")}</p>
        </>}
        {(applyError || error) && <div className="chat-model-error" role="alert">{applyError || error}<button type="button" disabled={applying || loading} onClick={() => { setApplyError(""); void load(); }}>{text("다시 확인", "Retry")}</button></div>}
      </div>
      <footer className="chat-model-footer"><button type="button" disabled={applying} onClick={close}>{text("취소", "Cancel")}</button>
        <button type="button" className="chat-model-apply" disabled={!canApply} onClick={() => { void apply(); }}>{applying ? text("적용 중…", "Applying…") : text("적용", "Apply")}</button></footer>
    </div>, portal)}
  </div>;
}
