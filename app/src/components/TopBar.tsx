// Custom window top bar (Electron): replaces the native title/menu bar.
// The OS still draws min/max/close as a titleBarOverlay on the right — the
// bar's own width is constrained to env(titlebar-area-width) so our controls
// never sit under the native buttons. Everything interactive is app-region:
// no-drag; the rest of the bar drags the window (double-click maximizes).
import { useAppLanguage } from "../lib/appLanguage";

export function TopBar({
  filesOpen,
  onToggleFiles,
  desktopPetEnabled,
  desktopPetAvailable,
  onToggleDesktopPet,
  settingsOpen,
  onToggleSettings,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onOpenNewWindow,
}: {
  filesOpen: boolean;
  onToggleFiles: () => void;
  desktopPetEnabled: boolean;
  desktopPetAvailable: boolean;
  onToggleDesktopPet: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onOpenNewWindow: () => void;
}) {
  const { text } = useAppLanguage();
  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        <div className="topbar-drag" aria-hidden="true" />
        <button
          type="button"
          className={`topbar-btn ${alwaysOnTop ? "topbar-btn-active" : ""}`}
          onClick={onToggleAlwaysOnTop}
          title={alwaysOnTop ? text("상시 최상단 해제", "Disable always on top") : text("상시 최상단 활성화", "Enable always on top")}
          aria-pressed={alwaysOnTop}
        >
          <span className="always-on-top-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={onOpenNewWindow}
          title={text("새 창 열기", "Open new window")}
        >
          <span className="new-window-icon" aria-hidden="true" />
        </button>
        {desktopPetAvailable && (
          <button
            type="button"
            className={`topbar-btn ${desktopPetEnabled ? "topbar-btn-active" : ""}`}
            onClick={onToggleDesktopPet}
            title={desktopPetEnabled ? text("Desktop Pet 숨기기", "Hide Desktop Pet") : text("Desktop Pet 표시", "Show Desktop Pet")}
          >
            🤖
          </button>
        )}
        <button
          type="button"
          className={`topbar-btn ${settingsOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleSettings}
          title={text("설정", "Settings")}
        >
          ⚙
        </button>
        <span className="topbar-sep" aria-hidden="true" />
        <button
          type="button"
          className={`topbar-btn ${filesOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleFiles}
          title={filesOpen ? text("파일 트리 접기", "Collapse file tree") : text("파일 트리 펼치기", "Expand file tree")}
          aria-label={text("오른쪽 파일 사이드바 토글", "Toggle right file sidebar")}
        >
          <svg className="topbar-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <rect x="15.3" y="5.4" width="4.8" height="13.2" rx="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  );
}
