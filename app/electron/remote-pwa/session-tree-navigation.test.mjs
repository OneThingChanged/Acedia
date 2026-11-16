import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { buildSessionFamilies, normalizeChildSessionVisibility } from './session-tree.js';
import { matchesSessionFilter, sessionFilterCounts, childSessionVisibilityState } from '../shared/session-state.mjs';
import { remoteAgentStatus, remoteAgentView } from '../../src/lib/remoteSessionProjection.ts';

const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const implementation = name => {
  const code = source.match(new RegExp(`^function ${name}\\([^]*?\\n\\}`, 'm'))?.[0];
  if (!code) throw Error(`Missing production function ${name}`); return code;
};
// A bounded DOM double: execute the real renderer and event handlers in Node,
// without a browser, desktop windows, native input or a user's sessions.
class Element {
  constructor(tag, className = '', value = '') {
    Object.assign(this, { tag, className, value, children: [], dataset: {}, attributes: {}, listeners: {}, style: { setProperty() {} } });
    this.classList = { toggle: (name, force) => { const names = new Set(this.className.split(' ').filter(Boolean));
      const enabled = force ?? !names.has(name); enabled ? names.add(name) : names.delete(name); this.className = [...names].join(' '); },
    add: name => { if (!this.className.split(' ').includes(name)) this.className += ' ' + name; } };
  }
  get textContent() { return this.value + this.children.map(c => c.textContent).join(''); }
  set textContent(value) { this.value = value; this.children = []; }
  append(...children) { for (const child of children) { if (child.tag === 'fragment') this.append(...child.children); else { child.parentElement = this; this.children.push(child); } } }
  appendChild(child) { this.append(child); }
  replaceChildren(...children) { this.children = []; this.value = ''; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(event, listener) { this.listeners[event] = listener; }
  focus() {}
  querySelectorAll(selector) {
    const [first, ...rest] = selector.split(' '), descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    const matches = node => first === '*' || first.startsWith('.') ? first === '*' || node.className.split(' ').includes(first.slice(1))
      : first === '[data-filter]' ? !!node.dataset.filter : first === '[data-child-visibility]' ? !!node.dataset.childVisibility : node.tag === first;
    const found = descendants.filter(matches);
    return rest.length ? found.flatMap(node => node.querySelectorAll(rest.join(' '))) : found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const make = (tag, className, value) => new Element(tag, className || '', value ?? '');
const records = () => [
  { id: 'manager', name: 'RnDHub', runtimeStatus: 'exited' },
  { id: 'middle', name: 'VFX_New · Codex', deferredStart: true, resumeEligible: true, runtimeStatus: 'idle', sessionHierarchy: { parentId: 'manager' } },
  { id: 'worker', name: '몬스터 · Sol', status: 'working', runtimeStatus: 'running', sessionHierarchy: { parentId: 'middle' } },
  { id: 'sibling', name: 'Sleeping sibling', deferredStart: true, resumeEligible: true, runtimeStatus: 'idle', sessionHierarchy: { parentId: 'middle' } },
].map(agent => ({ projectId: 'p', aiToolId: 'codex', status: 'idle', ...agent }));

function fixture(visibility = { idle: false, stopped: false, sleeping: false }) {
  const all = records(), names = new Map([['p', 'RnDHub']]);
  const catalog = () => JSON.parse(JSON.stringify(all.map(a => ({ ...remoteAgentView(a), ...remoteAgentStatus(a, names) }))));
  const ui = Object.fromEntries(['filters', 'childSessionVisibility', 'screenCount', 'screenList', 'visibleSessionCount', 'sessionList', 'emptyState', 'emptySessionMessage', 'resetSessionFilter', 'overviewButton', 'documentsButton', 'usageButton', 'hostingButton', 'mobileHostingButton', 'detailFamily'].map(key => [key, make('div')]));
  for (const key of ['idle', 'stopped', 'sleeping']) {
    const button = make('button', '', key); button.dataset.childVisibility = key; ui.childSessionVisibility.append(button);
  }
  ui.searchInput = { value: '' };
  const stored = new Map(), storage = { getItem: key => stored.get(key) ?? null, setItem: vi.fn((key, value) => stored.set(key, value)) };
  const context = vm.createContext({ ui, make, buildSessionFamilies, normalizeChildSessionVisibility, childSessionVisibilityState, sessionFilterCounts, text: value => String(value || ''),
    childSessionVisibility: normalizeChildSessionVisibility(visibility), CHILD_SESSION_VISIBILITY_KEY: 'multiagent.remote.childSessionVisibility.v1',
    t: (value, values = []) => value.replace(/\{(\d+)\}/g, (_, index) => String(values[index])), getLanguage: () => 'ko',
    sessionModelEditor: { update() {} }, navigationAgents: catalog,
    visibleAgents: all => all.filter(a => ui.searchInput.value ? a.name.includes(ui.searchInput.value) : matchesSessionFilter(a, context.activeFilter)),
    screenGroups: () => [], agentMap: () => new Map(catalog().map(a => [a.id, a])), projectName: () => 'RnDHub',
    remoteState: { view: { projects: [{ id: 'p', name: 'RnDHub' }] } }, activeFilter: 'active', selection: { type: 'session', id: 'worker' },
    sessionFamilyRevealKey: '', sessionFamilyTrailKey: '', sessionNavigationStructureKey: '', projectFolds: new Set(), sessionFamilyFolds: new Set(),
    rememberSessionFamilyFolds: vi.fn(), completedUnread: new Set(), selectSession: vi.fn(), closeRemoteSession: vi.fn(),
    providerLogo: () => make('svg'), outputPreview: () => 'terminal output',
    displayStatusOf: a => a.deferredStart ? 'sleeping' : a.runtimeStatus === 'running' ? 'working' : 'offline',
    STATUS: { sleeping: { label: 'Sleeping' }, working: { label: 'Working' }, offline: { label: 'Offline' } },
    document: { createDocumentFragment: () => make('fragment') }, localStorage: storage,
  });
  vm.runInContext(['loadChildSessionVisibility', 'isChildSessionVisible', 'syncChildSessionVisibility', 'bindChildSessionVisibility', 'sessionFamilyAncestors', 'renderSessionFamilyTrail', 'renderNavigation'].map(implementation).join('\n'), context);
  context.bindChildSessionVisibility();
  return { all, ui, context, stored, storage };
}

it('toggles idle, stopped and sleeping children independently and persists the local choice without changing sessions', () => {
  const { all, ui, context, stored } = fixture(null);
  all.push({ id: 'idle', name: 'Idle child', projectId: 'p', aiToolId: 'codex', status: 'idle', runtimeStatus: 'running', sessionHierarchy: { parentId: 'manager' } },
    { id: 'stopped', name: 'Stopped child', projectId: 'p', aiToolId: 'codex', status: 'exited', runtimeStatus: 'exited', sessionHierarchy: { parentId: 'manager' } });
  const original = JSON.stringify(all);
  const ids = () => ui.sessionList.querySelectorAll('.session-row').map(row => row.dataset.agentId);
  const buttons = ui.childSessionVisibility.querySelectorAll('[data-child-visibility]');
  const click = key => ui.childSessionVisibility.listeners.click({ target: { closest: () => buttons.find(button => button.dataset.childVisibility === key) } });
  context.renderNavigation(); expect(ids()).toEqual(['manager', 'middle', 'worker', 'sibling', 'idle', 'stopped']);
  click('idle'); expect(ids()).not.toContain('idle'); expect(ids()).toContain('stopped'); expect(ids()).toContain('sibling');
  click('stopped'); expect(ids()).not.toContain('stopped');
  click('sleeping'); expect(ids()).toEqual(['manager', 'middle', 'worker']);
  expect(ui.visibleSessionCount.textContent).toBe('3');
  expect(ui.sessionList.querySelectorAll('.session-family-count').map(node => node.textContent)).toEqual(['1', '1']);
  expect(buttons.map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
  expect(context.loadChildSessionVisibility()).toEqual({ idle: false, stopped: false, sleeping: false });
  expect(JSON.parse(stored.get(context.CHILD_SESSION_VISIBILITY_KEY))).toEqual({ idle: false, stopped: false, sleeping: false });
  expect(JSON.stringify(all)).toBe(original);
  expect(context.selection.id).toBe('worker'); expect(context.selectSession).not.toHaveBeenCalled(); expect(context.closeRemoteSession).not.toHaveBeenCalled();
  click('sleeping'); expect(ids()).toContain('sibling'); expect(ids()).not.toContain('idle'); expect(ids()).not.toContain('stopped');
  expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
});

it('finds hidden children in search and reapplies saved visibility when search clears or runtime changes', () => {
  const { all, ui, context } = fixture();
  const ids = () => ui.sessionList.querySelectorAll('.session-row').map(row => row.dataset.agentId);
  context.renderNavigation(); expect(ids()).not.toContain('sibling');
  ui.searchInput.value = 'Sleeping sibling'; context.renderNavigation();
  expect(ids()).toEqual(['manager', 'middle', 'sibling']);
  ui.searchInput.value = ''; context.renderNavigation(); expect(ids()).not.toContain('sibling');
  Object.assign(all[3], { deferredStart: false, resumeEligible: true, runtimeStatus: 'running', status: 'working' });
  context.renderNavigation(); expect(ids()).toContain('sibling');
  all[3].status = 'idle'; context.renderNavigation(); expect(ids()).not.toContain('sibling');
});

it('applies child preferences in All/Sleeping and recovers from invalid or inaccessible local storage', () => {
  const { ui, context, stored, storage } = fixture();
  context.activeFilter = 'all'; context.renderNavigation();
  expect(ui.sessionList.querySelectorAll('.session-row').map(row => row.dataset.agentId)).toEqual(['manager', 'middle', 'worker']);
  context.activeFilter = 'sleeping'; context.renderNavigation();
  expect(ui.sessionList.querySelectorAll('.session-row')).toHaveLength(0); expect(ui.emptyState.hidden).toBe(false); expect(ui.resetSessionFilter.hidden).toBe(false);
  stored.set(context.CHILD_SESSION_VISIBILITY_KEY, '{broken');
  expect(context.loadChildSessionVisibility()).toEqual({ idle: true, stopped: true, sleeping: true });
  storage.getItem = () => { throw Error('Storage disabled'); };
  expect(context.loadChildSessionVisibility()).toEqual({ idle: true, stopped: true, sleeping: true });
  storage.setItem.mockImplementation(() => { throw Error('Storage disabled'); });
  const button = ui.childSessionVisibility.querySelectorAll('[data-child-visibility]')[2];
  expect(() => ui.childSessionVisibility.listeners.click({ target: { closest: () => button } })).not.toThrow();
  expect(ui.sessionList.querySelectorAll('.session-row').map(row => row.dataset.agentId)).toEqual(['manager', 'middle', 'sibling']);
});

it('renders real projected Active sessions under their inactive ancestors, folds and updates the editable parent', () => {
  const { all, ui, context } = fixture(); context.renderNavigation();
  const rows = () => ui.sessionList.querySelectorAll('.session-row');
  expect(rows().map(row => [row.dataset.agentId, row.dataset.depth, row.dataset.parentId])).toEqual([
    ['manager', '0', undefined], ['middle', '1', 'manager'], ['worker', '2', 'middle'],
  ]);
  const worker = rows()[2];
  expect(worker.querySelector('.session-parent').textContent).toBe('↳ VFX_New · Codex');
  expect(rows()[1].querySelector('.session-family-count').textContent).toBe('1');
  expect(ui.visibleSessionCount.textContent).toBe('3');
  rows()[1].querySelector('.session-family-toggle').listeners.click();
  expect(rows().map(row => row.dataset.agentId)).toEqual(['manager', 'middle']);
  ui.searchInput.value = '몬스터'; context.renderNavigation();
  expect(rows().map(row => row.dataset.agentId)).toEqual(['manager', 'middle', 'worker']);
  ui.searchInput.value = ''; all[2].sessionHierarchy.parentId = 'manager'; context.renderNavigation();
  expect(rows().find(row => row.dataset.agentId === 'worker').dataset.parentId).toBe('manager');
  expect(rows().find(row => row.dataset.agentId === 'worker').querySelector('.session-parent').textContent).toBe('↳ RnDHub');
  expect(context.selectSession).not.toHaveBeenCalled(); expect(context.closeRemoteSession).not.toHaveBeenCalled();
});

it('gives long session names their own full-width title and keeps controls and status on the metadata line', () => {
  const { all, ui, context } = fixture();
  const name = 'ProjectWitch · Codex 개발 · 멀티플레이 전투와 VFX 검증 <원문 이름>';
  all[2].name = name; context.renderNavigation();
  const row = ui.sessionList.querySelectorAll('.session-row').find(r => r.dataset.agentId === 'worker');
  const select = row.querySelector('.session-select'), metadata = row.querySelector('.session-meta');
  expect(select.querySelector('strong').textContent).toBe(name);
  expect(select.querySelector('strong').title).toBe(name);
  expect(select.getAttribute('aria-label')).toBe(name);
  expect(select.querySelectorAll('button')).toHaveLength(0);
  expect(select.querySelector('.status-dot')).toBeNull(); expect(select.querySelector('svg')).toBeNull();
  expect(metadata.querySelector('.status-dot')).not.toBeNull(); expect(metadata.querySelector('svg')).not.toBeNull();
  expect(metadata.querySelector('.session-status').textContent).toBe('Working');
  expect(metadata.querySelector('.session-parent').textContent).toBe('↳ VFX_New · Codex');
  expect(metadata.querySelector('.session-row-actions')).not.toBeNull();
  const manager = ui.sessionList.querySelectorAll('.session-row')[0];
  expect(manager.querySelector('.session-family-toggle').parentElement).toBe(manager.querySelector('.session-meta'));
  expect(manager.querySelector('.session-family-count').parentElement).toBe(manager.querySelector('.session-meta'));
  select.listeners.click(); expect(context.selectSession).toHaveBeenCalledExactlyOnceWith('worker');
  context.renderNavigation();
  expect(ui.sessionList.querySelectorAll('.session-row').find(r => r.dataset.agentId === 'worker').querySelector('.session-select')).toBe(select);
  metadata.querySelector('.session-close').listeners.click(); expect(context.closeRemoteSession).toHaveBeenCalledExactlyOnceWith('worker');
});

it('shows parent navigation in chat, retains breadcrumb focus targets on polls and clears detached ancestry', () => {
  const { all, ui, context } = fixture(); context.renderSessionFamilyTrail(all[2]);
  const links = () => ui.detailFamily.querySelectorAll('.session-ancestor-link');
  expect(links().map(link => link.textContent)).toEqual(['RnDHub', 'VFX_New · Codex']);
  const parent = links()[1]; parent.listeners.click();
  expect(context.selectSession).toHaveBeenCalledExactlyOnceWith('middle');
  context.renderSessionFamilyTrail(all[2]); expect(links()[1]).toBe(parent);
  all[1].name = 'Renamed manager'; context.renderSessionFamilyTrail(all[2]);
  expect(links()[1].textContent).toBe('Renamed manager');
  delete all[2].sessionHierarchy; context.renderSessionFamilyTrail(all[2]);
  expect(ui.detailFamily.hidden).toBe(true); expect(links()).toHaveLength(0);
});
