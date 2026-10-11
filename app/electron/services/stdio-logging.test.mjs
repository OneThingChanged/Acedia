import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { guardConsoleOutput } from "./stdio-logging.mjs";

function fixture() {
  const stdout = new EventEmitter(), stderr = new EventEmitter();
  const logger = Object.fromEntries(["log", "info", "debug", "warn", "error"].map(method => [method, vi.fn()]));
  const originals = { ...logger };
  const restore = guardConsoleOutput({ stdout, stderr, logger });
  return { stdout, stderr, logger, originals, restore };
}
describe("console output after the launching terminal closes", () => {
  it("contains asynchronous broken-pipe errors and leaves the other stream available", () => {
    const f = fixture(); f.logger.log("before");
    expect(() => f.stdout.emit("error", Object.assign(Error("broken"), { code: "EPIPE" }))).not.toThrow();
    f.logger.log("after"); f.logger.info("after"); f.logger.debug("after"); f.logger.error("still visible");
    expect(f.originals.log).toHaveBeenCalledExactlyOnceWith("before");
    expect(f.originals.info).not.toHaveBeenCalled(); expect(f.originals.debug).not.toHaveBeenCalled();
    expect(f.originals.error).toHaveBeenCalledWith("still visible");
    f.stderr.emit("error", Object.assign(Error("broken"), { code: "EPIPE" }));
    f.logger.warn("after"); expect(f.originals.warn).not.toHaveBeenCalled();
    f.restore(); expect(f.logger.log).toBe(f.originals.log); expect(f.stdout.listenerCount("error")).toBe(0);
  });
  it("contains a synchronous closed-pipe write and skips subsequent writes", () => {
    const f = fixture(); f.originals.log.mockImplementation(() => { throw Object.assign(Error("closed"), { code: "EPIPE" }); });
    expect(() => f.logger.log("first")).not.toThrow(); f.logger.log("second");
    expect(f.originals.log).toHaveBeenCalledOnce(); f.restore();
  });
  it("keeps unrelated logging and stream errors visible", () => {
    const f = fixture(); const error = Object.assign(Error("other failure"), { code: "EACCES" });
    expect(() => f.stdout.emit("error", error)).toThrow(error);
    f.originals.error.mockImplementation(() => { throw new TypeError("programming error"); });
    expect(() => f.logger.error("test")).toThrow("programming error"); f.restore();
  });
});
