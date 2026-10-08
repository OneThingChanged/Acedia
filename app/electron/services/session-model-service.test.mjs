import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSessionModel, sessionModelArgs, readCodexModels, claudeModelCatalog } from "../shared/session-model.mjs";
import { SessionModelService, lastTurnModel, modelRestartAllowed, verifyModelSessionStart } from "./session-model-service.mjs";
import { RemoteSessionModelBroker } from "./remote-session-model-broker.mjs";
import { LocalDashboardService, RemoteDashboardService } from "./web-services.mjs";

const raw = (model, efforts = ["low", "high"]) => ({ id: model, model, displayName: model,
  defaultReasoningEffort: "high", supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })) });
const resources = [];
afterEach(async () => { vi.useRealTimers(); for (const close of resources.splice(0)) await close(); });

describe("session model controls", () => {
  it("uses the installed Claude aliases and effort levels without treating them as account entitlements", () => {
    const help = "  --model <model> Model for this session. An alias (e.g. 'fable', 'opus', or 'sonnet') or a model's full name (e.g. 'claude-fable-5').\n  --effort <level> Effort for this session\n    (low, medium, high, xhigh, max)\n  --help display help";
    const models = claudeModelCatalog(help);
    expect(models.map(model => model.model)).toEqual(["fable", "opus", "sonnet"]);
    expect(models[0].efforts.map(item => item.effort)).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(sessionModelArgs({ model: "opus", effort: "max" }, undefined, "claude")).toEqual(["--model", "opus", "--effort", "max"]);
    expect(() => claudeModelCatalog("old CLI without flags")).toThrow("모델 옵션");
  });
  it("does not acknowledge a CLI that exits before its new start hook", async () => {
    const entry = { startedAt: 10, modelSettings: { model: "safe", effort: "high" } };
    await expect(verifyModelSessionStart({ id: "s", settings: entry.modelSettings, entryFor: () => entry,
      hookFor: () => ({ lastTs: 11, event: "session-start" }) })).resolves.toBeUndefined();
    let calls = 0;
    await expect(verifyModelSessionStart({ id: "s", settings: entry.modelSettings, entryFor: () => ++calls === 1 ? entry : null,
      hookFor: () => ({ lastTs: 9, event: "session-start" }) })).rejects.toThrow("종료");
  });
  it("paginates the account catalog, deduplicates entries, and omits hidden/unsafe IDs", async () => {
    const call = vi.fn().mockResolvedValueOnce({ data: [raw("account-only"), { ...raw("hidden"), hidden: true }, raw("$(unsafe)")], nextCursor: "next" })
      .mockResolvedValueOnce({ data: [raw("account-only"), raw("other", ["medium"])], nextCursor: null });
    const result = await readCodexModels({ call });
    expect(result.map(item => item.model)).toEqual(["account-only", "other"]);
    expect(result[0].efforts.map(item => item.effort)).toEqual(["low", "high"]);
    expect(call.mock.calls[1][1]).toMatchObject({ cursor: "next", includeHidden: false });
  });
  it("rejects cycling cursors", async () => {
    await expect(readCodexModels({ call: async () => ({ data: [], nextCursor: "cycle" }) })).rejects.toThrow("pagination");
  });
  it("encodes native model arguments and rejects injection or competing overrides", () => {
    expect(sessionModelArgs({ model: "account-only", effort: "high" })).toEqual(["--model", "account-only", "-c", 'model_reasoning_effort="high"']);
    expect(sessionModelArgs(null)).toEqual([]);
    expect(normalizeSessionModel({ model: "foo;bar", effort: "high" })).toBeUndefined();
    expect(() => sessionModelArgs({ model: "safe", effort: "$(bad)" })).toThrow();
    for (const args of [["--model=other"], ["-m", "other"], ["-c", 'model_reasoning_effort="low"'], ["--config=model=other"]]) {
      expect(() => sessionModelArgs({ model: "safe" }, { args })).toThrow("고급 실행");
    }
  });
  function fixture() {
    const agent = { id: "session", aiToolId: "codex", status: "working", hook: { event: "working" } };
    const update = vi.fn(async payload => ({ id: payload.id, restarted: payload.restart }));
    const service = new SessionModelService({ agentFor: id => id === agent.id ? agent : null,
      active: () => true, catalog: async () => ({ models: [{ model: "account-only", efforts: [{ effort: "high" }] }], accountLabel: "Account A" }), update });
    return { service, agent, update };
  }
  it("saves for next start while working but refuses to restart an active turn", async () => {
    const { service, update } = fixture();
    await service.save({ id: "session", settings: { model: "account-only", effort: "high" }, restart: false });
    expect(update).toHaveBeenCalledOnce();
    await expect(service.save({ id: "session", settings: null, restart: true })).rejects.toMatchObject({ statusCode: 409 });
    expect(update).toHaveBeenCalledOnce();
    expect((await service.read("session")).canRestart).toBe(false);
  });
  it("permits restart after completion and verifies account-specific model/effort pairs", async () => {
    const { service, agent, update } = fixture(); agent.status = "done"; agent.hook.event = "done";
    await expect(service.save({ id: "session", settings: { model: "account-only", effort: "high" }, restart: true })).resolves.toMatchObject({ restarted: true });
    await expect(service.save({ id: "session", settings: { model: "different-account-model" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.save({ id: "session", settings: { model: "account-only", effort: "low" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.save({ id: "session" })).rejects.toMatchObject({ statusCode: 400 });
    expect(update).toHaveBeenCalledOnce();
  });
  it("rejects unknown sessions, unsupported providers and SSH", async () => {
    const { service, agent } = fixture();
    await expect(service.read("missing")).rejects.toMatchObject({ statusCode: 404 });
    agent.aiToolId = "qwen"; await expect(service.read("session")).rejects.toMatchObject({ statusCode: 409 });
    agent.aiToolId = "codex"; agent.sshHostId = "remote"; await expect(service.read("session")).rejects.toMatchObject({ statusCode: 409 });
    expect(modelRestartAllowed({ status: "running" }, true)).toBe(false);
    expect(modelRestartAllowed({ status: "starting", hook: { event: "session-start" } }, true)).toBe(false);
  });
  it("revalidates activity after asynchronous discovery", async () => {
    const { service, agent, update } = fixture(); agent.status = "done"; agent.hook.event = "done";
    service.catalog = async () => { agent.status = "working"; agent.hook.event = "working"; return { models: [{ model: "account-only", efforts: [] }] }; };
    await expect(service.save({ id: "session", settings: { model: "account-only" }, restart: true })).rejects.toMatchObject({ statusCode: 409 });
    expect(update).not.toHaveBeenCalled();
  });
  it("reads the last valid turn without disclosing or loading the full transcript", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-model-test-"));
    resources.push(() => fs.rm(root, { recursive: true }));
    const file = path.join(root, "turn.jsonl");
    await fs.writeFile(file, 'x'.repeat(600000) + '\n' + JSON.stringify({ type: "turn_context", payload: { model: "account-only", effort: "high" } }) + '\n{"partial":');
    expect(await lastTurnModel(file)).toEqual({ model: "account-only", effort: "high" });
  });
  it.each(["codex", "claude"])("does not replace new launch settings with an older resumed turn (%s)", async provider => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-model-age-"));
    resources.push(() => fs.rm(root, { recursive: true }));
    const file = path.join(root, "turn.jsonl"), since = Date.parse("2026-10-08T08:00:00Z");
    const row = (model, timestamp) => provider === "codex"
      ? { type: "turn_context", timestamp, payload: { model, effort: "high" } }
      : { type: "assistant", timestamp, message: { model }, effort: "high" };
    await fs.writeFile(file, JSON.stringify(row("previous", "2026-10-08T07:00:00Z")) + "\n");
    expect(await lastTurnModel(file, provider)).toEqual({ model: "previous", effort: "high" });
    expect(await lastTurnModel(file, provider, since)).toBeNull();
    await fs.appendFile(file, JSON.stringify(row("new-or-manually-changed", "2026-10-08T08:01:00Z")) + "\n");
    expect(await lastTurnModel(file, provider, since)).toEqual({ model: "new-or-manually-changed", effort: "high" });
    await fs.appendFile(file, JSON.stringify(row("undated", undefined)) + "\n");
    expect(await lastTurnModel(file, provider, since)).toEqual({ model: "new-or-manually-changed", effort: "high" });
  });
  it("acknowledges the matching renderer result, serializes updates, and rejects shutdown", async () => {
    const dispatch = vi.fn(() => true), broker = new RemoteSessionModelBroker({ dispatch });
    resources.push(() => broker.close());
    const pending = broker.update({ id: "session", settings: null });
    await expect(broker.update({ id: "session", settings: null })).rejects.toMatchObject({ statusCode: 409 });
    const { requestId } = dispatch.mock.calls[0][0];
    expect(broker.complete({ requestId, id: "other", ok: true })).toBe(false);
    broker.complete({ requestId, id: "session", ok: true, restarted: true });
    await expect(pending).resolves.toEqual({ id: "session", restarted: true });
    const final = broker.update({ id: "session", settings: null }); broker.close();
    await expect(final).rejects.toMatchObject({ statusCode: 503 });
  });
  it.each(["remote", "dashboard"])("provides authenticated model routes with same-origin mutation protection (%s)", async surface => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "acedia-model-web-"));
    const { service: sessionModels, agent } = fixture(); agent.status = "done"; agent.hook.event = "done";
    const web = surface === "remote" ? new RemoteDashboardService({ baseDir: root, sessionModels })
      : new LocalDashboardService({ title: "Model test", defaultPort: 0, configName: "test.json", stateProvider: () => ({}), baseDir: root, providers: { sessionModels } });
    resources.push(async () => { await web.stop(); await fs.rm(root, { recursive: true }); });
    if (surface === "remote") web.config.server_port = 0;
    const state = await web.start();
    const response = await fetch(`${state.url}/api/session/model?id=session`);
    expect(response.status).toBe(200); expect((await response.json()).accountLabel).toBe("Account A");
    const options = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "session", settings: null, restart: true }) };
    expect((await fetch(`${state.url}/api/session/model`, { ...options, headers: { ...options.headers, origin: "https://foreign.invalid" } })).status).toBe(403);
    expect((await fetch(`${state.url}/api/session/model`, options)).status).toBe(200);
  });
});
