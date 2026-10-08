import { describe, expect, it, vi } from "vitest";
import { applyChatSessionModel, isChatSessionModelChanging, settingsForChatModel } from "./chatSessionModel";
import { invoke } from "../platform/runtime";

vi.mock("../platform/runtime", () => ({ invoke: vi.fn() }));

describe("chat session model application", () => {
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
