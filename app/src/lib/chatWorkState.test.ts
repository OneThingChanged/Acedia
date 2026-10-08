import { describe, expect, it } from "vitest";
import { isChatWorking } from "./chatWorkState";

describe("desktop chat progress", () => {
  it("shows live transcript work before the working hook arrives", () => {
    expect(isChatWorking({ status: "running", lifecycle: "working", now: 2000 })).toBe(true);
  });
  it("distinguishes a fresh hook from an earlier completion and a missed Stop hook", () => {
    expect(isChatWorking({ status: "working", lifecycle: "idle", lifecycleAt: 1000, workStartedAt: 1500, now: 2000 })).toBe(true);
    expect(isChatWorking({ status: "working", lifecycle: "idle", lifecycleAt: 2000, workStartedAt: 1500, now: 2500 })).toBe(false);
    expect(isChatWorking({ status: "working", lifecycle: "idle", now: 2500 })).toBe(false);
  });
  it("shows dispatch immediately, ends at completion and times out an unacknowledged send", () => {
    expect(isChatWorking({ status: "running", lifecycle: "idle", lifecycleAt: 1000, dispatchAt: 1500, now: 2000 })).toBe(true);
    expect(isChatWorking({ status: "running", lifecycle: "idle", lifecycleAt: 2000, dispatchAt: 1500, now: 2200 })).toBe(false);
    expect(isChatWorking({ status: "running", dispatchAt: 1500, now: 12000 })).toBe(false);
  });
  it("does not show work for stopped, dead, sleeping or synchronous question states", () => {
    for (const status of ["idle", "exited", "unreachable"] as const) expect(isChatWorking({ status, lifecycle: "working", now: 2000 })).toBe(false);
    expect(isChatWorking({ status: "working", lifecycle: "working", stopped: true, now: 2000 })).toBe(false);
    expect(isChatWorking({ status: "waiting", lifecycle: "working", waiting: true, now: 2000 })).toBe(false);
  });
});
