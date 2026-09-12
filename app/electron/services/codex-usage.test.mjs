import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { codexUsageSnapshot, fetchCodexUsage } from "./codex-usage.mjs";

const quota = { limitId: "codex", planType: "pro", primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1900000000 }, secondary: { usedPercent: 42, windowDurationMins: 10080, resetsAt: 1900000500 }, credits: { hasCredits: false, unlimited: false, balance: "0" } };
function server(respond) {
  const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, stdin: new PassThrough(), stdout: new PassThrough() });
  const requests = [];
  child.stdin.on("data", chunk => {
    const request = JSON.parse(String(chunk)); requests.push(request);
    queueMicrotask(() => {
      const result = respond(request);
      if (result) {
        const line = JSON.stringify(result) + "\n";
        child.stdout.write(line.slice(0, 7)); child.stdout.write(line.slice(7));
      }
    });
  });
  const start = vi.fn(() => child), stop = vi.fn();
  const run = () => fetchCodexUsage({ command: { file: "codex.exe", args: ["app-server"] }, env: { CODEX_HOME: "isolated-account" }, start, stop, timeoutMs: 30 });
  return { child, start, stop, requests, run };
}
const reply = request => request.id === 1 ? { id: 1, result: {} }
  : request.id === 2 ? { id: 2, result: { account: { type: "chatgpt" } } }
  : request.id === 3 ? { id: 3, result: { rateLimits: quota } } : null;

describe("Codex account quota RPC", () => {
  it("reads only the supplied account via a completed handshake, without starting a model turn", async () => {
    const fixture = server(reply);
    expect(await fixture.run()).toEqual({ status: "success", data: { rateLimits: quota } });
    expect(fixture.requests.map(request => request.method)).toEqual(["initialize", "initialized", "account/read", "account/rateLimits/read"]);
    expect(fixture.start).toHaveBeenCalledWith("codex.exe", ["app-server"], expect.objectContaining({ env: { CODEX_HOME: "isolated-account" }, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] }));
    expect(fixture.stop).toHaveBeenCalledOnce();
  });
  for (const [account, status] of [[null, "login_required"], [{ type: "apiKey" }, "unavailable"]]) it(`reports ${status} without a quota request`, async () => {
    const fixture = server(request => request.id === 2 ? { id: 2, result: { account } } : reply(request));
    expect(await fixture.run()).toEqual({ status });
    expect(fixture.requests).toHaveLength(3); expect(fixture.stop).toHaveBeenCalledOnce();
  });
  it("suppresses raw authentication errors and stops the helper", async () => {
    const fixture = server(request => request.id === 3 ? { id: 3, error: { message: "401 private-auth-value" } } : reply(request));
    expect(await fixture.run()).toEqual({ status: "login_required" });
    expect(fixture.stop).toHaveBeenCalledOnce();
  });
  it("times out a silent server and cleans up its owned process", async () => {
    const fixture = server(() => null);
    expect(await fixture.run()).toEqual({ status: "timeout" }); expect(fixture.stop).toHaveBeenCalledOnce();
  });
  it("handles start and early exit failures without leaving a pending refresh", async () => {
    expect(await fetchCodexUsage({ command: {}, start: () => { throw Error("private-path"); } })).toEqual({ status: "failed" });
    const fixture = server(() => null); const pending = fixture.run();
    fixture.child.exitCode = 1; fixture.child.emit("exit", 1);
    expect(await pending).toEqual({ status: "failed" }); expect(fixture.stop).not.toHaveBeenCalled();
  });
  it("uses the Codex bucket and keeps account identities, reset times and zero usage", () => {
    const snapshot = codexUsageSnapshot({ rateLimits: { limitId: "codex_model", primary: { usedPercent: 99 } }, rateLimitsByLimitId: { codex: quota } }, { id: "other", label: "Work" }, 123);
    expect(snapshot).toMatchObject({ limitId: "codex:other", limitName: "Codex · Work", updatedAt: 123, primary: { usedPercent: 0, windowMinutes: 300, resetsAt: 1900000000 }, secondary: { usedPercent: 42, windowMinutes: 10080 } });
    expect(codexUsageSnapshot({ rateLimits: { limitId: "codex_model" } }, { id: "default" })).toBeNull();
    expect(codexUsageSnapshot({ rateLimits: {} }, { id: "default" })).toBeNull();
  });
});
