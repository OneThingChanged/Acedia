import fs from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";
import { captureBrowserPng } from "./browser-capture.mjs";

function showFixture({ background = true } = {}) {
  const source = fs.readFileSync(new URL("../main.mjs", import.meta.url), "utf8");
  const start = source.indexOf("function showBrowserIntegrationTab(");
  const end = source.indexOf("\nasync function refreshDocumentBrowserPreview", start);
  const attachedWindow = { isDestroyed: () => false, webContents: { id: 1 } };
  const ownerWindow = { isDestroyed: () => false, webContents: { id: 2 } };
  const record = { id: "tab", background, win: attachedWindow,
    view: { getBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }), setBounds: vi.fn(),
      webContents: { isDestroyed: () => false, getURL: () => "https://example.com" } } };
  const context = {
    browserParentWindowForAgent: vi.fn(() => ownerWindow),
    attachDocumentBrowserToWindow: vi.fn(() => true),
    runtimeByWebContents: new Map([[1, { workspace_window: true }], [2, { workspace_window: true }]]),
    documentBrowserByAgent: new Map(), sendEvent: vi.fn(),
    sanitizeBrowserUrl: url => url, publishDocumentBrowserCatalog: vi.fn(),
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, record, attachedWindow, ownerWindow };
}

it("agent connection requests place a background tab without selecting the workspace", () => {
  const { context, record, ownerWindow } = showFixture();
  expect(context.showBrowserIntegrationTab(record, "agent", "right")).toBe(true);
  expect(context.attachDocumentBrowserToWindow).toHaveBeenCalledWith(record, ownerWindow);
  expect(context.sendEvent).toHaveBeenCalledWith(ownerWindow, "document-browser:show-tab",
    expect.objectContaining({ browserId: "tab", agentId: "agent", placement: "right", activate: false }));
  expect(record.bounds).toMatchObject({ width: 1280, height: 800 });
});

it("repeated agent connections keep a browser in its existing workspace window", () => {
  const { context, record, attachedWindow } = showFixture({ background: false });
  for (let i = 0; i < 3; i++) expect(context.showBrowserIntegrationTab(record, "agent", "right")).toBe(true);
  expect(context.browserParentWindowForAgent).not.toHaveBeenCalled();
  expect(context.attachDocumentBrowserToWindow).toHaveBeenCalledTimes(3);
  for (const [tab, win] of context.attachDocumentBrowserToWindow.mock.calls) {
    expect(tab).toBe(record);
    expect(win).toBe(attachedWindow);
  }
});

it("a missing workspace cannot reparent the browser before a failed connection", () => {
  const { context, record } = showFixture();
  context.runtimeByWebContents.clear();
  expect(context.showBrowserIntegrationTab(record, "agent", "right")).toBe(false);
  expect(context.attachDocumentBrowserToWindow).not.toHaveBeenCalled();
  expect(context.sendEvent).not.toHaveBeenCalled();
});

it("AI open/navigation/snapshot/screenshots do not reveal or attach the tab to a workspace", async () => {
  const source = fs.readFileSync(new URL("../main.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function handleBrowserIntegration(");
  const end = source.indexOf("\nconst REMOTE_BROWSER_KEYS", start);
  const host = { id: "background-host" };
  const record = { view: { webContents: { loadURL: vi.fn(async () => {}) } } };
  const reveal = vi.fn();
  const create = vi.fn(async () => ({ browserId: "tab" }));
  const context = {
    URL, isHttpUrl: url => url.startsWith("https:"), ensureBrowserHostWindow: () => host,
    browserParentWindowForAgent: vi.fn(() => { throw new Error("AI must not attach to workspace"); }),
    createDocumentBrowserWindow: create, documentBrowserWindows: new Map([["tab", record]]),
    browserIntegrationTabSnapshot: () => ({ tabId: "tab" }), showBrowserIntegrationTab: reveal,
    browserRecordForIntegration: async () => record, executeBrowserSnapshot: async () => ({ text: "page" }),
    saveBrowserScreenshot: async () => "screenshot.png",
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  for (const action of ["open", "navigate", "snapshot", "screenshot"]) {
    const result = await context.handleBrowserIntegration({ agentId: "agent", action, body: { tabId: "tab", url: "https://example.com" } });
    expect(result.ok).toBe(true);
  }
  for (const placement of ["right", "tab"]) {
    const result = await context.handleBrowserIntegration({ agentId: "agent", action: "open", reveal: true,
      body: { url: "https://example.com", placement } });
    expect(result.ok).toBe(true);
  }
  expect(reveal).not.toHaveBeenCalled();
  for (const [options] of create.mock.calls) expect(options).toMatchObject({ parentWindow: host, background: true });
  reveal.mockReturnValue(true);
  const shown = await context.handleBrowserIntegration({ agentId: "agent", action: "show", body: { tabId: "tab", placement: "right" } });
  expect(shown.ok).toBe(true);
  // The fixture records display requests; the real renderer owns the layout.
  expect(reveal).toHaveBeenCalledOnce();
  expect(reveal).toHaveBeenCalledWith(record, "agent", "right");
});

it("captures the scrolled viewport without replacing another debugger connection", async () => {
  const debuggerApi = {
    isAttached: () => true, attach: vi.fn(), detach: vi.fn(),
    sendCommand: vi.fn(async method => method === "Page.getLayoutMetrics"
      ? { cssVisualViewport: { pageX: 0, pageY: 200, clientWidth: 800, clientHeight: 600 } }
      : { data: Buffer.from("png").toString("base64") }),
  };
  expect((await captureBrowserPng({ debugger: debuggerApi, isDestroyed: () => false }, { x: 10, y: 20, width: 50, height: 60 })).toString()).toBe("png");
  expect(debuggerApi.sendCommand).toHaveBeenCalledWith("Page.captureScreenshot", expect.objectContaining({ clip: { x: 10, y: 220, width: 50, height: 60, scale: 1 } }));
  expect(debuggerApi.attach).not.toHaveBeenCalled();
  expect(debuggerApi.detach).not.toHaveBeenCalled();
});
