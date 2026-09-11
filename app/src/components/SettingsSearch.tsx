import { useEffect, useState, type RefObject } from "react";
import { useAppLanguage } from "../lib/appLanguage";
import { SETTING_SCOPES, settingById, settingBreadcrumb, type SettingDefinition, type SettingsNavigation } from "../lib/settingsCatalog";
import "./SettingsSearch.css";

export const settingTarget = (id?: string) => id ? { "data-setting-id": id, tabIndex: -1 } : {};
export function SettingLabel({ id }: { id: string }) {
  const { text } = useAppLanguage();
  const setting = settingById(id);
  return setting ? <>{text(...setting.label)}</> : null;
}
export function SettingScope({ id }: { id?: string }) {
  const { text } = useAppLanguage();
  const setting = id ? settingById(id) : undefined;
  if (!setting) return null;
  const scope = SETTING_SCOPES[setting.scope];
  return <span className="setting-scope" title={text(...scope.detail)}>{text(...scope.label)}</span>;
}
export function SettingsSearchResults({ results, onSelect }: {
  results: readonly SettingDefinition[]; onSelect: (item: SettingDefinition) => void;
}) {
  const { text } = useAppLanguage();
  return <section className="settings-search-results">
    <p role="status">{text("검색 결과 " + results.length + "개", results.length + " settings found")}</p>
    {!results.length && <p>{text("일치하는 설정이 없습니다. 옵션 이름이나 도구 이름으로 검색해 보세요.", "No matching settings. Try an option or tool name.")}</p>}
    <ul aria-label={text("설정 검색 결과", "Settings search results")} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0) return;
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault(); buttons[next]?.focus();
    }}>
      {results.map(item => <li key={item.id}>
        <button type="button" data-setting-result={item.id} onClick={() => onSelect(item)}>
          <span className="setting-result-copy"><strong>{text(...item.label)}</strong><small>{settingBreadcrumb(item, text)}</small></span>
          <SettingScope id={item.id} /><span aria-hidden="true">›</span>
        </button>
      </li>)}
    </ul>
  </section>;
}

export function useSettingNavigation(root: RefObject<HTMLDivElement | null>, navigation: SettingsNavigation | null) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    const container = root.current;
    if (!container || !navigation) return;
    let target: HTMLElement | null = null;
    let frame = 0;
    let finished = false;
    const find = () => {
      if (finished) return;
      target = [...container.querySelectorAll<HTMLElement>("[data-setting-id]")].find(el => el.dataset.settingId === navigation.id) ?? null;
      if (!target) return;
      finished = true;
      for (let parent = target.parentElement; parent && parent !== container; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      const found = target;
      frame = requestAnimationFrame(() => {
        found.classList.add("setting-target-highlight");
        found.scrollIntoView({ block: "center", behavior: "auto" });
        found.focus({ preventScroll: true });
      });
    };
    const observer = new MutationObserver(find);
    observer.observe(container, { childList: true, subtree: true });
    find();
    const timeout = window.setTimeout(() => { if (!finished) setMissing(true); observer.disconnect(); }, 2000);
    return () => { observer.disconnect(); window.clearTimeout(timeout); cancelAnimationFrame(frame); target?.classList.remove("setting-target-highlight"); };
  }, [root, navigation]);
  return missing;
}
