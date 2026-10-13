import { describe, expect, it, vi } from "vitest";
import { StartupUpdateService } from "./startup-update.mjs";

const update = { version: "1.8.1.81" };

describe("startup update prompts", () => {
  it("checks once and limits concurrent windows and renderer remounts to one owner", async () => {
    let complete;
    const check = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const service = new StartupUpdateService({ enabled: true, check });
    const first = service.claim(1);
    const remount = service.claim(1);
    expect(await service.claim(2)).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
    complete(update);
    expect(await first).toEqual(update);
    expect(await remount).toEqual(update);
    expect(await service.claim(1)).toEqual(update);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("keeps Later dismissed for this launch and checks again on the next launch", async () => {
    const check = vi.fn(async () => update);
    const service = new StartupUpdateService({ enabled: true, check });
    await service.claim(1);
    service.dismiss(2);
    expect(await service.claim(1)).toEqual(update);
    service.dismiss(1);
    expect(await service.claim(1)).toBeNull();
    expect(await service.claim(2)).toBeNull();
    const nextLaunch = new StartupUpdateService({ enabled: true, check });
    expect(await nextLaunch.claim(3)).toEqual(update);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("does not restore a dismissed prompt when its check completes late", async () => {
    let complete;
    const service = new StartupUpdateService({ enabled: true, check: () => new Promise(resolve => { complete = resolve; }) });
    const pending = service.claim(1);
    await Promise.resolve();
    service.dismiss(1);
    complete(update);
    expect(await pending).toBeNull();
  });

  it("does not query disabled channels or prompt when the version is current", async () => {
    const check = vi.fn(async () => null);
    const disabled = new StartupUpdateService({ enabled: false, check });
    expect(await disabled.claim(1)).toBeNull();
    expect(check).not.toHaveBeenCalled();
    const enabled = new StartupUpdateService({ enabled: true, check });
    expect(await enabled.claim(1)).toBeNull();
    expect(await enabled.claim(1)).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("records a failed network check without blocking startup or retrying in a loop", async () => {
    const error = new Error("offline");
    const check = vi.fn(async () => { throw error; });
    const record = vi.fn();
    const service = new StartupUpdateService({ enabled: true, check, record });
    expect(await service.claim(1)).toBeNull();
    expect(await service.claim(1)).toBeNull();
    expect(check).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith("startup-check-failed", error);
  });
});
