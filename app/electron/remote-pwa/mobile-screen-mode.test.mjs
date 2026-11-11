import fs from "node:fs";
import { fileURLToPath } from "node:url";
import vm from 'node:vm';
import { describe, expect, it, vi } from "vitest";

const script = fs.readFileSync(
  fileURLToPath(new URL("./app.js", import.meta.url)),
  "utf8",
).replace(/\r\n/g, "\n");

const implementation = name => {
  const source = script.match(new RegExp(`^function ${name}\\([^]*?\\n\\}`, 'm'))?.[0];
  if (!source) throw Error(`Missing production function: ${name}`);
  return source;
};
function fixture({ mobile = false, touch = false, native = false } = {}) {
  const listeners = new Map(), button = {};
  // Real functions run against bounded DOM/API doubles; no application UI runs.
  const tools = { append: vi.fn(value => { value.parentElement = tools; }) };
  const desktop = { append: vi.fn(value => { value.parentElement = desktop; }) };
  const context = vm.createContext({ mobileMedia: { matches: mobile, addEventListener: (event, fn) => listeners.set('mobile:' + event, fn) },
    touchMedia: { matches: touch, addEventListener: (event, fn) => listeners.set('touch:' + event, fn) }, window: { __MULTIAGENT_NATIVE_APP__: native },
    ui: { appShell: { classList: { toggle: vi.fn() } }, sessionMode: {}, screensSection: {}, searchInput: {}, sessionTools: tools },
    document: { querySelector: () => desktop }, taskModeButton: button,
    preferredSessionViewMode: 'term', sessionViewMode: 'term', selection: { type: 'screen', id: 'screen' }, returnScreenId: 'screen', mobilePaneId: 'pane', screenRenderKey: 'old',
    screenGroups: () => [{ id: 'screen', panes: ['active'] }], allAgents: () => [{ id: 'offline', status: 'offline' }, { id: 'active', status: 'working' }],
    statusOf: agent => agent.status, localDocumentProjects: () => [], agentMap: () => new Map([['active', {}]]), preferredSessionId: () => 'active',
    t: value => value, setSessionToolsOpen: vi.fn(), renderNavigation: vi.fn(), renderSelection: vi.fn(), updateUrl: vi.fn(),
    syncDocumentSidebar: vi.fn(), syncTerminal: vi.fn(), updateSidebarToggleState: vi.fn(), refitAllTerminals: vi.fn(),
  });
  const mode = script.match(/^const isChatOnly = .*;$/m)?.[0];
  if (!mode) throw Error('Missing production chat-only mode');
  vm.runInContext(`const isMobile = () => mobileMedia.matches;\n${mode}\n${['applyScreenAvailability','defaultWorkspaceSelection','validateSelection','syncResponsiveWorkspace'].map(implementation).join('\n')}
    ${script.match(/^mobileMedia\.addEventListener\("change", syncResponsiveWorkspace\);$/m)?.[0] || 'throw Error("Missing mobile listener")'}
    ${script.match(/^touchMedia\.addEventListener\("change", syncResponsiveWorkspace\);$/m)?.[0] || 'throw Error("Missing touch listener")'}`, context);
  return { context, listeners, tools, desktop, button };
}

describe("Remote mobile Screen routing", () => {
  it("hides Screen navigation and uses a session-only search label on mobile", () => {
    for (const device of [{ mobile: true }, { touch: true }, { native: true }, {}]) {
      const f = fixture(device), chatOnly = Boolean(device.mobile || device.touch || device.native);
      f.context.applyScreenAvailability();
      expect(f.context.ui.screensSection.hidden).toBe(chatOnly);
      expect(f.context.ui.sessionMode.hidden).toBe(chatOnly);
      expect(f.context.sessionViewMode).toBe(chatOnly ? 'chat' : 'term');
      expect(f.context.ui.searchInput.placeholder).toBe(chatOnly ? '프로젝트 · 세션 검색' : 'Screen · 프로젝트 · 세션 검색');
      expect(f.button.parentElement).toBe(chatOnly ? f.tools : f.desktop);
    }
  });

  it("does not choose a Screen as the mobile default", () => {
    const phone = fixture({ mobile: true }).context, desktop = fixture().context;
    expect(phone.defaultWorkspaceSelection()).toEqual({ type: 'session', id: 'active' });
    expect(desktop.defaultWorkspaceSelection()).toEqual({ type: 'screen', id: 'screen' });
    phone.allAgents = () => [{ id: 'offline', status: 'offline' }];
    expect(phone.defaultWorkspaceSelection()).toEqual({ type: 'session', id: 'offline' });
    phone.allAgents = () => [];
    expect(phone.defaultWorkspaceSelection()).toEqual({ type: 'usage', id: null });
  });

  it("redirects mobile Screen URLs and viewport transitions to a session", () => {
    for (const event of ['mobile:change', 'touch:change']) {
      const f = fixture();
      expect(f.listeners.get(event)).toBe(f.context.syncResponsiveWorkspace);
      if (event.startsWith('mobile')) f.context.mobileMedia.matches = true; else f.context.touchMedia.matches = true;
      f.listeners.get(event)();
      expect(f.context.selection).toEqual({ type: 'session', id: 'active' });
      expect(f.context.returnScreenId).toBeNull(); expect(f.context.mobilePaneId).toBeNull(); expect(f.context.screenRenderKey).toBe('');
      expect(f.context.updateUrl).toHaveBeenCalledOnce(); expect(f.context.refitAllTerminals).toHaveBeenCalledOnce();
    }
  });
});
