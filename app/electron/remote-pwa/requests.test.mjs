import { afterEach, expect, it, vi } from "vitest";
import { LatestRequest, requestJson } from "./requests.js";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("ignores stale successes and failures after a newer state response", async () => {
  const latest = new LatestRequest();
  let finish, fail;
  const apply = vi.fn(), failed = vi.fn();
  const old = latest.run(() => new Promise(resolve => { finish = resolve; }), apply, failed);
  const staleError = latest.run(() => new Promise((_, reject) => { fail = reject; }), apply, failed);
  await latest.run(async () => "new", apply, failed);
  finish("old"); fail(new Error("old failure"));
  await Promise.all([old, staleError]);
  expect(apply.mock.calls).toEqual([["new"]]);
  expect(failed).not.toHaveBeenCalled();
});
it("times out stalled response bodies and allows the next request to recover", async () => {
  vi.useFakeTimers();
  let signal;
  vi.stubGlobal("fetch", vi.fn((_, options) => {
    signal = options.signal;
    return Promise.resolve({ json: () => new Promise(() => {}) });
  }));
  const pending = requestJson("/api/state", {}, 100);
  const rejected = expect(pending).rejects.toThrow("초과");
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(signal.aborted).toBe(true);
  fetch.mockResolvedValue({ json: async () => ({ recovered: true }) });
  expect((await requestJson("/api/state")).data).toEqual({ recovered: true });
});
