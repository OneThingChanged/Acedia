import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectBoardWindow, BoardSessionNavigation, BoardSessionActions, assertBoardAccess, BOARD_COMMANDS } from './project-board-window.mjs';
function fixture(settings = {}) {
  const created = [];
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.contents = { id: created.length + 1 }; created.push(this); }
    // Electron native getters must no longer be used once 'closed' fires.
    get webContents() { if (this.isDestroyed()) throw new TypeError('Object has been destroyed'); return this.contents; }
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
afterEach(() => { vi.useRealTimers(); });
it('routes explicit context actions through acknowledged start/stop and rejects stale state', async () => {
  let active = false;
  const start = vi.fn(async () => { active = true; return { active: true }; }), stop = vi.fn(async () => { active = false; return { stopped: true }; });
  const actions = new BoardSessionActions({ active: () => active, start, stop });
  await expect(actions.handle({ id: 'child', action: 'start', expectedActive: false })).resolves.toEqual({ active: true });
  expect(start).toHaveBeenCalledExactlyOnceWith({ sessionId: 'child', waitMs: 0 });
  await expect(actions.handle({ id: 'child', action: 'stop', expectedActive: false })).rejects.toThrow('상태가 변경');
  expect(stop).not.toHaveBeenCalled();
  await actions.handle({ id: 'child', action: 'stop', expectedActive: true });
  expect(stop).toHaveBeenCalledExactlyOnceWith('stop', { sessionId: 'child' });
  expect(() => assertBoardAccess({ project_board_window: true }, 'project_board_session_action')).not.toThrow();
    expect(() => assertBoardAccess({ project_board_window: true }, 'project_board_manage_session')).not.toThrow();
    expect(() => assertBoardAccess({}, 'project_board_manage_session')).toThrow();
  expect(() => assertBoardAccess({ project_board_window: true }, 'spawn_agent')).toThrow();
});
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
    const id = win.webContents.id;
    win.destroy(); expect(f.unregister).toHaveBeenCalledWith(id);
    expect(f.manager.open()).not.toBe(win);
  });
  it('recovers window bounds from a removed display and restores maximization', () => {
    const f = fixture({ bounds: { x: 9000, y: -9000, width: 2000, height: 1400 }, maximized: true });
    const win = f.manager.open(); expect(win.options).toMatchObject({ x: 0, y: 0, width: 1600, height: 900 });
    win.emit('ready-to-show'); expect(win.maximize).toHaveBeenCalledOnce(); expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).not.toHaveBeenCalled();
  });
  it('unregisters the destroyed board using the actual main-process wiring without reading native getters', () => {
    const f = fixture();
    const source = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
    const start = source.indexOf('const projectBoardWindows = new ProjectBoardWindow(');
    const end = source.indexOf('\nconst boardSessionNavigation', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const runtimeByWebContents = new Map([[999, { workspace_window: true }]]);
    const manager = vm.runInNewContext(source.slice(start, end) + '\nprojectBoardWindows;', {
      ProjectBoardWindow, BrowserWindow: f.manager.BrowserWindow, screen: f.manager.screen,
      preloadPath: '', iconPath: '', BOARD_COMMANDS, loadRenderer: f.load,
      projectBoard: { data: { preferences: {} }, preferences: f.save }, runtimeByWebContents, installNavigationPolicy: vi.fn(),
    });
    const win = manager.open(), id = win.webContents.id;
    expect(runtimeByWebContents.get(id).project_board_window).toBe(true);
    win.emit('move'); win.emit('resize'); win.emit('close');
    expect(() => win.destroy()).not.toThrow();
    expect(runtimeByWebContents.has(id)).toBe(false); expect(runtimeByWebContents.has(999)).toBe(true);
    expect(manager.window).toBe(null);
    expect(manager.open()).not.toBe(win);
  });
  it('cancels queued movement persistence and late ready-to-show callbacks after destruction', () => {
    vi.useFakeTimers();
    const f = fixture({ maximized: true }), win = f.manager.open();
    win.emit('move'); win.emit('resize');
    expect(vi.getTimerCount()).toBe(1);
    win.destroy();
    expect(vi.getTimerCount()).toBe(0);
    win.emit('ready-to-show'); win.emit('move'); win.emit('resize');
    vi.runAllTimers();
    expect(f.save).not.toHaveBeenCalled(); expect(win.show).not.toHaveBeenCalled(); expect(win.maximize).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0); expect(f.unregister).toHaveBeenCalledOnce();
  });
  it('debounces native movement and saves final geometry on normal close', () => {
    vi.useFakeTimers();
    const f = fixture(), win = f.manager.open();
    win.emit('move'); vi.advanceTimersByTime(200); win.emit('resize');
    vi.advanceTimersByTime(399); expect(f.save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(f.save).toHaveBeenCalledTimes(1);
    win.emit('move'); win.emit('close'); win.destroy(); vi.runAllTimers();
    expect(f.save).toHaveBeenCalledTimes(2);
    expect(f.save).toHaveBeenLastCalledWith({ bounds: { x: 20, y: 30, width: 1200, height: 800 }, maximized: false });
  });
  it('cleans up a failed renderer load and allows opening a fresh board', async () => {
    const f = fixture(); f.load.mockRejectedValueOnce(new Error('renderer load failed'));
    const win = f.manager.open(), id = win.webContents.id;
    await vi.waitFor(() => expect(f.unregister).toHaveBeenCalledWith(id));
    expect(win.isDestroyed()).toBe(true); expect(f.manager.window).toBe(null);
    const next = f.manager.open();
    expect(next).not.toBe(win); expect(next.isDestroyed()).toBe(false);
  });
});

describe('Navigation from a board without restarting sessions', () => {
  function navigation(ready = true) {
    const windows = [{ webContents: { id: 1 }, isDestroyed: () => false }, { webContents: { id: 2 }, isDestroyed: () => false }];
    const create = vi.fn(() => windows[0]), send = vi.fn(), focus = vi.fn();
    const value = new BoardSessionNavigation({ sessions: () => [{ id: 'existing' }], projects: () => [{ id: 'project' }], owner: () => windows[1], windows: () => windows,
      create, ready: () => ready, send, focus, live: () => false });
    return { value, windows, create, send, focus };
  }
  it('targets project forms and hierarchies without opening a session', () => {
    const f = navigation(false);
    expect(() => f.value.manageProject({ id: 'removed', action: 'new-session' })).toThrow('프로젝트');
    expect(f.value.manageProject({ id: 'project', action: 'new-session' })).toEqual({ opened: true, windowId: 1 });
    expect(f.send).not.toHaveBeenCalled();
    f.value.loaded(1);
    expect(f.send).toHaveBeenLastCalledWith(f.windows[0], { projectId: 'project', action: 'new-session' });
    f.value.manageProject({ action: 'hierarchy' });
    f.value.loaded(1);
    expect(f.send).toHaveBeenLastCalledWith(f.windows[0], { projectId: null, action: 'hierarchy' });
    expect(f.create).not.toHaveBeenCalled();
  });
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
  it('queues a request to display management for the owning workspace without lifecycle metadata', () => {
    const f = navigation(false), live = vi.fn(); f.value.live = live;
    expect(f.value.manage({ id: 'existing', action: 'delete' })).toEqual({ opened: true, windowId: 2 });
    expect(f.send).not.toHaveBeenCalled(); expect(live).not.toHaveBeenCalled();
    f.value.loaded(2); expect(f.send).toHaveBeenCalledExactlyOnceWith(f.windows[1], { id: 'existing', action: 'delete' });
    expect(() => f.value.manage({ id: 'missing', action: 'delete' })).toThrow(); expect(f.focus).toHaveBeenCalledOnce();
  });
  it('creates only a blank workspace when all workspaces are closed', () => {
    const f = navigation(false); f.value.owner = () => null; f.value.windows = () => [];
    f.value.open({ id: 'existing' }); expect(f.create).toHaveBeenCalledWith();
    expect(f.send).not.toHaveBeenCalled(); f.value.loaded(1);
    expect(f.send).toHaveBeenCalledWith(f.windows[0], { id: 'existing', live: false, compose: false });
  });
});
