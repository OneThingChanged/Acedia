import fs from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";
import { captureBrowserPng } from "./browser-capture.mjs";

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
  expect(reveal).not.toHaveBeenCalled();
  expect(create.mock.calls[0][0]).toMatchObject({ parentWindow: host, background: true });
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
