export const BOARD_COMMANDS = Object.freeze(['project_board_snapshot', 'project_board_ack', 'project_board_ack_results', 'project_board_preferences', 'project_board_open_session']);
export function assertBoardAccess(runtime, command) {
  if (runtime?.project_board_window && !BOARD_COMMANDS.includes(command)) throw new Error('보드 전용 창에서는 작업 실행 명령을 사용할 수 없습니다.');
  if ((BOARD_COMMANDS.includes(command) || command === 'open_project_board') && !runtime?.project_board_window && !runtime?.workspace_window) throw new Error('Acedia 작업창에서 보드를 사용하세요.');
}

/** Dedicated read-only renderer; never registered as a workspace or PTY owner. */
export class ProjectBoardWindow {
  constructor({ BrowserWindow, screen, preload, arguments: args, icon, load, settings, save, register, unregister }) {
    Object.assign(this, { BrowserWindow, screen, preload, args, icon, load, settings, save, register, unregister });
    this.window = null;
  }
  open() {
    if (this.window && !this.window.isDestroyed()) { this.window.restore(); this.window.show(); this.window.focus(); return this.window; }
    const saved = this.settings();
    const bounds = saved.bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(saved.bounds[key])) ? saved.bounds : null;
    const area = this.screen.getDisplayMatching(bounds || { x: 0, y: 0, width: 1280, height: 800 }).workArea;
    const width = Math.min(area.width, Math.max(760, bounds?.width || 1440));
    const height = Math.min(area.height, Math.max(520, bounds?.height || 900));
    const win = new this.BrowserWindow({ title: 'Acedia · Project Board', show: false, width, height,
      x: Math.min(area.x + area.width - width, Math.max(area.x, bounds?.x ?? area.x + 40)),
      y: Math.min(area.y + area.height - height, Math.max(area.y, bounds?.y ?? area.y + 40)),
      minWidth: Math.min(760, area.width), minHeight: Math.min(520, area.height), backgroundColor: '#0d1117', icon: this.icon,
      webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: true, allowRunningInsecureContent: false, additionalArguments: this.args } });
    // 'closed' runs after Electron has destroyed the native window. Retain
    // its registration key now; even reading win.webContents can then throw.
    const webContentsId = win.webContents.id;
    this.window = win; this.register(win, webContentsId);
    let timer, closed = false;
    const persist = () => { clearTimeout(timer); timer = undefined; if (!closed && !win.isDestroyed()) this.save({ bounds: win.getNormalBounds(), maximized: win.isMaximized() }); };
    const changed = () => { if (closed || win.isDestroyed()) return; clearTimeout(timer); timer = setTimeout(persist, 400); timer.unref?.(); };
    const reveal = () => { if (closed || win.isDestroyed()) return; if (saved.maximized) win.maximize(); win.show(); };
    const geometryEvents = ['resize', 'move', 'maximize', 'unmaximize'];
    for (const event of geometryEvents) win.on(event, changed);
    win.on('close', persist);
    win.once('closed', () => {
      closed = true; clearTimeout(timer);
      for (const event of geometryEvents) win.removeListener(event, changed);
      win.removeListener('close', persist); win.removeListener('ready-to-show', reveal);
      if (this.window === win) this.window = null;
      this.unregister(webContentsId);
    });
    win.once('ready-to-show', reveal);
    this.load(win, { projectBoard: '1' }).catch(() => { if (!win.isDestroyed()) win.destroy(); });
    return win;
  }
}

/** User navigation only. No launch, stop, restart or transcript operation. */
export class BoardSessionNavigation {
  constructor({ sessions, owner, windows, create, ready, send, focus, live }) {
    Object.assign(this, { sessions, owner, windows, create, ready, send, focus, live }); this.pending = new Map();
  }
  open({ id, compose = false }) {
    if (!this.sessions().some(s => s.id === id)) throw new Error('세션을 찾을 수 없습니다.');
    let win = this.owner(id);
    if (!win || win.isDestroyed()) win = [...this.windows()].find(w => !w.isDestroyed());
    if (!win) win = this.create();
    const payload = { id, live: this.live(id), compose };
    if (this.ready(win)) this.send(win, payload); else this.pending.set(win.webContents.id, { win, payload });
    this.focus(win); return { opened: true, windowId: win.webContents.id };
  }
  loaded(id) { const next = this.pending.get(id); if (!next) return; this.pending.delete(id); if (!next.win.isDestroyed()) this.send(next.win, next.payload); }
  closed(id) { this.pending.delete(id); }
}
