import { Terminal } from "@xterm/xterm/lib/xterm.mjs";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "../platform/runtime";
import { createEntry, installImeCompositionPreview } from "./terminal";

vi.mock("@xterm/xterm", async () => import("@xterm/xterm/lib/xterm.mjs"));
vi.mock("../platform/runtime", () => ({ invoke: vi.fn().mockResolvedValue(null), listen: vi.fn() }));

let terminal;
afterEach(() => {
  terminal?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function fixture() {
  vi.stubGlobal("document", {
    createElement: () => Object.assign(new EventTarget(), {
      appendChild() {},
      setAttribute() {},
      classList: { remove() {} },
    }),
  });
  const handler = vi.spyOn(Terminal.prototype, "attachCustomKeyEventHandler");
  const entry = createEntry("claude-session");
  terminal = entry.term;
  const [receiveKey] = handler.mock.calls[0];
  return {
    entry,
    press(key) {
      const event = { type: "keydown", preventDefault: vi.fn(), stopPropagation: vi.fn(), ...key };
      return { event, letXtermHandle: receiveKey(event) };
    },
  };
}

it.each([
  [{ key: "Escape", code: "Escape", keyCode: 27 }, "\x1b"],
  [{ key: "Process", code: "Escape", keyCode: 229 }, "\x1b"],
  [{ key: "Process", code: "Tab", keyCode: 229 }, "\t"],
  [{ key: "Process", code: "Tab", keyCode: 229, shiftKey: true }, "\x1b[Z"],
])("sends a terminal control key once when the browser reports %j", (key, data) => {
  const { event, letXtermHandle } = fixture().press(key);
  expect(letXtermHandle).toBe(false);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledExactlyOnceWith("write_pty", { id: "claude-session", data });
});

it("keeps Escape with the IME while text is composing", () => {
  const { entry, press } = fixture();
  const textarea = new EventTarget();
  Object.defineProperty(entry.term, "textarea", { value: textarea });
  installImeCompositionPreview(entry);
  textarea.dispatchEvent(new Event("compositionstart"));

  const escape = { key: "Process", code: "Escape", keyCode: 229 };
  expect(press(escape).event.preventDefault).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();

  textarea.dispatchEvent(new Event("compositionend"));
  press(escape);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("write_pty", { id: "claude-session", data: "\x1b" });
});

it("leaves ordinary keys and modified Escape combinations on the normal xterm path", () => {
  const { press } = fixture();
  expect(press({ key: "Tab", code: "Tab", keyCode: 9, shiftKey: true }).letXtermHandle).toBe(true);
  expect(press({ key: "Escape", code: "Escape", keyCode: 27, altKey: true }).letXtermHandle).toBe(true);
  expect(press({ key: "Process", code: "Enter", keyCode: 229 }).letXtermHandle).toBe(false);
  expect(invoke).not.toHaveBeenCalled();
});
