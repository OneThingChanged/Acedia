import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { buildSessionFamilies } from './session-tree.js';
import { matchesSessionFilter, sessionFilterCounts } from '../shared/session-state.mjs';
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
      : first === '[data-filter]' ? !!node.dataset.filter : node.tag === first;
    const found = descendants.filter(matches);
    return rest.length ? found.flatMap(node => node.querySelectorAll(rest.join(' '))) : found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const make = (tag, className, value) => new Element(tag, className || '', value ?? '');
const records = () => [
  { id: 'manager', name: 'RnDHub', runtimeStatus: 'exited' },
  { id: 'middle', name: 'VFX_New · Codex', deferredStart: true, resumeEligible: true, runtimeStatus: 'idle', sessionHierarchy: { parentId: 'manager' } },
  { id: 'worker', name: '몬스터 · Sol', runtimeStatus: 'running', sessionHierarchy: { parentId: 'middle' } },
  { id: 'sibling', name: 'Sleeping sibling', deferredStart: true, resumeEligible: true, runtimeStatus: 'idle', sessionHierarchy: { parentId: 'middle' } },
].map(agent => ({ projectId: 'p', aiToolId: 'codex', status: 'idle', ...agent }));

function fixture() {
  const all = records(), names = new Map([['p', 'RnDHub']]);
  const catalog = () => JSON.parse(JSON.stringify(all.map(a => ({ ...remoteAgentView(a), ...remoteAgentStatus(a, names) }))));
  const ui = Object.fromEntries(['filters', 'screenCount', 'screenList', 'visibleSessionCount', 'sessionList', 'emptyState', 'emptySessionMessage', 'resetSessionFilter', 'overviewButton', 'documentsButton', 'usageButton', 'hostingButton', 'mobileHostingButton', 'detailFamily'].map(key => [key, make('div')]));
  ui.searchInput = { value: '' };
  const context = vm.createContext({ ui, make, buildSessionFamilies, sessionFilterCounts, text: value => String(value || ''),
    t: (value, values = []) => value.replace(/\{(\d+)\}/g, (_, index) => String(values[index])), getLanguage: () => 'ko',
    sessionModelEditor: { update() {} }, navigationAgents: catalog,
    visibleAgents: all => all.filter(a => ui.searchInput.value ? a.name.includes(ui.searchInput.value) : matchesSessionFilter(a, 'active')),
    screenGroups: () => [], agentMap: () => new Map(catalog().map(a => [a.id, a])), projectName: () => 'RnDHub',
    remoteState: { view: { projects: [{ id: 'p', name: 'RnDHub' }] } }, activeFilter: 'active', selection: { type: 'session', id: 'worker' },
    sessionFamilyRevealKey: '', sessionFamilyTrailKey: '', sessionNavigationStructureKey: '', projectFolds: new Set(), sessionFamilyFolds: new Set(),
    rememberSessionFamilyFolds: vi.fn(), completedUnread: new Set(), selectSession: vi.fn(), closeRemoteSession: vi.fn(),
    providerLogo: () => make('svg'), outputPreview: () => 'terminal output',
    displayStatusOf: a => a.deferredStart ? 'sleeping' : a.runtimeStatus === 'running' ? 'working' : 'offline',
    STATUS: { sleeping: { label: 'Sleeping' }, working: { label: 'Working' }, offline: { label: 'Offline' } },
    document: { createDocumentFragment: () => make('fragment') }, localStorage: { setItem() {} },
  });
  vm.runInContext(['sessionFamilyAncestors', 'renderSessionFamilyTrail', 'renderNavigation'].map(implementation).join('\n'), context);
  return { all, ui, context };
}

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
