import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "./usage-service.mjs";

const fixtures = [];
afterEach(async () => {
  for (const { service, root } of fixtures.splice(0)) {
    service.close();
    await Promise.allSettled([service.transcriptRefresh, ...service.fileIngests.values()].filter(Boolean));
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("acedia-token-refresh-")) {
      throw new Error("Unexpected usage fixture path");
    }
    fs.rmSync(root, { recursive: true });
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fixture() {
  vi.useFakeTimers({ toFake: ["Date"] });
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
  return { service, scan, append, entries };
}

describe("Dashboard transcript freshness", () => {
  it("returns stored history immediately and includes ongoing turns after background collection", async () => {
    const { service, append } = fixture();
    append("ongoing", 13);
    const first = await service.browserSummary();
    expect(first.tokens).toMatchObject({ events: 0, totalTokens: 0 });
    expect(first.tokensRefreshPending).toBe(true);
    expect(first.tokensUpdatedAt).toBe(0);
    await service.transcriptRefresh;
    const collected = await service.browserSummary();
    expect(collected.tokens).toMatchObject({ events: 1, totalTokens: 13 });
    expect(collected.history.totals).toMatchObject({ events: 1, totalTokens: 13 });
    expect(collected.tokensUpdatedAt).toBe(Date.now());
    expect(collected.tokensRefreshPending).toBe(false);

    append("ongoing", 17, 30);
    append("no-completion-hook", 11);
    const refreshed = await service.browserSummary(true);
    expect(refreshed.tokens.totalTokens).toBe(13);
    expect(refreshed.tokensRefreshPending).toBe(true);
    expect(service.refreshRateLimits).toHaveBeenCalledTimes(1);
    await service.transcriptRefresh;
    const updated = await service.browserSummary();
    expect(updated.tokens).toMatchObject({ events: 3, totalTokens: 41 });
    expect(updated.history.totals).toMatchObject({ events: 3, totalTokens: 41 });
    expect((await service.browserSummary(true)).tokens.totalTokens).toBe(41);
    await service.transcriptRefresh;
    expect(service.dashboardSummary().totalTokens).toBe(41);
  });

  it("shares simultaneous scans and refreshes passive history after 30 seconds", async () => {
    const { service, scan, append } = fixture();
    append("ongoing", 13);
    const summaries = await Promise.all([service.browserSummary(), service.browserSummary(), service.browserSummary(true)]);
    expect(summaries.every(s => s.tokensRefreshPending && s.tokens.totalTokens === 0)).toBe(true);
    await service.transcriptRefresh;
    expect(scan).toHaveBeenCalledTimes(2);
    append("ongoing", 17, 30);
    expect((await service.browserSummary()).tokens.totalTokens).toBe(13);
    expect(scan).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 30_000);
    expect((await service.browserSummary()).tokensRefreshPending).toBe(true);
    await service.transcriptRefresh;
    expect((await service.browserSummary()).tokens.totalTokens).toBe(30);
    expect(scan).toHaveBeenCalledTimes(4);
  });

  it("does not wait for account lookups or transcript discovery before returning cached totals", async () => {
    const { service, append } = fixture();
    append("ongoing", 13);
    let settle;
    const pending = new Promise(resolve => { settle = resolve; });
    service.refreshRateLimits.mockImplementation(() => {
      service.rateLimitRefresh = pending;
      return pending;
    });
    const summary = await service.browserSummary(true);
    expect(summary.tokens.totalTokens).toBe(0);
    expect(summary.tokensRefreshPending).toBe(true);
    expect(summary.refreshPending).toBe(true);
    await service.transcriptRefresh;
    expect((await service.browserSummary()).tokens.totalTokens).toBe(13);
    settle({ limits: [] });
    await pending;
    service.rateLimitRefresh = null;
  });

  it("keeps cached totals visible on failure and allows explicit retry without claiming freshness", async () => {
    const { service, scan, append, entries } = fixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    append("ongoing", 13);
    await service.ingestFile(entries[0], "codex");
    scan.mockRejectedValueOnce(new Error("transcript scan unavailable"));
    expect((await service.browserSummary()).tokens.totalTokens).toBe(13);
    await service.transcriptRefresh?.catch(() => {});
    expect(service.transcriptUpdatedAt).toBe(0);
    const failed = await service.browserSummary();
    expect(failed).toMatchObject({ tokensRefreshFailed: true, tokensRefreshPending: false, tokensUpdatedAt: 0 });
    expect(failed.tokens.totalTokens).toBe(13);
    expect(scan).toHaveBeenCalledTimes(1);
    await service.browserSummary(true);
    await service.transcriptRefresh;
    expect((await service.browserSummary()).tokensRefreshFailed).toBe(false);
    expect(service.transcriptUpdatedAt).toBe(Date.now());
  });

  it("does not attach Dashboard responses or duplicate imports to a blocked history scan", async () => {
    const { service, scan, append, entries } = fixture();
    append("ongoing", 13);
    let release;
    const scanning = new Promise(resolve => { release = resolve; });
    scan.mockImplementationOnce(() => scanning);
    const first = await service.browserSummary();
    const job = service.transcriptRefresh;
    try {
      expect(first.tokensRefreshPending).toBe(true);
      expect((await service.browserSummary(true)).tokensRefreshPending).toBe(true);
      expect(service.ingestAll()).toBe(job);
      expect(scan).toHaveBeenCalledTimes(1);
    } finally {
      release(entries);
      await job;
    }
    expect((await service.browserSummary()).tokens.totalTokens).toBe(13);
  });

  it("indexes active sessions across providers before inactive historical sessions", async () => {
    const { service, scan, append, entries } = fixture();
    append("archived", 13);
    append("active", 17);
    service.activeSessions = () => [{ aiToolId: "codex", sessionId: "active" }];
    scan.mockImplementation(async tool => tool === "codex" ? entries : [{ ...entries[0], sessionId: "old-claude" }]);
    const reads = [];
    vi.spyOn(service, "ingestFile").mockImplementation(async entry => { reads.push(entry.sessionId); return 0; });
    await service.ingestAll();
    expect(reads).toEqual(["active", "archived", "old-claude"]);
  });

  it("reports per-file failures without marking a partial import complete", async () => {
    const { service, append } = fixture();
    append("unreadable", 13);
    vi.spyOn(service, "ingestFile").mockRejectedValueOnce(new Error("read failed"));
    const result = await service.ingestAll();
    expect(result.errors).toHaveLength(1);
    expect((await service.browserSummary()).tokensRefreshFailed).toBe(true);
    expect(service.transcriptUpdatedAt).toBe(0);
  });
});
