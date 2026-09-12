import { it, expect, vi } from "vitest";
import { watchElementBounds } from "./watchElementBounds";
it("updates a moved split pane even when its dimensions stay equal, and stops on unmount", () => {
  let callback: FrameRequestCallback = () => {}, y = 20;
  vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => { callback = cb; return 1; }));
  const cancel = vi.fn(); vi.stubGlobal("cancelAnimationFrame", cancel);
  try {
    const host = { getBoundingClientRect: () => ({ left: 10, top: y, width: 400, height: 300 }) } as Element;
    const changed = vi.fn(), stop = watchElementBounds(host, changed);
    callback(0); expect(changed).toHaveBeenCalledTimes(1);
    callback(1); expect(changed).toHaveBeenCalledTimes(1);
    y = 350; callback(2); expect(changed).toHaveBeenCalledTimes(2);
    stop(); y = 700; callback(3); expect(changed).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
