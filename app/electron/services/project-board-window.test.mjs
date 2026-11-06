import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ProjectBoardWindow, BoardSessionNavigation, assertBoardAccess, BOARD_COMMANDS } from './project-board-window.mjs';
function fixture(settings = {}) {
  const created = [];
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = { id: created.length + 1 }; created.push(this); }
    isDestroyed() { return this.destroyed === true; }
    getNormalBounds() { return { x: 20, y: 30, width: 1200, height: 800 }; }
    isMaximized() { return false; }
    show = vi.fn(); focus = vi.fn(); restore = vi.fn(); maximize = vi.fn();
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const save = vi.fn(), register = vi.fn(), unregister = vi.fn(), load = vi.fn(async () => {});
  const manager = new ProjectBoardWindow({ BrowserWindow: Window, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1600, height: 900 } }) },
    settings: () => settings, save, register, unregister, load });
  return { manager, created, save, register, unregister, load };
}
describe('Board-only window lifecycle without GUI', () => {
  it('rejects execution, credentials and terminal ownership from a board renderer', () => {
    for (const command of BOARD_COMMANDS) expect(() => assertBoardAccess({ project_board_window: true }, command)).not.toThrow();
    for (const command of ['spawn_pty', 'write_pty', 'kill_pty', 'persist_storage_snapshot', 'codex_accounts_switch', 'task_orchestration']) expect(() => assertBoardAccess({ project_board_window: true }, command)).toThrow();
    expect(() => assertBoardAccess({}, 'project_board_ack')).toThrow();
    expect(() => assertBoardAccess({ workspace_window: true }, 'open_project_board')).not.toThrow();
  });
  it('creates an isolated renderer once and only focuses on an explicit open', () => {
    const f = fixture(), win = f.manager.open();
    expect(f.load).toHaveBeenCalledWith(win, { projectBoard: '1' });
    expect(win.options.webPreferences).toMatchObject({ nodeIntegration: false, sandbox: true, contextIsolation: true });
    expect(win.focus).not.toHaveBeenCalled();
    expect(f.manager.open()).toBe(win); expect(f.created).toHaveLength(1); expect(win.focus).toHaveBeenCalledTimes(1);
    expect(f.register).toHaveBeenCalledTimes(1);
    win.emit('close'); expect(f.save).toHaveBeenCalledWith({ bounds: win.getNormalBounds(), maximized: false });
    win.destroy(); expect(f.unregister).toHaveBeenCalledWith(win);
    expect(f.manager.open()).not.toBe(win);
  });
  it('recovers window bounds from a removed display and restores maximization', () => {
    const f = fixture({ bounds: { x: 9000, y: -9000, width: 2000, height: 1400 }, maximized: true });
    const win = f.manager.open(); expect(win.options).toMatchObject({ x: 0, y: 0, width: 1600, height: 900 });
    win.emit('ready-to-show'); expect(win.maximize).toHaveBeenCalledOnce(); expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).not.toHaveBeenCalled();
  });
});

describe('Navigation from a board without restarting sessions', () => {
  function navigation(ready = true) {
    const windows = [{ webContents: { id: 1 }, isDestroyed: () => false }, { webContents: { id: 2 }, isDestroyed: () => false }];
    const create = vi.fn(() => windows[0]), send = vi.fn(), focus = vi.fn();
    const value = new BoardSessionNavigation({ sessions: () => [{ id: 'existing' }], owner: () => windows[1], windows: () => windows,
      create, ready: () => ready, send, focus, live: () => false });
    return { value, windows, create, send, focus };
  }
  it('reuses the actual owner and sends view-only metadata for an offline session', () => {
    const f = navigation(); expect(f.value.open({ id: 'existing', compose: true })).toEqual({ opened: true, windowId: 2 });
    expect(f.create).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledWith(f.windows[1], { id: 'existing', live: false, compose: true });
    expect(f.focus).toHaveBeenCalledOnce();
    expect(() => f.value.open({ id: 'missing' })).toThrow(); expect(f.focus).toHaveBeenCalledOnce();
  });
  it('waits for renderer readiness and cancels navigation when that window closes', () => {
    const f = navigation(false); f.value.open({ id: 'existing' }); expect(f.send).not.toHaveBeenCalled();
    f.value.loaded(2); expect(f.send).toHaveBeenCalledOnce(); f.value.loaded(2); expect(f.send).toHaveBeenCalledOnce();
    f.value.open({ id: 'existing' }); f.value.closed(2); f.value.loaded(2); expect(f.send).toHaveBeenCalledOnce();
  });
  it('creates only a blank workspace when all workspaces are closed', () => {
    const f = navigation(false); f.value.owner = () => null; f.value.windows = () => [];
    f.value.open({ id: 'existing' }); expect(f.create).toHaveBeenCalledWith();
    expect(f.send).not.toHaveBeenCalled(); f.value.loaded(1);
    expect(f.send).toHaveBeenCalledWith(f.windows[0], { id: 'existing', live: false, compose: false });
  });
});
