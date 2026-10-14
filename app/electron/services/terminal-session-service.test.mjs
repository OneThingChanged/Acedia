import { expect, it, vi } from "vitest";
import { PassThroughTerminalFilter, SynchronizedTerminalFilter } from "./terminal-stream.mjs";
import { TerminalSessionService } from "./terminal-session-service.mjs";

function fakePty() {
  let onData = () => {};
  let onExit = () => {};
  return {
    cols: 80,
    rows: 24,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData(listener) { onData = listener; },
    onExit(listener) { onExit = listener; },
    emitData(data) { onData(data); },
    emitExit(exitCode = 0) { onExit({ exitCode }); },
  };
}

function register(service, id, process = fakePty(), extra = {}) {
  const generation = service.beginSpawn(id);
  const accepted = service.register({
    id,
    process,
    filter: new PassThroughTerminalFilter(),
    ...extra,
  }, generation);
  expect(accepted).toBe(true);
  return process;
}

it('publishes watchdog output in sequence and prevents a closed Qwen frame from reaching a replacement session', () => {
  vi.useFakeTimers();
  const deliveries = [], service = new TerminalSessionService({sendDataToView:(_view,data)=>deliveries.push(data)});
  try {
    const pty = register(service, 'qwen', fakePty(), {filter:new SynchronizedTerminalFilter()});
    service.attach('qwen',1);
    pty.emitData('before'); pty.emitData('\x1b[?2026hpartial');
    expect(deliveries).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(deliveries.at(-1)).toMatchObject({sequenceStart:6,data:'\x1b[?2026hpartial\x1b[?2026l'});
    expect(service.snapshotSince('qwen').data).toBe(deliveries.map(item=>item.data).join(''));
    pty.emitData('\x1b[?2026hstale');service.close('qwen');register(service,'qwen');
    vi.advanceTimersByTime(200);
    expect(deliveries).toHaveLength(2);expect(service.snapshotSince('qwen').data).toBe('');
  } finally {service.closeAll();vi.useRealTimers();}
});

it("buffers hidden output and replays it only to an attached view", () => {
  const deliveries = [];
  const service = new TerminalSessionService({
    sendDataToView: (viewId, payload) => deliveries.push({ viewId, payload }),
  });
  const pty = register(service, "agent-1");
  pty.emitData("hidden");
  expect(deliveries).toEqual([]);

  expect(service.attach("agent-1", 10, 0)).toMatchObject({
    sequenceStart: 0,
    sequenceEnd: 6,
    data: "hidden",
  });
  pty.emitData(" live");
  expect(deliveries).toEqual([{
    viewId: 10,
    payload: {
      id: "agent-1",
      sequenceStart: 6,
      sequenceEnd: 11,
      data: " live",
    },
  }]);
});

it.each(["sleep", "close", "restart"])("captures settings before disposing or killing a %s session", action => {
  const events = [];
  const service = new TerminalSessionService({ onBeforeClose: (entry, reason) => {
    expect(service.get(entry.id)).toBe(entry); events.push(reason);
  } });
  const pty = register(service, "session");
  service.get("session").filter.dispose = () => events.push("disposed");
  pty.kill.mockImplementation(() => events.push("killed"));
  service.action("session", action);
  expect(events).toEqual([action, "disposed", "killed"]);
  pty.emitExit(); expect(events).toHaveLength(3);
});

it("captures a native quit before writing and captures a natural exit before releasing its viewport", () => {
  const captured = [];
  const service = new TerminalSessionService({ onBeforeClose: (_entry, reason) => captured.push(reason) });
  const pty = register(service, "session");
  pty.write.mockImplementation(() => expect(captured).toEqual(["quit"]));
  service.action("session", "quit");
  pty.emitExit(); expect(captured).toEqual(["quit", "natural"]);
});

it("captures every session during app quit and still tears down when persistence fails", () => {
  const reasons = [];
  const service = new TerminalSessionService({ onBeforeClose: (entry, reason) => {
    reasons.push([entry.id, reason]); if (entry.id === "first") throw new Error("fixture failure");
  } });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const first = register(service, "first"), second = register(service, "second");
    service.closeAll();
    expect(reasons).toEqual([["first", "app-quit"], ["second", "app-quit"]]);
    expect(first.kill).toHaveBeenCalledOnce(); expect(second.kill).toHaveBeenCalledOnce();
  } finally { warn.mockRestore(); }
});

it('reports manual input and quit before writing so an automatic retry can be cancelled', () => {
  const inputs = [], service = new TerminalSessionService({ onInput: id => inputs.push(id) });
  const process = register(service, 'agent-1');
  service.write('agent-1', 'manual prompt'); service.action('agent-1', 'quit');
  expect(inputs).toEqual(['agent-1', 'agent-1']);
  expect(process.write.mock.calls.map(([data]) => data)).toEqual(['manual prompt', '/quit\r']);
  service.closeAll();
});

it("moves a view without losing or duplicating output", () => {
  const deliveries = [];
  const service = new TerminalSessionService({
    sendDataToView: (viewId, payload) => deliveries.push({ viewId, payload }),
  });
  const pty = register(service, "agent-1");
  service.attach("agent-1", 1, 0);
  pty.emitData("first");
  service.detach("agent-1", 1);
  pty.emitData("between");
  const replay = service.attach("agent-1", 2, 5);
  pty.emitData("last");

  expect(replay).toMatchObject({ data: "between", sequenceStart: 5, sequenceEnd: 12 });
  expect(deliveries.map(({ viewId, payload }) => [viewId, payload.data])).toEqual([
    [1, "first"],
    [2, "last"],
  ]);
});

it("makes duplicate close idempotent and ignores a late exit", () => {
  const exits = [];
  const released = vi.fn();
  const service = new TerminalSessionService({ broadcastExit: (event) => exits.push(event) });
  const pty = register(service, "agent-1", fakePty(), { release: released });

  expect(service.close("agent-1")).toBe(true);
  expect(service.close("agent-1")).toBe(false);
  pty.emitExit(9);
  expect(pty.kill).toHaveBeenCalledTimes(1);
  expect(released).toHaveBeenCalledTimes(1);
  expect(exits).toEqual([]);
});

it("uses an entry process-tree terminator before the PTY fallback", () => {
  const service = new TerminalSessionService();
  const pty = fakePty();
  const terminate = vi.fn(() => true);
  register(service, "agent-tree", pty, { terminate });

  expect(service.close("agent-tree", "sleep")).toBe(true);
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(pty.kill).not.toHaveBeenCalled();
});

it("falls back to PTY kill when process-tree termination fails", () => {
  const service = new TerminalSessionService();
  const pty = fakePty();
  register(service, "agent-tree", pty, { terminate: () => false });

  expect(service.close("agent-tree", "restart")).toBe(true);
  expect(pty.kill).toHaveBeenCalledTimes(1);
});

it("does not let an in-flight spawn resurrect a session after close", () => {
  const service = new TerminalSessionService();
  const process = fakePty();
  const generation = service.beginSpawn("agent-1");
  service.close("agent-1");

  expect(service.register({
    id: "agent-1",
    process,
    filter: new PassThroughTerminalFilter(),
  }, generation)).toBe(false);
  expect(service.has("agent-1")).toBe(false);
  expect(process.kill).toHaveBeenCalledTimes(1);
});

it("keeps a newer process when the old process exits late", () => {
  const service = new TerminalSessionService();
  const oldProcess = register(service, "agent-1");
  service.close("agent-1", "restart");
  const newProcess = register(service, "agent-1");
  oldProcess.emitExit(1);

  expect(service.get("agent-1")?.process).toBe(newProcess);
});

it("graceful quit writes the provider command and keeps the session alive", () => {
  const service = new TerminalSessionService();
  const pty = register(service, "agent-1", fakePty(), { quitCommand: "/quit\r" });
  expect(service.action("agent-1", "quit")).toBe(true);
  expect(pty.write).toHaveBeenCalledWith("/quit\r");
  expect(pty.kill).not.toHaveBeenCalled();
  expect(service.has("agent-1")).toBe(true);
});

it("reports the live id set for crash-safe reopen journaling", () => {
  const onSessionsChanged = vi.fn();
  const service = new TerminalSessionService({ onSessionsChanged });
  register(service, "agent-1");
  register(service, "agent-2");
  service.close("agent-1", "sleep");

  expect(onSessionsChanged.mock.calls.map(([event]) => event)).toEqual([
    { reason: "spawn", ids: ["agent-1"] },
    { reason: "spawn", ids: ["agent-1", "agent-2"] },
    { reason: "sleep", ids: ["agent-2"] },
  ]);
});

it("resizes the output filter before resizing the PTY", () => {
  const order = [];
  const filter = {
    push: (data) => data,
    finish: () => "",
    resize: vi.fn(() => order.push("filter")),
    dispose: vi.fn(),
  };
  const pty = fakePty();
  pty.resize.mockImplementation(() => order.push("pty"));
  const service = new TerminalSessionService();
  register(service, "agent-resize", pty, { filter });

  expect(service.resize("agent-resize", 132, 42)).toBe(true);
  expect(order).toEqual(["filter", "pty"]);
  expect(filter.resize).toHaveBeenCalledWith(132, 42);
  expect(pty.resize).toHaveBeenCalledWith(132, 42);
});

it("disposes the output filter exactly once when a session is released", () => {
  const filter = {
    push: (data) => data,
    finish: () => "",
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const service = new TerminalSessionService();
  const pty = fakePty();
  register(service, "agent-dispose", pty, { filter });

  expect(service.close("agent-dispose")).toBe(true);
  pty.emitExit(0);
  expect(filter.dispose).toHaveBeenCalledTimes(1);
});
