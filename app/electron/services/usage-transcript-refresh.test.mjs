import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "./usage-service.mjs";

const fixtures = [];
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const { service, root } of fixtures.splice(0)) {
    service.close();
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-token-refresh-")) {
      throw new Error("Unexpected usage fixture path");
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 3, 1, 0, 0));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-token-refresh-"));
  const entries = [];
  const scan = vi.fn(async tool => tool === "codex" ? entries : []);
  const service = new UsageService(path.join(root, "usage.db"), { scan });
  vi.spyOn(service, "refreshRateLimits").mockResolvedValue({ limits: [] });
  fixtures.push({ service, root });
  const append = (sessionId, total, cumulative = total) => {
    let entry = entries.find(e => e.sessionId === sessionId);
    if (!entry) {
      entry = { sessionId, cwd: root, path: path.join(root, `${sessionId}.jsonl`) };
      entries.push(entry);
    }
    fs.appendFileSync(entry.path, JSON.stringify({
      timestamp: new Date().toISOString(), type: "event_msg", payload: {
        type: "token_count", info: {
          last_token_usage: { input_tokens: total - 3, output_tokens: 3, cached_input_tokens: 2, reasoning_output_tokens: 1, total_tokens: total },
          total_token_usage: { total_tokens: cumulative },
        },
      },
    }) + "\n");
  };
  return { service, scan, append };
}

describe("Dashboard transcript freshness", () => {
  it("includes ongoing turns and newly discovered sessions before returning history", async () => {
    const { service, append } = fixture();
    append("ongoing", 13);
    const first = await service.browserSummary();
    expect(first.tokens).toMatchObject({ events: 1, totalTokens: 13 });
    expect(first.history.totals).toMatchObject({ events: 1, totalTokens: 13 });
    expect(first.tokensUpdatedAt).toBe(Date.now());

    append("ongoing", 17, 30);
    append("no-completion-hook", 11);
    const refreshed = await service.browserSummary(true);
    expect(refreshed.tokens).toMatchObject({ events: 3, totalTokens: 41 });
    expect(refreshed.history.totals).toMatchObject({ events: 3, totalTokens: 41 });
    expect(service.refreshRateLimits).toHaveBeenCalledTimes(1);
    expect((await service.browserSummary(true)).tokens.totalTokens).toBe(41);
  });

  it("shares simultaneous scans and refreshes passive history after 30 seconds", async () => {
    const { service, scan, append } = fixture();
    append("ongoing", 13);
    const summaries = await Promise.all([service.browserSummary(), service.browserSummary(), service.browserSummary(true)]);
    expect(summaries.every(s => s.tokens.totalTokens === 13)).toBe(true);
    expect(scan).toHaveBeenCalledTimes(2);
    append("ongoing", 17, 30);
    expect((await service.browserSummary()).tokens.totalTokens).toBe(13);
    expect(scan).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_000);
    expect((await service.browserSummary()).tokens.totalTokens).toBe(30);
    expect(scan).toHaveBeenCalledTimes(4);
  });

  it("does not wait for account lookups before returning fresh token totals", async () => {
    const { service, append } = fixture();
    append("ongoing", 13);
    let settle;
    const pending = new Promise(resolve => { settle = resolve; });
    service.refreshRateLimits.mockImplementation(() => {
      service.rateLimitRefresh = pending;
      return pending;
    });
    const summary = await service.browserSummary(true);
    expect(summary.tokens.totalTokens).toBe(13);
    expect(summary.refreshPending).toBe(true);
    settle({ limits: [] });
    await pending;
    service.rateLimitRefresh = null;
  });

  it("retries a failed scan without marking old token data as refreshed", async () => {
    const { service, scan, append } = fixture();
    append("ongoing", 13);
    scan.mockRejectedValueOnce(new Error("transcript scan unavailable"));
    await expect(service.browserSummary()).rejects.toThrow("transcript scan unavailable");
    expect(service.transcriptUpdatedAt).toBe(0);
    expect((await service.browserSummary()).tokens.totalTokens).toBe(13);
  });
});
