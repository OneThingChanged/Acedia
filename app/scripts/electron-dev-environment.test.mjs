import { describe, expect, it } from "vitest";
import { devElectronEnvironment } from "./electron-dev-environment.mjs";

describe("dev Electron environment", () => {
  it("does not propagate the automation console's NO_COLOR into GUI PTYs", () => {
    const source = { NO_COLOR: "1", TERM: "dumb", PATH: "fixture-path", CODEX_HOME: "fixture-home" };
    expect(devElectronEnvironment(source)).toEqual({ TERM: "dumb", PATH: "fixture-path", CODEX_HOME: "fixture-home" });
    expect(source.NO_COLOR).toBe("1");
  });

  it("also removes differently cased Windows keys and handles normal launches", () => {
    expect(devElectronEnvironment({ No_Color: "true", no_color: "1", MULTIAGENT_DEV_URL: "fixture-url" }))
      .toEqual({ MULTIAGENT_DEV_URL: "fixture-url" });
    expect(devElectronEnvironment({ PATH: "fixture-path" })).toEqual({ PATH: "fixture-path" });
  });
});
