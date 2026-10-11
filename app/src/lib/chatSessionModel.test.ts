import { describe, expect, it, vi } from "vitest";
import { applyChatSessionModel, isChatSessionModelChanging, settingsForChatModel, settingsForChatEffort } from "./chatSessionModel";
import { invoke } from "../platform/runtime";

vi.mock("../platform/runtime", () => ({ invoke: vi.fn() }));

describe("chat session model application", () => {
  it("does not overwrite a newer native speed value with read-only dialog metadata", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ id: "latest-speed", restarted: true });
    await applyChatSessionModel("latest-speed", { model: "new", effort: "high", serviceTier: "fast" });
    expect(invoke).toHaveBeenLastCalledWith("set_session_model", { id: "latest-speed", settings: { model: "new", effort: "high" }, restart: true });
  });
  it("preserves the session's known speed across model and effort selections", () => {
    const model = { model: "new", label: "New", efforts: [{ effort: "high", description: "" }], defaultEffort: "high", isDefault: false };
    const changed = settingsForChatModel(model, { model: "old", effort: "max", serviceTier: "fast" });
    expect(changed).toEqual({ model: "new", effort: "high", serviceTier: "fast" });
    expect(settingsForChatEffort(changed, "low")).toEqual({ model: "new", effort: "low", serviceTier: "fast" });
    expect(settingsForChatEffort(changed)).toEqual({ model: "new", serviceTier: "fast" });
    expect(settingsForChatModel(model, { model: "old", serviceTier: null })).toEqual({ model: "new", effort: "high", serviceTier: null });
  });
  it("keeps supported effort and falls back to the new model's default", () => {
    const model = { model: "other", label: "Other", efforts: [{ effort: "low", description: "" }, { effort: "high", description: "" }], defaultEffort: "low", isDefault: false };
    expect(settingsForChatModel(model, { model: "old", effort: "high" })).toEqual({ model: "other", effort: "high" });
    expect(settingsForChatModel(model, { model: "old", effort: "ultra" })).toEqual({ model: "other", effort: "low" });
    expect(settingsForChatModel({ ...model, efforts: [], defaultEffort: null })).toEqual({ model: "other" });
  });
  it("locks only the changing session until the replacement is verified", async () => {
    let finish!: (result: { id: string; restarted: boolean }) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const settings = { model: "account-model", effort: "high" };
    const pending = applyChatSessionModel("session-a", settings);
    expect(isChatSessionModelChanging("session-a")).toBe(true);
    expect(isChatSessionModelChanging("session-b")).toBe(false);
    expect(invoke).toHaveBeenCalledWith("set_session_model", { id: "session-a", settings, restart: true });
    await expect(applyChatSessionModel("session-a", settings)).rejects.toThrow("변경 중");
    finish({ id: "session-a", restarted: true });
    await pending;
    expect(isChatSessionModelChanging("session-a")).toBe(false);
  });
  it("releases failed changes and refuses to claim a merely saved setting was applied", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ id: "session-a", restarted: false });
    await expect(applyChatSessionModel("session-a", { model: "model" })).rejects.toThrow("시작을 확인");
    expect(isChatSessionModelChanging("session-a")).toBe(false);
    vi.mocked(invoke).mockRejectedValueOnce(new Error("startup hook failure"));
    await expect(applyChatSessionModel("session-a", { model: "model" })).rejects.toThrow("startup hook");
    expect(isChatSessionModelChanging("session-a")).toBe(false);
  });
});
