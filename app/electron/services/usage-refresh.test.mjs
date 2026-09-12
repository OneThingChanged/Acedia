import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageService } from "./usage-service.mjs";

const resources = [];
afterEach(() => { for (const { service, root } of resources.splice(0)) { service.close(); fs.rmSync(root, { recursive: true, force: true }); } });
const ids = ["default", "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const accounts = ids.map(id => ({ id, label: "Same name" }));
const result = usedPercent => ({ status: "success", data: { rateLimits: { limitId: "codex", primary: { usedPercent, windowDurationMins: 10080, resetsAt: 1900000000 } } } });
function fixture(fetcher) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "acedia-usage-refresh-"));
  const service = new UsageService(path.join(root, "usage.db"), { scan: async () => [] }, { codexUsageFetcher: fetcher, claudeUsageFetcher: async () => null });
  service.codexAccounts = () => accounts;
  service.accountProfiles = provider => provider === "codex" ? accounts.slice(1) : [];
  resources.push({ service, root }); return service;
}

describe("live account quota refresh", () => {
  it("fetches idle and hidden registered accounts once across simultaneous refresh requests", async () => {
    let active = 0, maxActive = 0;
    const fetcher = vi.fn(async account => {
      maxActive = Math.max(maxActive, ++active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--;
      return result(ids.indexOf(account.id) * 20);
    });
    const service = fixture(fetcher);
    service.setProfileVisibility(`codex:${ids[1]}`, true);
    const [first, second] = await Promise.all([service.getRateLimits(true), service.getRateLimits(true)]);
    expect(first).toEqual(second); expect(fetcher).toHaveBeenCalledTimes(3); expect(maxActive).toBe(2);
    expect(first.limits.filter(limit => limit.profile.provider === "codex").map(limit => limit.primary.usedPercent).sort((a,b) => a-b)).toEqual([0,20,40]);
    expect(first.profiles.filter(profile => profile.provider === "codex").every(profile => profile.refresh.status === "success")).toBe(true);
    expect(first.profiles.find(profile => profile.id === ids[1]).hidden).toBe(true);
    await service.getRateLimits(false); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("preserves old quotas on a partial failure, continues other accounts and recovers on retry", async () => {
    const service = fixture(async () => result(25));
    await service.getRateLimits(true);
    const prior = service.rateLimitSummary().limits.find(limit => limit.limitId === "codex");
    service.codexUsageFetcher = async account => {
      if (account.id === "default") return { status: "timeout" };
      if (account.id === ids[1]) throw Error("private-auth-value");
      return result(60);
    };
    service.sessionService.scan = async () => { throw Error("scan unavailable"); };
    const refreshed = await service.getRateLimits(true);
    const cached = refreshed.limits.find(limit => limit.limitId === "codex");
    expect(cached.primary).toEqual(prior.primary); expect(cached.updatedAt).toBe(prior.updatedAt);
    expect(cached.profile.refresh.status).toBe("timeout");
    expect(refreshed.profiles.find(profile => profile.id === ids[1]).refresh.status).toBe("failed");
    expect(refreshed.limits.find(limit => limit.profile.id === ids[2]).primary.usedPercent).toBe(60);
    expect(JSON.stringify(refreshed)).not.toContain("private-auth-value");
    service.codexUsageFetcher = async () => result(70);
    expect((await service.getRateLimits(true)).limits.every(limit => limit.primary.usedPercent === 70)).toBe(true);
  });
  it("shows missing authentication without inventing quota data", async () => {
    const service = fixture(async () => ({ status: "login_required" }));
    const summary = await service.getRateLimits(true);
    expect(summary.limits).toEqual([]);
    expect(summary.profiles.filter(profile => profile.provider === "codex")).toHaveLength(3);
    expect(summary.profiles.every(profile => profile.refresh.status === "login_required")).toBe(true);
  });
  it("isolates Claude account failures and replaces their status after recovery", async () => {
    const service = fixture(null);
    service.claudeAccounts = () => accounts;
    service.accountProfiles = () => accounts.slice(1);
    service.claudeUsageFetcher = async account => {
      if (account.id === ids[1]) throw Error("private-token");
      return { usage: { seven_day: { utilization: 34, resets_at: "2030-01-01T00:00:00Z" } }, subscriptionType: "max" };
    };
    const summary = await service.getRateLimits(true);
    expect(summary.limits).toHaveLength(2);
    expect(summary.profiles.find(profile => profile.key === `claude:${ids[1]}`).refresh.status).toBe("failed");
    expect(summary.limits.every(limit => limit.profile.refresh.status === "success")).toBe(true);
  });
});
